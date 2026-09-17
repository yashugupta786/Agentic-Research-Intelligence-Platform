"""Content-addressed embedding cache stored in SQLite.

Vectors are kept as raw float32 bytes rather than JSON: 768 floats is ~3KB
packed versus ~15KB as text, and unpacking is a single numpy call. At corpus
scale that is the difference between a snappy rebuild and a slow one.
"""

from __future__ import annotations

import hashlib
from typing import Iterable, Sequence

import numpy as np

from ..config import settings
from . import db


def key_for(text: str, task_type: str) -> str:
    payload = f"{task_type}|{settings.embed_dim}|{settings.gemini_embed_model}|{text}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def get_many(texts: Sequence[str], task_type: str) -> dict[str, list[float]]:
    """Return ``{hash: vector}`` for whichever texts are already cached."""
    if not texts:
        return {}

    keys = [key_for(text, task_type) for text in texts]
    found: dict[str, list[float]] = {}

    # SQLite caps variables per statement; chunk the IN clause.
    for start in range(0, len(keys), 400):
        window = keys[start : start + 400]
        placeholders = ",".join("?" for _ in window)
        try:
            rows = db.query(
                f"SELECT hash, dim, vector FROM embedding_cache WHERE hash IN ({placeholders})",
                window,
            )
        except Exception:  # noqa: BLE001 - a missing table just means "no cache"
            return found
        for row in rows:
            if int(row["dim"]) != settings.embed_dim:
                continue
            found[row["hash"]] = np.frombuffer(row["vector"], dtype="float32").tolist()

    return found


def put_many(vectors: dict[str, list[float]], task_type: str) -> None:
    if not vectors:
        return
    db.execute_many(
        """INSERT OR REPLACE INTO embedding_cache (hash, dim, task_type, vector)
           VALUES (?,?,?,?)""",
        [
            (key, settings.embed_dim, task_type, np.asarray(vector, dtype="float32").tobytes())
            for key, vector in vectors.items()
        ],
    )


def size() -> int:
    row = db.query_one("SELECT COUNT(*) AS c FROM embedding_cache")
    return int(row["c"]) if row else 0


def clear(hashes: Iterable[str] | None = None) -> None:
    if hashes is None:
        db.execute("DELETE FROM embedding_cache")
        return
    keys = list(hashes)
    if keys:
        placeholders = ",".join("?" for _ in keys)
        db.execute(f"DELETE FROM embedding_cache WHERE hash IN ({placeholders})", keys)
