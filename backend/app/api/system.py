"""Health, capability and metadata endpoints.

The frontend calls ``/api/meta`` once on boot and uses it to decide what to
render: which capabilities are live, what the agent roster looks like, and what
the graph topology is *before* a run has happened.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..agents.graph import graph_topology
from ..agents.state import AGENT_ROLES
from ..config import settings
from ..core.telemetry import TELEMETRY
from ..data import db
from ..data.taxonomy import DOMAIN_SWEEPS, EXAMPLE_QUESTIONS, PRACTICE_AREAS
from ..services import cache, rag
from ..services import run_history
from ..services.vectorstore import get_index

router = APIRouter()


@router.get("/health")
def health() -> dict:
    counts = db.table_counts()
    index = get_index()
    return {
        "status": "ok" if index.ready else "degraded",
        "capabilities": {
            "llm": settings.has_llm,
            "web_search": settings.has_search,
            "vector_index": index.ready,
            "offline_mode": settings.offline_mode,
        },
        "models": {
            "chat": settings.gemini_chat_model,
            "fast": settings.gemini_fast_model,
            "embedding": settings.gemini_embed_model,
            "fallback_chain": settings.fallback_chain,
        },
        "counts": counts,
        "index_vectors": index.size,
    }


@router.get("/meta")
def meta() -> dict:
    """Everything the UI needs to render its chrome before any query runs."""
    return {
        "agents": [
            {"id": key, "name": value["name"], "role": value["role"]}
            for key, value in AGENT_ROLES.items()
        ],
        "topology": graph_topology(),
        "example_questions": list(EXAMPLE_QUESTIONS),
        "practice_areas": list(PRACTICE_AREAS),
        "sweeps": [
            {"key": s.key, "label": s.label, "category": s.category, "query": s.query}
            for s in DOMAIN_SWEEPS
        ],
        "library": rag.library_stats(),
    }


@router.get("/telemetry")
def telemetry() -> dict:
    """Process-wide API usage. Free tier, so the point is workload shape, not cost."""
    return {"process": TELEMETRY.summary(), "cache": cache.stats()}


@router.get("/runs")
def runs(limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), graph_only: bool = False) -> dict:
    return run_history.list_runs(limit, offset, graph_only)


@router.get("/runs/{run_id}/result")
def run_result(run_id: int) -> dict:
    result = run_history.load_run(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Saved run not found")
    return {"result": result}


@router.get("/runs/{run_id}")
def run_detail(run_id: int) -> dict:
    row = db.query_one("SELECT * FROM runs WHERE id = ?", (run_id,))
    if not row:
        return {"run": None}
    for field in ("plan", "trace", "citations", "telemetry"):
        row[field] = db.from_json(row.get(field), [] if field != "telemetry" else {})
    return {"run": row}
