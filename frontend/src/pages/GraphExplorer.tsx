import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Network } from 'lucide-react'
import GraphView from '../components/GraphView'
import PageHeader from '../components/PageHeader'
import { Panel, EmptyState, Badge } from '../components/ui'
import { readSession } from '../lib/session'
import RunHistory, { runDate } from '../components/RunHistory'
import { api } from '../lib/api'
import type { GraphNode, GraphPayload } from '../lib/types'

export default function GraphExplorer() {
  const [scan, setScan] = useState(() => readSession('research.lastScan'))
  const [params, setParams] = useSearchParams()
  const runId = params.get('run')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const snapshot = scan?.graph?.snapshot
  const documentTitles = useMemo(() => new Map((scan?.topics ?? []).flatMap(t => (t.matched_docs ?? []).map(d => [d.doc_id, d.title] as const))), [scan])
  const topics = useMemo(() => snapshot?.nodes.filter(n => n.type === 'TOPIC') ?? [], [snapshot])
  const [topicId, setTopicId] = useState(topics[0]?.id ?? '')
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [includeEntities, setIncludeEntities] = useState(true)
  const [includeDocs, setIncludeDocs] = useState(true)
  const [allEntities, setAllEntities] = useState(false)
  useEffect(() => {
    if (!runId) return
    let active = true
    // Loading state tracks a request triggered by URL navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setLoadError('')
    api.runResult(Number(runId)).then(({ result }) => {
      if (!active) return
      setScan(result)
      setTopicId(result.graph?.snapshot?.nodes.find(n => n.type === 'TOPIC')?.id ?? '')
      setSelected(null)
      setAllEntities(false)
    }).catch(e => { if (active) setLoadError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [runId])
  const payload = useMemo<GraphPayload | null>(() => {
    if (!snapshot) return null
    const keep = new Set<string>(topicId ? [topicId] : topics.map(n => n.id))
    const id = (v: string | GraphNode) => typeof v === 'string' ? v : v.id
    snapshot.links.forEach(l => { if (l.relation !== 'adjacent_to' && (!topicId ? topics.some(t => t.id === id(l.source)) : id(l.source) === topicId)) keep.add(id(l.target)) })
    const candidates = snapshot.nodes.filter(n => keep.has(n.id) && n.type !== 'PRACTICE_AREA')
    const entityIds = new Set(candidates.filter(n => !['TOPIC', 'DOCUMENT'].includes(n.type)).sort((a,b) => b.degree-a.degree).slice(0, allEntities ? undefined : 5).map(n => n.id))
    const nodes = candidates.filter(n => n.type === 'TOPIC' || (n.type === 'DOCUMENT' ? includeDocs : includeEntities && entityIds.has(n.id))).map(n => n.type === 'DOCUMENT' ? { ...n, title: documentTitles.get(n.label) } : n)
    const ids = new Set(nodes.map(n => n.id))
    return { nodes, links: snapshot.links.filter(l => ids.has(id(l.source)) && ids.has(id(l.target))), stats: snapshot.stats }
  }, [snapshot, topics, topicId, includeDocs, includeEntities, allEntities, documentTitles])
  return <div className="pb-10">
      <PageHeader
        eyebrow="Knowledge map"
        title="News, topics, and our notes — linked"
      />
    <div className="px-7"><RunHistory graphOnly selectedId={scan?.run_id} disabled={loading} onSelect={id => setParams({ run: String(id) })} />{loading && <p role="status" className="mt-4 text-sm text-momentum">Opening recorded map from the database…</p>}{loadError && <p role="alert" className="mt-4 text-sm text-critical">{loadError}</p>}</div>
    {!payload ? <EmptyState icon={<Network className="size-7" />} title="Start with a research question" body="Run a market scan in Research studio to explore its topics and evidence." action={<Link className="text-momentum" to="/">Open research studio →</Link>} /> : <div className="space-y-5 px-7 pt-6">
      <div className="grid gap-2 sm:grid-cols-3">
        <GraphHint
          kicker="Left column"
          title="Market names"
          body="Companies, tools, and regulators named in the news for this scan."
        />
        <GraphHint
          kicker="Middle column"
          title="Topics we found"
          body="The topics this scan extracted. Pick one in Focus topic to keep the picture small."
        />
        <GraphHint
          kicker="Right column"
          title="Our research notes"
          body="Library documents that look related. A line here means we already have something on the shelf."
        />
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        A line to the left means the news <span className="font-medium text-ink-2">mentioned</span> that name.
        A line to the right means a note <span className="font-medium text-ink-2">covers</span> that topic.
        Click a box to read the exact link. This map is from this scan only — it is not the whole internet.
      </p>
      <div className="flex flex-wrap items-center gap-3"><Badge tone="momentum">{scan?.history_source === 'database' ? `Saved run #${scan.run_id}` : 'Current scan'}</Badge><p className="text-sm text-ink">{scan?.question}</p>{scan?.saved_at && <span className="text-xs text-ink-3">{runDate(scan.saved_at)}</span>}<span className="ml-auto text-xs text-ink-3">{payload.nodes.length} nodes · {payload.links.length} connections</span></div>
      {scan?.history_source === 'database' && <p className="text-xs text-ink-3">Recorded graph loaded from the database. No live retrieval. <Link className="text-momentum" to={`/?run=${scan.run_id}`}>Open this run’s complete results →</Link></p>}
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-edge-soft p-4">
          <label className="flex items-center gap-2 text-xs text-ink-3">Focus topic<select aria-label="Focus topic" className="max-w-[330px] rounded-lg border border-edge bg-surface-2 px-3 py-2 text-ink" value={topicId} onChange={e => { setTopicId(e.target.value); setSelected(null) }}><option value="">All topics in this scan</option>{topics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeEntities} onChange={e => setIncludeEntities(e.target.checked)} />Entities</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeDocs} onChange={e => setIncludeDocs(e.target.checked)} />Documents</label>
          {includeEntities && <label className="flex items-center gap-2 text-xs text-ink-3"><input type="checkbox" checked={allEntities} onChange={e => setAllEntities(e.target.checked)} />Show all entities</label>}
        </div>
        <GraphView payload={payload} height={590} selectedId={selected?.id} onSelect={setSelected} />
      </Panel>
      {!allEntities && includeEntities && <p className="text-xs text-ink-3">Showing up to 5 of the most connected names. Tick Show all entities to see the rest.</p>}
      {selected ? <Panel className="animate-rise p-5"><div className="flex items-center gap-3"><Badge>{selected.type.replaceAll('_',' ')}</Badge><h2 className="font-semibold">{selected.title || selected.label}</h2>{selected.slug && <Link className="ml-auto flex items-center gap-1 text-sm text-momentum" to={`/topic/${selected.slug}`}>Topic details<ArrowUpRight className="size-4" /></Link>}<button className="ml-auto text-xs text-ink-3" onClick={() => setSelected(null)}>Clear selection</button></div><ul className="mt-4 flex flex-wrap gap-3">{payload.links.filter(l => l.source === selected.id || l.target === selected.id).map((l,i) => <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">{payload.nodes.find(n => n.id === l.source)?.label} <span className="text-momentum">{l.relation.replaceAll('_',' ')}</span> {payload.nodes.find(n => n.id === l.target)?.label}</li>)}</ul></Panel> : <p className="text-center text-xs text-ink-3">Click a box to see what it connects to.</p>}
    </div>}
  </div>
}

function GraphHint({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-edge-soft bg-surface px-4 py-3">
      <p className="label-caps text-ink-3">{kicker}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12px] leading-snug text-ink-2">{body}</p>
    </div>
  )
}

