"""FAISS vector store over the internal library.

Cosine similarity via inner product on L2-normalised vectors. ``IndexFlatIP``
is an exact index - at a few thousand chunks there is no reason to trade recall
for speed, and exactness keeps the retrieval evaluation honest.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from typing import Any

import faiss
import numpy as np

from ..config import settings
from ..core.llm import embed_query, embed_texts
from ..data import db


@dataclass
class Hit:
    doc_id: str
    chunk_index: int
    score: float
    text: str
    title: str
    practice_area: str
    doc_type: str
    published_date: str
    analyst: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "chunk_index": self.chunk_index,
            "score": round(self.score, 4),
            "text": self.text,
            "title": self.title,
            "practice_area": self.practice_area,
            "doc_type": self.doc_type,
            "published_date": self.published_date,
            "analyst": self.analyst,
        }


class LibraryIndex:
    """Thread-safe singleton wrapper around the FAISS index."""

    _lock = threading.Lock()
    _instance: "LibraryIndex | None" = None

    def __init__(self) -> None:
        self.index: faiss.Index | None = None
        self.keys: list[tuple[str, int]] = []  # (doc_id, chunk_index)

    # -- lifecycle ---------------------------------------------------------
    @classmethod
    def instance(cls) -> "LibraryIndex":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
                cls._instance.load()
            return cls._instance

    @classmethod
    def invalidate(cls) -> None:
        with cls._lock:
            cls._instance = None

    def load(self) -> bool:
        if not settings.index_path.exists() or not settings.index_ids_path.exists():
            return False
        self.index = faiss.read_index(str(settings.index_path))
        raw = json.loads(settings.index_ids_path.read_text(encoding="utf-8"))
        self.keys = [(item[0], int(item[1])) for item in raw]
        return True

    @property
    def ready(self) -> bool:
        return self.index is not None and self.index.ntotal > 0

    @property
    def size(self) -> int:
        return int(self.index.ntotal) if self.index is not None else 0

    # -- build -------------------------------------------------------------
    def build(self, keys: list[tuple[str, int]], vectors: list[list[float]]) -> None:
        matrix = np.asarray(vectors, dtype="float32")
        faiss.normalize_L2(matrix)
        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)

        faiss.write_index(index, str(settings.index_path))
        settings.index_ids_path.write_text(json.dumps(keys), encoding="utf-8")
        self.index, self.keys = index, keys

    # -- search ------------------------------------------------------------
    def search(self, query: str, top_k: int | None = None, *, min_score: float = 0.0) -> list[Hit]:
        if not self.ready:
            return []
        return self.search_vector(embed_query(query), top_k=top_k, min_score=min_score)

    def search_vector(
        self,
        vector: list[float],
        top_k: int | None = None,
        *,
        min_score: float = 0.0,
    ) -> list[Hit]:
        if not self.ready:
            return []

        k = min(top_k or settings.rag_top_k, self.size)
        q = np.asarray([vector], dtype="float32")
        faiss.normalize_L2(q)
        scores, indices = self.index.search(q, k)  # type: ignore[union-attr]

        wanted: list[tuple[str, int, float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or float(score) < min_score:
                continue
            doc_id, chunk_index = self.keys[int(idx)]
            wanted.append((doc_id, chunk_index, float(score)))

        if not wanted:
            return []

        placeholders = ",".join("?" for _ in wanted)
        rows = db.query(
            f"""
            SELECT c.doc_id, c.chunk_index, c.text,
                   d.title, d.practice_area, d.doc_type, d.published_date, d.analyst
            FROM chunks c
            JOIN documents d ON d.doc_id = c.doc_id
            WHERE c.doc_id IN ({placeholders})
            """,
            [w[0] for w in wanted],
        )
        lookup = {(r["doc_id"], r["chunk_index"]): r for r in rows}

        hits: list[Hit] = []
        for doc_id, chunk_index, score in wanted:
            row = lookup.get((doc_id, chunk_index))
            if not row:
                continue
            hits.append(
                Hit(
                    doc_id=doc_id,
                    chunk_index=chunk_index,
                    score=score,
                    text=row["text"],
                    title=row["title"],
                    practice_area=row["practice_area"],
                    doc_type=row["doc_type"],
                    published_date=row["published_date"],
                    analyst=row["analyst"],
                )
            )
        return hits

    def search_documents(self, query: str, top_k: int = 8) -> list[dict[str, Any]]:
        """Chunk hits collapsed to best-per-document (what a user actually wants)."""
        hits = self.search(query, top_k=top_k * 3)
        best: dict[str, Hit] = {}
        for hit in hits:
            current = best.get(hit.doc_id)
            if current is None or hit.score > current.score:
                best[hit.doc_id] = hit
        ordered = sorted(best.values(), key=lambda h: h.score, reverse=True)[:top_k]
        return [h.to_dict() for h in ordered]


def get_index() -> LibraryIndex:
    return LibraryIndex.instance()


def rebuild_index_from_db() -> int:
    """Re-embed every chunk in SQLite and rewrite the FAISS index."""
    rows = db.query("SELECT doc_id, chunk_index, text FROM chunks ORDER BY doc_id, chunk_index")
    if not rows:
        return 0
    vectors = embed_texts([r["text"] for r in rows])
    keys = [(r["doc_id"], r["chunk_index"]) for r in rows]
    LibraryIndex.invalidate()
    get_index().build(keys, vectors)
    return len(keys)
