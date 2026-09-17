"""FastAPI application entrypoint.

    uvicorn app.main:app --reload --port 8000

Startup does two cheap things and refuses to do a third: it ensures the SQLite
schema exists and warms the FAISS index into memory. It does *not* seed - that
is an explicit `python -m scripts.seed` step, because seeding spends API quota
and a server restart should never do that silently.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import api_router
from .config import settings
from .data import db
from .services.vectorstore import get_index

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    index = get_index()
    logger.info(
        "Ready | index=%s vectors | llm=%s | web_search=%s | db=%s",
        index.size,
        settings.has_llm,
        settings.has_search,
        settings.db_path.name,
    )
    if not index.ready:
        logger.warning("Vector index is empty - run `python -m scripts.seed` before querying.")
    yield


app = FastAPI(
    title="Demand Sensing Intelligence Platform",
    description=(
        "Agentic AI + RAG + Knowledge Graph. Senses external market demand, "
        "compares it against the internal research library, and ranks coverage gaps."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# The Vite dev server runs on 5173; in a packaged demo the frontend is served
# from the same origin, so this only matters during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": "demand-sensing-intelligence",
        "docs": "/docs",
        "api": "/api/health",
    }
