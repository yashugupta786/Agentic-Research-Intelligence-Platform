import clsx from 'clsx'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { PRIORITY_STYLE, pct } from '../lib/format'
import type { Priority } from '../lib/types'

export function Panel({
  children,
  className,
  raised = false,
}: {
  children: ReactNode
  className?: string
  raised?: boolean
}) {
  return <section className={clsx(raised ? 'panel-raised' : 'panel', className)}>{children}</section>
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={clsx('flex items-start justify-between gap-4 border-b border-edge-soft px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 text-ink-3">{icon}</div> : null}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function Stat({
  label,
  value,
  hint,
  accent = 'text-ink',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: string
  icon?: ReactNode
}) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        {icon ? <span className="text-ink-3">{icon}</span> : null}
      </div>
      <div className={clsx('num mt-2 text-[26px] leading-none font-semibold tracking-tight', accent)}>{value}</div>
      {hint ? <div className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{hint}</div> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'momentum' | 'coverage' | 'gap' | 'critical' | 'accent'
  className?: string
}) {
  const tones = {
    neutral: 'border-edge bg-surface-2 text-ink-2',
    momentum: 'border-momentum/35 bg-momentum/10 text-momentum',
    coverage: 'border-coverage/35 bg-coverage/10 text-coverage',
    gap: 'border-gap/35 bg-gap/10 text-gap',
    critical: 'border-critical/35 bg-critical/10 text-critical',
    accent: 'border-accent/40 bg-accent/12 text-indigo-300',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority?: Priority | null }) {
  if (!priority) return <Badge>unscored</Badge>
  const style = PRIORITY_STYLE[priority]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold tracking-wide',
        style.bg,
        style.text,
      )}
    >
      <span className={clsx('size-1.5 rounded-full', style.dot)} />
      {priority}
    </span>
  )
}

/** Twin bar: momentum above, coverage below. Reading the two lengths against
 *  each other *is* the gap, so they share one scale and sit adjacent. */
export function DemandBar({
  momentum,
  coverage,
  compact = false,
}: {
  momentum?: number | null
  coverage?: number | null
  compact?: boolean
}) {
  const bar = (value: number | null | undefined, colour: string) => (
    <div className={clsx('overflow-hidden rounded-full bg-surface-3', compact ? 'h-1' : 'h-1.5')}>
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500', colour)}
        style={{ width: `${Math.max(2, Math.min(100, (value ?? 0) * 100))}%` }}
      />
    </div>
  )
  return (
    <div className={clsx('w-full', compact ? 'space-y-1' : 'space-y-1.5')}>
      {bar(momentum, 'bg-momentum')}
      {bar(coverage, 'bg-coverage')}
      {!compact ? (
        <div className="num flex justify-between text-[10.5px] text-ink-3">
          <span className="text-momentum">demand {pct(momentum)}</span>
          <span className="text-coverage">coverage {pct(coverage)}</span>
        </div>
      ) : null}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-4 animate-spin text-ink-3', className)} />
}

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <Spinner />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="relative h-9 overflow-hidden rounded-lg bg-surface-2 animate-sweep" />
      ))}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-5 flex items-start gap-3 rounded-xl border border-critical/30 bg-critical/8 px-4 py-3.5">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">Something went wrong</p>
        <p className="mt-1 text-[12.5px] break-words text-ink-2">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink-2 transition hover:border-momentum/40 hover:text-ink"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-ink-3">{icon}</div> : null}
      <p className="text-[14px] font-medium text-ink-2">{title}</p>
      {body ? <p className="max-w-md text-[12.5px] leading-relaxed text-ink-3">{body}</p> : null}
      {action}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const variants = {
    primary:
      'bg-momentum text-canvas font-semibold hover:bg-sky-300 disabled:bg-surface-3 disabled:text-ink-3 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset]',
    secondary: 'border border-edge bg-surface-2 text-ink-2 hover:border-momentum/40 hover:text-ink',
    ghost: 'text-ink-3 hover:bg-surface-2 hover:text-ink',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-3.5 py-2 text-[13px]',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-edge-soft bg-surface p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition',
            value === option.value ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className="num ml-1.5 text-[11px] text-ink-3">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

/** Small dotted separator used inside dense metric rows. */
export function Dot() {
  return <span className="text-ink-3/50">&middot;</span>
}
