"""Lightweight in-process telemetry.

Every LLM / search / embedding call is recorded so the UI can show the VP what
the run actually cost: how many model calls, how many tokens, and where the
time went. Free tier means the dollar cost is zero, but the *shape* of the
workload is exactly what a production estimate would be built from.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CallRecord:
    kind: str  # "llm" | "embed" | "search" | "gdelt"
    label: str
    latency_ms: int
    tokens: int = 0
    items: int = 0
    cached: bool = False
    error: str | None = None


@dataclass
class Telemetry:
    """Aggregates call records for a single agent run (or the whole process)."""

    records: list[CallRecord] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, record: CallRecord) -> None:
        with self._lock:
            self.records.append(record)

    def summary(self) -> dict[str, Any]:
        by_kind: dict[str, dict[str, int]] = defaultdict(lambda: {"calls": 0, "tokens": 0, "latency_ms": 0})
        for r in self.records:
            slot = by_kind[r.kind]
            slot["calls"] += 1
            slot["tokens"] += r.tokens
            slot["latency_ms"] += r.latency_ms
        return {
            "total_calls": len(self.records),
            "total_tokens": sum(r.tokens for r in self.records),
            "total_latency_ms": sum(r.latency_ms for r in self.records),
            "cache_hits": sum(1 for r in self.records if r.cached),
            "errors": [r.error for r in self.records if r.error],
            "by_kind": dict(by_kind),
            # Free tier: no spend. Kept explicit so the number is visible.
            "estimated_cost_usd": 0.0,
        }

    def reset(self) -> None:
        with self._lock:
            self.records.clear()


# Process-wide collector (single-user prototype; keeps the demo simple).
TELEMETRY = Telemetry()


@contextmanager
def track(kind: str, label: str, telemetry: Telemetry | None = None):
    """Time a call and record it. Yields a mutable dict for tokens/items."""
    sink = telemetry or TELEMETRY
    meta: dict[str, Any] = {"tokens": 0, "items": 0, "cached": False}
    start = time.perf_counter()
    error: str | None = None
    try:
        yield meta
    except Exception as exc:  # noqa: BLE001 - record then re-raise
        error = f"{type(exc).__name__}: {exc}"[:200]
        raise
    finally:
        sink.add(
            CallRecord(
                kind=kind,
                label=label,
                latency_ms=int((time.perf_counter() - start) * 1000),
                tokens=int(meta.get("tokens") or 0),
                items=int(meta.get("items") or 0),
                cached=bool(meta.get("cached")),
                error=error,
            )
        )
