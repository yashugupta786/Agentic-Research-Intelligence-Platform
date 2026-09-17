"""Builds the simulated internal research library.

Two sources, on purpose:

1. **Generated research notes** - written by Gemini from ``LIBRARY_PLAN``. These
   carry the engineered coverage distribution (deep/stale/absent/over-served)
   that makes gap analysis meaningful. They are clearly labelled as simulated.
2. **Public archive clippings** - real rows from the HuffPost news-category
   dataset (the case study suggests it), pulled keyless from the HuggingFace
   datasets server. They add realistic breadth and retrieval noise, so the
   vector search has to actually discriminate rather than match the only thing
   in the index.

The generated corpus is cached to ``data/seed/library.json`` and committed, so
seeding is deterministic and a reviewer gets the same numbers we demoed.
"""

from __future__ import annotations

import json
import random
import urllib.parse
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Iterable

import httpx
from pydantic import BaseModel, Field

from ..config import DATA_DIR
from ..core.llm import extract_structured
from .taxonomy import ANALYSTS, LIBRARY_PLAN, LibrarySubject

SEED_DIR = DATA_DIR / "seed"
LIBRARY_CACHE = SEED_DIR / "library.json"
ARCHIVE_CACHE = SEED_DIR / "archive.json"

HF_ROWS_URL = "https://datasets-server.huggingface.co/rows"
HF_DATASET = "heegyu/news-category-balanced-top10"

RNG = random.Random(20260916)  # fixed seed -> reproducible corpus


# ---------------------------------------------------------------------------
# LLM output schema
# ---------------------------------------------------------------------------
class GeneratedDoc(BaseModel):
    title: str = Field(description="Specific, executive-facing research title")
    doc_type: str = Field(description="Research Note, Market Guide, Analyst Brief or Case Study")
    abstract: str = Field(description="2-sentence executive abstract")
    body: str = Field(description="180-260 words of analysis in 2 paragraphs")
    findings: list[str] = Field(description="2-3 short key findings")


class GeneratedBatch(BaseModel):
    documents: list[GeneratedDoc]


GEN_SYSTEM = (
    "You write concise analyst research for a global IT research and advisory firm. "
    "Your audience is CIOs and business unit heads. Be specific and quantitative where "
    "plausible, avoid marketing language, and never mention that this content is generated."
)


def _prompt_for(subject: LibrarySubject, count: int, offset: int) -> str:
    return f"""Write {count} distinct research documents for the practice area "{subject.practice_area}".

Subject: {subject.subject}
Angles to cover: {subject.focus}
Preferred document types: {", ".join(subject.doc_types)}

Requirements:
- Each document must take a DIFFERENT angle (this is batch starting at index {offset + 1}).
- Titles must be specific, not generic. No two titles may overlap in wording.
- Body: 180-260 words, 2 paragraphs, analytical tone, concrete recommendations.
- Include plausible figures (percentages, timelines, adoption rates) where natural.
"""


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
def generate_library(
    *,
    force: bool = False,
    batch_size: int = 4,
    on_progress: Any = None,
) -> list[dict[str, Any]]:
    """Generate (or load from cache) the simulated internal library."""
    if LIBRARY_CACHE.exists() and not force:
        return json.loads(LIBRARY_CACHE.read_text(encoding="utf-8"))

    SEED_DIR.mkdir(parents=True, exist_ok=True)
    docs: list[dict[str, Any]] = []
    counter = 1000

    for subject in LIBRARY_PLAN:
        remaining = subject.doc_count
        offset = 0
        collected: list[GeneratedDoc] = []

        while remaining > 0:
            take = min(batch_size, remaining)
            if on_progress:
                on_progress(f"{subject.subject[:52]} ({len(collected) + take}/{subject.doc_count})")
            try:
                batch = extract_structured(
                    _prompt_for(subject, take, offset),
                    GeneratedBatch,
                    fast=True,
                    system=GEN_SYSTEM,
                    label="library-gen",
                )
                collected.extend(batch.documents[:take])
            except Exception as exc:  # noqa: BLE001 - keep seeding resilient
                if on_progress:
                    on_progress(f"  ! batch failed ({type(exc).__name__}), continuing")
            remaining -= take
            offset += take

        for doc in collected:
            counter += 1
            age = RNG.randint(*subject.age_days)
            published = date.today() - timedelta(days=age)
            body = doc.body.strip()
            if doc.findings:
                body += "\n\nKey findings:\n" + "\n".join(f"- {f.strip()}" for f in doc.findings)

            docs.append(
                {
                    "doc_id": f"RN-{counter}",
                    "title": doc.title.strip(),
                    "abstract": doc.abstract.strip(),
                    "body": body,
                    "practice_area": subject.practice_area,
                    "doc_type": doc.doc_type.strip() or "Research Note",
                    "published_date": published.isoformat(),
                    "analyst": RNG.choice(ANALYSTS),
                    "source_url": None,
                    "subject": subject.subject,
                    "coverage_intent": subject.intent,
                }
            )

    LIBRARY_CACHE.write_text(json.dumps(docs, indent=2, ensure_ascii=False), encoding="utf-8")
    return docs


# ---------------------------------------------------------------------------
# Public archive (real data, keyless)
# ---------------------------------------------------------------------------
ARCHIVE_CATEGORIES = {"BUSINESS", "TECH", "SCIENCE", "POLITICS", "HEALTHY LIVING", "MONEY"}


def fetch_archive(limit: int = 90, *, force: bool = False) -> list[dict[str, Any]]:
    """Pull HuffPost rows from the HuggingFace datasets server (no auth needed)."""
    if ARCHIVE_CACHE.exists() and not force:
        cached = json.loads(ARCHIVE_CACHE.read_text(encoding="utf-8"))
        if len(cached) >= limit:
            return cached[:limit]

    SEED_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    offset = 0
    with httpx.Client(timeout=45, headers={"User-Agent": "Mozilla/5.0"}) as client:
        while len(rows) < limit * 4 and offset < 2000:
            params = {
                "dataset": HF_DATASET,
                "config": "default",
                "split": "train",
                "offset": offset,
                "length": 100,
            }
            try:
                resp = client.get(f"{HF_ROWS_URL}?{urllib.parse.urlencode(params)}")
                resp.raise_for_status()
                page = [item["row"] for item in resp.json().get("rows", [])]
            except Exception:  # noqa: BLE001 - archive is optional enrichment
                break
            if not page:
                break
            rows.extend(page)
            offset += 100

    docs: list[dict[str, Any]] = []
    counter = 5000
    for row in rows:
        category = str(row.get("category", "")).upper()
        headline = str(row.get("headline", "")).strip()
        description = str(row.get("short_description", "")).strip()
        if category not in ARCHIVE_CATEGORIES or len(headline) < 25 or len(description) < 60:
            continue
        counter += 1
        docs.append(
            {
                "doc_id": f"AR-{counter}",
                "title": headline,
                "abstract": description[:400],
                "body": description,
                "practice_area": "Syndicated Archive",
                "doc_type": "Archive Clipping",
                "published_date": str(row.get("date") or "2022-01-01")[:10],
                "analyst": None,
                "source_url": row.get("link"),
                "subject": f"Archive / {category.title()}",
                "coverage_intent": "archive",
            }
        )
        if len(docs) >= limit:
            break

    if docs:
        ARCHIVE_CACHE.write_text(json.dumps(docs, indent=2, ensure_ascii=False), encoding="utf-8")
    return docs


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
def chunk_document(doc: dict[str, Any], *, target_words: int = 130, overlap_words: int = 25) -> list[str]:
    """Sliding-window chunks with the title prepended.

    Repeating the title in every chunk is a cheap trick that measurably helps
    retrieval: an isolated middle paragraph often loses the subject entirely.
    """
    text = f"{doc['abstract']}\n\n{doc['body']}".strip()
    words = text.split()
    if not words:
        return [doc["title"]]

    chunks: list[str] = []
    step = max(target_words - overlap_words, 40)
    for start in range(0, len(words), step):
        window = words[start : start + target_words]
        if len(window) < 25 and chunks:
            break
        chunks.append(f"{doc['title']} — {' '.join(window)}")
        if start + target_words >= len(words):
            break
    return chunks


def iter_all_documents(library: Iterable[dict[str, Any]], archive: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for doc in [*library, *archive]:
        if doc["doc_id"] in seen:
            continue
        seen.add(doc["doc_id"])
        out.append(doc)
    return out
