"""Coverage and gap analysis - the core deliverable.

Retrieve unique candidate documents, assess relevance, discount dated material,
and combine effective depth (60%) with the strongest usable document (40%).
``gap_score = momentum * (1 - coverage)`` is always the ranking formula.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Sequence

from pydantic import BaseModel, Field

from ..core.llm import RateLimited, extract_structured
from ..data import db
from .vectorstore import Hit, get_index

logger = logging.getLogger(__name__)

_JUDGE_COOLDOWN_UNTIL = 0.0
_JUDGE_COOLDOWN_SECONDS = 90.0

# Prototype retrieval thresholds; not validated probabilities of coverage.
CANDIDATE_THRESHOLD = 0.62
RELEVANT_THRESHOLD = 0.70
STRONG_THRESHOLD = 0.74

FRESH_DAYS = 120     # anything newer is fully fresh
STALE_DAYS = 450     # anything older contributes nothing to freshness

# Weight each judged verdict contributes to effective depth.
VERDICT_WEIGHTS = {"covers": 1.0, "partial": 0.5, "tangential": 0.0, "unrelated": 0.0}

# Effective depth (sum of judged weights) at which a topic counts as fully
# covered. Five documents that genuinely address a topic is a real shelf.
DEPTH_SATURATION = 5.0


@dataclass
class Coverage:
    topic_slug: str
    doc_count: int
    strong_matches: int
    best_score: float
    mean_score: float
    newest_doc_date: str | None
    staleness_days: float
    coverage_score: float
    matched_docs: list[dict[str, Any]]
    candidates_judged: int = 0
    rejected: int = 0
    judged_by: str = "similarity"

    def to_dict(self) -> dict[str, Any]:
        return {
            "topic_slug": self.topic_slug,
            "doc_count": self.doc_count,
            "strong_matches": self.strong_matches,
            "best_score": round(self.best_score, 4),
            "mean_score": round(self.mean_score, 4),
            "newest_doc_date": self.newest_doc_date,
            "staleness_days": round(self.staleness_days, 1),
            "coverage_score": round(self.coverage_score, 4),
            "matched_docs": self.matched_docs,
            "candidates_judged": self.candidates_judged,
            "rejected": self.rejected,
            "judged_by": self.judged_by,
        }


@dataclass
class Gap:
    topic_slug: str
    label: str
    momentum: float
    coverage_score: float
    gap_score: float
    priority: str
    quadrant: str
    rationale: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "topic_slug": self.topic_slug,
            "label": self.label,
            "momentum": round(self.momentum, 4),
            "coverage_score": round(self.coverage_score, 4),
            "gap_score": round(self.gap_score, 4),
            "priority": self.priority,
            "quadrant": self.quadrant,
            "rationale": self.rationale,
        }


# ---------------------------------------------------------------------------
# Coverage
# ---------------------------------------------------------------------------
def _days_since(value: str | None) -> float:
    if not value:
        return 999.0
    try:
        return max(0.0, (date.today() - datetime.fromisoformat(value[:10]).date()).days)
    except ValueError:
        return 999.0


def _freshness(staleness_days: float) -> float:
    if staleness_days <= FRESH_DAYS:
        return 1.0
    if staleness_days >= STALE_DAYS:
        return 0.0
    return 1.0 - (staleness_days - FRESH_DAYS) / (STALE_DAYS - FRESH_DAYS)


class DocumentVerdict(BaseModel):
    doc_id: str = Field(description="The document id exactly as supplied")
    verdict: str = Field(description="covers, partial, tangential or unrelated")
    reason: str = Field(description="One short clause justifying the verdict")


class CoverageJudgement(BaseModel):
    verdicts: list[DocumentVerdict] = Field(description="One verdict per supplied document")


JUDGE_SYSTEM = (
    "You audit research coverage for an IT research and advisory firm. Given a market topic "
    "and a set of internal research documents that a vector search returned, you decide for "
    "each document whether it actually answers the topic.\n\n"
    "Be strict. Vector search returns anything in the same broad domain, and 'about healthcare "
    "AI' is not the same as 'about clinical AI governance'. Use:\n"
    "- covers      : squarely addresses this topic; a client asking about it would be satisfied\n"
    "- partial     : touches the topic as a section or adjacent angle, but is not about it\n"
    "- tangential  : same domain, different subject\n"
    "- unrelated   : does not belong in this result set at all\n\n"
    "Most same-domain documents are tangential. Reserve 'covers' for genuine matches."
)


def judge_candidates(
    topic_label: str,
    description: str,
    candidates: Sequence[Hit],
) -> dict[str, dict[str, str]]:
    """Ask the model which retrieved documents genuinely cover the topic.

    This is the step that turns similarity into coverage. Measured on the seeded
    corpus, every healthcare-adjacent topic retrieved the *same* twelve
    healthcare documents above the similarity threshold, which made every topic
    look well covered and erased the gap analysis entirely. Similarity says
    "same domain"; only a reading of the text can say "answers the question".

    Returns ``{doc_id: {"verdict": ..., "reason": ...}}``, empty on failure so
    the caller can fall back to the similarity-only path.
    """
    global _JUDGE_COOLDOWN_UNTIL
    if not candidates:
        return {}
    if time.time() < _JUDGE_COOLDOWN_UNTIL:
        return {}

    listing = "\n\n".join(
        f"[{hit.doc_id}] {hit.title}\n"
        f"(practice area: {hit.practice_area}; type: {hit.doc_type}; similarity: {hit.score:.2f})\n"
        f"{hit.text[:420]}"
        for hit in candidates
    )
    prompt = (
        f"TOPIC: {topic_label}\n"
        f"WHAT THE TOPIC COVERS: {description or 'n/a'}\n\n"
        f"Rule on all {len(candidates)} documents below. Return exactly one verdict per document id.\n\n"
        f"DOCUMENTS\n{listing}"
    )

    try:
        judgement = extract_structured(
            prompt,
            CoverageJudgement,
            fast=True,
            system=JUDGE_SYSTEM,
            label="coverage-judge",
            retry=False,
        )
    except RateLimited as exc:
        _JUDGE_COOLDOWN_UNTIL = time.time() + _JUDGE_COOLDOWN_SECONDS
        logger.info("Coverage judge rate-limited for %r: %s", topic_label, exc)
        return {}
    except Exception as exc:  # noqa: BLE001 - degrade to similarity-only scoring
        logger.info("Coverage judge unavailable for %r: %s", topic_label, exc)
        return {}

    allowed = {hit.doc_id for hit in candidates}
    return {
        verdict.doc_id: {
            "verdict": verdict.verdict.strip().lower(),
            "reason": verdict.reason.strip(),
        }
        for verdict in judgement.verdicts
        if verdict.doc_id in allowed and verdict.verdict.strip().lower() in VERDICT_WEIGHTS
    }


def assess_coverage(
    topic_slug: str,
    query_text: str,
    *,
    top_k: int = 5,
    exclude_archive: bool = True,
    judge: bool = True,
    topic_label: str = "",
    description: str = "",
) -> Coverage:
    """Estimate usable coverage from relevance, unique depth and freshness.

    Similarity retrieves candidates; a text verdict establishes relevance.
    Missing verdicts use a conservative, explicitly labelled proxy.
    """
    if top_k < 1:
        raise ValueError("top_k must be positive")
    index = get_index()
    if not index.ready:
        raise RuntimeError("Coverage unavailable: the library index is not ready")
    hits: Sequence[Hit] = index.search(query_text, top_k=max(top_k * 10, 50))

    if exclude_archive:
        hits = [h for h in hits if h.practice_area != "Syndicated Archive"]

    best_per_doc: dict[str, Hit] = {}
    for hit in hits:
        current = best_per_doc.get(hit.doc_id)
        if current is None or hit.score > current.score:
            best_per_doc[hit.doc_id] = hit

    ranked = [h for h in sorted(best_per_doc.values(), key=lambda h: h.score, reverse=True)
              if h.score >= CANDIDATE_THRESHOLD][:max(top_k * 2, 10)]
    verdicts = judge_candidates(topic_label or query_text, description, ranked) if judge else {}
    method = "llm" if ranked and len(verdicts) == len(ranked) else "hybrid" if verdicts else "similarity_proxy"
    assessments = {}
    for hit in ranked:
        assessments[hit.doc_id] = verdicts.get(hit.doc_id, {
            "verdict": "partial" if hit.score >= STRONG_THRESHOLD else "unrelated",
            "reason": "Unverified similarity proxy; analyst review required.",
        })
    accepted = [h for h in ranked if VERDICT_WEIGHTS[assessments[h.doc_id]["verdict"]] > 0]
    accepted.sort(key=lambda h: (VERDICT_WEIGHTS[assessments[h.doc_id]["verdict"]], h.score), reverse=True)
    accepted = accepted[:top_k]

    if not accepted:
        return Coverage(
            topic_slug, 0, 0, 0.0, 0.0, None, 999.0, 0.0, [],
            candidates_judged=len(verdicts), rejected=len(ranked), judged_by=method,
        )

    scores = [h.score for h in accepted]
    newest = max((h.published_date for h in accepted if h.published_date), default=None)
    staleness = _days_since(newest)
    best = max(scores)
    weights = [VERDICT_WEIGHTS[assessments[h.doc_id]["verdict"]] for h in accepted]
    usable = [w * (0.25 + 0.75 * _freshness(_days_since(h.published_date)))
              for h, w in zip(accepted, weights)]
    # One good note gives some coverage; five current, direct notes saturate it.
    # Old research retains background value but cannot imply current readiness.
    coverage_score = 0.6 * min(1.0, sum(usable) / DEPTH_SATURATION) + 0.4 * max(usable)

    placeholders = ",".join("?" for _ in accepted)
    abstracts = {
        row["doc_id"]: row["abstract"]
        for row in db.query(
            f"SELECT doc_id, abstract FROM documents WHERE doc_id IN ({placeholders})",
            [h.doc_id for h in accepted],
        )
    }

    return Coverage(
        topic_slug=topic_slug,
        doc_count=len(accepted),
        strong_matches=sum(1 for w in weights if w == 1.0),
        best_score=best,
        mean_score=sum(scores) / len(scores),
        newest_doc_date=newest,
        staleness_days=staleness,
        coverage_score=float(min(1.0, max(0.0, coverage_score))),
        matched_docs=[
            {
                "doc_id": hit.doc_id,
                "title": hit.title,
                "score": round(hit.score, 4),
                "published_date": hit.published_date,
                "practice_area": hit.practice_area,
                "doc_type": hit.doc_type,
                "age_days": int(_days_since(hit.published_date)),
                "abstract": abstracts.get(hit.doc_id, ""),
                **assessments[hit.doc_id],
                "judged_by": "llm" if hit.doc_id in verdicts else "similarity_proxy",
            }
            for hit in accepted
        ],
        candidates_judged=len(verdicts),
        rejected=sum(1 for h in ranked if VERDICT_WEIGHTS[assessments[h.doc_id]["verdict"]] == 0),
        judged_by=method,
    )


# ---------------------------------------------------------------------------
# Gap scoring
# ---------------------------------------------------------------------------
def classify(momentum: float, coverage: Coverage) -> tuple[str, str, str]:
    """Return ``(quadrant, priority, rationale)``."""
    score = coverage.coverage_score
    stale = coverage.staleness_days > 300 and coverage.doc_count > 0

    if momentum >= 0.50 and stale and score < 0.70:
        quadrant = "refresh"
        rationale = f"Existing research is dated: newest relevant document is {int(coverage.staleness_days)} days old. Validate and update it before commissioning new work."
    elif momentum >= 0.55 and score < 0.35:
        quadrant = "publish_now"
        rationale = (
            f"Market momentum is high while the library holds "
            f"{coverage.doc_count} relevant document(s)"
            + (f", newest {int(coverage.staleness_days)} days old" if coverage.doc_count else " - white space")
            + "."
        )
    elif momentum >= 0.50 and score >= 0.60:
        quadrant = "maintain"
        rationale = f"Well covered ({coverage.doc_count} documents, best match {coverage.best_score:.2f}) and demand is healthy."
    elif momentum < 0.45 and score >= 0.55:
        quadrant = "over_invested"
        rationale = f"{coverage.doc_count} documents against low observed news attention. Review portfolio allocation; this sample does not establish declining client demand."
    else:
        quadrant = "watch"
        rationale = "Neither demand nor coverage is strong enough to act on yet."

    gap_score = momentum * (1.0 - score)

    if gap_score >= 0.45:
        priority = "CRITICAL"
    elif gap_score >= 0.30:
        priority = "HIGH"
    elif gap_score >= 0.16:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    if quadrant in ("maintain", "over_invested", "watch") and priority == "CRITICAL":
        priority = "HIGH"

    return quadrant, priority, rationale


def build_gap(topic_slug: str, label: str, momentum: float, coverage: Coverage) -> Gap:
    quadrant, priority, rationale = classify(momentum, coverage)
    return Gap(
        topic_slug=topic_slug,
        label=label,
        momentum=momentum,
        coverage_score=coverage.coverage_score,
        gap_score=momentum * (1.0 - coverage.coverage_score),
        priority=priority,
        quadrant=quadrant,
        rationale=rationale,
    )


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def save_coverage(coverage: Coverage) -> None:
    db.execute(
        """INSERT INTO coverage
           (topic_slug, doc_count, strong_matches, best_score, mean_score,
            newest_doc_date, staleness_days, coverage_score, matched_docs, computed_at)
           VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
           ON CONFLICT(topic_slug) DO UPDATE SET
             doc_count=excluded.doc_count, strong_matches=excluded.strong_matches,
             best_score=excluded.best_score, mean_score=excluded.mean_score,
             newest_doc_date=excluded.newest_doc_date, staleness_days=excluded.staleness_days,
             coverage_score=excluded.coverage_score, matched_docs=excluded.matched_docs,
             computed_at=CURRENT_TIMESTAMP""",
        (
            coverage.topic_slug, coverage.doc_count, coverage.strong_matches,
            coverage.best_score, coverage.mean_score, coverage.newest_doc_date,
            coverage.staleness_days, coverage.coverage_score, db.as_json(coverage.matched_docs),
        ),
    )


def save_gap(gap: Gap) -> None:
    db.execute(
        """INSERT INTO gaps
           (topic_slug, momentum, coverage_score, gap_score, priority, quadrant, rationale, computed_at)
           VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
           ON CONFLICT(topic_slug) DO UPDATE SET
             momentum=excluded.momentum, coverage_score=excluded.coverage_score,
             gap_score=excluded.gap_score, priority=excluded.priority,
             quadrant=excluded.quadrant, rationale=excluded.rationale,
             computed_at=CURRENT_TIMESTAMP""",
        (
            gap.topic_slug, gap.momentum, gap.coverage_score, gap.gap_score,
            gap.priority, gap.quadrant, gap.rationale,
        ),
    )


def portfolio_summary() -> dict[str, Any]:
    """Aggregate view for the dashboard header."""
    rows = db.query(
        """SELECT g.*, t.label, t.category, t.growth_pct
           FROM gaps g JOIN topics t ON t.slug = g.topic_slug"""
    )
    if not rows:
        return {
            "topics": 0, "critical": 0, "high": 0,
            "avg_momentum": 0.0, "avg_coverage": 0.0,
            "quadrants": {}, "exposure": 0.0,
        }

    quadrants: dict[str, int] = {}
    for row in rows:
        quadrants[row["quadrant"]] = quadrants.get(row["quadrant"], 0) + 1

    return {
        "topics": len(rows),
        "critical": sum(1 for r in rows if r["priority"] == "CRITICAL"),
        "high": sum(1 for r in rows if r["priority"] == "HIGH"),
        "avg_momentum": round(sum(r["momentum"] for r in rows) / len(rows), 4),
        "avg_coverage": round(sum(r["coverage_score"] for r in rows) / len(rows), 4),
        "quadrants": quadrants,
        # Share of sensed demand sitting on topics we cover poorly.
        "exposure": round(
            sum(r["momentum"] * (1 - r["coverage_score"]) for r in rows)
            / max(sum(r["momentum"] for r in rows), 1e-9),
            4,
        ),
    }
