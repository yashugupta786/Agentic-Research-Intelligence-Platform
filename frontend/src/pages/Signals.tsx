import { ExternalLink, Radar, Rss } from 'lucide-react'
import { Link } from 'react-router-dom'

import PageHeader from '../components/PageHeader'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel, PanelHeader, Stat } from '../components/ui'
import { api } from '../lib/api'
import { score, shortDate } from '../lib/format'
import { useAsync } from '../lib/hooks'

export default function Signals() {
  const { data, error, loading, reload } = useAsync(() => api.signals(60), [])
  const { data: meta } = useAsync(() => api.meta(), [])

  const signals = data?.signals ?? []
  const outlets = data?.outlets ?? []

  return (
    <div className="pb-14">
      <PageHeader
        eyebrow="Market signals"
        title="The external evidence base"
        lede="Every topic and momentum score traces back to specific articles. This is the audit trail: if a research director asks why a topic scored 0.87, the answer is a list of sources they can open."
      />

      {loading ? <LoadingBlock label="Loading signals" rows={5} /> : null}
      {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

      {data ? (
        <div className="space-y-5 px-7 pt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Stored signals" value={signals.length} icon={<Rss className="size-3.5" />} />
            <Stat label="Distinct outlets" value={outlets.length} />
            <Stat
              label="Sweep domains"
              value={meta?.sweeps?.length ?? 0}
              hint="broad queries fired at the market, not topic names"
              icon={<Radar className="size-3.5" />}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel>
              <PanelHeader title="Recent articles" subtitle="Most recent first, linked to the topic they support" />
              {signals.length ? (
                <ul className="divide-y divide-edge-soft">
                  {signals.map((signal, index) => (
                    <li key={`${signal.url}-${index}`} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <a
                          href={signal.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group min-w-0 flex-1"
                        >
                          <p className="text-[12.5px] leading-snug font-medium text-ink-2 group-hover:text-momentum">
                            {signal.title}
                            <ExternalLink className="ml-1.5 inline size-3 text-ink-3" />
                          </p>
                        </a>
                        {signal.relevance ? (
                          <span className="num shrink-0 text-[11px] text-ink-3">{score(signal.relevance)}</span>
                        ) : null}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="num text-[10.5px] text-ink-3">{signal.domain}</span>
                        {signal.published_date ? (
                          <span className="num text-[10.5px] text-ink-3">{shortDate(signal.published_date)}</span>
                        ) : null}
                        {signal.topic_slug ? (
                          <Link to={`/topic/${signal.topic_slug}`}>
                            <Badge tone="momentum">{signal.topic_label ?? signal.topic_slug}</Badge>
                          </Link>
                        ) : null}
                      </div>

                      {signal.snippet ? (
                        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-3">{signal.snippet}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No signals stored"
                  body="Run a market scan from the console and the Signal Scout will fill this in."
                />
              )}
            </Panel>

            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Source mix" subtitle="Breadth matters: one outlet is not a trend" />
                <ul className="space-y-2.5 px-4 py-4">
                  {outlets.map((outlet) => {
                    const max = outlets[0]?.articles || 1
                    return (
                      <li key={outlet.domain}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="num truncate text-[11.5px] text-ink-2">{outlet.domain}</span>
                          <span className="num shrink-0 text-[11px] text-ink-3">{outlet.articles}</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full bg-momentum/70"
                            style={{ width: `${(outlet.articles / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Panel>

              {meta?.sweeps?.length ? (
                <Panel>
                  <PanelHeader
                    title="Standing sweeps"
                    subtitle="Deliberately broad. Topics are discovered from what comes back, never hard-coded."
                  />
                  <ul className="divide-y divide-edge-soft">
                    {meta.sweeps.map((sweep) => (
                      <li key={sweep.key} className="px-4 py-2.5">
                        <p className="text-[12px] font-medium text-ink-2">{sweep.label}</p>
                        <p className="num mt-0.5 text-[10.5px] text-ink-3">{sweep.query}</p>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
