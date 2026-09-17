"""Knowledge graph endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..data import db
from ..services import knowledge_graph

router = APIRouter(prefix="/graph")


@router.get("")
def full_graph(
    types: str | None = Query(default=None, description="Comma-separated node types to include"),
    max_nodes: int = Query(default=260, ge=20, le=800),
) -> dict:
    node_types = [t.strip() for t in types.split(",") if t.strip()] if types else None
    return knowledge_graph.to_cytoscape(node_types=node_types, max_nodes=max_nodes)


@router.get("/entities")
def entities(limit: int = Query(default=14, ge=1, le=60)) -> dict:
    return {"entities": knowledge_graph.central_entities(limit=limit)}


@router.get("/legend")
def legend() -> dict:
    """Node/edge inventory - lets the UI build its legend from real data."""
    nodes = db.query("SELECT type, COUNT(*) AS n FROM kg_nodes GROUP BY type ORDER BY n DESC")
    edges = db.query("SELECT relation, COUNT(*) AS n FROM kg_edges GROUP BY relation ORDER BY n DESC")
    return {"node_types": nodes, "relations": edges}


@router.get("/topic/{slug}")
def topic_subgraph(slug: str, depth: int = Query(default=1, ge=1, le=3)) -> dict:
    payload = knowledge_graph.topic_subgraph(slug, depth=depth)
    if not payload.get("nodes"):
        raise HTTPException(status_code=404, detail=f"No graph neighbourhood for {slug}")
    return payload
