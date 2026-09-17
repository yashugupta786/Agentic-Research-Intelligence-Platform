"""Demand-sensing intelligence: topics, coverage, gaps and commissioning briefs.

These endpoints read the analysis the agent already computed and persisted, so
the dashboard loads instantly on a cold browser rather than re-running a scan.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from ..data import db
from ..services import briefs as brief_service
from ..services import coverage as coverage_service
from ..services import knowledge_graph

logger = logging.getLogger(__name__)
router = APIRouter()

TOPIC_SELECT = """
SELECT t.slug, t.label, t.aliases, t.category, t.description,
       t.mention_count, t.source_count, t.momentum, t.growth_pct, t.velocity,
       t.recency_days, t.first_seen, t.last_seen, t.updated_at,
       c.doc_count, c.strong_matches, c.best_score, c.mean_score,
       c.newest_doc_date, c.staleness_days, c.coverage_score, c.matched_docs,
       g.gap_score, g.priority, g.quadrant, g.rationale
FROM topics t
LEFT JOIN coverage c ON c.topic_slug = t.slug
LEFT JOIN gaps     g ON g.topic_slug = t.slug
"""


def _hydrate(row: dict) -> dict:
    row["aliases"] = db.from_json(row.get("aliases"), [])
    row["matched_docs"] = db.from_json(row.get("matched_docs"), [])
    return row


def _series(slug: str, limit: int = 90) -> list[dict]:
    rows = db.query(
        """SELECT date, value, source FROM topic_timeseries
           WHERE topic_slug = ? ORDER BY date ASC LIMIT ?""",
        (slug, limit),
    )
    return rows


@router.get("/topics")
def topics(
    quadrant: str | None = None,
    priority: str | None = None,
    order: str = Query(default="gap", pattern="^(gap|momentum|coverage|label)$"),
) -> dict:
    """Every tracked topic joined with its coverage and gap verdict."""
    sort = {
        "gap": "COALESCE(g.gap_score, 0) DESC",
        "momentum": "t.momentum DESC",
        "coverage": "COALESCE(c.coverage_score, 0) DESC",
        "label": "t.label ASC",
    }[order]

    clauses: list[str] = []
    params: list = []
    if quadrant:
        clauses.append("g.quadrant = ?")
        params.append(quadrant)
    if priority:
        clauses.append("g.priority = ?")
        params.append(priority.upper())

    sql = TOPIC_SELECT
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += f" ORDER BY {sort}"

    rows = [_hydrate(r) for r in db.query(sql, params)]

    # Sparklines make the table readable at a glance; 30 points is enough.
    for row in rows:
        points = _series(row["slug"])
        row["sparkline"] = [round(float(p["value"]), 3) for p in points[-30:]]

    return {"topics": rows, "portfolio": coverage_service.portfolio_summary()}


@router.get("/topics/{slug}")
def topic_detail(slug: str) -> dict:
    row = db.query_one(TOPIC_SELECT + " WHERE t.slug = ?", (slug,))
    if not row:
        raise HTTPException(status_code=404, detail=f"Unknown topic: {slug}")

    topic = _hydrate(row)
    signals = db.query(
        """SELECT title, url, domain, snippet, published_date, relevance, source
           FROM signals WHERE topic_slug = ?
           ORDER BY COALESCE(published_date, '') DESC, relevance DESC LIMIT 20""",
        (slug,),
    )
    return {
        "topic": topic,
        "series": _series(slug),
        "signals": signals,
        "adjacent": knowledge_graph.adjacent_covered_topics(slug, limit=5),
        "subgraph": knowledge_graph.topic_subgraph(slug, depth=1),
        "brief": brief_service.latest_brief(slug),
    }


@router.get("/gaps")
def gaps() -> dict:
    """The core deliverable: ranked demand-vs-coverage gaps."""
    rows = db.query(
        """SELECT g.topic_slug, g.momentum, g.coverage_score, g.gap_score,
                  g.priority, g.quadrant, g.rationale, g.computed_at,
                  t.label, t.category, t.growth_pct, t.description,
                  c.doc_count, c.staleness_days, c.matched_docs
           FROM gaps g
           JOIN topics t ON t.slug = g.topic_slug
           LEFT JOIN coverage c ON c.topic_slug = g.topic_slug
           ORDER BY g.gap_score DESC"""
    )
    for row in rows:
        row["matched_docs"] = db.from_json(row.get("matched_docs"), [])
    return {"gaps": rows, "portfolio": coverage_service.portfolio_summary()}


@router.get("/portfolio")
def portfolio() -> dict:
    summary = coverage_service.portfolio_summary()

    by_category = db.query(
        """SELECT COALESCE(t.category, 'Uncategorised') AS category,
                  COUNT(*) AS topics,
                  ROUND(AVG(g.momentum), 4)       AS avg_momentum,
                  ROUND(AVG(g.coverage_score), 4) AS avg_coverage,
                  ROUND(AVG(g.gap_score), 4)      AS avg_gap
           FROM gaps g JOIN topics t ON t.slug = g.topic_slug
           GROUP BY category ORDER BY avg_gap DESC"""
    )
    return {"portfolio": summary, "by_category": by_category}


@router.get("/signals")
def signals(limit: int = 40) -> dict:
    """Recent external evidence across all topics - the 'what did we read' view."""
    rows = db.query(
        """SELECT s.title, s.url, s.domain, s.snippet, s.published_date,
                  s.relevance, s.source, s.topic_slug, t.label AS topic_label
           FROM signals s LEFT JOIN topics t ON t.slug = s.topic_slug
           ORDER BY COALESCE(s.published_date, '') DESC, s.relevance DESC
           LIMIT ?""",
        (min(limit, 200),),
    )
    outlets = db.query(
        """SELECT domain, COUNT(*) AS articles FROM signals
           WHERE domain IS NOT NULL AND domain <> ''
           GROUP BY domain ORDER BY articles DESC LIMIT 12"""
    )
    return {"signals": rows, "outlets": outlets}


@router.post("/briefs/{slug}")
async def create_brief(slug: str) -> dict:
    """Generate a commissioning brief for a gap topic.

    The system argues for research; it does not write the research. That line is
    deliberate - the analyst's judgement is the product.
    """
    row = db.query_one(TOPIC_SELECT + " WHERE t.slug = ?", (slug,))
    if not row:
        raise HTTPException(status_code=404, detail=f"Unknown topic: {slug}")
    if row.get("gap_score") is None:
        raise HTTPException(status_code=409, detail="No gap analysis stored for this topic yet")

    topic = _hydrate(row)
    coverage = coverage_service.Coverage(
        topic_slug=slug,
        doc_count=topic.get("doc_count") or 0,
        strong_matches=topic.get("strong_matches") or 0,
        best_score=topic.get("best_score") or 0.0,
        mean_score=topic.get("mean_score") or 0.0,
        newest_doc_date=topic.get("newest_doc_date"),
        staleness_days=topic.get("staleness_days") or 999.0,
        coverage_score=topic.get("coverage_score") or 0.0,
        matched_docs=topic.get("matched_docs") or [],
    )
    gap = coverage_service.Gap(
        topic_slug=slug,
        label=topic["label"],
        momentum=topic.get("momentum") or 0.0,
        coverage_score=coverage.coverage_score,
        gap_score=topic["gap_score"],
        priority=topic["priority"],
        quadrant=topic["quadrant"],
        rationale=topic["rationale"] or "",
    )
    evidence = db.query(
        """SELECT title, url, domain, published_date FROM signals
           WHERE topic_slug = ? ORDER BY relevance DESC LIMIT 6""",
        (slug,),
    )

    try:
        return await asyncio.to_thread(
            brief_service.generate_brief,
            topic_label=topic["label"],
            topic_slug=slug,
            description=topic.get("description") or "",
            momentum=gap.momentum,
            growth_pct=topic.get("growth_pct") or 0.0,
            coverage=coverage,
            gap=gap,
            signals=evidence,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Brief generation failed for %s", slug)
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc


@router.get("/briefs")
def list_briefs(limit: int = 20) -> dict:
    rows = db.query(
        """SELECT b.*, t.label AS topic_label FROM briefs b
           JOIN topics t ON t.slug = b.topic_slug
           ORDER BY b.id DESC LIMIT ?""",
        (min(limit, 100),),
    )
    for row in rows:
        row["key_questions"] = db.from_json(row.get("key_questions"), [])
        row["adjacent_docs"] = db.from_json(row.get("adjacent_docs"), [])
        row["sources"] = db.from_json(row.get("sources"), [])
    return {"briefs": rows}
