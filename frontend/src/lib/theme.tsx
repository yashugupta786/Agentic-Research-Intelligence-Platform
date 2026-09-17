import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const stored = localStorage.getItem('research.theme'); if (stored === 'light' || stored === 'dark') return stored } catch { /* storage disabled */ }
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem('research.theme', theme) } catch { /* storage disabled */ }
  }, [theme])
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>
}
// The hook and provider share one stable context; neither exports mutable state.
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext)
