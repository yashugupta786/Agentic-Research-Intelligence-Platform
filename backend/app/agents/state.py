"""Shared state and trace plumbing for the agent graph.

The trace is a first-class output, not debug logging. The case study asks for a
demonstration of *how* the agent orchestrates its components, so every node
records what it decided, what it called, and what it found - and that stream is
what the UI renders live.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, TypedDict

Intent = Literal["market_scan", "library_qa", "gap_review", "topic_deep_dive"]

# Agent personas. Naming them is not decoration: it makes the division of
# labour legible to a non-technical audience watching the trace.
AGENT_ROLES: dict[str, dict[str, str]] = {
    "planner": {
        "name": "Planner",
        "role": "Classifies the request and chooses which specialists to run",
    },
    "scout": {
        "name": "Signal Scout",
        "role": "Searches external news and web signals for the research area",
    },
    "topic_analyst": {
        "name": "Topic Analyst",
        "role": "Extracts topics and entities, then normalises duplicates into one canonical set",
    },
    "momentum_analyst": {
        "name": "Attention Analyst",
        "role": "Scores distinct news articles, source domains and recency; growth needs a baseline",
    },
    "librarian": {
        "name": "Librarian",
        "role": "Searches the internal research library and assesses coverage",
    },
    "graph_curator": {
        "name": "Graph Curator",
        "role": "Organises topics, entities and documents into the knowledge graph",
    },
    "gap_analyst": {
        "name": "Gap Analyst",
        "role": "Compares market momentum against internal coverage and ranks opportunities",
    },
    "synthesizer": {
        "name": "Synthesizer",
        "role": "Writes the executive recommendation from the assembled evidence",
    },
    "critic": {
        "name": "Critic",
        "role": "Verifies the output is grounded in retrieved evidence",
    },
}


@dataclass
class TraceEvent:
    node: str
    status: Literal["start", "progress", "done", "error", "skip"]
    message: str
    detail: dict[str, Any] = field(default_factory=dict)
    elapsed_ms: int = 0
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        info = AGENT_ROLES.get(self.node, {})
        return {
            "node": self.node,
            "agent": info.get("name", self.node.replace("_", " ").title()),
            "role": info.get("role", ""),
            "status": self.status,
            "message": self.message,
            "detail": self.detail,
            "elapsed_ms": self.elapsed_ms,
            "ts": self.ts,
        }


Emitter = Callable[[TraceEvent], None]


class AgentState(TypedDict, total=False):
    """Everything the graph passes between nodes."""

    # --- input ------------------------------------------------------------
    question: str
    force_refresh: bool
    forced_intent: Intent | None

    # --- planning ---------------------------------------------------------
    intent: Intent
    research_area: str
    plan: list[dict[str, Any]]
    reasoning: str

    # --- external signals -------------------------------------------------
    queries: list[str]
    articles: list[dict[str, Any]]
    signal_source: str
    scout_stats: dict[str, Any]

    # --- topics -----------------------------------------------------------
    topics: list[dict[str, Any]]
    topic_objects: list[Any]  # TopicCandidate instances, not serialised
    normalisation: dict[str, Any]

    # --- library ----------------------------------------------------------
    coverage: dict[str, Any]
    rag: dict[str, Any]

    # --- analysis ---------------------------------------------------------
    gaps: list[dict[str, Any]]
    graph: dict[str, Any]
    portfolio: dict[str, Any]

    # --- output -----------------------------------------------------------
    answer: str
    executive_summary: str
    recommendations: list[dict[str, Any]]
    top_opportunities: list[str]
    citations: list[dict[str, Any]]
    groundedness: float | None
    verdict: str | None
    critique_issues: list[str]

    # --- bookkeeping ------------------------------------------------------
    trace: list[dict[str, Any]]
    errors: list[str]
    started_at: float


class Tracer:
    """Collects trace events and forwards them to an optional live emitter."""

    def __init__(self, emit: Emitter | None = None) -> None:
        self.events: list[TraceEvent] = []
        self._emit = emit
        self._node_started: dict[str, float] = {}

    def start(self, node: str, message: str, **detail: Any) -> None:
        self._node_started[node] = time.perf_counter()
        self._record(TraceEvent(node, "start", message, detail))

    def progress(self, node: str, message: str, **detail: Any) -> None:
        self._record(TraceEvent(node, "progress", message, detail, self._elapsed(node)))

    def done(self, node: str, message: str, **detail: Any) -> None:
        self._record(TraceEvent(node, "done", message, detail, self._elapsed(node)))

    def skip(self, node: str, message: str, **detail: Any) -> None:
        self._record(TraceEvent(node, "skip", message, detail, self._elapsed(node)))

    def error(self, node: str, message: str, **detail: Any) -> None:
        self._record(TraceEvent(node, "error", message, detail, self._elapsed(node)))

    def _elapsed(self, node: str) -> int:
        started = self._node_started.get(node)
        return int((time.perf_counter() - started) * 1000) if started else 0

    def _record(self, event: TraceEvent) -> None:
        self.events.append(event)
        if self._emit:
            try:
                self._emit(event)
            except Exception:  # noqa: BLE001 - a broken client must not kill the run
                pass

    def as_dicts(self) -> list[dict[str, Any]]:
        return [event.to_dict() for event in self.events]
