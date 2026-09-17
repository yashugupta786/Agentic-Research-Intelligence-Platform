import type { ReactNode } from 'react'

export default function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-edge-soft px-7 py-6">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <p className="label-caps mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {lede ? <details className="mt-3 text-xs text-ink-3"><summary className="cursor-pointer hover:text-momentum">About this view</summary><div className="mt-2 max-w-2xl leading-relaxed">{lede}</div></details> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
