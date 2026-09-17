export type ArchitectureStep = { id: string; title: string; sub: string; kind: string; input: string; output: string; detail: string }
export const steps: ArchitectureStep[] = [
  { id: 'frontend', title: 'React workspace', sub: 'Question + selected mode', kind: 'UI', input: 'Question (2–500 characters), market scan / library QA / portfolio review / auto route, fresh-search flag.', output: 'EventSource HTTP request to /api/ask/stream with q, intent and refresh.', detail: 'Vite proxies /api to FastAPI during local development. The browser renders trace events as agent cards and stores a tab copy of the last result.' },
  { id: 'api', title: 'FastAPI boundary', sub: 'Validate · stream · execute', kind: 'HTTP', input: 'GET /api/ask/stream?q=…&intent=…&refresh=false. POST /api/ask is also supported.', output: 'A worker invokes run_agent. An async queue returns trace, result and done events over SSE.', detail: 'FastAPI validates question length and query types. Pydantic validates POST bodies and model output schemas. UI-forced valid modes bypass LLM intent classification. Authentication is future work.' },
  { id: 'planner', title: '01  Planner', sub: 'Choose the route', kind: 'ROUTING', input: 'Original question and optional UI-selected intent.', output: 'intent, research_area, queries, plan and reasoning.', detail: 'LangGraph conditional edges select the market, library or portfolio branch. Forced market mode uses code to derive a search subject and three queries. Auto mode asks an LLM to plan.' },
  { id: 'scout', title: '02  Signal Scout', sub: 'Tavily + search cache', kind: 'SEARCH', input: 'research_area, queries and force_refresh.', output: 'Deduplicated articles with snippets and metadata. scout_stats records each query count and cache hit.', detail: 'Searches each planned query, requesting eight results by default. Counts may differ. URL deduplication merges overlapping results. These are excerpts, not guaranteed full article bodies.' },
  { id: 'topic_analyst', title: '03  Topic Analyst', sub: 'Extract · group · name', kind: 'LLM + EMBEDDINGS', input: 'Article titles, snippets, dates and domains.', output: 'Canonical topics with aliases, URLs, counts, dates, entities and drivers. Internal TopicCandidate objects retain mappings.', detail: 'LLM extraction batches contain six articles. Lexical dictionaries preserve phrase/article mappings. Normalised embeddings join greedy centroid groups at cosine ≥ 0.93. A naming call returns member_groups used to map the canonical names back to articles.' },
  { id: 'momentum_analyst', title: '04  Attention Analyst', sub: 'Breadth + recency', kind: 'PYTHON', input: 'Canonical topics, unique article counts, distinct domains and last-seen dates.', output: 'Topics enriched with momentum and recency. Growth stays unavailable without a time-series baseline.', detail: 'In the news-count path, breadth=min(1, 0.7×domains/6 + 0.3×min(articles,12)/12). Recency=exp(−age/30). Attention=0.7×breadth+0.3×recency. This is sampled attention, not measured client demand.' },
  { id: 'librarian', title: '05  Librarian', sub: 'Retrieve + judge coverage', kind: 'RAG + LLM JUDGE', input: 'Each topic label and description, plus the prepared internal index.', output: 'Coverage by topic slug: accepted documents, verdicts, freshness, coverage_score and staleness_days.', detail: 'Retrieve 50 passages. Exclude archive material, keep the best passage per document, retain up to ten candidates scoring ≥ 0.62. Judge their first 420 characters. Keep up to five covers/partial matches and calculate usable coverage in Python.' },
  { id: 'graph_curator', title: '06  Graph Curator', sub: 'NetworkX relationships', kind: 'PYTHON + EMBEDDINGS', input: 'TopicCandidate entities and accepted coverage matches.', output: 'Topic/entity/document graph, counts and a query-specific node/edge snapshot.', detail: 'Creates mentions, covered_by and published_in edges. At most four documents per topic enter the graph. Topic adjacency uses cosine ≥ 0.62. SQLite stores the latest graph and the run snapshot preserves the historical graph.' },
  { id: 'gap_analyst', title: '07  Gap Analyst', sub: 'Rank research actions', kind: 'PYTHON', input: 'Topic attention and usable coverage.', output: 'Ranked gaps, priorities and action categories. gap = attention × (1 − coverage).', detail: 'Refresh rules consider the newest accepted document being older than 300 days. Other rules assign commission, maintain, review or monitor. The graph counts do not determine the gap score.' },
  { id: 'synthesizer', title: '08  Synthesizer', sub: 'Write the recommendation', kind: 'LLM', input: 'Original question, top gap analytics, document IDs and ages.', output: 'Executive summary and opportunity names. Final actions follow deterministic gap rules.', detail: 'The prompt constrains statements to supplied analytics. On model failure, code returns a labelled computed summary. This step receives analytics, not the entire research library.' },
  { id: 'critic', title: '09  Critic', sub: 'Check the narrative', kind: 'LLM JUDGE', input: 'Executive answer and top gap analytics.', output: 'Consistency verdict, confidence and any issues.', detail: 'Flags disagreements between the narrative and numbers. It does not independently fact-check the external news. Library QA already performs groundedness checking, so the Critic skips that branch.' },
  { id: 'storage', title: 'Result + history', sub: 'SQLite snapshot → UI', kind: 'PERSISTENCE', input: 'Final serialisable state, trace, evidence, graph and telemetry.', output: 'Immutable result_json plus run ID and timestamp. UI shows the result and can reopen it from the database.', detail: 'GET /api/runs lists recorded queries. GET /api/runs/{id}/result returns that run’s snapshot without calling Tavily or Gemini. Missing persistence is reported rather than presented as saved.' },
]

export const setupFlow = [
  ['Simulated research', 'Document ID, title, abstract, body, date and practice area.'],
  ['SQLite documents', 'Preserve full source text and metadata for inspection.'],
  ['Sliding passages', 'About 130 words with 25-word overlap. Title prepended.'],
  ['Gemini embeddings', '768 dimensions by default. Cached by content and task.'],
  ['FAISS + ID map', 'Normalised vectors, exact inner-product search, chunk/document keys.'],
]
export const coverageFlow = [
  ['Topic query', 'Combine the canonical label and description. Embed the text.'],
  ['Retrieve 50', 'Search the prepared index for the nearest passages.'],
  ['Filter candidates', 'Exclude archive. Best passage per document. Up to 10 at similarity ≥ 0.62.'],
  ['LLM relevance judge', 'Topic + description + candidate titles, metadata and 420-character excerpts.'],
  ['Accept up to 5', 'covers=1, partial=0.5, tangential/unrelated=0. Sort by relevance then similarity.'],
  ['Score in Python', 'Discount each accepted document by age. Combine depth (60%) and best usable match (40%).'],
]
export const qaFlow = [
  ['Client question', 'The original question becomes the retrieval query.'],
  ['Retrieve passages', 'Search 24 by default, exclude archive, keep up to 6 with at most 2 per document.'],
  ['Cited answer', 'Gemini sees the retained passages and their document IDs.'],
  ['Groundedness judge', 'Assess whether the answer’s claims are supported by supplied extracts.'],
  ['Return evidence', 'Answer, citations, passage text, support estimate and unsupported claims.'],
]
