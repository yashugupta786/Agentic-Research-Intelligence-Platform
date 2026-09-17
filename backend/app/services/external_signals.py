"""External demand signals: Tavily (news) + GDELT (volume time series).

The two sources answer different questions and that split is deliberate:

* **Tavily** tells us *what* is being said - titles, snippets, URLs, dates. That
  text is what the LLM reads to discover and name topics.
* **GDELT** tells us *how much* it is being said, day by day. Volume over time
  is the only honest way to separate "a topic exists" from "a topic is
  surging", and it is free with no key.

Gemini's own Google-Search grounding would have been the obvious choice, but it
returns HTTP 429 without billing, so it is not an option on the free tier.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Any, Iterable
from urllib.parse import urlparse

import httpx

from ..config import settings
from ..core.telemetry import track
from .cache import cached

logger = logging.getLogger(__name__)

# After a 429, skip further GDELT calls for this window. Retrying burns 30-90s
# per topic and makes the UI look like the backend has died.
_GDELT_COOLDOWN_UNTIL = 0.0
_GDELT_COOLDOWN_SECONDS = 180.0

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126 Safari/537.36"
    )
}


@dataclass
class Article:
    title: str
    url: str
    domain: str
    snippet: str
    published_date: str | None
    relevance: float
    source: str
    sweep: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Tavily
# ---------------------------------------------------------------------------
def _tavily_client():
    from tavily import TavilyClient

    return TavilyClient(api_key=settings.tavily_api_key)


def _normalise_date(value: Any) -> str | None:
    """Tavily returns RFC-1123 dates; GDELT returns compact UTC stamps."""
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    match = re.match(r"(\d{4})(\d{2})(\d{2})T", text)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    return text[:10] if re.match(r"\d{4}-\d{2}-\d{2}", text) else None


def search_news(
    query: str,
    *,
    max_results: int = 8,
    days: int = 30,
    sweep: str | None = None,
    force: bool = False,
) -> tuple[list[Article], bool]:
    """Search recent news for a query. Returns ``(articles, from_cache)``."""
    if not settings.tavily_api_key:
        return [], True

    key = f"news::{query}::{max_results}::{days}"

    def produce() -> list[dict[str, Any]]:
        with track("search", f"tavily:{query[:36]}") as meta:
            payload = _tavily_client().search(
                query=query,
                topic="news",
                days=days,
                max_results=max_results,
                search_depth="basic",
            )
            results = payload.get("results", [])
            meta["items"] = len(results)
        return results

    try:
        raw, from_cache = cached("tavily", key, produce, force=force)
    except Exception as exc:  # noqa: BLE001 - degrade rather than fail the run
        logger.warning("Tavily search failed for %r: %s", query, exc)
        return [], False

    articles: list[Article] = []
    for item in raw or []:
        url = item.get("url") or ""
        if not url:
            continue
        articles.append(
            Article(
                title=(item.get("title") or "").strip(),
                url=url,
                domain=urlparse(url).netloc.replace("www.", ""),
                snippet=(item.get("content") or "")[:900],
                published_date=_normalise_date(item.get("published_date")),
                relevance=float(item.get("score") or 0.0),
                source="tavily",
                sweep=sweep,
            )
        )
    return articles, from_cache


def sweep_domains(sweeps: Iterable[Any], *, per_sweep: int = 8, force: bool = False) -> tuple[list[Article], int]:
    """Run every domain sweep and return a de-duplicated article pool."""
    pool: dict[str, Article] = {}
    cache_hits = 0
    for sweep in sweeps:
        articles, from_cache = search_news(
            sweep.query, max_results=per_sweep, sweep=sweep.key, force=force
        )
        cache_hits += int(from_cache)
        for article in articles:
            pool.setdefault(article.url, article)
    return list(pool.values()), cache_hits


# ---------------------------------------------------------------------------
# GDELT volume series
# ---------------------------------------------------------------------------
def _gdelt_query(topic: str) -> str:
    """Build a GDELT query string.

    Multi-word phrases must be quoted or GDELT ORs the terms and the volume
    curve becomes meaningless. Long phrases are trimmed - GDELT matches the
    literal phrase, and 8+ word phrases return almost nothing.
    """
    words = re.sub(r"[^\w\s-]", " ", topic).split()
    trimmed = " ".join(words[:5])
    phrase = f'"{trimmed}"' if len(words) > 1 else trimmed
    return f"{phrase} sourcelang:english"


def volume_series(topic: str, *, timespan: str = "3m", force: bool = False) -> tuple[list[dict[str, Any]], bool]:
    """Daily article-volume series for a topic. Returns ``(points, from_cache)``."""
    global _GDELT_COOLDOWN_UNTIL
    if time.time() < _GDELT_COOLDOWN_UNTIL:
        return [], False

    key = f"vol::{topic}::{timespan}"

    def produce() -> list[dict[str, Any]]:
        global _GDELT_COOLDOWN_UNTIL
        params = {
            "query": _gdelt_query(topic),
            "mode": "TimelineVolRaw",
            "timespan": timespan,
            "format": "json",
        }
        with track("gdelt", f"volume:{topic[:36]}") as meta:
            response = httpx.get(GDELT_URL, params=params, headers=GDELT_HEADERS, timeout=20)
            if response.status_code == 429:
                _GDELT_COOLDOWN_UNTIL = time.time() + _GDELT_COOLDOWN_SECONDS
                raise RuntimeError("gdelt 429")
            response.raise_for_status()
            text = response.text.strip()
            if not text.startswith("{"):
                return []
            timeline = response.json().get("timeline") or []
            points = timeline[0].get("data", []) if timeline else []
            meta["items"] = len(points)
            return [
                {"date": _normalise_date(p.get("date")), "value": float(p.get("value") or 0)}
                for p in points
                if _normalise_date(p.get("date"))
            ]

    try:
        points, from_cache = cached(
            "gdelt", key, produce, ttl_hours=settings.cache_ttl_hours * 2, force=force
        )
        return (points or []), from_cache
    except Exception as exc:  # noqa: BLE001
        logger.info("GDELT unavailable for %r: %s", topic, exc)
        return [], False


def synthetic_series(mentions: int, *, days: int = 60, growth: float = 0.0) -> list[dict[str, Any]]:
    """Fallback curve when GDELT has no data for a topic.

    Used only so the UI always has something to draw; anything derived from it
    is flagged ``source='derived'`` rather than presented as measured volume.
    """
    today = date.today()
    points: list[dict[str, Any]] = []
    base = max(mentions, 1)
    for offset in range(days, -1, -1):
        progress = (days - offset) / max(days, 1)
        value = base * (0.4 + progress * (0.6 + growth))
        points.append({"date": (today - timedelta(days=offset)).isoformat(), "value": round(value, 3)})
    return points
