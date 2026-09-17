"""The LangGraph orchestrator.

    planner
       |
       +-- market_scan / topic_deep_dive --> scout -> topic_analyst -> momentum_analyst
       |                                        -> librarian -> graph_curator
       |                                        -> gap_analyst -> synthesizer -> critic
       +-- gap_review --------------------> gap_review -> synthesizer -> critic
       +-- library_qa --------------------> librarian(RAG) -> synthesizer -> critic

The conditional edge out of the planner is the point of the exercise: a question
about the internal library must not trigger web sensing, and a market scan must
not answer from stale memory. Routing is a decision the model makes per request,
not a hardcoded branch.
"""

from __future__ import annotations

import time
from copy import deepcopy
from typing import Any, Callable, Iterator

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

from ..data import db
from ..services.run_history import save_run
from .nodes import (
    critic_node,
    gap_analyst_node,
    gap_review_node,
    graph_curator_node,
    librarian_coverage_node,
    librarian_rag_node,
    momentum_node,
    planner_node,
    scout_node,
    synthesizer_node,
    topic_analyst_node,
)
from .state import AgentState, Emitter, Tracer

_compiled = None


def with_output_trace(node_id: str, fn: Callable) -> Callable:
    """Stream the actual serialisable node update for the expandable UI cards."""
    def traced(state: AgentState, config: RunnableConfig):
        update = fn(state, config)
        tracer = (config.get("configurable") or {}).get("tracer")
        if tracer and update is not None:
            output = {k: v for k, v in update.items() if k != "topic_objects"}
            tracer.progress(node_id, "Output ready", output=deepcopy(output))
        return update
    return traced


def route_after_planner(state: AgentState) -> str:
    intent = state.get("intent", "market_scan")
    if intent == "library_qa":
        return "librarian_rag"
    if intent == "gap_review":
        return "gap_review"
    return "scout"


def build_graph():
    """Compile the agent graph (cached - compilation is not free)."""
    global _compiled
    if _compiled is not None:
        return _compiled

    builder = StateGraph(AgentState)

    for name, trace_name, fn in [
        ("planner", "planner", planner_node), ("scout", "scout", scout_node),
        ("topic_analyst", "topic_analyst", topic_analyst_node),
        ("momentum_analyst", "momentum_analyst", momentum_node),
        ("librarian_coverage", "librarian", librarian_coverage_node),
        ("graph_curator", "graph_curator", graph_curator_node),
        ("gap_analyst", "gap_analyst", gap_analyst_node),
        ("gap_review", "gap_analyst", gap_review_node),
        ("librarian_rag", "librarian", librarian_rag_node),
        ("synthesizer", "synthesizer", synthesizer_node), ("critic", "critic", critic_node),
    ]:
        builder.add_node(name, with_output_trace(trace_name, fn))

    builder.set_entry_point("planner")
    builder.add_conditional_edges(
        "planner",
        route_after_planner,
        {"scout": "scout", "librarian_rag": "librarian_rag", "gap_review": "gap_review"},
    )

    # Market-scan pipeline
    builder.add_edge("scout", "topic_analyst")
    builder.add_edge("topic_analyst", "momentum_analyst")
    builder.add_edge("momentum_analyst", "librarian_coverage")
    builder.add_edge("librarian_coverage", "graph_curator")
    builder.add_edge("graph_curator", "gap_analyst")
    builder.add_edge("gap_analyst", "synthesizer")

    # Other paths converge on synthesis
    builder.add_edge("gap_review", "synthesizer")
    builder.add_edge("librarian_rag", "synthesizer")

    builder.add_edge("synthesizer", "critic")
    builder.add_edge("critic", END)

    _compiled = builder.compile()
    return _compiled


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
def run_agent(
    question: str,
    *,
    force_refresh: bool = False,
    intent: str | None = None,
    emit: Emitter | None = None,
    persist: bool = True,
) -> dict[str, Any]:
    """Run the full graph and return a serialisable result."""
    tracer = Tracer(emit)
    started = time.perf_counter()

    from ..core.telemetry import Telemetry, TELEMETRY

    before = len(TELEMETRY.records)

    allowed = {"market_scan", "library_qa", "gap_review", "topic_deep_dive"}
    forced = intent.strip().lower() if isinstance(intent, str) else None
    if forced not in allowed:
        forced = None

    graph = build_graph()
    initial: AgentState = {
        "question": question,
        "force_refresh": force_refresh,
        "forced_intent": forced,  # type: ignore[typeddict-item]
        "trace": [],
        "errors": [],
        "started_at": time.time(),
    }

    final: dict[str, Any] = graph.invoke(
        initial,
        config={"configurable": {"tracer": tracer}, "recursion_limit": 30},
    )

    latency_ms = int((time.perf_counter() - started) * 1000)

    # Per-run telemetry slice (the process-wide collector keeps everything).
    run_records = TELEMETRY.records[before:]
    run_telemetry = Telemetry(records=list(run_records)).summary()

    result = {
        "question": question,
        "intent": final.get("intent"),
        "research_area": final.get("research_area"),
        "reasoning": final.get("reasoning"),
        "plan": final.get("plan", []),
        "queries": final.get("queries", []),
        "answer": final.get("answer", ""),
        "executive_summary": final.get("executive_summary"),
        "recommendations": final.get("recommendations", []),
        "top_opportunities": final.get("top_opportunities", []),
        "topics": _strip_topics(final.get("topics", [])),
        "gaps": final.get("gaps", []),
        "coverage": final.get("coverage", {}),
        "graph": final.get("graph", {}),
        "portfolio": final.get("portfolio", {}),
        "rag": final.get("rag"),
        "citations": final.get("citations", []),
        "groundedness": final.get("groundedness"),
        "verdict": final.get("verdict"),
        "critique_issues": final.get("critique_issues", []),
        "articles": final.get("articles", []),
        "signal_source": final.get("signal_source"),
        "scout_stats": final.get("scout_stats", {}),
        "normalisation": final.get("normalisation", {}),
        "trace": tracer.as_dicts(),
        "telemetry": run_telemetry,
        "latency_ms": latency_ms,
        "errors": final.get("errors", []),
    }

    if persist:
        try:
            save_run(result)
        except Exception:  # noqa: BLE001 - persistence must not break a response
            result["errors"].append("History could not be saved. This result is available in this tab only.")

    return result


def _strip_topics(topics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Trim the long volume series before sending topics over the wire."""
    trimmed = []
    for topic in topics:
        item = {k: v for k, v in topic.items() if k != "series"}
        series = topic.get("series") or []
        item["series"] = series[-45:]
        item["sparkline"] = [round(float(p.get("value") or 0), 3) for p in series[-30:]]
        trimmed.append(item)
    return trimmed


def stream_agent(question: str, *, force_refresh: bool = False) -> Iterator[dict[str, Any]]:
    """Generator of trace events, then the final result.

    The graph runs on a worker thread and pushes trace events into a queue so
    the HTTP layer can forward them as they happen rather than after the fact.
    """
    import queue
    import threading

    events: "queue.Queue[dict[str, Any] | None]" = queue.Queue()
    holder: dict[str, Any] = {}

    def emit(event: Any) -> None:
        events.put({"type": "trace", "event": event.to_dict()})

    def worker() -> None:
        try:
            holder["result"] = run_agent(question, force_refresh=force_refresh, emit=emit)
        except Exception as exc:  # noqa: BLE001
            holder["error"] = f"{type(exc).__name__}: {exc}"
        finally:
            events.put(None)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    while True:
        item = events.get()
        if item is None:
            break
        yield item

    thread.join(timeout=5)
    if "error" in holder:
        yield {"type": "error", "message": holder["error"]}
    else:
        yield {"type": "result", "result": holder.get("result", {})}


def graph_topology() -> dict[str, Any]:
    """Static description of the graph, so the UI can draw it before a run."""
    return {
        "nodes": [
            {"id": "planner", "label": "Planner", "kind": "router"},
            {"id": "scout", "label": "Signal Scout", "kind": "external"},
            {"id": "topic_analyst", "label": "Topic Analyst", "kind": "llm"},
            {"id": "momentum_analyst", "label": "Momentum Analyst", "kind": "analytics"},
            {"id": "librarian_coverage", "label": "Librarian", "kind": "retrieval"},
            {"id": "graph_curator", "label": "Graph Curator", "kind": "graph"},
            {"id": "gap_analyst", "label": "Gap Analyst", "kind": "analytics"},
            {"id": "gap_review", "label": "Gap Review", "kind": "analytics"},
            {"id": "librarian_rag", "label": "Librarian (RAG)", "kind": "retrieval"},
            {"id": "synthesizer", "label": "Synthesizer", "kind": "llm"},
            {"id": "critic", "label": "Critic", "kind": "verify"},
        ],
        "edges": [
            {"source": "planner", "target": "scout", "condition": "market_scan"},
            {"source": "planner", "target": "librarian_rag", "condition": "library_qa"},
            {"source": "planner", "target": "gap_review", "condition": "gap_review"},
            {"source": "scout", "target": "topic_analyst"},
            {"source": "topic_analyst", "target": "momentum_analyst"},
            {"source": "momentum_analyst", "target": "librarian_coverage"},
            {"source": "librarian_coverage", "target": "graph_curator"},
            {"source": "graph_curator", "target": "gap_analyst"},
            {"source": "gap_analyst", "target": "synthesizer"},
            {"source": "gap_review", "target": "synthesizer"},
            {"source": "librarian_rag", "target": "synthesizer"},
            {"source": "synthesizer", "target": "critic"},
        ],
    }
