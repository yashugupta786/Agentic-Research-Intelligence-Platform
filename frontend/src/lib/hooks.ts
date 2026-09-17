import { useCallback, useEffect, useRef, useState } from 'react'

import { streamUrl } from './api'
import { readSession, saveSession } from './session'
import type { AgentResult, StreamEvent, TraceEvent } from './types'

/** Minimal data-fetching hook: enough for a read-mostly dashboard, no cache
 *  library required. Guards against setting state after unmount. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    loader()
      .then((value) => alive && setData(value))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, error, loading, reload: () => setNonce((n) => n + 1) }
}

export type StreamPhase = 'idle' | 'running' | 'done' | 'error'

/** Drives a run of the agent graph over server-sent events.
 *
 *  The trace is accumulated per node rather than as a flat log: the UI wants
 *  "which specialist is working, and what has it said so far", which is a
 *  grouped view, not a transcript. */
export function useAgentStream() {
  const [saved] = useState(() => readSession())
  const [phase, setPhase] = useState<StreamPhase>(saved ? 'done' : 'idle')
  const [events, setEvents] = useState<TraceEvent[]>(saved?.trace ?? [])
  const [result, setResult] = useState<AgentResult | null>(saved)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState(saved?.question ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  const stop = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const run = useCallback(
    (nextQuestion: string, forceRefresh = false, intent?: string | null) => {
      stop()
      setQuestion(nextQuestion)
      setEvents([])
      setResult(null)
      setError(null)
      setPhase('running')
      setStartedAt(Date.now())

      const source = new EventSource(streamUrl(nextQuestion, forceRefresh, intent))
      sourceRef.current = source

      source.onmessage = (message) => {
        let payload: StreamEvent
        try {
          payload = JSON.parse(message.data) as StreamEvent
        } catch {
          return
        }

        switch (payload.type) {
          case 'trace':
            setEvents((prev) => [...prev, payload.event])
            break
          case 'result':
            setResult(payload.result)
            saveSession(payload.result)
            setPhase('done')
            break
          case 'error':
            setError(payload.message)
            setPhase('error')
            break
          case 'done':
            stop()
            setPhase((prev) => (prev === 'running' ? 'done' : prev))
            break
        }
      }

      source.onerror = () => {
        // EventSource also fires this on a clean close. Auto-reconnect would
        // start a second agent run, so we always close — but only show an error
        // if we never got a result.
        if (sourceRef.current !== source) return
        stop()
        setPhase((prev) => {
          if (prev === 'running') {
            setError(
              'The live connection dropped. The server may still finish this run; check Operations for saved runs and Opportunities for saved gap scores.',
            )
            return 'error'
          }
          return prev
        })
      }
    },
    [stop],
  )

  const reset = useCallback(() => {
    stop()
    setPhase('idle')
    setEvents([])
    setResult(null)
    setError(null)
    setQuestion('')
    setStartedAt(null)
    try { sessionStorage.removeItem('research.lastRun') } catch { /* optional persistence */ }
  }, [stop])

  const stopWatching = useCallback(() => {
    stop()
    setPhase('error')
    setError('Live updates paused. The server may still finish this run; saved results are available in Opportunities.')
  }, [stop])
  const restore = useCallback((savedResult: AgentResult) => {
    stop()
    setResult(savedResult)
    setEvents(savedResult.trace ?? [])
    setQuestion(savedResult.question)
    setError(null)
    setStartedAt(null)
    setPhase('done')
    saveSession(savedResult)
  }, [stop])
  return { phase, events, result, error, question, startedAt, run, restore, stop: stopWatching, reset }
}

/** Ticking elapsed-seconds counter for long-running work. */
export function useElapsed(startedAt: number | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !startedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [active, startedAt])
  return startedAt ? Math.max(0, now - startedAt) : 0
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}
