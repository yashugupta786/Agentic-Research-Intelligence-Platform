import clsx from 'clsx'
import { Activity, Cpu, Database, GitBranch, History, Zap } from 'lucide-react'
import { useState } from 'react'

import PageHeader from '../components/PageHeader'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel, PanelHeader, Stat } from '../components/ui'
import { api } from '../lib/api'
import { AGENT_KIND_COLOUR, compact, pct, relativeTime, seconds, titleCase } from '../lib/format'
import { useAsync } from '../lib/hooks'

export default function Operations() {
  const { data: health } = useAsync(() => api.health(), [])
  const { data: meta } = useAsync(() => api.meta(), [])
  const { data: telemetry, reload: reloadTelemetry } = useAsync(() => api.telemetry(), [])
  const { data: runs, error, loading } = useAsync(() => api.runs(20), [])

  const process = telemetry?.process
  const counts = health?.counts ?? {}

  return (
    <div className="pb-14">
      <PageHeader
        eyebrow="Agent operations"
        title="What the system is, and what it costs to run"
        lede="The orchestration topology, the API workload behind each run, and the history of every request. Free-tier models mean the dollar figure is zero, but the shape of the workload is exactly what a production estimate would be built from."
      />

      <div className="space-y-5 px-7 pt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="API calls" value={compact(process?.total_calls)} icon={<Zap className="size-3.5" />} />
          <Stat label="Tokens" value={compact(process?.total_tokens)} hint="this server process" />
          <Stat
            label="Cache hits"
            value={compact(process?.cache_hits)}
            accent="text-coverage"
            hint="search + embedding reuse"
          />
          <Stat label="Estimated cost" value={`$${(process?.estimated_cost_usd ?? 0).toFixed(2)}`} hint="free tier throughout" />
          <Stat
            label="Runs recorded"
            value={compact(counts.runs)}
            hint="every request is replayable"
            icon={<History className="size-3.5" />}
          />
        </div>

        {/* Graph topology */}
        {meta?.topology ? (
          <Panel>
            <PanelHeader
              title="Orchestration topology"
              subtitle="A LangGraph state machine. The planner picks the branch per request - a library question must not trigger web sensing, and a market scan must not answer from memory."
              icon={<GitBranch className="size-4" />}
            />
            <Topology topology={meta.topology} />
          </Panel>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Workload breakdown */}
          <Panel>
            <PanelHeader
              title="Workload by call type"
              subtitle="Where the latency actually goes"
              icon={<Activity className="size-4" />}
              actions={
                <button
                  type="button"
                  onClick={reloadTelemetry}
                  className="text-[11.5px] text-ink-3 transition hover:text-ink"
                >
                  refresh
                </button>
              }
            />
            {process && Object.keys(process.by_kind).length ? (
              <ul className="space-y-3 px-5 py-4">
                {Object.entries(process.by_kind)
                  .sort((a, b) => b[1].latency_ms - a[1].latency_ms)
                  .map(([kind, slot]) => {
                    const maxLatency = Math.max(...Object.values(process.by_kind).map((item) => item.latency_ms), 1)
                    return (
                      <li key={kind}>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[12px] text-ink-2">{titleCase(kind)}</span>
                          <span className="num text-[11px] text-ink-3">
                            {slot.calls} calls &middot; {seconds(slot.latency_ms)}
                            {slot.tokens ? ` · ${compact(slot.tokens)} tok` : ''}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full bg-momentum/70"
                            style={{ width: `${(slot.latency_ms / maxLatency) * 100}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
              </ul>
            ) : (
              <EmptyState title="No calls yet in this process" body="Run a query and the workload appears here." />
            )}
          </Panel>

          {/* Stack */}
          <Panel>
            <PanelHeader title="Stack and storage" subtitle="Every component is free-tier or in-process" icon={<Database className="size-4" />} />
            <ul className="divide-y divide-edge-soft">
              {[
                { label: 'Orchestration', value: 'LangGraph state machine, 10 nodes' },
                { label: 'Reasoning model', value: health?.models.chat ?? '--' },
                { label: 'Fast model', value: health?.models.fast ?? '--' },
                { label: 'Embeddings', value: health?.models.embedding?.replace('models/', '') ?? '--' },
                { label: 'Vector store', value: `FAISS IndexFlatIP, ${compact(health?.index_vectors)} vectors` },
                { label: 'Knowledge graph', value: `NetworkX, ${compact(counts.kg_nodes)} nodes / ${compact(counts.kg_edges)} edges` },
                { label: 'Persistence', value: `SQLite, ${compact(counts.documents)} documents / ${compact(counts.chunks)} passages` },
                { label: 'External signals', value: 'Tavily web search (momentum from mention counts)' },
              ].map((row) => (
                <li key={row.label} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
                  <span className="text-[12px] text-ink-3">{row.label}</span>
                  <span className="num truncate text-[11.5px] text-ink-2">{row.value}</span>
                </li>
              ))}
            </ul>
            {health?.models.fallback_chain?.length ? (
              <div className="border-t border-edge-soft px-5 py-3.5">
                <p className="label-caps mb-2">Model fallback chain</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {health.models.fallback_chain.map((model, index) => (
                    <span key={model} className="flex items-center gap-1.5">
                      {index ? <span className="text-ink-3">&rarr;</span> : null}
                      <span className="num rounded-md border border-edge bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">
                        {model.replace('gemini-', '')}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                  When a model exhausts its daily free-tier quota the chain fails over automatically, so a demo does not
                  die on a 429.
                </p>
              </div>
            ) : null}
          </Panel>
        </div>

        {/* Run history */}
        <Panel>
          <PanelHeader title="Run history" subtitle="Every request, its route and its latency" icon={<Cpu className="size-4" />} />
          {loading ? <LoadingBlock label="Loading runs" rows={4} /> : null}
          {error ? <ErrorBlock message={error} /> : null}
          {runs?.runs?.length ? (
            <ul className="divide-y divide-edge-soft">
              {runs.runs.map((run) => (
                <li key={run.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-2">{run.question}</p>
                    <div className="num flex shrink-0 items-center gap-2.5 text-[10.5px] text-ink-3">
                      <Badge>{run.intent?.replace('_', ' ') ?? 'unknown'}</Badge>
                      {run.groundedness !== null && run.groundedness !== undefined ? (
                        <span
                          className={clsx(run.groundedness >= 0.8 ? 'text-coverage' : 'text-gap')}
                        >
                          {pct(run.groundedness)}
                        </span>
                      ) : null}
                      <span>{seconds(run.latency_ms)}</span>
                      <span>{relativeTime(run.created_at)}</span>
                    </div>
                  </div>
                  {run.answer ? (
                    <p className="mt-1 line-clamp-1 text-[11.5px] text-ink-3">{run.answer}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : !loading ? (
            <EmptyState title="No runs recorded yet" />
          ) : null}
        </Panel>
      </div>
    </div>
  )
}

/** Static render of the LangGraph topology: entry, conditional branches, join. */
function Topology({
  topology,
}: {
  topology: { nodes: { id: string; label: string; kind: string }[]; edges: { source: string; target: string; condition?: string }[] }
}) {
  const [hover, setHover] = useState<string | null>(null)
  const byId = new Map(topology.nodes.map((node) => [node.id, node]))

  const PATH_LABEL: Record<string, string> = {
    market_scan: 'Market scan',
    library_qa: 'Ask the library',
    gap_review: 'Saved portfolio',
  }

  const branches = topology.edges.filter((edge) => edge.condition)
  const chain = (start: string): string[] => {
    const path = [start]
    let current = start
    for (let step = 0; step < 8; step += 1) {
      const next = topology.edges.find((edge) => edge.source === current && !edge.condition)
      if (!next || path.includes(next.target)) break
      path.push(next.target)
      current = next.target
    }
    return path
  }

  const paths = branches.map((branch) => ({ condition: branch.condition!, nodes: chain(branch.target) }))

  const chip = (id: string) => {
    const node = byId.get(id)
    if (!node) return null
    const colour = AGENT_KIND_COLOUR[node.kind] ?? '#64748b'
    const dim = hover !== null && hover !== node.kind
    return (
      <span
        key={id}
        onMouseEnter={() => setHover(node.kind)}
        onMouseLeave={() => setHover(null)}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition',
          dim ? 'opacity-35' : 'opacity-100',
        )}
        style={{
          borderColor: `color-mix(in srgb, ${colour} 45%, var(--color-edge))`,
          background: `color-mix(in srgb, ${colour} 16%, var(--color-surface))`,
          color: 'var(--color-ink)',
        }}
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: colour }} />
        {node.label}
      </span>
    )
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {chip('planner')}
        <span className="text-[12px] text-ink-3">then one of these paths</span>
      </div>

      <div className="space-y-3">
        {paths.map((path) => (
          <div key={path.condition} className="rounded-xl border border-edge-soft bg-surface-2/40 px-3 py-3">
            <p className="label-caps mb-2 text-ink-3">{PATH_LABEL[path.condition] ?? path.condition}</p>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {path.nodes.map((id, index) => (
                <span key={id} className="flex shrink-0 items-center gap-1.5">
                  {index ? <span className="text-ink-3">&rarr;</span> : null}
                  {chip(id)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-edge-soft pt-3.5">
        {Object.entries(AGENT_KIND_COLOUR).map(([kind, colour]) => (
          <span key={kind} className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
            <span className="size-2 rounded-full" style={{ background: colour }} />
            {titleCase(kind)}
          </span>
        ))}
      </div>
    </div>
  )
}
