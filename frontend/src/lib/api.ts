import type {
  AgentResult,
  Brief,
  CentralEntity,
  Gap,
  GraphPayload,
  Health,
  LibraryDocument,
  LibraryStats,
  Meta,
  Portfolio,
  RagAnswer,
  RunSummary,
  Signal,
  Telemetry,
  Topic,
  TopicDetail,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })

  if (!response.ok) {
    // FastAPI puts the useful message in `detail`; surface it rather than a
    // generic "500" the user can do nothing with.
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<T>
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  health: () => request<Health>('/health'),
  meta: () => request<Meta>('/meta'),
  telemetry: () => request<{ process: Telemetry; cache: Record<string, unknown> }>('/telemetry'),

  runs: (limit = 25, offset = 0, graphOnly = false) => request<{ runs: RunSummary[]; total: number }>(`/runs${qs({ limit, offset, graph_only: graphOnly })}`),
  runResult: (id: number) => request<{ result: AgentResult }>(`/runs/${id}/result`),
  run: (id: number) => request<{ run: (RunSummary & { trace: unknown[]; plan: unknown[] }) | null }>(`/runs/${id}`),

  ask: (question: string, forceRefresh = false) =>
    request<AgentResult>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question, force_refresh: forceRefresh }),
    }),

  topics: (params: { quadrant?: string; priority?: string; order?: string } = {}) =>
    request<{ topics: Topic[]; portfolio: Portfolio }>(`/topics${qs(params)}`),
  topic: (slug: string) => request<TopicDetail>(`/topics/${encodeURIComponent(slug)}`),

  gaps: () => request<{ gaps: Gap[]; portfolio: Portfolio }>('/gaps'),
  portfolio: () =>
    request<{
      portfolio: Portfolio
      by_category: { category: string; topics: number; avg_momentum: number; avg_coverage: number; avg_gap: number }[]
    }>('/portfolio'),
  signals: (limit = 40) =>
    request<{ signals: Signal[]; outlets: { domain: string; articles: number }[] }>(`/signals${qs({ limit })}`),

  brief: (slug: string) => request<Brief>(`/briefs/${encodeURIComponent(slug)}`, { method: 'POST' }),
  briefs: (limit = 20) => request<{ briefs: (Brief & { id: number; created_at: string })[] }>(`/briefs${qs({ limit })}`),

  libraryStats: () => request<LibraryStats>('/library/stats'),
  documents: (params: { practice_area?: string; doc_type?: string; q?: string; limit?: number; offset?: number } = {}) =>
    request<{
      documents: LibraryDocument[]
      total: number
      facets: { practice_area: string; n: number }[]
      doc_types: { doc_type: string; n: number }[]
    }>(`/library/documents${qs(params)}`),
  document: (docId: string) =>
    request<{ document: LibraryDocument; chunks: { chunk_index: number; text: string }[] }>(
      `/library/documents/${encodeURIComponent(docId)}`,
    ),
  librarySearch: (q: string, topK = 8) =>
    request<{ query: string; results: (LibraryDocument & { score: number; text: string })[] }>(
      `/library/search${qs({ q, top_k: topK })}`,
    ),
  libraryAsk: (question: string, topK = 6) =>
    request<RagAnswer>('/library/ask', {
      method: 'POST',
      body: JSON.stringify({ question, top_k: topK }),
    }),

  graph: (params: { types?: string; max_nodes?: number } = {}) => request<GraphPayload>(`/graph${qs(params)}`),
  graphTopic: (slug: string, depth = 1) =>
    request<GraphPayload>(`/graph/topic/${encodeURIComponent(slug)}${qs({ depth })}`),
  graphEntities: (limit = 14) => request<{ entities: CentralEntity[] }>(`/graph/entities${qs({ limit })}`),
  graphLegend: () =>
    request<{ node_types: { type: string; n: number }[]; relations: { relation: string; n: number }[] }>(
      '/graph/legend',
    ),
}

/** URL for the SSE stream. Same origin via the Vite proxy. */
export const streamUrl = (question: string, forceRefresh = false, intent?: string | null) =>
  `/api/ask/stream${qs({ q: question, refresh: forceRefresh, intent: intent || undefined })}`
