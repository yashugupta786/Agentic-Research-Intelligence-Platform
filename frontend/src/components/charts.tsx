import clsx from 'clsx'
import { useId, useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { QUADRANT_META, pct, score, shortDate } from '../lib/format'
import type { Gap, SeriesPoint } from '../lib/types'

const AXIS = { fill: 'var(--color-ink-3)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }

/** Inline sparkline. Hand-rolled SVG rather than a chart component: at 90x22px
 *  a full charting library is pure overhead and renders blurry. */
export function Sparkline({
  values,
  className,
  colour = 'var(--color-momentum)',
  width = 84,
  height = 22,
}: {
  values?: number[] | null
  className?: string
  colour?: string
  width?: number
  height?: number
}) {
  const id = useId()
  const path = useMemo(() => {
    const points = (values ?? []).filter((value) => Number.isFinite(value))
    if (points.length < 2) return null

    const max = Math.max(...points)
    const min = Math.min(...points)
    const span = max - min || 1
    const step = width / (points.length - 1)

    const coords = points.map((value, index) => {
      const x = index * step
      const y = height - 2 - ((value - min) / span) * (height - 4)
      return [x, y] as const
    })

    const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${width},${height} L0,${height} Z`
    const rising = points[points.length - 1] >= points[0]
    return { line, area, rising, last: coords[coords.length - 1] }
  }, [values, width, height])

  if (!path) {
    return <div className={clsx('text-[10.5px] text-ink-3', className)}>no series</div>
  }

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.30" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${id})`} />
      <path d={path.line} fill="none" stroke={colour} strokeWidth="1.35" strokeLinejoin="round" />
      <circle cx={path.last[0]} cy={path.last[1]} r="1.9" fill={colour} />
    </svg>
  )
}

/** The quadrant chart: market momentum on x, internal coverage on y.
 *  Everything in the bottom-right is a research opportunity, and the chart is
 *  built so that reading is instant - background bands, not a legend. */
export function QuadrantChart({
  gaps,
  onSelect,
  height = 380,
  guide = true,
}: {
  gaps: Gap[]
  onSelect?: (slug: string) => void
  height?: number
  guide?: boolean
}) {
  const data = gaps.map((gap) => ({
    x: gap.momentum,
    y: gap.coverage_score,
    z: Math.max(40, gap.gap_score * 380),
    ...gap,
  }))

  return (
    <div className="w-full">
      <div className="relative w-full" style={{ height }}>
        {guide ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-2 grid-rows-2 pl-14 pr-6 pb-11 pt-3">
          <p className="max-w-[11rem] text-[10.5px] leading-snug text-ink-3">
            Top left · quiet news
            <span className="mt-0.5 block font-medium text-ink-2">We have notes, market is quiet</span>
          </p>
          <p className="max-w-[11rem] justify-self-end text-right text-[10.5px] leading-snug text-coverage">
            Top right · hot news
            <span className="mt-0.5 block font-medium">We already have notes</span>
          </p>
          <p className="max-w-[11rem] self-end text-[10.5px] leading-snug text-ink-3">
            Bottom left · quiet news
            <span className="mt-0.5 block font-medium text-ink-2">Empty shelf — watch only</span>
          </p>
          <p className="max-w-[11rem] justify-self-end self-end text-right text-[10.5px] leading-snug text-gap">
            Bottom right · hot news
            <span className="mt-0.5 block font-medium">We do not have usable notes</span>
          </p>
        </div>
        ) : null}
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 14, right: 22, bottom: 26, left: 6 }}>
          <CartesianGrid stroke="var(--color-edge-soft)" strokeDasharray="2 4" />

          {/* Opportunity zone: high demand, low coverage. */}
          <ReferenceArea x1={0.5} x2={1} y1={0} y2={0.38} fill="#fb7185" fillOpacity={0.07} />
          <ReferenceArea x1={0.5} x2={1} y1={0.6} y2={1} fill="#34d399" fillOpacity={0.05} />
          <ReferenceLine x={0.5} stroke="var(--color-edge)" strokeDasharray="4 4" />
          <ReferenceLine y={0.5} stroke="var(--color-edge)" strokeDasharray="4 4" />

          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(value: number) => value.toFixed(2)}
            tick={AXIS}
            axisLine={{ stroke: 'var(--color-edge)' }}
            tickLine={false}
            label={{
              value: 'MARKET MOMENTUM  \u2192',
              position: 'insideBottom',
              offset: -14,
              fill: 'var(--color-ink-3)',
              fontSize: 10,
              letterSpacing: '0.08em',
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(value: number) => value.toFixed(2)}
            tick={AXIS}
            axisLine={{ stroke: 'var(--color-edge)' }}
            tickLine={false}
            label={{
              value: 'INTERNAL COVERAGE  \u2192',
              angle: -90,
              position: 'insideLeft',
              offset: 14,
              fill: 'var(--color-ink-3)',
              fontSize: 10,
              letterSpacing: '0.08em',
            }}
          />
          <ZAxis type="number" dataKey="z" range={[45, 420]} />

          <Tooltip content={<QuadrantTooltip />} />

          <Scatter
            data={data}
            // Recharts types the click payload loosely; the row we supplied comes
            // back on the event object itself.
            onClick={(point: unknown) => {
              const slug = (point as { topic_slug?: string } | undefined)?.topic_slug
              if (slug) onSelect?.(slug)
            }}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {data.map((point) => (
              <Cell
                key={point.topic_slug}
                fill={QUADRANT_META[point.quadrant]?.colour ?? '#64748b'}
                fillOpacity={0.55}
                stroke={QUADRANT_META[point.quadrant]?.colour ?? '#64748b'}
                strokeWidth={1.4}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {(Object.keys(QUADRANT_META) as (keyof typeof QUADRANT_META)[]).map((key) => (
          <span key={key} className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
            <span className="size-2 rounded-full" style={{ background: QUADRANT_META[key].colour }} />
            {QUADRANT_META[key].label}
          </span>
        ))}
      </div>

      {guide ? (
        <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ChartCorner
          title="Top right — keep / maintain"
          body="News is talking about it, and we already have good notes. Not a writing gap."
        />
        <ChartCorner
          title="Bottom right — write this"
          body="News is talking about it, and our shelf is empty or weak. This is the opportunity. Pink dots."
        />
        <ChartCorner
          title="Top left — many notes, quiet news"
          body="We already published a lot. The news sample is quiet. Do not write more until clients confirm."
        />
        <ChartCorner
          title="Bottom left — watch"
          body="Quiet news and an empty shelf. Not the first thing to write."
        />
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        Yellow is different: we <span className="font-medium text-ink-2">do</span> have a note, but it is old
        compared with the news. Refresh it. Bigger bubble = bigger gap (hot market × empty shelf).
      </p>
        </>
      ) : null}
    </div>
  )
}

function ChartCorner({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-edge-soft bg-surface-2/40 px-3 py-2">
      <p className="text-[11.5px] font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{body}</p>
    </div>
  )
}

function QuadrantTooltip({ active, payload }: { active?: boolean; payload?: { payload: Gap }[] }) {
  if (!active || !payload?.length) return null
  const gap = payload[0].payload
  const meta = QUADRANT_META[gap.quadrant]
  return (
    <div className="max-w-[260px] rounded-xl border border-edge bg-surface-2/95 px-3 py-2.5 shadow-xl backdrop-blur">
      <p className="text-[12.5px] font-semibold text-ink">{gap.label}</p>
      <p className="num mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
        <span className="text-momentum">demand {score(gap.momentum)}</span>
        <span className="text-coverage">coverage {score(gap.coverage_score)}</span>
        <span className="text-gap">gap {score(gap.gap_score)}</span>
      </p>
      <p className="mt-1.5 text-[11px]" style={{ color: meta?.colour }}>
        {meta?.label} &middot; {gap.priority}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{gap.rationale}</p>
    </div>
  )
}

/** Daily article-volume series behind a topic's momentum score. */
export function MomentumChart({ series, height = 200 }: { series: SeriesPoint[]; height?: number }) {
  if (series.length < 2) {
    return (
      <div className="grid h-[200px] place-items-center px-5 text-center text-[12px] text-ink-3">
        No measured volume series for this topic. Momentum was derived from mention breadth and recency instead.
      </div>
    )
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 10, right: 14, bottom: 4, left: -18 }}>
          <defs>
            <linearGradient id="momentum-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-edge-soft)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS}
            tickFormatter={shortDate}
            axisLine={{ stroke: 'var(--color-edge)' }}
            tickLine={false}
            minTickGap={44}
          />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={46} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-edge)',
              borderRadius: 10,
              fontSize: 11.5,
            }}
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value) => [Number(value).toFixed(2), 'coverage volume']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#38bdf8"
            strokeWidth={1.7}
            fill="url(#momentum-fill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal comparison bar used in the gap table and topic detail. */
export function ScoreRow({
  label,
  value,
  colour,
  suffix,
}: {
  label: string
  value?: number | null
  colour: string
  suffix?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label-caps">{label}</span>
        <span className="num text-[12px] font-medium" style={{ color: colour }}>
          {score(value)}
          {suffix ? <span className="ml-1 text-ink-3">{suffix}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(2, Math.min(100, (value ?? 0) * 100))}%`, background: colour }}
        />
      </div>
      <div className="mt-1 text-[10.5px] text-ink-3">{pct(value)} of scale</div>
    </div>
  )
}

