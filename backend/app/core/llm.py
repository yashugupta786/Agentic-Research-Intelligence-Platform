"""Gemini access layer: chat, structured extraction, and embeddings.

Design notes (these were driven by probing the free tier, not by guesswork):

* ``gemini-2.x`` model ids now return 404 "no longer available to new users",
  so the 3.x flash family is the target. Pro models return 429 without billing.
* The 3.x models ignore ``temperature`` (fixed sampling defaults) and emit a
  warning if you pass it, so we simply don't.
* ``batchEmbedContents`` accepts 48 items but returns 429 at 96 on the free
  tier, so embedding is chunked and retried with backoff.
* Embeddings are requested at 768 dimensions (down from the native 3072) which
  keeps the FAISS index small with no measurable retrieval loss at this corpus
  size.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Sequence, TypeVar

import httpx
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..config import settings
from .telemetry import Telemetry, track

logger = logging.getLogger(__name__)

GENAI_BASE = "https://generativelanguage.googleapis.com/v1beta"
T = TypeVar("T", bound=BaseModel)


class LLMUnavailable(RuntimeError):
    """Raised when no API key is configured, so callers can degrade gracefully."""


class RateLimited(RuntimeError):
    """Transient 429/503 from the free tier - safe to retry."""


# ---------------------------------------------------------------------------
# Chat models (used by LangGraph for tool calling)
# ---------------------------------------------------------------------------

_chat_cache: dict[str, ChatGoogleGenerativeAI] = {}


def get_chat_model(fast: bool = False) -> ChatGoogleGenerativeAI:
    """Return a cached chat model. ``fast=True`` picks the cheaper flash-lite."""
    if not settings.has_llm:
        raise LLMUnavailable("GOOGLE_API_KEY is not set (see backend/.env.example)")

    name = settings.gemini_fast_model if fast else settings.gemini_chat_model
    if name not in _chat_cache:
        _chat_cache[name] = ChatGoogleGenerativeAI(
            model=name,
            google_api_key=settings.google_api_key,
            max_retries=3,
        )
    return _chat_cache[name]


def message_text(message: Any) -> str:
    """Flatten a LangChain message's content.

    Gemini 3.x returns a list of content blocks rather than a bare string, so
    naive ``message.content`` handling breaks. This normalises both shapes.
    """
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if block.get("type") in (None, "text") and block.get("text"):
                    parts.append(str(block["text"]))
        return "\n".join(parts).strip()
    return str(content)


# ---------------------------------------------------------------------------
# Structured extraction (KG entities, topic normalisation, briefs, critique)
# ---------------------------------------------------------------------------


def _is_transient(exc: BaseException) -> bool:
    return isinstance(exc, (RateLimited, httpx.TimeoutException, httpx.TransportError))


def _post_once(path: str, payload: dict[str, Any], timeout: float = 120.0) -> dict[str, Any]:
    """Single POST to Gemini. Callers that can degrade should use this."""
    if not settings.has_llm:
        raise LLMUnavailable("GOOGLE_API_KEY is not set")

    response = httpx.post(
        f"{GENAI_BASE}/{path}",
        json=payload,
        headers={
            "x-goog-api-key": settings.google_api_key,
            "Content-Type": "application/json",
        },
        timeout=timeout,
    )
    if response.status_code in (429, 503):
        raise RateLimited(f"{response.status_code} on {path}: {response.text[:160]}")
    if response.status_code >= 400:
        # Surface the API's own message - httpx's default error hides it, and
        # "400 Bad Request" alone is useless when debugging response schemas.
        raise RuntimeError(f"Gemini {response.status_code} on {path}: {response.text[:600]}")
    return response.json()


@retry(
    retry=retry_if_exception_type((RateLimited, httpx.TimeoutException, httpx.TransportError)),
    # The free tier's per-minute ceiling needs patience, not persistence: short
    # retries just burn the same quota again. Backoff runs out past a minute.
    wait=wait_exponential(multiplier=3, min=4, max=75),
    stop=stop_after_attempt(6),
    reraise=True,
)
def _post(path: str, payload: dict[str, Any], timeout: float = 120.0) -> dict[str, Any]:
    """POST to the Gemini REST API with backoff on free-tier throttling."""
    return _post_once(path, payload, timeout=timeout)


def _clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Strip JSON-schema keywords the Gemini responseSchema validator rejects.

    Care is needed with ``properties``: its keys are user field names, so a
    field legitimately called "title" must survive even though the *keyword*
    ``title`` has to go.
    """
    drop = {"title", "default", "$defs", "additionalProperties", "definitions", "examples", "const"}

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            out: dict[str, Any] = {}
            for key, value in node.items():
                if key == "properties" and isinstance(value, dict):
                    out[key] = {name: walk(sub) for name, sub in value.items()}
                    continue
                if key in drop:
                    continue
                if key == "anyOf":  # Optional[...] -> take the first concrete type
                    concrete = [v for v in value if isinstance(v, dict) and v.get("type") != "null"]
                    if concrete:
                        out.update(walk(concrete[0]))
                    continue
                out[key] = walk(value)
            return out
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Resolve ``$ref``/``$defs`` produced by nested pydantic models."""
    defs = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref = node["$ref"].split("/")[-1]
                return walk(defs.get(ref, {}))
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


def _thinking_config(level: str | None) -> dict[str, Any]:
    """Thinking budget for a call.

    Gemini 3.x thinks without limit unless told otherwise, which on long
    retrieval prompts costs tens of seconds. ``low`` keeps reasoning quality
    while staying interactive; pass ``None`` to let the model decide.
    """
    resolved = settings.thinking_level if level is None else level
    if not resolved or resolved == "default":
        return {}
    return {"thinkingConfig": {"thinkingLevel": resolved}}


def extract_structured(
    prompt: str,
    schema_model: type[T],
    *,
    fast: bool = True,
    system: str | None = None,
    telemetry: Telemetry | None = None,
    label: str | None = None,
    thinking: str | None = None,
    retry: bool = True,
) -> T:
    """Ask Gemini for JSON matching ``schema_model`` and parse it.

    Uses the REST ``responseSchema`` path rather than LangChain's structured
    output so the schema is enforced server-side - the model physically cannot
    return prose, which removes an entire class of parsing failures.
    """
    raw_schema = _inline_refs(schema_model.model_json_schema())
    payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _clean_schema(raw_schema),
            **_thinking_config(thinking),
        },
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}

    model = settings.gemini_fast_model if fast else settings.gemini_chat_model
    body = _generate(
        model,
        payload,
        label=label or f"structured:{schema_model.__name__}",
        telemetry=telemetry,
        retry=retry,
    )

    text = _first_text(body)
    try:
        return schema_model.model_validate_json(text)
    except Exception:
        # Very occasionally the model wraps JSON in stray characters.
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return schema_model.model_validate_json(text[start : end + 1])
        raise


def generate_text(
    prompt: str,
    *,
    fast: bool = False,
    system: str | None = None,
    telemetry: Telemetry | None = None,
    label: str | None = None,
    thinking: str | None = None,
) -> str:
    """Plain text generation (final answer synthesis, brief prose)."""
    payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": _thinking_config(thinking),
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}

    model = settings.gemini_fast_model if fast else settings.gemini_chat_model
    body = _generate(model, payload, label=label or "generate", telemetry=telemetry)
    return _first_text(body)


# ---------------------------------------------------------------------------
# Multi-model failover
# ---------------------------------------------------------------------------
# Free-tier quotas are per-model and per-day, so one exhausted model must not
# take the whole app down. Exhausted models are remembered until the daily quota
# window rolls over, which keeps us from re-spending latency on a dead endpoint.
_exhausted: dict[str, float] = {}
_EXHAUSTED_TTL = 3600.0


def _is_daily_quota(message: str) -> bool:
    return "PerDay" in message or "per day" in message.lower()


def _available_chain(preferred: str) -> list[str]:
    chain = [preferred] + [m for m in settings.fallback_chain if m != preferred]
    now = time.time()
    live = [m for m in chain if now - _exhausted.get(m, 0) > _EXHAUSTED_TTL]
    return live or chain[:1]  # if everything looks exhausted, still try the first


def _generate(
    model: str,
    payload: dict[str, Any],
    *,
    label: str,
    telemetry: Telemetry | None = None,
    retry: bool = True,
) -> dict[str, Any]:
    """Call generateContent, transparently failing over to the next model."""
    last_error: Exception | None = None
    poster = _post if retry else _post_once

    for candidate in _available_chain(model):
        try:
            with track("llm", f"{label}@{candidate}", telemetry) as meta:
                body = poster(f"models/{candidate}:generateContent", payload)
                meta["tokens"] = body.get("usageMetadata", {}).get("totalTokenCount", 0)
            if candidate != model:
                logger.info("Model failover: %s -> %s for %s", model, candidate, label)
            return body
        except RateLimited as exc:
            last_error = exc
            if _is_daily_quota(str(exc)):
                _exhausted[candidate] = time.time()
                logger.warning("Daily free-tier quota exhausted for %s; failing over", candidate)
            continue
        except LLMUnavailable:
            raise
        except Exception as exc:  # noqa: BLE001 - try the next model, then give up
            last_error = exc
            continue

    raise last_error or RuntimeError("no model available")


def _first_text(body: dict[str, Any]) -> str:
    try:
        parts = body["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError) as exc:  # blocked or empty candidate
        raise RuntimeError(f"Gemini returned no candidate: {json.dumps(body)[:300]}") from exc
    return "".join(p.get("text", "") for p in parts).strip()


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------


def _embed_batch(texts: Sequence[str], task_type: str, telemetry: Telemetry | None) -> list[list[float]]:
    model = settings.gemini_embed_model  # already includes the "models/" prefix
    payload = {
        "requests": [
            {
                "model": model,
                "content": {"parts": [{"text": text[:8000] or " "}]},
                "taskType": task_type,
                "outputDimensionality": settings.embed_dim,
            }
            for text in texts
        ]
    }
    with track("embed", f"batch[{len(texts)}]", telemetry) as meta:
        body = _post(f"{model}:batchEmbedContents", payload)
        meta["items"] = len(texts)
    return [item["values"] for item in body["embeddings"]]


def embed_texts(
    texts: Sequence[str],
    *,
    task_type: str = "RETRIEVAL_DOCUMENT",
    telemetry: Telemetry | None = None,
    use_cache: bool = True,
    pause: float = 0.6,
    on_progress: Any = None,
) -> list[list[float]]:
    """Embed a list of texts, cached and paced for the free tier.

    Cache-first by content hash, so re-seeding resumes where it stopped instead
    of paying for the whole corpus again. Batches are also spaced out: the
    per-minute ceiling is reached by *rate*, and hammering it just triggers
    another 429.
    """
    if not texts:
        return []

    from ..data import embedding_cache  # imported here to avoid a circular import

    results: list[list[float] | None] = [None] * len(texts)
    pending: list[int] = list(range(len(texts)))

    if use_cache:
        cached_vectors = embedding_cache.get_many(texts, task_type)
        pending = []
        for i, text in enumerate(texts):
            hit = cached_vectors.get(embedding_cache.key_for(text, task_type))
            if hit is not None:
                results[i] = hit
            else:
                pending.append(i)
        if on_progress and len(pending) < len(texts):
            on_progress(f"{len(texts) - len(pending)}/{len(texts)} embeddings served from cache")

    batch = max(1, settings.embed_batch_size)
    fresh: dict[str, list[float]] = {}

    for start in range(0, len(pending), batch):
        window = pending[start : start + batch]
        chunk = [texts[i] for i in window]
        vectors = _embed_batch(chunk, task_type, telemetry)
        for i, vector in zip(window, vectors):
            results[i] = vector
            fresh[embedding_cache.key_for(texts[i], task_type)] = vector

        if use_cache and fresh:
            embedding_cache.put_many(fresh, task_type)  # persist as we go
            fresh = {}
        if on_progress:
            on_progress(f"embedded {min(start + batch, len(pending))}/{len(pending)} new chunks")
        if pause and start + batch < len(pending):
            time.sleep(pause)

    return [vector if vector is not None else [0.0] * settings.embed_dim for vector in results]


def embed_query(text: str, *, telemetry: Telemetry | None = None) -> list[float]:
    """Embed a single query.

    ``RETRIEVAL_QUERY`` is asymmetric to ``RETRIEVAL_DOCUMENT`` and measurably
    improves ranking versus embedding both sides the same way.
    """
    payload = {
        "content": {"parts": [{"text": text[:8000] or " "}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": settings.embed_dim,
    }
    with track("embed", "query", telemetry) as meta:
        body = _post(f"{settings.gemini_embed_model}:embedContent", payload)
        meta["items"] = 1
    return body["embedding"]["values"]
