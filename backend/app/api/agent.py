"""Agent execution endpoints.

Two ways to run the same graph:

``POST /api/ask``
    Blocking. Returns the whole result once. Useful for scripts and evaluation.

``GET /api/ask/stream``
    Server-sent events. The graph runs on a worker thread and pushes trace
    events into an asyncio queue as they happen, so the UI can show each
    specialist working instead of a spinner for 40 seconds. For a case study
    about *orchestration*, watching the orchestration is the whole point.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from ..agents.graph import run_agent
from .schemas import AskRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ask")
async def ask(payload: AskRequest) -> dict:
    try:
        return await asyncio.to_thread(
            run_agent,
            payload.question,
            force_refresh=payload.force_refresh,
            intent=payload.intent,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Agent run failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc


@router.get("/ask/stream")
async def ask_stream(
    q: str = Query(min_length=2, max_length=500),
    refresh: bool = False,
    intent: str | None = Query(default=None),
) -> EventSourceResponse:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def push(item: dict | None) -> None:
        # Called from the worker thread; hand off to the event loop safely.
        loop.call_soon_threadsafe(queue.put_nowait, item)

    def emit(event) -> None:
        push({"type": "trace", "event": event.to_dict()})

    def worker() -> None:
        try:
            result = run_agent(q, force_refresh=refresh, intent=intent, emit=emit)
            push({"type": "result", "result": result})
        except Exception as exc:  # noqa: BLE001
            logger.exception("Streamed agent run failed")
            push({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        finally:
            push(None)

    threading.Thread(target=worker, daemon=True, name="agent-run").start()

    async def events():
        yield {"event": "message", "data": json.dumps({"type": "open", "question": q})}
        while True:
            item = await queue.get()
            if item is None:
                break
            yield {"event": "message", "data": json.dumps(item, default=str)}
        yield {"event": "message", "data": json.dumps({"type": "done"})}

    return EventSourceResponse(events(), ping=8, send_timeout=600)
