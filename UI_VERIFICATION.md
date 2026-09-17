# UI verification

This is the recorded smoke test for the redesigned workspace. It was run against the local Vite frontend and the local FastAPI backend on 16 September 2026.

## Completed market scan

Query: `AI in healthcare`  
Mode: Market scan  
Refresh: off  

The browser stream visibly reached all nine specialists in order: Planner, Signal Scout, Topic Analyst, Attention Analyst, Librarian, Graph Curator, Gap Analyst, Synthesizer and Critic.

Observed result:

| Output | Observed value |
|---|---:|
| External articles after deduplication | 23 |
| Distinct source outlets | 20 |
| Canonical topics | 14 |
| Duplicate topic surface forms merged | 27 |
| Knowledge graph nodes | 70 |
| Knowledge graph relationships | 316 |
| Total latency | 119.9 seconds |
| Completed activity cards | 9 |
| Critic result | 0.95 confidence; 1 wording discrepancy flagged |

The critic warning was displayed in the executive summary. It identified wording around “low observed news attention”; the number itself matched the analytics. This is the intended review behaviour: the system exposes the issue rather than hiding it.

## Query-scoped knowledge map

Opening **Knowledge map** showed the saved question `AI in healthcare`. The default focus was `AI Governance And Regulation`, with 10 visible nodes and 9 connections after the clarity filter: the topic, its five most connected entities and four accepted internal documents. The map included **Show all entities**, topic selection, entity/document toggles, zoom, fit, keyboard accessible nodes and a selected-node inspector. Selecting the topic displayed its `mentions` and `covered_by` relationships.

The map uses `result.graph.snapshot` saved with the run in this browser tab. It does not call the unscoped global graph for this view, so a subsequent scan cannot silently change the map for the current question.

## Appearance and navigation

The light theme and dark theme were both toggled successfully. The sidebar expanded and collapsed successfully, and the active navigation remained visible in either state. The former Case Study Guide link is absent. Supporting explanations are collapsed under page-level disclosures, while live activity cards open and animate as events arrive.

## Recommended demo questions

These are safe, representative questions for a presentation:

- Market scan: `AI in healthcare`
- Market scan: `AI in supply chain`
- Ask the library: `What are the major risks of AI adoption in healthcare?`
- Portfolio review: `Review the saved research gaps`

The first query above is the one recorded in this smoke test. External search, Gemini, and the internal index must be configured for a fresh live scan; otherwise the UI reports the provider or index limitation and preserves any saved result.
