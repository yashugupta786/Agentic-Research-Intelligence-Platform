import clsx from 'clsx'
import { BrainCircuit, CheckCircle2, ChevronDown, Globe, Layers, Library, Network, Scale, ShieldCheck, TrendingUp, Loader2, AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { seconds } from '../lib/format'
import type { TraceEvent } from '../lib/types'

const ICONS: Record<string, typeof Globe> = { planner: BrainCircuit, scout: Globe, topic_analyst: Layers, momentum_analyst: TrendingUp, librarian: Library, graph_curator: Network, gap_analyst: Scale, synthesizer: BrainCircuit, critic: ShieldCheck }
const label = (s: string) => s.replaceAll('_',' ')

/** Render the real structured output without inventing intermediate results. */
function ValueView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return <span className="text-ink-3">Not available</span>
  if (typeof value !== 'object') return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  if (Array.isArray(value)) return <div className="space-y-2">{value.length ? value.map((item,i) => <details key={i} className="rounded-lg border border-edge-soft bg-surface p-2.5"><summary className="cursor-pointer font-medium text-ink">{typeof item === 'object' && item !== null ? String(item.label || item.title || item.doc_id || item.name || item.query || `Record ${i+1}`) : String(item)}</summary>{typeof item === 'object' && item !== null && <div className="mt-3"><ValueView value={item} depth={depth+1} /></div>}</details>) : <span className="text-ink-3">No records</span>}</div>
  if (!Object.keys(value).length) return <span className="text-ink-3">No state changes returned. See the step status above.</span>
  return <div className="space-y-3">{Object.entries(value as Record<string, unknown>).map(([key,v]) => <div key={key} className="min-w-0">{typeof v === 'object' && v !== null ? <details open={depth === 0 && key !== 'graph'}><summary className="cursor-pointer text-momentum capitalize">{label(key)} {Array.isArray(v) ? `(${v.length})` : ''}</summary><div className="mt-2 border-l border-edge pl-3"><ValueView value={v} depth={depth+1} /></div></details> : <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2"><span className="capitalize text-ink-3">{label(key)}</span><ValueView value={v} depth={depth+1} /></div>}</div>)}</div>
}

export default function AgentTrace({ events, running, className }: { events: TraceEvent[]; running: boolean; className?: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, TraceEvent[]>()
    events.forEach(e => map.set(e.node,[...(map.get(e.node) ?? []),e]))
    return [...map.entries()]
  },[events])
  const [expanded,setExpanded] = useState<Record<string,boolean>>({})
  const [all,setAll] = useState(false)
  return <div className={clsx('space-y-3',className)}>
    <div className="flex items-center justify-between px-1 text-xs text-ink-3"><span>{groups.filter(([,es]) => es.some(e => e.status === 'done')).length} completed</span><button className="text-momentum" onClick={() => { setAll(!all); setExpanded({}) }}>{all ? 'Collapse all' : 'Expand all outputs'}</button></div>
    {groups.map(([node,es],index) => {
      const first = es[0], last = es[es.length-1]
      const terminal = [...es].reverse().find(e => ['done','error','skip'].includes(e.status))
      const active = running && !terminal && index === groups.length-1
      const isOpen = expanded[node] ?? (all || active)
      const output = [...es].reverse().find(e => e.detail?.output)?.detail.output
      const summary = terminal?.message ?? es.findLast(e => e.message !== 'Output ready')?.message
      const Icon = ICONS[node] ?? BrainCircuit
      return <motion.section layout key={node} initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} className={clsx('overflow-hidden rounded-xl border', active ? 'border-momentum/50 bg-momentum/5' : 'border-edge-soft bg-surface')}>
        <button aria-expanded={isOpen} onClick={() => setExpanded(p => ({...p,[node]:!isOpen}))} className="flex w-full items-center gap-3 p-4 text-left">
          <span className={clsx('grid size-9 shrink-0 place-items-center rounded-xl',active ? 'animate-pulse-ring bg-momentum/10 text-momentum' : 'bg-surface-2 text-ink-2')}><Icon className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{String(index+1).padStart(2,'0')} · {first.agent}</span><span className="mt-1 block truncate text-[11px] text-ink-3">{summary}</span></span>
          <span className="num text-[10px] text-ink-3">{seconds(last.elapsed_ms)}</span>
          {active ? <Loader2 className="size-4 animate-spin text-momentum" /> : terminal?.status === 'error' ? <AlertCircle className="size-4 text-critical" /> : <CheckCircle2 className="size-4 text-coverage" />}
          <ChevronDown className={clsx('size-3 shrink-0 transition-transform',isOpen && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>{isOpen && <motion.div initial={{ height:0,opacity:0 }} animate={{ height:'auto',opacity:1 }} exit={{ height:0,opacity:0 }}><div className="space-y-4 border-t border-edge-soft p-4">
          <ol className="space-y-2 border-l border-edge pl-3">{es.filter(e => !e.detail?.output).map((e,i) => <li key={i} className="animate-rise text-xs leading-relaxed text-ink-2">{e.message}{Object.keys(e.detail ?? {}).length > 0 && <details className="mt-1 text-[11px]"><summary className="text-momentum">Step evidence</summary><div className="mt-2"><ValueView value={e.detail} /></div></details>}</li>)}</ol>
          {output !== undefined && <div className="rounded-xl bg-surface-2 p-3 text-xs"><p className="label-caps mb-3">Actual agent output</p><ValueView value={output} /><details className="mt-4"><summary className="cursor-pointer text-ink-3">Raw JSON</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(output,null,2)}</pre></details></div>}
        </div></motion.div>}</AnimatePresence>
      </motion.section>
    })}
  </div>
}
