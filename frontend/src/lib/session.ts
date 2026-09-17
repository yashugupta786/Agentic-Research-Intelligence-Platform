import type { AgentResult } from './types'

export function readSession(key = 'research.lastRun'): AgentResult | null {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}
export function saveSession(result: AgentResult) {
  try {
    sessionStorage.setItem('research.lastRun', JSON.stringify(result))
    if (result.graph?.snapshot) sessionStorage.setItem('research.lastScan', JSON.stringify(result))
  } catch { /* A full browser store must not prevent a result from rendering. */ }
}
