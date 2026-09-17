import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { TraceEvent } from './types'

export type Activity = { question: string; events: TraceEvent[]; running: boolean; saved: boolean }
const ActivityContext = createContext<{ activity: Activity; setActivity: (value: Activity) => void }>({ activity: { question: '', events: [], running: false, saved: false }, setActivity: () => {} })
export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<Activity>({ question: '', events: [], running: false, saved: false })
  return <ActivityContext.Provider value={{ activity, setActivity }}>{children}</ActivityContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export const useActivity = () => useContext(ActivityContext)
