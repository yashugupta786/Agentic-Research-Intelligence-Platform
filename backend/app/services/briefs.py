"""Research brief generation.

Scope discipline matters here: the system does **not** write research. Gartner's
credibility is its analysts, and an AI-authored report would be the wrong
answer to this problem. What the system produces is a commissioning brief - the
argument for why a topic deserves an analyst's time, the questions worth
answering, and the assets already in the library to build on. A human decides
and writes.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

from pydantic import BaseModel, Field

from ..core.llm import extract_structured
from ..data import db
from .coverage import Coverage, Gap
from .knowledge_graph import adjacent_covered_topics

logger = logging.getLogger(__name__)


class ResearchBrief(BaseModel):
    title: str = Field(description="Proposed research title, specific and executive-facing")
    why_now: str = Field(description="2-3 sentences on why this must be commissioned this quarter, referencing the evidence")
    key_questions: list[str] = Field(description="3-5 questions the research must answer for a CIO")
    suggested_type: str = Field(description="Research Note, Market Guide, Analyst Brief or Predicts")
    audience: str = Field(description="Primary role that will read this")
    build_on: str = Field(description="How to reuse adjacent existing coverage, or 'net new' if none applies")


BRIEF_SYSTEM = (
    "You are a research planning lead at an IT research and advisory firm. You write "
    "commissioning briefs that justify analyst time. You are evidence-driven, concise, "
    "and you never invent statistics that were not supplied to you."
)


def generate_brief(
    *,
    topic_label: str,
    topic_slug: str,
    description: str,
    momentum: float,
    growth_pct: float,
    coverage: Coverage,
    gap: Gap,
    signals: Sequence[dict[str, Any]] | None = None,
    persist: bool = True,
) -> dict[str, Any]:
    """Produce a commissioning brief for one gap topic."""
    adjacent = adjacent_covered_topics(topic_slug)

    signal_lines = "\n".join(
        f"- {s.get('title', '')[:130]} ({s.get('domain', 'unknown')}, {s.get('published_date') or 'undated'})"
        for s in (signals or [])[:6]
    ) or "- (no article snippets available)"

    existing_lines = "\n".join(
        f"- {d['doc_id']}: {d['title'][:110]} (similarity {d['score']}, {d['age_days']} days old)"
        for d in (coverage.matched_docs or [])[:5]
    ) or "- none: this is white space in the library"

    adjacent_lines = "\n".join(
        f"- {a['label']} (coverage {a['coverage_score']:.2f}, similarity {a['similarity']}): "
        + ", ".join(d["doc_id"] for d in a["documents"])
        for a in adjacent
    ) or "- no closely adjacent covered topics"

    prompt = f"""Write a commissioning brief for the following coverage gap.

TOPIC: {topic_label}
WHAT IT COVERS: {description or "n/a"}

MARKET EVIDENCE
- momentum score: {momentum:.2f} / 1.00
- volume growth (recent vs baseline): {growth_pct:+.0f}%
- gap score: {gap.gap_score:.2f} ({gap.priority}, quadrant: {gap.quadrant})
- assessment: {gap.rationale}

RECENT SIGNALS
{signal_lines}

EXISTING INTERNAL COVERAGE
{existing_lines}

ADJACENT COVERED TOPICS (reuse candidates from the knowledge graph)
{adjacent_lines}

Rules:
- Ground "why now" in the evidence above; cite document ids where relevant.
- Do not invent market statistics beyond what is given.
- If adjacent coverage exists, 'build_on' must name the specific documents.
"""

    brief = extract_structured(prompt, ResearchBrief, fast=False, system=BRIEF_SYSTEM, label="research-brief")

    payload = {
        "topic_slug": topic_slug,
        "topic_label": topic_label,
        "title": brief.title.strip(),
        "why_now": brief.why_now.strip(),
        "key_questions": [q.strip() for q in brief.key_questions if q.strip()],
        "suggested_type": brief.suggested_type.strip(),
        "audience": brief.audience.strip(),
        "build_on": brief.build_on.strip(),
        "adjacent": adjacent,
        "evidence": {
            "momentum": round(momentum, 4),
            "growth_pct": round(growth_pct, 2),
            "gap_score": round(gap.gap_score, 4),
            "priority": gap.priority,
            "quadrant": gap.quadrant,
            "existing_docs": (coverage.matched_docs or [])[:5],
            "sources": [
                {"title": s.get("title"), "url": s.get("url"), "domain": s.get("domain"), "published_date": s.get("published_date")}
                for s in (signals or [])[:6]
            ],
        },
    }

    if persist:
        db.execute(
            """INSERT INTO briefs
               (topic_slug, title, why_now, key_questions, suggested_type, audience, adjacent_docs, sources)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                topic_slug, payload["title"], payload["why_now"],
                db.as_json(payload["key_questions"]), payload["suggested_type"],
                payload["audience"], db.as_json(adjacent), db.as_json(payload["evidence"]["sources"]),
            ),
        )

    return payload


def latest_brief(topic_slug: str) -> dict[str, Any] | None:
    row = db.query_one(
        "SELECT * FROM briefs WHERE topic_slug = ? ORDER BY created_at DESC, id DESC LIMIT 1",
        (topic_slug,),
    )
    if not row:
        return None
    row["key_questions"] = db.from_json(row["key_questions"], [])
    row["adjacent_docs"] = db.from_json(row["adjacent_docs"], [])
    row["sources"] = db.from_json(row["sources"], [])
    return row
