"""HTTP layer. Thin by design: every route delegates to a service or the graph."""

from fastapi import APIRouter

from . import agent, graph, intel, library, system

api_router = APIRouter(prefix="/api")
api_router.include_router(system.router, tags=["system"])
api_router.include_router(agent.router, tags=["agent"])
api_router.include_router(intel.router, tags=["intelligence"])
api_router.include_router(library.router, tags=["library"])
api_router.include_router(graph.router, tags=["knowledge-graph"])

__all__ = ["api_router"]
