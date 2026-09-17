import {
  ArrowLeft,
  ExternalLink,
  FileStack,
  Lightbulb,
  Link2,
  Loader2,
  Network,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import GraphView from '../components/GraphView'
import { MomentumChart, ScoreRow } from '../components/charts'
import { Badge, Button, EmptyState, ErrorBlock, LoadingBlock, Panel, PanelHeader, PriorityBadge } from '../components/ui'
import { api } from '../lib/api'
import { QUADRANT_META, ageLabel, coverageLabel, momentumLabel, score, shortDate, signed } from '../lib/format'
import { useAsync } from '../lib/hooks'
import type { Brief } from '../lib/types'

export default function TopicDetail() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync(() => api.topic(slug), [slug])

  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)

  const generateBrief = async () => {
    setBriefLoading(true)
    setBriefError(null)
    try {
      setBrief(await api.brief(slug))
    } catch (err) {
      setBriefError((err as Error).message)
    } finally {
      setBriefLoading(false)
    }
  }

  if (loading) return <LoadingBlock label="Loading topic" rows={6} />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!data) return null

  const { topic, series, signals, adjacent, subgraph } = data
  const quadrant = QUADRANT_META[topic.quadrant ?? 'watch']

  return (
    <div className="pb-14">
      <header className="border-b border-edge-soft px-7 py-6">
        <Link to="/demand" className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-2">
          <ArrowLeft className="size-3.5" />
          Demand vs coverage
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{topic.label}</h1>
            {topic.description ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{topic.description}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={topic.priority} />
              <Badge>
                <span className="size-1.5 rounded-full" style={{ background: quadrant?.colour }} />
                {quadrant?.label}
              </Badge>
              {topic.category ? <Badge>{topic.category}</Badge> : null}
              <Badge>
                {topic.mention_count} mentions across {topic.source_count} sources
              </Badge>
              {topic.last_seen ? <Badge>last seen {shortDate(topic.last_seen)}</Badge> : null}
            </div>
          </div>

          <Button variant="primary" onClick={generateBrief} disabled={briefLoading}>
            {briefLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Lightbulb className="size-3.5" />}
            {briefLoading ? 'Drafting brief…' : 'Draft commissioning brief'}
          </Button>
        </div>
      </header>

      <div className="space-y-5 px-7 pt-6">
        {/* Scores + rationale */}
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Panel className="space-y-4 p-5">
            <ScoreRow label="Market momentum" value={topic.momentum} colour="var(--color-momentum)" />
            <ScoreRow label="Internal coverage" value={topic.coverage_score} colour="var(--color-coverage)" />
            <ScoreRow label="Research gap" value={topic.gap_score} colour="var(--color-gap)" />

            <div className="num space-y-1.5 border-t border-edge-soft pt-3.5 text-[11.5px]">
              {topic.growth_pct != null ? <Row label="volume growth" value={signed(topic.growth_pct)} /> : null}
              <Row label="demand" value={momentumLabel(topic.momentum)} />
              <Row label="coverage" value={coverageLabel(topic.coverage_score)} />
              <Row label="articles in this scan" value={String(topic.mention_count ?? 0)} />
              <Row label="websites" value={String(topic.source_count ?? 0)} />
              <Row label="documents" value={String(topic.doc_count ?? 0)} />
              <Row label="strong matches" value={String(topic.strong_matches ?? 0)} />
              <Row label="newest doc" value={ageLabel(topic.staleness_days)} />
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel>
              <PanelHeader
                title="Why this verdict"
                subtitle={quadrant?.blurb}
                icon={<Sparkles className="size-4" />}
              />
              <p className="px-5 py-4 text-[13px] leading-relaxed text-ink-2">{topic.rationale}</p>
              {topic.aliases?.length > 1 ? (
                <div className="border-t border-edge-soft px-5 py-3.5">
                  <p className="label-caps mb-2">Normalised from {topic.aliases.length} surface forms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.aliases.map((alias) => (
                      <span
                        key={alias}
                        className="rounded-md border border-edge bg-surface-2 px-2 py-1 text-[11px] text-ink-3"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </Panel>

            {series.length >= 2 ? (
              <Panel>
                <PanelHeader
                  title="Market volume"
                  subtitle="Daily article volume for this topic. Used only when a time series exists."
                  icon={<TrendingUp className="size-4" />}
                />
                <MomentumChart series={series} height={210} />
              </Panel>
            ) : null}
          </div>
        </div>

        {/* Brief */}
        {briefError ? <ErrorBlock message={briefError} onRetry={generateBrief} /> : null}
        {brief ? <BriefCard brief={brief} /> : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Internal coverage */}
          <Panel>
            <PanelHeader
              title="What the library already holds"
              subtitle={`${topic.matched_docs?.length ?? 0} candidate matches · inspect relevance and assessment method`}
              icon={<FileStack className="size-4" />}
            />
            {topic.matched_docs?.length ? (
              <ul className="divide-y divide-edge-soft">
                {topic.matched_docs.map((doc) => (
                  <li key={doc.doc_id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12.5px] leading-snug font-medium text-ink">{doc.title}</p>
                        <p className="num mt-1 text-[10.5px] text-ink-3">
                          {doc.doc_id} &middot; {doc.practice_area} &middot; {doc.doc_type} &middot;{' '}
                          {ageLabel(doc.age_days)}
                        </p>
                        <p className="mt-2 text-xs text-ink-2">{doc.verdict ?? 'Legacy match'} · {doc.judged_by?.replaceAll('_', ' ') ?? 'Legacy assessment'}</p>
                        {doc.reason ? <p className="mt-1 text-xs leading-relaxed text-ink-3">{doc.reason}</p> : null}
                      </div>
                      <span className="num shrink-0 text-[11px] text-coverage">{score(doc.score)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No accepted coverage matches"
                body="No retrieved candidate was accepted. Validate the topic and retrieval before concluding that research is missing."
              />
            )}
          </Panel>

          {/* External evidence */}
          <Panel>
            <PanelHeader
              title="External evidence"
              subtitle={`${signals.length} article(s) backing this topic`}
              icon={<ExternalLink className="size-4" />}
            />
            {signals.length ? (
              <ul className="divide-y divide-edge-soft">
                {signals.slice(0, 10).map((signal, index) => (
                  <li key={`${signal.url}-${index}`} className="px-5 py-3">
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12.5px] leading-snug font-medium text-ink-2 hover:text-momentum"
                    >
                      {signal.title}
                    </a>
                    <p className="num mt-1 text-[10.5px] text-ink-3">
                      {signal.domain} {signal.published_date ? `· ${shortDate(signal.published_date)}` : ''}
                    </p>
                    {signal.snippet ? (
                      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-3">{signal.snippet}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No stored signals" body="This topic was scored from derived breadth and recency." />
            )}
          </Panel>
        </div>

        {/* Adjacency - the graph earning its keep */}
        {adjacent?.length ? (
          <Panel>
            <PanelHeader
              title="Adjacent coverage to build on"
              subtitle="Topics next to this one that we already cover well - reuse candidates surfaced by the knowledge graph"
              icon={<Link2 className="size-4" />}
            />
            <ul className="divide-y divide-edge-soft">
              {adjacent.map((item) => (
                <li key={item.slug} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <Link to={`/topic/${item.slug}`} className="text-[12.5px] font-medium text-ink hover:text-momentum">
                      {item.label}
                    </Link>
                    <p className="num mt-1 text-[10.5px] text-ink-3">
                      coverage {score(item.coverage_score)} &middot; similarity {score(item.similarity)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.documents.map((doc) => (
                      <span
                        key={doc.doc_id}
                        title={doc.title}
                        className="num rounded-md border border-coverage/30 bg-coverage/8 px-1.5 py-0.5 text-[10.5px] text-coverage"
                      >
                        {doc.doc_id}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {/* Neighbourhood graph */}
        {subgraph?.nodes?.length ? (
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Graph neighbourhood"
              subtitle={`${subgraph.nodes.length} connected nodes: entities driving this topic and documents covering it`}
              icon={<Network className="size-4" />}
            />
            <GraphView payload={subgraph} height={420} selectedId={subgraph.center ?? null} />
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink-2">{value}</span>
    </div>
  )
}

function BriefCard({ brief }: { brief: Brief }) {
  return (
    <Panel raised>
      <PanelHeader
        title="Commissioning brief"
        subtitle="The argument for spending analyst time - the system proposes research, it does not write it"
        icon={<Lightbulb className="size-4 text-gap" />}
        actions={
          <div className="flex gap-1.5">
            <Badge tone="gap">{brief.suggested_type}</Badge>
            <Badge>{brief.audience}</Badge>
          </div>
        }
      />
      <div className="space-y-4 px-5 py-4">
        <h3 className="text-[16px] leading-snug font-semibold text-ink">{brief.title}</h3>

        <div>
          <p className="label-caps mb-1.5">Why now</p>
          <p className="text-[13px] leading-relaxed text-ink-2">{brief.why_now}</p>
        </div>

        <div>
          <p className="label-caps mb-2">Questions the research must answer</p>
          <ol className="space-y-1.5">
            {brief.key_questions.map((question, index) => (
              <li key={question} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <span className="num shrink-0 text-ink-3">{index + 1}.</span>
                {question}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="label-caps mb-1.5">Build on</p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{brief.build_on}</p>
        </div>
      </div>
    </Panel>
  )
}
