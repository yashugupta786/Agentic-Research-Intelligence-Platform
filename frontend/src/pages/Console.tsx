import clsx from 'clsx'
import {
  ArrowRight,
  BadgeCheck,
  CornerDownLeft,
  ExternalLink,
  FileText,
  Layers,
  Quote,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Sparkles,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import AgentTrace from '../components/AgentTrace'
import RunHistory, { runDate } from '../components/RunHistory'
import { api } from '../lib/api'
import { useActivity } from '../lib/activity'
import { motion } from 'framer-motion'
import { QuadrantChart, Sparkline } from '../components/charts'
import { Badge, Button, EmptyState, Panel, PanelHeader, PriorityBadge, Stat, Tabs } from '../components/ui'
import {
  ACTION_STYLE,
  QUADRANT_META,
  compact,
  coverageLabel,
  momentumLabel,
  pct,
  score,
  seconds,
  signed,
  titleCase,
} from '../lib/format'
import { useAgentStream, useElapsed } from '../lib/hooks'
import type { AgentResult, Citation } from '../lib/types'

const INTENT_COPY: Record<string, { label: string; blurb: string }> = {
  market_scan: {
    label: 'Market scan',
    blurb: 'Sense external demand, then compare it against the internal shelf',
  },
  library_qa: {
    label: 'Library question',
    blurb: 'Answer from existing research only, with citations',
  },
  gap_review: {
    label: 'Portfolio review',
    blurb: 'Review stored demand-vs-coverage across all tracked topics',
  },
  topic_deep_dive: {
    label: 'Topic deep dive',
    blurb: 'Detail on one already-sensed topic',
  },
}

export default function Console() {
  const [draft, setDraft] = useState('')
  const [refresh, setRefresh] = useState(false)
  const [mode, setMode] = useState<'auto' | 'market_scan' | 'library_qa' | 'gap_review'>('market_scan')
  const { phase, events, result, error, question, startedAt, run, restore, stop, reset } = useAgentStream()
  const [params, setParams] = useSearchParams()
  const runId = params.get('run')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const { setActivity } = useActivity()
  useEffect(() => () => {
    setActivity({ question: '', events: [], running: false, saved: false })
  }, [setActivity])
  useEffect(() => {
    setActivity({ question, events, running: phase === 'running', saved: result?.history_source === 'database' })
  }, [question, events, phase, result?.history_source, setActivity])
  useEffect(() => {
    if (!runId) return
    let active = true
    // Loading state tracks a request triggered by URL navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true)
    setHistoryError('')
    api.runResult(Number(runId)).then(({ result: savedResult }) => {
      if (!active) return
      restore(savedResult)
      setDraft(savedResult.question)
      setMode(savedResult.intent === 'library_qa' ? 'library_qa' : 'market_scan')
    }).catch(e => { if (active) setHistoryError(e.message) }).finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [runId, restore])
  const elapsed = useElapsed(startedAt, phase === 'running')


  const running = phase === 'running'
  const lockedIntent = mode === 'auto' ? null : mode
  const submit = () => {
    const trimmed = draft.trim()
    if (trimmed.length > 1 && !running && !historyLoading) {
      setParams({})
      setHistoryError('')
      run(trimmed, refresh, lockedIntent)
    }
  }

  return (
    <div className="pb-14">
      <header className="studio-hero">
        <div className="relative flex items-start justify-between gap-4">
          <div><p className="label-caps mb-4 flex items-center gap-2"><span className="size-1.5 rounded-full bg-momentum" />Research studio</p><h1 className="studio-title">From market signals<br /><span className="text-momentum">to your next opportunity.</span></h1><p className="mt-4 text-sm text-ink-3">One question. Connected evidence. A clear next step.</p></div>
          {phase !== 'idle' && <Button variant="secondary" size="sm" disabled={running} onClick={() => { setParams({}); reset(); setDraft('') }}><RefreshCw className="size-3.5" />New question</Button>}
        </div>
      </header>

      <div className="px-7 pt-6">
        {/* --- Query bar ------------------------------------------------ */}
        <Panel raised className="query-composer overflow-hidden">
          <div className="border-b border-edge-soft px-4 py-3">
            
            <Tabs
              value={mode}
              onChange={setMode}
              options={[
                { value: 'market_scan', label: 'Market scan' },
                { value: 'library_qa', label: 'Ask the library' },
                { value: 'auto', label: 'Auto route' },
              ]}
            />

          </div>
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Sparkles className="mt-2.5 size-4 shrink-0 text-momentum" />
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              aria-label="Research question"
              maxLength={500}
              rows={3}
              placeholder="e.g. AI in healthcare  -  or  -  What are the major risks of AI adoption in healthcare?"
              className="min-h-[52px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
            />
            <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
              {running ? (
                <Button variant="secondary" onClick={stop}>
                  <Square className="size-3.5" />
                  Pause updates
                </Button>
              ) : (
                <Button variant="primary" onClick={submit} disabled={draft.trim().length < 2 || historyLoading}>
                  Start research
                  <CornerDownLeft className="size-3.5" />
                </Button>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-3 select-none">
                <input
                  type="checkbox"
                  checked={refresh}
                  onChange={(event) => setRefresh(event.target.checked)}
                  className="size-3 accent-[var(--color-momentum)]"
                />
                fresh search
              </label>
            </div>
          </div>

          {phase === 'idle' && <div className="flex flex-wrap gap-2 border-t border-edge-soft px-4 py-3"><span className="self-center text-[11px] text-ink-3">Try a question</span>{(mode === 'library_qa' ? ['What are the risks of AI adoption in healthcare?', 'How should enterprises govern agentic AI?'] : ['AI in healthcare', 'AI in supply chain']).map(example => <button key={example} onClick={() => setDraft(example)} className="rounded-full border border-edge px-3 py-1.5 text-xs text-ink-2 transition hover:border-momentum">{example}<ArrowRight className="ml-2 inline size-3" /></button>)}</div>}
        </Panel>

        <RunHistory onSelect={id => setParams({ run: String(id) })} selectedId={result?.run_id} disabled={running || historyLoading} refreshKey={result?.run_id ?? 0} />
        {historyLoading && <p role="status" className="mt-4 text-sm text-momentum">Opening recorded result from the database…</p>}
        {historyError && <p role="alert" className="mt-4 text-sm text-critical">{historyError}</p>}
        {result && !running && <div className="mt-4 rounded-xl border border-edge bg-surface px-4 py-3 text-xs text-ink-2"><span className="font-semibold text-momentum">{result.history_source === 'database' ? `Saved run #${result.run_id} · Loaded from database` : result.run_id ? `Run #${result.run_id} · Saved to database` : 'Result in this tab'}</span><span className="ml-3">{result.question}</span>{result.saved_at && <span className="ml-3 text-ink-3">{runDate(result.saved_at)}</span>}{result.history_note && <p className="mt-2 text-gap">{result.history_note}</p>}</div>}

        {phase === 'idle' ? <IdleBrief /> : <Pipeline events={events} running={running} />}

        {phase !== 'idle' ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-5">
              {error ? (
                <Panel className="border-critical/30">
                  <div className="flex items-start gap-3 px-5 py-4">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
                    <div>
                      <p className="text-[13px] font-medium text-ink">The run did not complete</p>
                      <p className="mt-1 text-[12.5px] text-ink-2">{error}</p>
                      <p className="mt-2 text-[11.5px] text-ink-3">
                        Inspect the agent activity for the last completed step. Previously saved research remains available.
                      </p>
                    </div>
                  </div>
                </Panel>
              ) : null}

              {result ? <ResultView result={result} /> : null}

              {!result && running ? (
                <Panel className="relative overflow-hidden">
                  <div className="px-5 py-4">
                    <p className="text-[12.5px] text-ink-2">
                      Working on <span className="font-medium text-ink">{question}</span>
                    </p>
                    <p className="num mt-1 text-[11.5px] text-ink-3">{seconds(elapsed)} elapsed</p>
                  </div>
                  <div className="relative h-0.5 overflow-hidden bg-surface-3 animate-sweep" />
                </Panel>
              ) : null}
            </div>

            {/* --- Live trace ------------------------------------------- */}
            <Panel className="h-fit">
              <PanelHeader
                title="Agent activity"
                subtitle={running ? 'Live evidence and outputs' : 'Expand a step to inspect its output'}
                icon={<RouteIcon className="size-4" />}
                actions={
                  running ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-momentum">
                      <span className="size-1.5 animate-pulse rounded-full bg-momentum" />
                      running
                    </span>
                  ) : (
                    <span className="num text-[11px] text-ink-3">{seconds(result?.latency_ms ?? elapsed)}</span>
                  )
                }
              />
              <div className="p-2.5">
                {events.length ? (
                  <AgentTrace events={events} running={running} className="pr-1" />
                ) : (
                  <p className="px-3 py-6 text-center text-[12px] text-ink-3">Waiting for the first agent to report…</p>
                )}
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
function IdleBrief() {
  return <div className="mt-8 grid gap-4 md:grid-cols-3">{[
    { icon: Search, title: 'Discover', detail: 'Live signals across the market.', n: '01' },
    { icon: Layers, title: 'Connect', detail: 'Match topics to internal research.', n: '02' },
    { icon: ArrowRight, title: 'Decide', detail: 'Rank gaps. Plan your next move.', n: '03' },
  ].map(({ icon: Icon, title, detail, n },i) => <motion.div key={n} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*.1}} className="panel p-6"><div className="flex items-center justify-between"><Icon className="size-5 text-momentum" /><span className="num text-xs text-ink-3">{n}</span></div><h2 className="mt-5 text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-ink-3">{detail}</p></motion.div>)}</div>
}

function Pipeline({ events, running }: { events: import('../lib/types').TraceEvent[]; running: boolean }) {
  const nodes = [...new Map(events.map(e => [e.node,e])).values()]
  return <div aria-label="Research progress" className="mt-5 flex gap-2 overflow-x-auto pb-2">{nodes.map((e,i) => <motion.div key={e.node} initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} className={clsx('flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[11px]',running && i === nodes.length-1 ? 'border-momentum bg-momentum/10 text-momentum' : 'border-edge text-ink-2')}><span className={clsx('size-1.5 rounded-full',e.status === 'error' ? 'bg-critical' : 'bg-coverage')} />{e.agent}</motion.div>)}</div>
}

function ResultView({ result }: { result: AgentResult }) {
  const intent = INTENT_COPY[result.intent] ?? { label: titleCase(result.intent), blurb: '' }
  const isQa = result.intent === 'library_qa'
  const topGaps = result.gaps.slice(0, 8)
  const showTrend = topGaps.some((gap) => {
    const topic = result.topics.find((item) => item.slug === gap.topic_slug)
    return gap.growth_pct != null || (topic?.sparkline?.length ?? 0) >= 2
  })
  const scoutStats = result.scout_stats

  return (
    <div className="space-y-5">
      {!isQa && <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-3">Sampled news attention · Simulated research library</span>{result.graph?.snapshot && <Link to={result.run_id ? `/graph?run=${result.run_id}` : '/graph'} className="flex items-center gap-2 rounded-full border border-momentum/30 bg-momentum/10 px-4 py-2 text-xs text-momentum">Explore this query's map<ArrowRight className="size-3" /></Link>}</div>}
      {result.errors?.length ? <Panel className="border-critical/30 px-5 py-4"><p className="text-sm font-medium text-critical">Partial result</p><p className="mt-1 text-xs text-ink-2">Some steps failed or used a fallback. Review the activity trace before relying on this result.</p></Panel> : null}
      <details className="panel overflow-hidden"><summary className="px-5 py-3 text-xs text-ink-3">Run details & search evidence</summary>
      {/* Routing decision */}
      <Panel raised>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <Badge tone="accent">
            <RouteIcon className="size-3" />
            {intent.label}
          </Badge>
          {result.research_area ? <Badge>{result.research_area}</Badge> : null}
          {result.signal_source ? <Badge>signals: {result.signal_source}</Badge> : null}
          <span className="num ml-auto text-[11px] text-ink-3">
            {seconds(result.latency_ms)} &middot; {result.telemetry?.total_calls ?? 0} API calls &middot;{' '}
            {compact(result.telemetry?.total_tokens)} tokens
          </span>
        </div>
        {result.reasoning ? (
          <p className="px-5 pt-2.5 pb-4 text-[12.5px] leading-relaxed text-ink-3">
            <span className="text-ink-2">Why this route:</span> {result.reasoning}
          </p>
        ) : null}
      </Panel>

      {!isQa && scoutStats?.queries?.length ? (
        <Panel>
          <PanelHeader
            title="Signal Scout handoff"
            subtitle="Each query count is shown before URL de-duplication"
            icon={<Search className="size-4" />}
          />
          <div className="divide-y divide-edge-soft">
            {scoutStats.queries.map((item) => (
              <div key={item.query} className="flex items-center gap-3 px-5 py-2.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-ink-2">{item.query}</span>
                <span className="num shrink-0 text-ink">{item.count} results</span>
                <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-ink-3">{item.cached ? 'cached' : 'live'}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-edge-soft px-5 py-3 text-[11px] text-ink-3">
            <span><strong className="num text-ink">{scoutStats.raw_total ?? 0}</strong> raw results</span>
            <span><strong className="num text-ink">{scoutStats.unique_articles ?? result.articles.length}</strong> unique articles</span>
            <span><strong className="num text-ink">{scoutStats.outlets ?? 0}</strong> outlets</span>
          </div>
        </Panel>
      ) : null}

      </details>
      {/* Executive answer */}
      <Panel>
        <PanelHeader
          title={isQa ? 'Grounded answer' : 'Executive summary'}
          subtitle={isQa ? 'Answered from the internal library only' : 'Written from the computed demand-vs-coverage analytics'}
          icon={<FileText className="size-4" />}
          actions={
            result.groundedness !== null && result.groundedness !== undefined ? (
              <Badge tone={result.groundedness >= 0.8 ? 'coverage' : result.groundedness >= 0.5 ? 'gap' : 'critical'}>
                <BadgeCheck className="size-3" />
                {isQa ? 'support estimate' : 'consistency estimate'} {pct(result.groundedness)}
              </Badge>
            ) : null
          }
        />
        <div className="px-5 py-4">
          <p className="text-[13.5px] leading-[1.75] whitespace-pre-line text-ink">{result.answer}</p>

          {result.critique_issues?.length ? (
            <div className="mt-4 rounded-xl border border-gap/25 bg-gap/6 px-3.5 py-3">
              <p className="text-[11.5px] font-medium text-gap">The critic flagged {result.critique_issues.length} item(s)</p>
              <ul className="mt-1.5 space-y-1">
                {result.critique_issues.map((issue) => (
                  <li key={issue} className="text-[11.5px] leading-relaxed text-ink-2">
                    &middot; {issue}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {result.citations?.length ? <Citations citations={result.citations} /> : null}
      </Panel>

      {/* Normalisation evidence - proves step 2 actually happened */}
      {result.normalisation?.canonical ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat
            label="Articles read"
            value={result.articles?.length ?? 0}
            hint={`${new Set(result.articles?.map((a) => a.domain)).size} distinct outlets`}
          />
          <Stat
            label="Raw mentions"
            value={result.normalisation.raw_mentions ?? 0}
            hint="topic phrases extracted before merging"
          />
          <Stat
            label="Canonical topics"
            value={result.normalisation.canonical ?? 0}
            accent="text-momentum"
            hint={`${result.normalisation.merged ?? 0} duplicate surface forms merged`}
          />
          <Stat
            label="Graph"
            value={compact((result.graph?.nodes as number) ?? 0)}
            hint={`${compact((result.graph?.edges as number) ?? 0)} relationships`}
          />
        </div>
      ) : null}

      {/* Recommendations */}
      {result.recommendations?.length ? (
        <Panel>
          <PanelHeader
            title="Recommended actions"
            subtitle="Rule-based actions for analyst review"
            icon={<ArrowRight className="size-4" />}
          />
          <ul className="divide-y divide-edge-soft">
            {result.recommendations.map((rec) => (
              <li key={rec.topic + rec.action} className="flex items-start gap-3.5 px-5 py-3.5">
                <span
                  className={clsx(
                    'mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-semibold tracking-wide uppercase',
                    ACTION_STYLE[rec.action.toLowerCase()] ?? 'border-edge text-ink-3',
                  )}
                >
                  {rec.action}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{rec.topic}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{rec.rationale}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Gap table + quadrant */}
      {topGaps.length ? (
        <>
          <Panel>
            <PanelHeader
              title="Demand versus coverage"
              subtitle="Attention is sampled news interest; coverage estimates usable internal research"
              icon={<Layers className="size-4" />}
              actions={
                <Link to="/demand" className="text-[12px] text-momentum hover:underline">
                  Full dashboard
                </Link>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-edge-soft text-ink-3">
                    <th className="label-caps px-5 py-2.5 font-semibold">Topic</th>
                    {showTrend ? <th className="label-caps px-3 py-2.5 font-semibold">Trend</th> : null}
                    <th className="label-caps px-3 py-2.5 text-right font-semibold">Attention</th>
                    <th className="label-caps px-3 py-2.5 text-right font-semibold">Coverage</th>
                    <th className="label-caps px-3 py-2.5 text-right font-semibold">Gap</th>
                    <th className="label-caps px-3 py-2.5 font-semibold">Verdict</th>
                    <th className="label-caps px-5 py-2.5 font-semibold">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-soft/70">
                  {topGaps.map((gap) => {
                    const topic = result.topics.find((item) => item.slug === gap.topic_slug)
                    const meta = QUADRANT_META[gap.quadrant]
                    return (
                      <tr key={gap.topic_slug} className="transition hover:bg-surface-2/60">
                        <td className="max-w-[300px] px-5 py-3">
                          <Link
                            to={`/topic/${gap.topic_slug}`}
                            className="text-[13px] font-medium text-ink hover:text-momentum"
                          >
                            {gap.label}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-ink-3">
                            {gap.category ?? 'Uncategorised'}
                            {topic?.doc_count !== undefined ? ` · ${topic.doc_count} internal doc(s)` : ''}
                          </p>
                        </td>
                        {showTrend ? (
                          <td className="px-3 py-3">
                            {(topic?.sparkline?.length ?? 0) >= 2 ? <Sparkline values={topic?.sparkline} /> : null}
                            {gap.growth_pct != null ? (
                              <span className="num mt-0.5 block text-[10.5px] text-ink-3">{signed(gap.growth_pct)}</span>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="num px-3 py-3 text-right text-[12.5px] text-momentum">
                          {score(gap.momentum)}
                          <span className="mt-0.5 block text-[10px] text-ink-3">{momentumLabel(gap.momentum)}</span>
                        </td>
                        <td className="num px-3 py-3 text-right text-[12.5px] text-coverage">
                          {score(gap.coverage_score)}
                          <span className="mt-0.5 block text-[10px] text-ink-3">
                            {coverageLabel(gap.coverage_score)}{topic?.coverage_method ? ` · ${topic.coverage_method.replaceAll('_', ' ')}` : ''}
                          </span>
                        </td>
                        <td className="num px-3 py-3 text-right text-[12.5px] font-semibold text-gap">
                          {score(gap.gap_score)}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-[11.5px]" style={{ color: meta?.colour }}>
                            {meta?.label ?? gap.quadrant}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <PriorityBadge priority={gap.priority} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="This scan on the map"
              subtitle="Only topics from this question. The full saved portfolio is on Opportunities."
              actions={
                <Link to="/demand" className="text-[12px] text-momentum hover:underline">
                  Open Opportunities
                </Link>
              }
            />
            <div className="px-3 py-4">
              <QuadrantChart gaps={result.gaps} height={280} guide={false} />
            </div>
          </Panel>
        </>
      ) : null}

      <details className="panel overflow-hidden"><summary className="px-5 py-3 text-xs text-ink-3">External evidence ({result.articles?.length ?? 0} articles)</summary>
      {/* Evidence */}
      {result.articles?.length ? (
        <Panel>
          <PanelHeader
            title="External evidence"
            subtitle={`${result.articles.length} articles the crew actually read`}
            icon={<ExternalLink className="size-4" />}
          />
          <ul className="grid gap-x-6 gap-y-2.5 px-5 py-4 md:grid-cols-2">
            {result.articles.slice(0, 12).map((article, index) => (
              <li key={`${article.url}-${index}`} className="min-w-0">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-[12.5px] leading-snug text-ink-2 hover:text-momentum"
                >
                  {article.title}
                </a>
                <p className="num mt-0.5 text-[10.5px] text-ink-3">
                  {article.domain} {article.published_date ? `· ${article.published_date.slice(0, 10)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      </details>
      {!result.gaps.length && !result.citations?.length && !isQa ? (
        <Panel>
          <EmptyState
            title="No analysis was produced"
            body="The planner routed this request but the downstream specialists returned nothing usable. Check the agent activity panel for the failing step."
          />
        </Panel>
      ) : null}
    </div>
  )
}

function Citations({ citations }: { citations: Citation[] }) {
  return (
    <div className="border-t border-edge-soft px-5 py-4">
      <p className="label-caps mb-2.5 flex items-center gap-1.5">
        <Quote className="size-3" />
        Cited internal research ({citations.length})
      </p>
      <ul className="space-y-2">
        {citations.map((citation) => (
          <li key={citation.doc_id} className="flex items-start gap-2.5">
            <span className="num mt-0.5 shrink-0 rounded-md border border-momentum/30 bg-momentum/10 px-1.5 py-0.5 text-[10.5px] text-momentum">
              {citation.doc_id}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] leading-snug text-ink-2">{citation.title}</p>
              <p className="num mt-0.5 text-[10.5px] text-ink-3">
                {citation.practice_area} &middot; {citation.doc_type} &middot; {citation.published_date} &middot;
                similarity {score(citation.score)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
