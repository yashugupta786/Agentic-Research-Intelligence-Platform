import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { nodeColour } from '../lib/format'
import type { GraphNode, GraphPayload } from '../lib/types'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.2

interface Props {
  payload: GraphPayload
  height?: number
  onSelect?: (node: GraphNode | null) => void
  selectedId?: string | null
  highlightType?: string | null
}

export default function GraphView({ payload, height = 560, onSelect, selectedId, highlightType }: Props) {
  const [zoom, setZoom] = useState(1)
  const [full, setFull] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const focus = hover || selectedId
  const selected = payload.nodes.find((node) => node.id === selectedId)

  const layout = useMemo(() => {
    const columns = [
      payload.nodes.filter((n) => !['TOPIC', 'DOCUMENT', 'PRACTICE_AREA'].includes(n.type)),
      payload.nodes.filter((n) => n.type === 'TOPIC'),
      payload.nodes.filter((n) => ['DOCUMENT', 'PRACTICE_AREA'].includes(n.type)),
    ]
    const h = Math.max(460, ...columns.map((c) => c.length * 82 + 100))
    const positions = new Map<string, { x: number; y: number }>()
    columns.forEach((col, i) =>
      col.forEach((n, j) =>
        positions.set(n.id, { x: 35 + i * 350, y: 72 + j * 82 + (h - 100 - col.length * 82) / 2 }),
      ),
    )
    return { positions, h }
  }, [payload])

  const idOf = (value: string | GraphNode) => (typeof value === 'string' ? value : value.id)
  const neighbors = new Set([focus])
  payload.links.forEach((l) => {
    const a = idOf(l.source)
    const b = idOf(l.target)
    if (a === focus) neighbors.add(b)
    if (b === focus) neighbors.add(a)
  })

  const bumpZoom = (delta: number) =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 10) / 10)))

  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false)
      if (event.key === '+' || event.key === '=') bumpZoom(ZOOM_STEP)
      if (event.key === '-' || event.key === '_') bumpZoom(-ZOOM_STEP)
      if (event.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [full])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      bumpZoom(event.deltaY < 0 ? ZOOM_STEP / 2 : -ZOOM_STEP / 2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [full])

  const canvasHeight = full ? undefined : height

  const stage = (
    <div className={`graph-stage relative ${full ? 'h-full min-h-0' : ''}`}>
      <div className="absolute right-4 top-3 z-10 flex items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-sm">
        <button type="button" aria-label="Zoom out" title="Zoom out" className="rounded-md p-2 hover:bg-surface-2" onClick={() => bumpZoom(-ZOOM_STEP)}>
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          title="Reset zoom"
          className="num min-w-[3.25rem] rounded-md px-1.5 py-1 text-[11px] text-ink-2 hover:bg-surface-2"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" className="rounded-md p-2 hover:bg-surface-2" onClick={() => bumpZoom(ZOOM_STEP)}>
          <Plus className="size-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-edge" />
        {full ? (
          <button type="button" aria-label="Exit full screen" title="Exit full screen (Esc)" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-ink-2 hover:bg-surface-2" onClick={() => setFull(false)}>
            <Minimize2 className="size-3.5" />
            Exit
          </button>
        ) : (
          <button type="button" aria-label="Full screen" title="Full screen" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-ink-2 hover:bg-surface-2" onClick={() => setFull(true)}>
            <Maximize2 className="size-3.5" />
            Full screen
          </button>
        )}
      </div>
      <div ref={scroller} className={`overflow-auto ${full ? 'h-full' : ''}`} style={full ? undefined : { height: canvasHeight }}>
        <svg
          aria-label="Query knowledge graph"
          role="group"
          viewBox={`0 0 1040 ${layout.h}`}
          style={{ width: `${zoom * 100}%`, minWidth: 760, minHeight: full ? '100%' : height }}
        >
          {['MARKET ENTITIES', 'DISCOVERED TOPICS', 'INTERNAL RESEARCH'].map((t, i) => (
            <text key={t} x={35 + i * 350} y={35} fill="var(--color-ink-3)" fontSize="10" letterSpacing="1.5">
              {t}
            </text>
          ))}
          {payload.links.map((link, i) => {
            const a = layout.positions.get(idOf(link.source))
            const b = layout.positions.get(idOf(link.target))
            if (!a || !b) return null
            const isActive = !!focus && (idOf(link.source) === focus || idOf(link.target) === focus)
            const x1 = a.x + (a.x < b.x ? 250 : 0)
            const x2 = b.x + (a.x < b.x ? 0 : 250)
            const path =
              a.x === b.x
                ? `M${a.x + 250},${a.y + 30} C${a.x + 285},${a.y + 30} ${b.x + 285},${b.y + 30} ${b.x + 250},${b.y + 30}`
                : `M${x1},${a.y + 30} C${(x1 + x2) / 2},${a.y + 30} ${(x1 + x2) / 2},${b.y + 30} ${x2},${b.y + 30}`
            return (
              <g key={i} opacity={focus && !isActive ? 0.1 : 0.6}>
                <path d={path} fill="none" stroke={isActive ? 'var(--color-momentum)' : 'var(--color-ink-3)'} strokeWidth={isActive ? 2 : 1} className={isActive ? 'graph-edge' : ''} />
                <title>
                  {link.relation.replaceAll('_', ' ')} · {link.weight.toFixed(2)}
                </title>
                {isActive && a.x !== b.x && (
                  <text x={(x1 + x2) / 2} y={(a.y + b.y) / 2 + 22} textAnchor="middle" fill="var(--color-ink)" stroke="var(--color-canvas)" strokeWidth="4" paintOrder="stroke" fontSize="10">
                    {link.relation.replaceAll('_', ' ')}
                  </text>
                )}
              </g>
            )
          })}
          {payload.nodes.map((node, i) => {
            const p = layout.positions.get(node.id)!
            const active = node.id === focus
            const displayLabel = node.title || node.label
            const label = displayLabel.length > 33 ? displayLabel.slice(0, 31) + '…' : displayLabel
            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: (focus && !neighbors.has(node.id)) || (highlightType && node.type !== highlightType) ? 0.2 : 1 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.4) }}
                className="graph-node"
                role="button"
                tabIndex={0}
                aria-label={`${node.type}: ${node.label}`}
                onClick={() => onSelect?.(node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect?.(node)
                  }
                }}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{displayLabel}</title>
                <rect x={p.x} y={p.y} width={250} height={60} rx={12} fill="var(--color-surface)" stroke={active ? 'var(--color-momentum)' : 'var(--color-edge)'} strokeWidth={active ? 2 : 1} />
                <rect x={p.x + 12} y={p.y + 13} width={4} height={34} rx={2} fill={nodeColour(node.type)} />
                <text x={p.x + 26} y={p.y + 25} fill="var(--color-ink)" fontSize={12} fontWeight={600}>
                  {label}
                </text>
                <text x={p.x + 26} y={p.y + 44} fill="var(--color-ink-3)" fontSize={10}>
                  {node.type === 'TOPIC'
                    ? `Attention ${(node.momentum ?? 0).toFixed(2)} · Coverage ${node.coverage == null ? '—' : node.coverage.toFixed(2)}`
                    : node.type === 'DOCUMENT'
                      ? node.label
                      : node.type.replaceAll('_', ' ').toLowerCase()}
                </text>
              </motion.g>
            )
          })}
        </svg>
      </div>
    </div>
  )

  if (!full) return stage

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-canvas">
      <div className="flex items-center justify-between gap-3 border-b border-edge-soft px-5 py-3">
        <div>
          <p className="label-caps text-ink-3">Knowledge map · full screen</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {selected ? selected.title || selected.label : 'Click a box · + / − to zoom · Ctrl+wheel also zooms · Esc to exit'}
          </p>
        </div>
        <button type="button" className="rounded-lg border border-edge px-3 py-1.5 text-[12px] text-ink-2 hover:bg-surface-2" onClick={() => setFull(false)}>
          Exit full screen
        </button>
      </div>
      <div className="min-h-0 flex-1">{stage}</div>
    </div>,
    document.body,
  )
}
