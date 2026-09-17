import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Database,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  Maximize2,
  Minus,
  Monitor,
  Network,
  Package,
  PenLine,
  Plus,
  ScanSearch,
  Server,
  Share2,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  X,
} from 'lucide-react'
import { ARCH_NODES, type ArchNode } from '../content/blueprint'
import { coverageFlow, qaFlow, setupFlow } from '../content/architecture'

const WORLD = { w: 1600, h: 980 }
const MESH = { x: 80, y: 328, w: 1440, h: 248 }
const MIN_ZOOM = 0.25
const MAX_ZOOM = 1.8

type Box = {
  id: string
  x: number
  y: number
  w: number
  h: number
  kicker: string
  title: string
  sub: string
  Icon: LucideIcon
}

const OUTER: Box[] = [
  { id: 'frontend', x: 610, y: 28, w: 380, h: 70, kicker: 'People + UI', title: 'Analyst · React workspace', sub: 'Market scan or Ask the library', Icon: Monitor },
  { id: 'api', x: 610, y: 128, w: 380, h: 62, kicker: 'BFF', title: 'FastAPI + SSE', sub: 'Validate · stream · save', Icon: Server },
  { id: 'planner', x: 540, y: 218, w: 520, h: 70, kicker: 'Orchestrator', title: 'Planner · shared LangGraph state', sub: 'One route. Case folder grows. Not a swarm.', Icon: GitBranch },
  { id: 'tavily', x: 80, y: 620, w: 300, h: 78, kicker: 'Search', title: 'Tavily', sub: 'Live news · last 45 days', Icon: Globe },
  { id: 'gemini', x: 650, y: 620, w: 300, h: 78, kicker: 'LLM', title: 'Gemini', sub: 'Extract · judge · write', Icon: Sparkles },
  { id: 'faiss', x: 1220, y: 620, w: 300, h: 78, kicker: 'Index', title: 'FAISS', sub: 'Passage vectors', Icon: Database },
  { id: 'storage', x: 80, y: 742, w: 300, h: 86, kicker: 'Memory', title: 'SQLite', sub: 'Docs · runs · scores', Icon: HardDrive },
  { id: 'networkx', x: 650, y: 742, w: 300, h: 86, kicker: 'Graph store', title: 'NetworkX', sub: 'Topics · entities · notes', Icon: Network },
  { id: 'setup', x: 1220, y: 742, w: 300, h: 86, kicker: 'Setup once', title: 'Seed the shelf', sub: 'Chunk · embed · index', Icon: Package },
]

const AGENT_DEFS: Omit<Box, 'x' | 'y' | 'w' | 'h'>[] = [
  { id: 'scout', kicker: '02', title: 'Scout', sub: 'Tavily search', Icon: ScanSearch },
  { id: 'topic_analyst', kicker: '03', title: 'Topic', sub: 'Extract + name', Icon: Tags },
  { id: 'momentum_analyst', kicker: '04', title: 'Attention', sub: 'Breadth + recency', Icon: Gauge },
  { id: 'librarian', kicker: '05', title: 'Librarian', sub: 'RAG + judge', Icon: BookOpen },
  { id: 'graph_curator', kicker: '06', title: 'Graph', sub: 'NetworkX links', Icon: Share2 },
  { id: 'gap_analyst', kicker: '07', title: 'Gap', sub: 'Rank actions', Icon: Target },
  { id: 'synthesizer', kicker: '08', title: 'Writer', sub: 'Director brief', Icon: PenLine },
  { id: 'critic', kicker: '09', title: 'Critic', sub: 'Audit numbers', Icon: ShieldCheck },
]

function placeAgents(): Box[] {
  const cols = 4
  const padX = 24
  const padY = 56
  const gapX = 14
  const gapY = 14
  const w = (MESH.w - padX * 2 - gapX * (cols - 1)) / cols
  const h = 74
  return AGENT_DEFS.map((agent, i) => ({
    ...agent,
    x: MESH.x + padX + (i % cols) * (w + gapX),
    y: MESH.y + padY + Math.floor(i / cols) * (h + gapY),
    w,
    h,
  }))
}

const BOXES: Box[] = [...OUTER, ...placeAgents()]
const BY_ID = Object.fromEntries(BOXES.map((b) => [b.id, b])) as Record<string, Box>

type Side = 't' | 'b' | 'l' | 'r'
type Rect = { x: number; y: number; w: number; h: number }

function port(box: Rect, side: Side, t = 0.5): [number, number] {
  const along = clamp(t, 0.1, 0.9)
  if (side === 't') return [box.x + box.w * along, box.y]
  if (side === 'b') return [box.x + box.w * along, box.y + box.h]
  if (side === 'l') return [box.x, box.y + box.h * along]
  return [box.x + box.w, box.y + box.h * along]
}

function curve(a: [number, number], b: [number, number]) {
  const [x1, y1] = a
  const [x2, y2] = b
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  if (dy >= dx) {
    const mid = (y1 + y2) / 2
    return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
  }
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

type Wire = { d: string; color: string; label: string; lx: number; ly: number }

function wires(): Wire[] {
  const n = (id: string) => BY_ID[id]
  const pair = (
    from: string | Rect,
    fs: Side,
    to: string | Rect,
    ts: Side,
    color: string,
    label: string,
    ft = 0.5,
    tt = 0.5,
  ): Wire => {
    const A = typeof from === 'string' ? n(from) : from
    const B = typeof to === 'string' ? n(to) : to
    const p1 = port(A, fs, ft)
    const p2 = port(B, ts, tt)
    return { d: curve(p1, p2), color, label, lx: (p1[0] + p2[0]) / 2, ly: (p1[1] + p2[1]) / 2 - 6 }
  }
  const cyan = '#38bdf8'
  const amber = '#fb923c'
  const green = '#34d399'
  const row1 = ['scout', 'topic_analyst', 'momentum_analyst', 'librarian']
  const row2 = ['graph_curator', 'gap_analyst', 'synthesizer', 'critic']
  const sequence: Wire[] = []
  for (let i = 0; i < row1.length - 1; i++) sequence.push(pair(row1[i], 'r', row1[i + 1], 'l', cyan, ''))
  for (let i = 0; i < row2.length - 1; i++) sequence.push(pair(row2[i], 'r', row2[i + 1], 'l', cyan, ''))
  return [
    pair('frontend', 'b', 'api', 't', cyan, 'question'),
    pair('api', 'b', 'planner', 't', cyan, 'SSE'),
    pair('planner', 'b', MESH, 't', cyan, 'dispatch'),
    ...sequence,
    pair(MESH, 'b', 'tavily', 't', amber, 'search', 0.16),
    pair(MESH, 'b', 'gemini', 't', amber, 'LLM', 0.5),
    pair(MESH, 'b', 'faiss', 't', amber, 'retrieve', 0.84),
    pair('tavily', 'b', 'storage', 't', green, 'docs'),
    pair('gemini', 'b', 'networkx', 't', green, 'links'),
    pair('setup', 't', 'faiss', 'b', green, 'index'),
  ]
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export default function ArchitectureView() {
  const viewport = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 24 })
  const userZoomed = useRef(false)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null)
  const panRef = useRef(pan)
  panRef.current = pan
  const paths = wires()
  const detail = selected === 'setup' ? null : selected ? ARCH_NODES[selected] : null

  const fit = () => {
    const el = viewport.current
    if (!el) return
    const padLeft = 72
    const padRight = 28
    const padTop = 20
    const padBottom = 28
    const next = clamp(
      Math.min((el.clientWidth - padLeft - padRight) / WORLD.w, (el.clientHeight - padTop - padBottom) / WORLD.h),
      MIN_ZOOM,
      1,
    )
    setScale(next)
    setPan({
      x: padLeft + (el.clientWidth - padLeft - padRight - WORLD.w * next) / 2,
      y: padTop + (el.clientHeight - padTop - padBottom - WORLD.h * next) / 2,
    })
  }

  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (!userZoomed.current) fit()
    })
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [])

  const scaleRef = useRef(scale)
  scaleRef.current = scale

  const zoomAt = (factor: number, ox: number, oy: number) => {
    userZoomed.current = true
    const prev = scaleRef.current
    const next = clamp(Math.round(prev * factor * 100) / 100, MIN_ZOOM, MAX_ZOOM)
    const cur = panRef.current
    const wx = (ox - cur.x) / prev
    const wy = (oy - cur.y) / prev
    setScale(next)
    setPan({ x: ox - wx * next, y: oy - wy * next })
  }

  const zoomBy = (factor: number) => {
    const el = viewport.current
    if (!el) return
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
  }

  useEffect(() => {
    const el = viewport.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(event.deltaY < 0 ? 1.08 : 0.92, event.clientX - rect.left, event.clientY - rect.top)
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest('button, aside, a, input, select, textarea')) return
      event.preventDefault()
      drag.current = {
        sx: event.clientX,
        sy: event.clientY,
        px: panRef.current.x,
        py: panRef.current.y,
        moved: false,
      }
    }

    const onMove = (event: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = event.clientX - d.sx
      const dy = event.clientY - d.sy
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
      d.moved = true
      userZoomed.current = true
      setDragging(true)
      setPan({ x: d.px + dx, y: d.py + dy })
    }

    const onUp = () => {
      const d = drag.current
      drag.current = null
      setDragging(false)
      if (d && !d.moved) setSelected(null)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('wheel', onWheel)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div className="arch-stage relative h-full min-h-0 bg-[#07111f]">
      <div
        ref={viewport}
        className={`absolute inset-0 select-none overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onDoubleClick={() => {
          userZoomed.current = false
          fit()
        }}
      >
        <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-70" />
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: WORLD.w,
            height: WORLD.h,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg className="pointer-events-none absolute inset-0" width={WORLD.w} height={WORLD.h} viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} aria-hidden>
            <rect
              x={MESH.x}
              y={MESH.y}
              width={MESH.w}
              height={MESH.h}
              rx="18"
              fill="rgba(8,24,48,0.35)"
              stroke="#38bdf8"
              strokeWidth="1.4"
              strokeOpacity="0.55"
            />
            {paths.map((wire, i) => (
              <g key={`${wire.label}-${i}`}>
                <path d={wire.d} fill="none" stroke={wire.color} strokeWidth="1.6" opacity="0.25" />
                <path d={wire.d} fill="none" stroke={wire.color} strokeWidth="2" strokeLinecap="round" className="arch-run" />
                {wire.label ? (
                  <text x={wire.lx} y={wire.ly} textAnchor="middle" fill={wire.color} fontSize="11" opacity="0.9">
                    {wire.label}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>

          <div
            className="pointer-events-none absolute px-7 pt-3"
            style={{ left: MESH.x, top: MESH.y, width: MESH.w }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-300/90">
              Specialist agents · LangGraph nodes
              <span className="ml-3 font-normal normal-case tracking-normal text-sky-100/55">click any agent for detail</span>
            </p>
          </div>

          {BOXES.map((item) => {
            const on = selected === item.id
            const agent = AGENT_DEFS.some((a) => a.id === item.id)
            return (
              <button
                key={item.id}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(item.id)
                }}
                className={`pointer-events-auto absolute flex items-center gap-3 rounded-[14px] border px-3 py-2 text-left transition ${
                  on
                    ? 'border-cyan-300 bg-[#123056]'
                    : agent
                      ? 'border-cyan-400/35 bg-[#0c1c33] hover:border-cyan-300/80'
                      : 'border-white/15 bg-[#0c182c] hover:border-cyan-400/50'
                }`}
                style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                  <item.Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[9px] uppercase tracking-[0.14em] text-cyan-300/80">{item.kicker}</span>
                  <span className="block truncate text-[13px] font-semibold text-white">{item.title}</span>
                  <span className="block truncate text-[11px] text-sky-100/55">{item.sub}</span>
                </span>
              </button>
            )
          })}

          <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-[11px] text-sky-100/40">
            Drag to pan · wheel to zoom · + / − · double-click to fit
          </p>
        </div>
      </div>

      <div
        className="absolute bottom-5 left-5 z-20 flex flex-col overflow-hidden rounded-xl border border-cyan-400/25 bg-[#0b1730]/95 shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="p-2.5 text-cyan-100 hover:bg-white/10" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="p-2.5 text-cyan-100 hover:bg-white/10" aria-label="Zoom out" onClick={() => zoomBy(0.87)}>
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          className="border-t border-white/10 p-2.5 text-cyan-100 hover:bg-white/10"
          aria-label="Fit to screen"
          onClick={() => {
            userZoomed.current = false
            fit()
          }}
        >
          <Maximize2 className="size-4" />
        </button>
        <p className="border-t border-white/10 py-1.5 text-center text-[10px] text-cyan-100/70">{Math.round(scale * 100)}%</p>
      </div>

      <p className="pointer-events-none absolute bottom-5 right-5 z-20 text-[10px] tracking-wide text-sky-100/50">
        Prepared by Yashu Gupta
      </p>

      {selected ? (
        <aside
          className="absolute inset-y-0 right-0 z-30 flex w-[min(420px,92vw)] flex-col border-l border-cyan-400/25 bg-[#07111f] shadow-[-18px_0_60px_#0008]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">
                {selected === 'setup' ? 'Setup' : detail?.n} · {selected === 'setup' ? 'before any question' : detail?.role}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">{selected === 'setup' ? 'Seed the research shelf' : detail?.title ?? BY_ID[selected]?.title}</h3>
            </div>
            <button type="button" aria-label="Close details" className="rounded-lg p-1.5 text-sky-100/70 hover:bg-white/10" onClick={() => setSelected(null)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {selected === 'setup' ? <SetupDetail /> : detail ? <NodeDetail node={detail} /> : <ToolNote id={selected} />}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

function NodeDetail({ node }: { node: ArchNode }) {
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-sky-100/85">
      <p>{node.purpose}</p>
      <p className="text-[12px] text-cyan-200/70">LLM: {node.llm}</p>
      {node.formula ? <pre className="whitespace-pre-wrap rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-3 font-mono text-[11.5px] text-cyan-100">{node.formula}</pre> : null}
      {node.why ? (
        <p>
          <span className="font-semibold text-amber-200">Why. </span>
          {node.why}
        </p>
      ) : null}
      <Block title="Consumes / reads" items={node.reads} />
      <Block title="What it really does" items={node.work} />
      <Block title="Example · AI in healthcare" items={node.example} />
      <Block title="Produces / writes" items={node.writes} />
      <p className="rounded-xl bg-white/5 px-3 py-2.5 text-[12.5px]">
        <span className="font-semibold text-white">Next. </span>
        {node.next}
      </p>
    </div>
  )
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-cyan-300/80">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-[12.5px] leading-snug text-sky-100/80">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ToolNote({ id }: { id: string }) {
  const copy: Record<string, { title: string; body: string[] }> = {
    tavily: {
      title: 'Tavily',
      body: ['Only Scout calls it.', 'Up to 8 results per query, 45 days.', 'Duplicate URLs are merged. Cache unless fresh search is on.'],
    },
    gemini: {
      title: 'Gemini',
      body: ['Topic extract + naming.', 'Coverage judge (covers / partial / tangential).', 'Synthesizer narrative and Critic audit.', 'Not used for gap math or momentum.'],
    },
    faiss: {
      title: 'FAISS',
      body: ['Built at setup from chunk embeddings.', 'Librarian searches neighbours, then a judge decides if they answer the topic.', 'Similarity is not coverage.'],
    },
    networkx: {
      title: 'NetworkX',
      body: ['Graph Curator writes mentions, covered_by, adjacent_to.', 'No extra LLM. Snapshot stored with the run.'],
    },
  }
  const item = copy[id]
  if (!item) return <p className="text-sky-100/70">Click another block.</p>
  return (
    <div>
      <p className="text-lg font-semibold text-white">{item.title}</p>
      <ul className="mt-3 space-y-2 text-[13px] text-sky-100/80">
        {item.body.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

function SetupDetail() {
  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-sky-100/80">
        Setup stocks the shelf before any client question. The nine scan agents do not run here. Embedding is representation, not training.
      </p>
      {(
        [
          ['Prepare the shelf', setupFlow],
          ['Later: coverage RAG', coverageFlow],
          ['Later: ask the library', qaFlow],
        ] as const
      ).map(([title, items]) => (
        <div key={title}>
          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-300/80">{title}</p>
          <ol className="space-y-2">
            {items.map(([name, body], i) => (
              <li key={name} className="text-[12.5px] text-sky-100/80">
                <span className="text-cyan-300">{String(i + 1).padStart(2, '0')} </span>
                <span className="font-medium text-white">{name}.</span> {body}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
