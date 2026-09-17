"""Internal research library: browsing, semantic search and grounded QA."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from ..data import db
from ..services import rag
from .schemas import LibraryQuestion

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/library")


@router.get("/stats")
def stats() -> dict:
    return rag.library_stats()


@router.get("/documents")
def documents(
    practice_area: str | None = None,
    doc_type: str | None = None,
    q: str | None = None,
    limit: int = Query(default=40, ge=1, le=200),
    offset: int = 0,
) -> dict:
    clauses: list[str] = []
    params: list = []
    if practice_area:
        clauses.append("practice_area = ?")
        params.append(practice_area)
    if doc_type:
        clauses.append("doc_type = ?")
        params.append(doc_type)
    if q:
        clauses.append("(title LIKE ? OR abstract LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    total = (db.query_one(f"SELECT COUNT(*) AS n FROM documents{where}", params) or {}).get("n", 0)
    rows = db.query(
        f"""SELECT doc_id, title, abstract, practice_area, doc_type,
                   published_date, analyst, word_count
            FROM documents{where}
            ORDER BY published_date DESC LIMIT ? OFFSET ?""",
        [*params, limit, offset],
    )
    facets = db.query(
        "SELECT practice_area, COUNT(*) AS n FROM documents GROUP BY practice_area ORDER BY n DESC"
    )
    types = db.query("SELECT doc_type, COUNT(*) AS n FROM documents GROUP BY doc_type ORDER BY n DESC")
    return {"documents": rows, "total": total, "facets": facets, "doc_types": types}


@router.get("/documents/{doc_id}")
def document(doc_id: str) -> dict:
    row = db.query_one("SELECT * FROM documents WHERE doc_id = ?", (doc_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"Unknown document: {doc_id}")
    chunks = db.query(
        "SELECT chunk_index, text FROM chunks WHERE doc_id = ? ORDER BY chunk_index",
        (doc_id,),
    )
    return {"document": row, "chunks": chunks}


@router.get("/search")
async def search(q: str = Query(min_length=2), top_k: int = Query(default=8, ge=1, le=25)) -> dict:
    """Semantic (vector) search over the library, collapsed to best-per-document."""
    try:
        results = await asyncio.to_thread(rag.search_library, q, top_k=top_k)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    return {"query": q, "results": results}


@router.post("/ask")
async def ask(payload: LibraryQuestion) -> dict:
    """Grounded QA with enforced citations and an independent groundedness score."""
    try:
        answer = await asyncio.to_thread(
            rag.answer_question,
            payload.question,
            top_k=payload.top_k,
            check_groundedness=True,
            persist=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Library QA failed")
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    return answer.to_dict()
