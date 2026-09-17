import { useState } from 'react'
import { History, ArrowUpRight, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { seconds, titleCase } from '../lib/format'

// eslint-disable-next-line react-refresh/only-export-components
export function runDate(value?: string) {
  if (!value) return 'Date unavailable'
  const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function RunHistory({ onSelect, selectedId, disabled = false, graphOnly = false, refreshKey = 0 }: {
  onSelect: (id: number) => void; selectedId?: number; disabled?: boolean; graphOnly?: boolean; refreshKey?: number
}) {
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const { data, error, loading, reload } = useAsync(() => api.runs(8, offset, graphOnly), [offset, graphOnly, refreshKey, open])
  return <section className="history-panel mt-4 overflow-hidden rounded-2xl border border-edge bg-surface">
    <button className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
      <History className="size-4 text-momentum" /><span className="flex-1 text-sm font-medium">{graphOnly ? 'Previous knowledge maps' : 'Previous runs'}<span className="ml-3 text-xs font-normal text-ink-3">{data ? `${data.total} saved` : 'From your database'}</span></span><span className="text-xs text-momentum">{open ? 'Hide history' : 'Browse history'}</span>
    </button>
    {open && <div className="border-t border-edge-soft p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-ink-3"><p>Open recorded results instantly. No search or model calls.</p><button onClick={reload} aria-label="Refresh saved runs" className="p-1"><RefreshCw className="size-4" /></button></div>
      {loading ? <p role="status" className="p-4 text-sm text-ink-3">Loading saved runs…</p> : error ? <p role="alert" className="text-sm text-critical">{error}</p> : !data?.runs.length ? <p className="p-4 text-sm text-ink-3">{graphOnly ? 'No graph snapshots have been saved yet.' : 'Completed research runs will appear here.'}</p> : <div className="grid gap-2 md:grid-cols-2">{data.runs.map(run => <button key={run.id} disabled={disabled} onClick={() => onSelect(run.id)} aria-label={`Open saved run ${run.id}: ${run.question}`} className={`history-card rounded-xl border p-4 text-left transition hover:border-momentum disabled:opacity-40 ${run.id === selectedId ? 'border-momentum bg-momentum/5' : 'border-edge-soft bg-surface-2/40'}`}>
        <span className="flex justify-between gap-3 text-[10px] uppercase tracking-wider text-ink-3"><span>#{run.id} · {titleCase(run.intent)}</span><ArrowUpRight className="size-3.5 text-momentum" /></span>
        <span className="mt-2 block text-sm font-medium">{run.question}</span>
        <span className="mt-2 block text-xs text-ink-3">{runDate(run.created_at)} · {seconds(run.latency_ms ?? 0)}</span>
        <span className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink-2"><span>{run.topic_count ?? 0} topics</span><span>· {run.article_count ?? 0} articles</span><span>· {run.snapshot_kind === 'complete' ? 'Full snapshot' : run.snapshot_kind === 'recovered' ? 'Recorded outputs' : 'Answer & trace only'}</span>{!!run.issue_count && <span className="text-gap">· {run.issue_count} review note(s)</span>}</span>
      </button>)}</div>}
      {!!data?.total && data.total > 8 && <div className="mt-4 flex items-center justify-between text-xs"><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 8))} className="text-momentum disabled:opacity-30">Newer</button><span className="text-ink-3">{offset + 1}–{Math.min(offset + 8, data.total)} of {data.total}</span><button disabled={offset + 8 >= data.total} onClick={() => setOffset(offset + 8)} className="text-momentum disabled:opacity-30">Older</button></div>}
    </div>}
  </section>
}
