"""Grounded question answering over the internal library.

Three things make this more than "stuff chunks into a prompt":

1. **Citation contract** - the model must tag every claim with a document id, and
   ids that were not retrieved are stripped out afterwards. For a research firm
   an uncited answer is worthless, so this is enforced, not requested.
2. **Groundedness check** - a second, independent model pass scores whether the
   answer is actually supported by the retrieved text. That number is shown in
   the UI rather than hidden, which is the honest way to present an LLM answer.
3. **Refusal path** - if retrieval returns nothing relevant, the answer says the
   library has no coverage. Inventing an answer would be the worst possible
   failure mode for this product.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Sequence

from pydantic import BaseModel, Field

from ..config import settings
from ..core.llm import extract_structured, generate_text
from ..data import db
from .vectorstore import Hit, get_index

logger = logging.getLogger(__name__)

ANSWER_SYSTEM = (
    "You are a research assistant for an IT research and advisory firm. You answer "
    "strictly from the supplied internal research extracts. Every factual sentence must "
    "end with one or more citations in square brackets, e.g. [RN-1042]. If the extracts "
    "do not support an answer, say so plainly instead of speculating. Never cite a "
    "document id that was not supplied."
)


class GroundednessVerdict(BaseModel):
    supported_claims: int = Field(description="Number of factual claims fully supported by the extracts")
    total_claims: int = Field(description="Total number of factual claims in the answer")
    unsupported: list[str] = Field(description="Any claims not supported by the extracts (max 3)")
    verdict: str = Field(description="grounded, partially_grounded or unsupported")


@dataclass
class RagAnswer:
    question: str
    answer: str
    citations: list[dict[str, Any]] = field(default_factory=list)
    hits: list[dict[str, Any]] = field(default_factory=list)
    groundedness: float | None = None
    verdict: str | None = None
    unsupported: list[str] = field(default_factory=list)
    retrieved: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.answer,
            "citations": self.citations,
            "hits": self.hits,
            "groundedness": self.groundedness,
            "verdict": self.verdict,
            "unsupported": self.unsupported,
            "retrieved": self.retrieved,
        }


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
def retrieve(question: str, *, top_k: int | None = None, min_score: float = 0.42) -> list[Hit]:
    """Retrieve chunks, keeping at most two per document.

    Without the per-document cap a single verbose note can occupy the whole
    context window and the answer loses breadth across the library.
    """
    k = top_k or settings.rag_top_k
    raw = get_index().search(question, top_k=k * 4, min_score=min_score)

    per_doc: dict[str, int] = {}
    kept: list[Hit] = []
    for hit in raw:
        if hit.practice_area == "Syndicated Archive":
            continue
        count = per_doc.get(hit.doc_id, 0)
        if count >= 2:
            continue
        per_doc[hit.doc_id] = count + 1
        kept.append(hit)
        if len(kept) >= k:
            break
    return kept


def format_context(hits: Sequence[Hit]) -> str:
    blocks = []
    for hit in hits:
        blocks.append(
            f"[{hit.doc_id}] {hit.title}\n"
            f"(practice area: {hit.practice_area}; type: {hit.doc_type}; published: {hit.published_date}; "
            f"similarity: {hit.score:.2f})\n"
            f"{hit.text}"
        )
    return "\n\n---\n\n".join(blocks)


# ---------------------------------------------------------------------------
# Answering
# ---------------------------------------------------------------------------
def answer_question(
    question: str,
    *,
    top_k: int | None = None,
    check_groundedness: bool = True,
    hits: Sequence[Hit] | None = None,
    persist: bool = False,
) -> RagAnswer:
    """Answer a question from the internal library, with citations."""
    retrieved = list(hits) if hits is not None else retrieve(question, top_k=top_k)

    if not retrieved:
        return RagAnswer(
            question=question,
            answer=(
                "No sufficiently relevant internal research was retrieved for this question. "
                "Try a narrower question or ask an analyst to verify coverage."
            ),
            retrieved=0,
            groundedness=None,
            verdict="no_coverage",
        )

    context = format_context(retrieved)
    allowed = sorted({hit.doc_id for hit in retrieved})

    prompt = f"""Answer the question using only the internal research extracts below.

QUESTION: {question}

Requirements:
- Every factual sentence ends with citations like [{allowed[0]}].
- Only cite from: {", ".join(allowed)}
- 120-220 words. Lead with the direct answer, then the supporting detail.
- If the extracts only partially address the question, state what is missing.
- Where extracts disagree or are dated, say so.

INTERNAL RESEARCH EXTRACTS
{context}
"""

    answer = generate_text(prompt, fast=False, system=ANSWER_SYSTEM, label="rag-answer")

    # Strip hallucinated citations: only ids we actually retrieved may survive.
    cited = set(re.findall(r"\[([A-Z]{2}-\d+)\]", answer))
    for bogus in cited - set(allowed):
        answer = answer.replace(f"[{bogus}]", "")
    cited &= set(allowed)

    by_doc = {hit.doc_id: hit for hit in retrieved}
    citations = [
        {
            "doc_id": doc_id,
            "title": by_doc[doc_id].title,
            "practice_area": by_doc[doc_id].practice_area,
            "doc_type": by_doc[doc_id].doc_type,
            "published_date": by_doc[doc_id].published_date,
            "analyst": by_doc[doc_id].analyst,
            "score": round(by_doc[doc_id].score, 4),
        }
        for doc_id in sorted(cited)
        if doc_id in by_doc
    ]

    result = RagAnswer(
        question=question,
        answer=answer.strip(),
        citations=citations,
        hits=[hit.to_dict() for hit in retrieved],
        retrieved=len(retrieved),
    )

    if check_groundedness:
        try:
            verdict = extract_structured(
                "Check whether the ANSWER is supported by the EXTRACTS. Count factual claims "
                "and list any that the extracts do not support.\n\n"
                f"ANSWER:\n{result.answer}\n\nEXTRACTS:\n{context[:9000]}",
                GroundednessVerdict,
                fast=True,
                label="groundedness",
            )
            total = max(verdict.total_claims, 1)
            result.groundedness = round(min(1.0, verdict.supported_claims / total), 3)
            result.verdict = verdict.verdict
            result.unsupported = verdict.unsupported[:3]
        except Exception as exc:  # noqa: BLE001 - never fail an answer over its score
            logger.info("Groundedness check skipped: %s", exc)

    if persist:
        db.execute(
            """INSERT INTO runs (question, intent, answer, citations, groundedness)
               VALUES (?,?,?,?,?)""",
            (question, "library_qa", result.answer, db.as_json(citations), result.groundedness),
        )

    return result


def search_library(query: str, *, top_k: int = 8) -> list[dict[str, Any]]:
    """Document-level search used by the UI's library browser."""
    return get_index().search_documents(query, top_k=top_k)


def library_stats() -> dict[str, Any]:
    rows = db.query(
        """SELECT practice_area,
                  COUNT(*)                                   AS documents,
                  MIN(published_date)                        AS oldest,
                  MAX(published_date)                        AS newest,
                  ROUND(AVG(word_count))                     AS avg_words
           FROM documents
           GROUP BY practice_area
           ORDER BY documents DESC"""
    )
    totals = db.query_one("SELECT COUNT(*) AS documents, SUM(word_count) AS words FROM documents") or {}
    chunks = db.query_one("SELECT COUNT(*) AS c FROM chunks") or {}
    return {
        "documents": totals.get("documents", 0),
        "words": totals.get("words", 0),
        "chunks": chunks.get("c", 0),
        "indexed_vectors": get_index().size,
        "by_practice_area": rows,
    }
