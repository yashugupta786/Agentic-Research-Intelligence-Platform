import type { Priority, Quadrant } from './types'

export const pct = (value?: number | null, digits = 0) =>
  value === null || value === undefined ? '--' : `${(value * 100).toFixed(digits)}%`

export const score = (value?: number | null, digits = 2) =>
  value === null || value === undefined ? '--' : value.toFixed(digits)

export const signed = (value?: number | null) =>
  value === null || value === undefined ? '--' : `${value > 0 ? '+' : ''}${Math.round(value)}%`

export const compact = (value?: number | null) =>
  value === null || value === undefined ? '--' : new Intl.NumberFormat('en', { notation: 'compact' }).format(value)

export const seconds = (ms?: number | null) =>
  ms === null || ms === undefined ? '--' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`

export const shortDate = (value?: string | null) => {
  if (!value) return '--'
  const date = new Date(value.slice(0, 10))
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: '2-digit' })
}

export const relativeTime = (value?: string | null) => {
  if (!value) return ''
  const then = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export const ageLabel = (days?: number | null) => {
  if (days === null || days === undefined || days >= 900) return 'no coverage'
  if (days < 60) return `${Math.round(days)}d old`
  if (days < 400) return `${Math.round(days / 30)}mo old`
  return `${(days / 365).toFixed(1)}y old`
}

// --- semantic labels -------------------------------------------------------
export const PRIORITY_STYLE: Record<Priority, { text: string; bg: string; dot: string }> = {
  CRITICAL: { text: 'text-critical', bg: 'bg-critical/12 border-critical/35', dot: 'bg-critical' },
  HIGH: { text: 'text-high', bg: 'bg-high/12 border-high/35', dot: 'bg-high' },
  MEDIUM: { text: 'text-medium', bg: 'bg-medium/12 border-medium/35', dot: 'bg-medium' },
  LOW: { text: 'text-low', bg: 'bg-low/12 border-low/35', dot: 'bg-low' },
}

export const QUADRANT_META: Record<Quadrant, { label: string; action: string; colour: string; blurb: string }> = {
  publish_now: {
    label: 'Commission review',
    action: 'Commission',
    colour: '#fb7185',
    blurb: 'High observed attention, limited usable research',
  },
  refresh: {
    label: 'Refresh',
    action: 'Update',
    colour: '#fbbf24',
    blurb: 'Coverage exists but has aged past the market conversation',
  },
  maintain: {
    label: 'Maintain',
    action: 'Hold',
    colour: '#34d399',
    blurb: 'Demand is healthy and the library already answers it',
  },
  over_invested: {
    label: 'Review allocation',
    action: 'Consolidate',
    colour: '#818cf8',
    blurb: 'Strong coverage against low sampled attention; validate with client data',
  },
  watch: {
    label: 'Watch',
    action: 'Monitor',
    colour: '#64748b',
    blurb: 'Neither demand nor coverage is strong enough to act on',
  },
}

export const ACTION_STYLE: Record<string, string> = {
  commission: 'text-critical border-critical/40 bg-critical/10',
  refresh: 'text-high border-high/40 bg-high/10',
  maintain: 'text-coverage border-coverage/40 bg-coverage/10',
  retire: 'text-low border-low/40 bg-low/10',
}

/** Momentum -> plain English, because 0.82 means nothing to an executive. */
export const momentumLabel = (value?: number | null) => {
  if (value === null || value === undefined) return 'Unknown'
  if (value >= 0.7) return 'High'
  if (value >= 0.5) return 'Moderate'
  if (value >= 0.3) return 'Low'
  return 'Very low'
}

export const coverageLabel = (value?: number | null) => {
  if (value === null || value === undefined) return 'Unknown'
  if (value >= 0.6) return 'Strong'
  if (value >= 0.35) return 'Partial'
  if (value > 0) return 'Thin'
  return 'None'
}

export const AGENT_KIND_COLOUR: Record<string, string> = {
  router: '#818cf8',
  external: '#38bdf8',
  llm: '#a78bfa',
  analytics: '#fbbf24',
  retrieval: '#34d399',
  graph: '#f472b6',
  verify: '#22d3ee',
}

export const NODE_TYPE_COLOUR: Record<string, string> = {
  TOPIC: '#38bdf8',
  DOCUMENT: '#34d399',
  COMPANY: '#fbbf24',
  ORGANISATION: '#fbbf24',
  ORG: '#fbbf24',
  REGULATOR: '#fb7185',
  GEO: '#a78bfa',
  GEOGRAPHY: '#a78bfa',
  TECHNOLOGY: '#22d3ee',
  PRACTICE_AREA: '#818cf8',
  PERSON: '#f472b6',
  SECTOR: '#f0abfc',
  UNKNOWN: '#64748b',
}

export const nodeColour = (type?: string | null) =>
  NODE_TYPE_COLOUR[(type ?? 'UNKNOWN').toUpperCase()] ?? NODE_TYPE_COLOUR.UNKNOWN

export const titleCase = (value: string) =>
  value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
