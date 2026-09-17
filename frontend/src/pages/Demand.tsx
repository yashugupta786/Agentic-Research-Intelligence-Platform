import clsx from 'clsx'
import { AlertOctagon, ArrowUpRight, Gauge, Layers, Target, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import PageHeader from '../components/PageHeader'
import { QuadrantChart, Sparkline } from '../components/charts'
import {
  Badge,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Panel,
  PanelHeader,
  PriorityBadge,
  Stat,
  Tabs,
} from '../components/ui'
import { api } from '../lib/api'
import { QUADRANT_META, ageLabel, coverageLabel, momentumLabel, pct, score, signed } from '../lib/format'
import { useAsync } from '../lib/hooks'
import type { Quadrant, Topic } from '../lib/types'

type Filter = 'all' | Quadrant
const EMPTY_TOPICS: Topic[] = []

export default function Demand() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const { data, error, loading, reload } = useAsync(() => api.topics({ order: 'gap' }), [])
  const { data: portfolioData } = useAsync(() => api.portfolio(), [])

  const topics = data?.topics ?? EMPTY_TOPICS
  const portfolio = data?.portfolio

  const gaps = useMemo(
    () =>
      topics
        .filter((topic) => topic.gap_score !== null && topic.gap_score !== undefined)
        .map((topic) => ({
          topic_slug: topic.slug,
          label: topic.label,
          momentum: topic.momentum ?? 0,
          coverage_score: topic.coverage_score ?? 0,
          gap_score: topic.gap_score ?? 0,
          priority: topic.priority ?? 'LOW',
          quadrant: topic.quadrant ?? 'watch',
          rationale: topic.rationale ?? '',
          category: topic.category,
          growth_pct: topic.growth_pct,
        })),
    [topics],
  )

  const visible = filter === 'all' ? topics : topics.filter((topic) => topic.quadrant === filter)
  const counts = portfolio?.quadrants ?? {}

  return (
    <div className="pb-14">
      <PageHeader
        eyebrow="Demand vs coverage"
        title="Where the market is ahead of our shelf"
        lede="Right side of the map = news is talking. Top of the map = we already have notes. The pink corner is the job: hot news, empty shelf."
      />

      {loading ? <LoadingBlock label="Loading portfolio" rows={5} /> : null}
      {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

      {!loading && !error && !topics.length ? (
        <Panel className="m-7">
          <EmptyState
            icon={<Target className="size-7" />}
            title="No analysis stored yet"
            body="Run a market scan from the research console first - the dashboard reads the analysis the agent crew persists, so it stays fast and works even if the model API is rate-limited."
            action={
              <Link
                to="/"
                className="mt-1 rounded-lg bg-momentum px-3.5 py-2 text-[12.5px] font-semibold text-canvas hover:bg-sky-300"
              >
                Open the console
              </Link>
            }
          />
        </Panel>
      ) : null}

      {topics.length ? (
        <div className="space-y-5 px-7 pt-6">
          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label="Topics tracked"
              value={portfolio?.topics ?? topics.length}
              hint="canonical, after de-duplication"
              icon={<Layers className="size-3.5" />}
            />
            <Stat
              label="Critical gaps"
              value={portfolio?.critical ?? 0}
              accent="text-critical"
              hint={`${portfolio?.high ?? 0} more at high priority`}
              icon={<AlertOctagon className="size-3.5" />}
            />
            <Stat
              label="Avg demand"
              value={score(portfolio?.avg_momentum)}
              accent="text-momentum"
              hint={momentumLabel(portfolio?.avg_momentum)}
              icon={<TrendingUp className="size-3.5" />}
            />
            <Stat
              label="Avg coverage"
              value={score(portfolio?.avg_coverage)}
              accent="text-coverage"
              hint={coverageLabel(portfolio?.avg_coverage)}
              icon={<Gauge className="size-3.5" />}
            />
            <Stat
              label="Demand exposure"
              value={pct(portfolio?.exposure)}
              accent="text-gap"
              hint="share of sensed demand sitting on poorly covered topics"
            />
          </div>

          {/* Quadrant map + priority rail */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <Panel>
              <PanelHeader
                title="Opportunity map"
                subtitle="Right = news is talking. Up = we already have notes. Click a bubble to open the topic."
              />
              <div className="px-3 py-4">
                <QuadrantChart gaps={gaps} onSelect={(slug) => navigate(`/topic/${slug}`)} height={560} />
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Act on these first" subtitle="Ranked by gap score" />
                <ul className="divide-y divide-edge-soft">
                  {topics.slice(0, 5).map((topic, index) => (
                    <li key={topic.slug}>
                      <Link
                        to={`/topic/${topic.slug}`}
                        className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2/60"
                      >
                        <span className="num mt-0.5 text-[11px] text-ink-3">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-ink">{topic.label}</p>
                          <div className="num mt-1 flex items-center gap-2.5 text-[10.5px]">
                            <span className="text-momentum">{score(topic.momentum)}</span>
                            <span className="text-coverage">{score(topic.coverage_score)}</span>
                            <span className="font-semibold text-gap">gap {score(topic.gap_score)}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader title="Portfolio shape" subtitle="How the tracked topics distribute" />
                <div className="space-y-2.5 px-4 py-4">
                  {(Object.keys(QUADRANT_META) as Quadrant[]).map((quadrant) => {
                    const count = counts[quadrant] ?? 0
                    const total = portfolio?.topics || 1
                    return (
                      <div key={quadrant}>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11.5px] text-ink-2">{QUADRANT_META[quadrant].label}</span>
                          <span className="num text-[11px] text-ink-3">{count}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{
                              width: `${Math.max(count ? 3 : 0, (count / total) * 100)}%`,
                              background: QUADRANT_META[quadrant].colour,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[10.5px] text-ink-3">{QUADRANT_META[quadrant].blurb}</p>
                      </div>
                    )
                  })}
                </div>
              </Panel>

              {portfolioData?.by_category?.length ? (
                <Panel>
                  <PanelHeader title="By category" subtitle="Average gap per market category" />
                  <ul className="divide-y divide-edge-soft">
                    {portfolioData.by_category.map((row) => (
                      <li key={row.category} className="flex items-center justify-between px-4 py-2.5">
                        <span className="truncate text-[12px] text-ink-2">{row.category}</span>
                        <span className="num flex shrink-0 items-center gap-2.5 text-[11px]">
                          <span className="text-ink-3">{row.topics}</span>
                          <span className="text-momentum">{score(row.avg_momentum)}</span>
                          <span className="text-coverage">{score(row.avg_coverage)}</span>
                          <span className="font-semibold text-gap">{score(row.avg_gap)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          </div>

          {/* Full table */}
          <Panel>
            <PanelHeader
              title="All tracked topics"
              subtitle={`${visible.length} of ${topics.length} shown`}
              actions={
                <Tabs<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: topics.length },
                    { value: 'publish_now', label: 'Publish now', count: counts.publish_now ?? 0 },
                    { value: 'refresh', label: 'Refresh', count: counts.refresh ?? 0 },
                    { value: 'maintain', label: 'Maintain', count: counts.maintain ?? 0 },
                    { value: 'over_invested', label: 'Over-invested', count: counts.over_invested ?? 0 },
                    { value: 'watch', label: 'Watch', count: counts.watch ?? 0 },
                  ]}
                />
              }
            />
            <TopicTable topics={visible} />
          </Panel>
        </div>
      ) : null}
    </div>
  )
}

function TopicTable({ topics }: { topics: Topic[] }) {
  if (!topics.length) {
    return <EmptyState title="Nothing in this quadrant" body="Try a different filter." />
  }

  const showTrend = topics.some(
    (topic) => (topic.sparkline?.length ?? 0) >= 2 || topic.growth_pct != null,
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-edge-soft">
            <th className="label-caps px-5 py-2.5 font-semibold">Topic</th>
            {showTrend ? <th className="label-caps px-3 py-2.5 font-semibold">Volume trend</th> : null}
            <th className="label-caps px-3 py-2.5 text-right font-semibold">Demand</th>
            <th className="label-caps px-3 py-2.5 text-right font-semibold">Coverage</th>
            <th className="label-caps px-3 py-2.5 font-semibold">Internal shelf</th>
            <th className="label-caps px-3 py-2.5 text-right font-semibold">Gap</th>
            <th className="label-caps px-5 py-2.5 font-semibold">Verdict</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-soft/70">
          {topics.map((topic) => {
            const meta = QUADRANT_META[topic.quadrant ?? 'watch']
            return (
              <tr key={topic.slug} className="group transition hover:bg-surface-2/60">
                <td className="max-w-[340px] px-5 py-3.5">
                  <Link to={`/topic/${topic.slug}`} className="text-[13px] font-medium text-ink group-hover:text-momentum">
                    {topic.label}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-3">
                    {topic.category ?? 'Uncategorised'}
                    {topic.aliases?.length > 1 ? ` · merged from ${topic.aliases.length} phrasings` : ''}
                  </p>
                </td>
                {showTrend ? (
                  <td className="px-3 py-3.5">
                    {(topic.sparkline?.length ?? 0) >= 2 ? <Sparkline values={topic.sparkline} /> : null}
                    {topic.growth_pct != null ? (
                      <span
                        className={clsx(
                          'num mt-0.5 block text-[10.5px]',
                          topic.growth_pct > 0 ? 'text-momentum' : 'text-ink-3',
                        )}
                      >
                        {signed(topic.growth_pct)}
                      </span>
                    ) : null}
                  </td>
                ) : null}
                <td className="num px-3 py-3.5 text-right">
                  <span className="text-[12.5px] text-momentum">{score(topic.momentum)}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-3">{momentumLabel(topic.momentum)}</span>
                </td>
                <td className="num px-3 py-3.5 text-right">
                  <span className="text-[12.5px] text-coverage">{score(topic.coverage_score)}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-3">{coverageLabel(topic.coverage_score)}</span>
                </td>
                <td className="px-3 py-3.5">
                  <span className="num text-[11.5px] text-ink-2">
                    {topic.doc_count ?? 0} doc{topic.doc_count === 1 ? '' : 's'}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-ink-3">{ageLabel(topic.staleness_days)}</span>
                </td>
                <td className="num px-3 py-3.5 text-right text-[13px] font-semibold text-gap">
                  {score(topic.gap_score)}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-col items-start gap-1.5">
                    <PriorityBadge priority={topic.priority} />
                    <Badge>
                      <span className="size-1.5 rounded-full" style={{ background: meta?.colour }} />
                      {meta?.action ?? topic.quadrant}
                    </Badge>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
