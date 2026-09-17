"""Seed the internal research library and build the vector index.

Usage (from the backend/ directory):

    python -m scripts.seed                # use cached corpus if present
    python -m scripts.seed --force        # regenerate the corpus with the LLM
    python -m scripts.seed --archive 120  # blend in more public archive rows
    python -m scripts.seed --no-embed     # populate SQLite only (offline)
"""

from __future__ import annotations

import argparse
import sys
import time

from app.config import settings
from app.core.telemetry import TELEMETRY
from app.data import db
from app.data.library_builder import (
    chunk_document,
    fetch_archive,
    generate_library,
    iter_all_documents,
)
from app.services.vectorstore import LibraryIndex, get_index


def log(message: str) -> None:
    print(f"  {message}", flush=True)


def step(number: int, title: str) -> None:
    print(f"\n[{number}] {title}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the demand-sensing platform")
    parser.add_argument("--force", action="store_true", help="regenerate the corpus with the LLM")
    parser.add_argument("--archive", type=int, default=90, help="number of public archive clippings")
    parser.add_argument("--no-embed", action="store_true", help="skip embedding / index build")
    args = parser.parse_args()

    started = time.perf_counter()

    step(1, "Initialising SQLite schema")
    db.init_db()
    log(f"database: {settings.db_path}")

    step(2, "Building simulated research library")
    if args.force and not settings.has_llm:
        print("  ERROR: --force needs GOOGLE_API_KEY in backend/.env", file=sys.stderr)
        return 2
    library = generate_library(force=args.force, on_progress=log)
    log(f"{len(library)} research documents")

    step(3, "Fetching public archive clippings (HuffPost via HuggingFace)")
    archive = fetch_archive(limit=args.archive)
    log(f"{len(archive)} archive clippings" if archive else "archive unavailable - continuing without it")

    step(4, "Writing documents and chunks")
    documents = iter_all_documents(library, archive)
    doc_rows = []
    chunk_rows = []
    for doc in documents:
        body = doc["body"]
        doc_rows.append(
            (
                doc["doc_id"], doc["title"], doc["abstract"], body,
                doc["practice_area"], doc["doc_type"], doc["published_date"],
                doc.get("analyst"), doc.get("source_url"), len(body.split()),
            )
        )
        for index, text in enumerate(chunk_document(doc)):
            chunk_rows.append((doc["doc_id"], index, text))

    db.execute("DELETE FROM chunks")
    db.execute("DELETE FROM documents")
    db.execute_many(
        """INSERT INTO documents
           (doc_id, title, abstract, body, practice_area, doc_type,
            published_date, analyst, source_url, word_count)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        doc_rows,
    )
    db.execute_many("INSERT INTO chunks (doc_id, chunk_index, text) VALUES (?,?,?)", chunk_rows)
    log(f"{len(doc_rows)} documents, {len(chunk_rows)} chunks")

    areas = db.query(
        "SELECT practice_area, COUNT(*) c FROM documents GROUP BY practice_area ORDER BY c DESC"
    )
    for row in areas:
        log(f"  {row['practice_area']:<34} {row['c']:>4}")

    if args.no_embed:
        print("\nSkipped embedding (--no-embed).")
        return 0

    step(5, f"Embedding {len(chunk_rows)} chunks with {settings.gemini_embed_model} (dim={settings.embed_dim})")
    if not settings.has_llm:
        print("  ERROR: GOOGLE_API_KEY missing - cannot embed", file=sys.stderr)
        return 2

    from app.core.llm import embed_texts
    from app.data import embedding_cache

    log(f"embedding cache holds {embedding_cache.size()} vectors")
    texts = [row[2] for row in chunk_rows]
    keys = [(row[0], row[1]) for row in chunk_rows]
    vectors = embed_texts(texts, on_progress=log)

    step(6, "Building FAISS index")
    LibraryIndex.invalidate()
    get_index().build(keys, vectors)
    log(f"index: {settings.index_path} ({len(vectors)} vectors)")

    step(7, "Smoke-testing retrieval")
    index = get_index()
    for probe in [
        "governance and accountability for autonomous AI agents",
        "how are APAC manufacturers handling supply disruption",
        "board reporting for cyber incidents",
    ]:
        hits = index.search(probe, top_k=3)
        log(f"'{probe[:46]}...'")
        for hit in hits:
            log(f"    {hit.score:.3f}  [{hit.doc_id}] {hit.title[:58]}")

    summary = TELEMETRY.summary()
    print(
        f"\nDone in {time.perf_counter() - started:.1f}s | "
        f"{summary['total_calls']} API calls | {summary['total_tokens']} tokens | cost ${summary['estimated_cost_usd']:.2f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
