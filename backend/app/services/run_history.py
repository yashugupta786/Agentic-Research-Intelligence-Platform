"""Immutable research snapshots. Reading history never invokes a provider.

Older versions persisted only summary fields and a trace. Recover only values
actually present in those recorded output events; never join the current topic
or graph tables to fabricate a historical result.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from ..data import db


def save_run(result: dict[str, Any]) -> int:
    saved_at = datetime.now(timezone.utc).isoformat()
    snapshot = deepcopy(result)
    snapshot.update(saved_at=saved_at, snapshot_version=1, snapshot_kind="complete")
    with db.get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO runs
            (question,intent,plan,trace,answer,citations,groundedness,latency_ms,telemetry,result_json)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (snapshot["question"], snapshot.get("intent"), db.as_json(snapshot.get("plan", [])),
             db.as_json(snapshot.get("trace", [])), snapshot.get("answer", ""),
             db.as_json(snapshot.get("citations", [])), snapshot.get("groundedness"),
             snapshot.get("latency_ms"), db.as_json(snapshot.get("telemetry", {})), db.as_json(snapshot)),
        )
        run_id = int(cur.lastrowid)
        snapshot["run_id"] = run_id
        conn.execute("UPDATE runs SET result_json=? WHERE id=?", (db.as_json(snapshot), run_id))
    result.update(run_id=run_id, saved_at=saved_at, snapshot_version=1, snapshot_kind="complete")
    return run_id


def result_from_row(row: dict[str, Any]) -> dict[str, Any]:
    stored = db.from_json(row.get("result_json"))
    if isinstance(stored, dict):
        return {**stored, "run_id": row["id"], "history_source": "database"}

    trace = db.from_json(row.get("trace"), [])
    result = {
        "question": row["question"], "intent": row.get("intent"),
        "plan": db.from_json(row.get("plan"), []), "answer": row.get("answer") or "",
        "citations": db.from_json(row.get("citations"), []), "groundedness": row.get("groundedness"),
        "latency_ms": row.get("latency_ms") or 0, "telemetry": db.from_json(row.get("telemetry"), {}),
        "topics": [], "gaps": [], "coverage": {}, "graph": {}, "articles": [],
        "recommendations": [], "top_opportunities": [], "critique_issues": [], "errors": [],
    }
    has_output = False
    for event in trace:
        output = (event.get("detail") or {}).get("output")
        if isinstance(output, dict):
            has_output = True
            result.update(deepcopy(output))
    result.update(trace=trace, run_id=row["id"], saved_at=row["created_at"],
                  history_source="database", snapshot_version=0,
                  snapshot_kind="recovered" if has_output else "legacy")
    result["history_note"] = (
        "Restored from the agent outputs saved with this older run. Only recorded fields are available."
        if has_output else "This older run saved its answer and trace only. Detailed results and its graph were not recorded."
    )
    return result


def load_run(run_id: int) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM runs WHERE id=?", (run_id,))
    return result_from_row(row) if row else None


def list_runs(limit: int = 25, offset: int = 0, graph_only: bool = False) -> dict[str, Any]:
    # Current demo history is small. Decode legacy traces to identify snapshots
    # accurately rather than advertising a graph that was never saved.
    rows = db.query("SELECT * FROM runs ORDER BY id DESC")
    summaries = []
    for row in rows:
        result = result_from_row(row)
        has_graph = bool((result.get("graph") or {}).get("snapshot", {}).get("nodes"))
        if graph_only and not has_graph:
            continue
        summaries.append({
            **{k: row[k] for k in ("id", "question", "intent", "answer", "groundedness", "latency_ms", "created_at")},
            "has_graph": has_graph, "snapshot_kind": result["snapshot_kind"],
            "topic_count": len(result.get("topics") or []), "article_count": len(result.get("articles") or []),
            "issue_count": len(result.get("errors") or []) + len(result.get("critique_issues") or []),
        })
    return {"runs": summaries[offset:offset + limit], "total": len(summaries)}
