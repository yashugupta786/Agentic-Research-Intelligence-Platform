/** Shapes returned by the FastAPI backend. Kept hand-written and narrow: only
 *  the fields the UI actually reads are declared, so a backend addition never
 *  breaks the build. */

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Quadrant = 'publish_now' | 'refresh' | 'maintain' | 'over_invested' | 'watch'
export type TraceStatus = 'start' | 'progress' | 'done' | 'skip' | 'error'
export type Intent = 'market_scan' | 'library_qa' | 'gap_review' | 'topic_deep_dive'

export interface TraceEvent {
  node: string
  agent: string
  role: string
  status: TraceStatus
  message: string
  detail: Record<string, unknown>
  elapsed_ms: number
  ts: number
}

export interface MatchedDoc {
  verdict?: string
  reason?: string
  judged_by?: string
  doc_id: string
  title: string
  score: number
  published_date: string
  practice_area: string
  doc_type: string
  age_days: number
}

export interface Citation {
  doc_id: string
  title: string
  practice_area: string
  doc_type: string
  published_date: string
  analyst?: string | null
  score: number
}

export interface Topic {
  slug: string
  label: string
  category?: string | null
  description?: string | null
  aliases: string[]
  entities?: { name: string; type: string }[]
  drivers?: string[]
  article_urls?: string[]
  mention_count: number
  source_count: number
  momentum: number
  growth_pct: number | null
  coverage_method?: string
  velocity?: number
  recency_days?: number
  first_seen?: string | null
  last_seen?: string | null
  updated_at?: string
  doc_count?: number | null
  strong_matches?: number | null
  best_score?: number | null
  mean_score?: number | null
  newest_doc_date?: string | null
  staleness_days?: number | null
  coverage_score?: number | null
  matched_docs?: MatchedDoc[]
  gap_score?: number | null
  priority?: Priority | null
  quadrant?: Quadrant | null
  rationale?: string | null
  sparkline?: number[]
  series?: SeriesPoint[]
}

export interface SeriesPoint {
  date: string
  value: number
  source?: string
}

export interface Gap {
  topic_slug: string
  label: string
  momentum: number
  coverage_score: number
  gap_score: number
  priority: Priority
  quadrant: Quadrant
  rationale: string
  category?: string | null
  growth_pct?: number | null
  description?: string | null
  doc_count?: number | null
  staleness_days?: number | null
  matched_docs?: MatchedDoc[]
}

export interface Portfolio {
  topics: number
  critical: number
  high: number
  avg_momentum: number
  avg_coverage: number
  quadrants: Record<string, number>
  exposure: number
}

export interface Signal {
  title: string
  url: string
  domain?: string | null
  snippet?: string | null
  published_date?: string | null
  relevance?: number
  source?: string
  topic_slug?: string | null
  topic_label?: string | null
}

export interface Recommendation {
  topic: string
  action: string
  rationale: string
}

export interface Telemetry {
  total_calls: number
  total_tokens: number
  total_latency_ms: number
  cache_hits: number
  errors: string[]
  by_kind: Record<string, { calls: number; tokens: number; latency_ms: number }>
  estimated_cost_usd: number
}

export interface AgentResult {
  run_id?: number
  saved_at?: string
  snapshot_kind?: 'complete' | 'recovered' | 'legacy'
  history_source?: 'database'
  history_note?: string
  question: string
  intent: Intent
  research_area?: string
  queries?: string[]
  reasoning?: string
  plan: { agent: string; action: string }[]
  answer: string
  executive_summary?: string
  recommendations: Recommendation[]
  top_opportunities: string[]
  topics: Topic[]
  gaps: Gap[]
  coverage: Record<string, unknown>
  graph: Record<string, unknown> & { nodes?: number; edges?: number; central_entities?: CentralEntity[]; snapshot?: GraphPayload; question?: string }
  portfolio?: Portfolio
  rag?: RagAnswer | null
  citations: Citation[]
  groundedness?: number | null
  verdict?: string | null
  critique_issues: string[]
  articles: Signal[]
  signal_source?: string
  scout_stats?: {
    queries?: { query: string; count: number; cached: boolean }[]
    raw_total?: number
    unique_articles?: number
    outlets?: number
  }
  normalisation?: { raw_mentions?: number; canonical?: number; merged?: number }
  trace: TraceEvent[]
  telemetry: Telemetry
  latency_ms: number
  errors: string[]
}

export interface RagAnswer {
  question: string
  answer: string
  citations: Citation[]
  hits: { doc_id: string; title: string; score: number; text: string; practice_area: string }[]
  groundedness?: number | null
  verdict?: string | null
  unsupported: string[]
  retrieved: number
}

export interface GraphNode {
  id: string
  label: string
  title?: string
  type: string
  weight: number
  degree: number
  momentum?: number | null
  coverage?: number | null
  slug?: string | null
  category?: string | null
}

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  relation: string
  weight: number
}

export interface GraphPayload {
  nodes: GraphNode[]
  links: GraphLink[]
  stats: { nodes: number; edges: number; by_type: Record<string, number>; density: number; components: number }
  center?: string
}

export interface CentralEntity {
  key: string
  label: string
  type: string
  degree: number
  centrality: number
}

export interface Health {
  status: string
  capabilities: { llm: boolean; web_search: boolean; vector_index: boolean; offline_mode: boolean }
  models: { chat: string; fast: string; embedding: string; fallback_chain: string[] }
  counts: Record<string, number>
  index_vectors: number
}

export interface Meta {
  agents: { id: string; name: string; role: string }[]
  topology: {
    nodes: { id: string; label: string; kind: string }[]
    edges: { source: string; target: string; condition?: string }[]
  }
  example_questions: string[]
  practice_areas: string[]
  sweeps: { key: string; label: string; category: string; query: string }[]
  library: LibraryStats
}

export interface LibraryStats {
  documents: number
  words: number
  chunks: number
  indexed_vectors: number
  by_practice_area: { practice_area: string; documents: number; oldest: string; newest: string; avg_words: number }[]
}

export interface LibraryDocument {
  doc_id: string
  title: string
  abstract: string
  practice_area: string
  doc_type: string
  published_date: string
  analyst?: string | null
  word_count: number
  body?: string
  source_url?: string | null
}

export interface Brief {
  topic_slug: string
  topic_label: string
  title: string
  why_now: string
  key_questions: string[]
  suggested_type: string
  audience: string
  build_on: string
  adjacent: {
    label: string
    slug: string
    coverage_score: number
    similarity: number
    documents: { doc_id: string; title: string }[]
  }[]
  evidence: {
    momentum: number
    growth_pct: number
    gap_score: number
    priority: Priority
    quadrant: Quadrant
    existing_docs: MatchedDoc[]
    sources: { title: string; url: string; domain: string; published_date: string }[]
  }
}

export interface RunSummary {
  id: number
  question: string
  intent: Intent
  answer: string
  groundedness?: number | null
  latency_ms?: number | null
  created_at: string
  has_graph?: boolean
  snapshot_kind?: 'complete' | 'recovered' | 'legacy'
  topic_count?: number
  article_count?: number
  issue_count?: number
}

export interface TopicDetail {
  topic: Topic
  series: SeriesPoint[]
  signals: Signal[]
  adjacent: Brief['adjacent']
  subgraph: GraphPayload
  brief: (Record<string, unknown> & { title: string; why_now: string; key_questions: string[] }) | null
}

/** Events pushed over the /api/ask/stream SSE channel. */
export type StreamEvent =
  | { type: 'open'; question: string }
  | { type: 'trace'; event: TraceEvent }
  | { type: 'result'; result: AgentResult }
  | { type: 'error'; message: string }
  | { type: 'done' }
