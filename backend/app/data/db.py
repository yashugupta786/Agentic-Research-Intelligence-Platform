"""SQLite persistence layer.

SQLite is deliberate: it ships inside Python, needs no server, and the whole
database is a single file inside the repo. A reviewer can clone, seed, and run
in a couple of minutes - no Docker, no Neo4j, no Postgres. The schema below is
still normalised the way a real system would be, so the design intent survives
even though the storage engine is humble.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterable, Iterator

from ..config import settings

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Internal research library (the "shelf" we compare the market against)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT UNIQUE NOT NULL,       -- e.g. RN-1042, cited in answers
    title           TEXT NOT NULL,
    abstract        TEXT NOT NULL,
    body            TEXT NOT NULL,
    practice_area   TEXT NOT NULL,              -- simulated Gartner practice
    doc_type        TEXT NOT NULL,              -- Research Note / Market Guide / ...
    published_date  TEXT NOT NULL,              -- ISO date
    analyst         TEXT,
    source_url      TEXT,
    word_count      INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documents_area ON documents(practice_area);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(published_date);

-- Chunk-level rows are what actually get embedded and cited.
CREATE TABLE IF NOT EXISTS chunks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    UNIQUE(doc_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

-- ---------------------------------------------------------------------------
-- Topics: canonical, de-duplicated market themes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    label           TEXT NOT NULL,              -- canonical display name
    aliases         TEXT DEFAULT '[]',          -- JSON list of merged surface forms
    category        TEXT,                       -- Technology / Risk / Operations ...
    description     TEXT,
    mention_count   INTEGER DEFAULT 0,
    source_count    INTEGER DEFAULT 0,
    momentum        REAL DEFAULT 0,             -- 0..1 composite surge score
    growth_pct      REAL DEFAULT 0,             -- recent vs baseline volume
    velocity        REAL DEFAULT 0,             -- slope of the volume curve
    recency_days    REAL DEFAULT 0,
    first_seen      TEXT,
    last_seen       TEXT,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_topics_momentum ON topics(momentum DESC);

-- ---------------------------------------------------------------------------
-- External signals (news articles / search results backing each topic)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_slug      TEXT REFERENCES topics(slug) ON DELETE CASCADE,
    source          TEXT NOT NULL,              -- tavily | gdelt | seed
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    domain          TEXT,
    snippet         TEXT,
    published_date  TEXT,
    relevance       REAL DEFAULT 0,
    fetched_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(topic_slug, url)
);
CREATE INDEX IF NOT EXISTS idx_signals_topic ON signals(topic_slug);

-- Daily volume series used to compute momentum.
CREATE TABLE IF NOT EXISTS topic_timeseries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_slug      TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
    date            TEXT NOT NULL,
    value           REAL NOT NULL,
    source          TEXT DEFAULT 'gdelt',
    UNIQUE(topic_slug, date, source)
);

-- ---------------------------------------------------------------------------
-- Coverage + gap analysis (the core deliverable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coverage (
    topic_slug      TEXT PRIMARY KEY REFERENCES topics(slug) ON DELETE CASCADE,
    doc_count       INTEGER DEFAULT 0,
    strong_matches  INTEGER DEFAULT 0,
    best_score      REAL DEFAULT 0,
    mean_score      REAL DEFAULT 0,
    newest_doc_date TEXT,
    staleness_days  REAL DEFAULT 0,
    coverage_score  REAL DEFAULT 0,             -- 0..1
    matched_docs    TEXT DEFAULT '[]',          -- JSON list of doc ids + scores
    computed_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gaps (
    topic_slug      TEXT PRIMARY KEY REFERENCES topics(slug) ON DELETE CASCADE,
    momentum        REAL DEFAULT 0,
    coverage_score  REAL DEFAULT 0,
    gap_score       REAL DEFAULT 0,             -- 0..1, higher = more urgent
    priority        TEXT,                       -- CRITICAL / HIGH / MEDIUM / LOW
    quadrant        TEXT,                       -- publish_now / maintain / ...
    rationale       TEXT,
    computed_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Recommended (not written) research, produced when a gap is confirmed.
CREATE TABLE IF NOT EXISTS briefs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_slug      TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    why_now         TEXT,
    key_questions   TEXT DEFAULT '[]',
    suggested_type  TEXT,
    audience        TEXT,
    adjacent_docs   TEXT DEFAULT '[]',
    sources         TEXT DEFAULT '[]',
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Knowledge graph (persisted; NetworkX is rebuilt from these rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kg_nodes (
    key             TEXT PRIMARY KEY,           -- "type:normalised_name"
    label           TEXT NOT NULL,
    type            TEXT NOT NULL,              -- TOPIC / COMPANY / GEO / ...
    weight          REAL DEFAULT 1,
    properties      TEXT DEFAULT '{}',
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kg_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    src             TEXT NOT NULL REFERENCES kg_nodes(key) ON DELETE CASCADE,
    dst             TEXT NOT NULL REFERENCES kg_nodes(key) ON DELETE CASCADE,
    relation        TEXT NOT NULL,
    weight          REAL DEFAULT 1,
    evidence        TEXT DEFAULT '[]',
    UNIQUE(src, dst, relation)
);

-- ---------------------------------------------------------------------------
-- Agent runs (kept so the demo can replay a trace, and for evaluation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question        TEXT NOT NULL,
    intent          TEXT,
    plan            TEXT DEFAULT '[]',
    trace           TEXT DEFAULT '[]',
    answer          TEXT,
    citations       TEXT DEFAULT '[]',
    groundedness    REAL,
    latency_ms      INTEGER,
    telemetry       TEXT DEFAULT '{}',
    result_json     TEXT,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Embedding cache. The free tier throttles hard (HTTP 429 mid-run), so every
-- vector is stored keyed by content hash: re-seeding resumes instead of
-- restarting, and unchanged text is never paid for twice.
CREATE TABLE IF NOT EXISTS embedding_cache (
    hash            TEXT PRIMARY KEY,
    dim             INTEGER NOT NULL,
    task_type       TEXT NOT NULL,
    vector          BLOB NOT NULL,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    suite           TEXT NOT NULL,
    metric          TEXT NOT NULL,
    value           REAL NOT NULL,
    detail          TEXT DEFAULT '{}',
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Transactional connection; commits on success, rolls back on error."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        # Additive migration: preserve all existing demo runs.
        columns = {row[1] for row in conn.execute("PRAGMA table_info(runs)")}
        if "result_json" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN result_json TEXT")


def query(sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return [dict(row) for row in conn.execute(sql, tuple(params)).fetchall()]


def query_one(sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    with get_conn() as conn:
        cur = conn.execute(sql, tuple(params))
        return cur.lastrowid or cur.rowcount


def execute_many(sql: str, rows: Iterable[Iterable[Any]]) -> None:
    with get_conn() as conn:
        conn.executemany(sql, [tuple(r) for r in rows])


def as_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def from_json(value: Any, fallback: Any = None) -> Any:
    if value in (None, ""):
        return fallback
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def table_counts() -> dict[str, int]:
    """Used by /api/health so the UI can tell whether seeding has run."""
    tables = [
        "documents",
        "chunks",
        "topics",
        "signals",
        "topic_timeseries",
        "coverage",
        "gaps",
        "briefs",
        "kg_nodes",
        "kg_edges",
        "runs",
        "embedding_cache",
    ]
    counts: dict[str, int] = {}
    with get_conn() as conn:
        for table in tables:
            try:
                counts[table] = conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]
            except sqlite3.Error:
                counts[table] = 0
    return counts
