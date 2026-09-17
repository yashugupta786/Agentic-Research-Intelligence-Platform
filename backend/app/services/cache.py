"""Disk cache for external API responses.

Two reasons this exists, and the second one is the important one:

1. Tavily's free tier is 1,000 credits/month and GDELT throttles bursts hard
   (verified: HTTP 429 on parallel calls), so repeat calls must be avoided.
2. A live demo must never depend on someone else's uptime. Cached snapshots let
   the app answer instantly on stage while still supporting an explicit
   "refresh live" action.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable

from ..config import CACHE_DIR, settings


def _path(namespace: str, key: str):
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:20]
    folder = CACHE_DIR / namespace
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{digest}.json"


def read(namespace: str, key: str, *, ttl_hours: float | None = None) -> Any | None:
    path = _path(namespace, key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    ttl = settings.cache_ttl_hours if ttl_hours is None else ttl_hours
    # In offline mode any snapshot is better than nothing, however old.
    if ttl > 0 and not settings.offline_mode:
        age_hours = (time.time() - payload.get("stored_at", 0)) / 3600
        if age_hours > ttl:
            return None
    return payload.get("value")


def write(namespace: str, key: str, value: Any) -> None:
    path = _path(namespace, key)
    path.write_text(
        json.dumps({"key": key, "stored_at": time.time(), "value": value}, ensure_ascii=False, default=str),
        encoding="utf-8",
    )


def cached(
    namespace: str,
    key: str,
    producer: Callable[[], Any],
    *,
    ttl_hours: float | None = None,
    force: bool = False,
) -> tuple[Any, bool]:
    """Return ``(value, was_cached)``; falls back to a stale snapshot on failure."""
    if not force:
        hit = read(namespace, key, ttl_hours=ttl_hours)
        if hit is not None:
            return hit, True

    if settings.offline_mode:
        stale = read(namespace, key, ttl_hours=0)
        return (stale if stale is not None else None), True

    try:
        value = producer()
    except Exception:
        stale = read(namespace, key, ttl_hours=0)
        if stale is not None:
            return stale, True
        raise

    write(namespace, key, value)
    return value, False


def stats() -> dict[str, Any]:
    namespaces: dict[str, int] = {}
    if CACHE_DIR.exists():
        for folder in CACHE_DIR.iterdir():
            if folder.is_dir():
                namespaces[folder.name] = len(list(folder.glob("*.json")))
    return {"entries": sum(namespaces.values()), "by_namespace": namespaces}
