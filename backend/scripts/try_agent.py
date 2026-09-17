"""Smoke-test the agent graph from the command line.

    python -m scripts.try_agent "AI in healthcare"
    python -m scripts.try_agent --qa "What are the major risks of AI adoption in healthcare?"
"""

from __future__ import annotations

import argparse
import json
import sys

from app.agents.graph import run_agent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("question", nargs="*", default=["AI in healthcare"])
    parser.add_argument("--qa", action="store_true", help="shorthand for a library question")
    parser.add_argument("--json", action="store_true", help="dump the raw result")
    parser.add_argument("--refresh", action="store_true", help="bypass caches")
    args = parser.parse_args()

    question = " ".join(args.question) if args.question else "AI in healthcare"

    def emit(event) -> None:
        payload = event.to_dict()
        icon = {"start": "->", "progress": "  .", "done": " ok", "skip": "  -", "error": "  !"}.get(payload["status"], "   ")
        print(f"{icon} [{payload['agent']}] {payload['message']}", flush=True)

    print(f"\nQUESTION: {question}\n" + "=" * 78)
    result = run_agent(question, emit=emit, force_refresh=args.refresh)

    if args.json:
        print(json.dumps(result, indent=2, default=str)[:12000])
        return 0

    print("\n" + "=" * 78)
    print(f"INTENT      : {result['intent']}  (area: {result.get('research_area')})")
    print(f"ROUTING     : {result.get('reasoning')}")
    print(f"LATENCY     : {result['latency_ms'] / 1000:.1f}s | "
          f"{result['telemetry'].get('total_calls')} API calls | "
          f"{result['telemetry'].get('total_tokens')} tokens")
    print(f"GROUNDEDNESS: {result.get('groundedness')} ({result.get('verdict')})")

    if result.get("normalisation"):
        n = result["normalisation"]
        print(f"NORMALISED  : {n.get('raw_mentions')} raw mentions -> {n.get('canonical')} topics ({n.get('merged')} merged)")

    print("\n--- ANSWER ---")
    print(result["answer"])

    if result.get("citations"):
        print("\n--- CITATIONS ---")
        for c in result["citations"]:
            print(f"  [{c['doc_id']}] {c['title'][:64]} ({c['published_date']}, sim {c['score']})")

    if result.get("gaps"):
        print("\n--- DEMAND VS COVERAGE ---")
        print(f"  {'TOPIC':<44}{'MOM':>6}{'COV':>6}{'GAP':>6}  {'PRIORITY':<9}{'QUADRANT'}")
        for g in result["gaps"]:
            print(f"  {g['label'][:43]:<44}{g['momentum']:>6.2f}{g['coverage_score']:>6.2f}"
                  f"{g['gap_score']:>6.2f}  {g['priority']:<9}{g['quadrant']}")

    if result.get("recommendations"):
        print("\n--- RECOMMENDATIONS ---")
        for r in result["recommendations"]:
            print(f"  [{r['action'].upper():<10}] {r['topic'][:44]:<46} {r['rationale'][:70]}")

    if result.get("graph"):
        g = result["graph"]
        print(f"\nKNOWLEDGE GRAPH: {g.get('nodes')} nodes, {g.get('edges')} edges, types={g.get('by_type')}")

    if result.get("errors"):
        print("\nERRORS:", result["errors"], file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
