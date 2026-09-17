import clsx from 'clsx'
import { Activity, BookOpen, Cpu, Network, Radar, Sparkles, Target, PanelLeftClose, PanelLeftOpen, Sun, Moon, Presentation } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, MotionConfig } from 'framer-motion'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import Showcase from './Showcase'

const NAV = [
  { to: '/', label: 'Research studio', icon: Sparkles },
  { to: '/demand', label: 'Opportunities', icon: Target },
  { to: '/graph', label: 'Knowledge map', icon: Network },
  { to: '/library', label: 'Research library', icon: BookOpen },
  { to: '/signals', label: 'Market signals', icon: Radar },
  { to: '/ops', label: 'Operations', icon: Cpu },
]

export default function Layout() {
  const { data: health } = useAsync(() => api.health(), [])
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [showcase, setShowcase] = useState<'architecture'|'slides'|null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('research.sidebar') === 'collapsed' || innerWidth < 900 } catch { return false }
  })
  function collapse() {
    setCollapsed(!collapsed)
    try { localStorage.setItem('research.sidebar', collapsed ? 'expanded' : 'collapsed') } catch { /* optional preference */ }
  }
  return <MotionConfig reducedMotion="user">
    <div className="app-shell flex h-screen overflow-hidden bg-canvas">
      <aside className={clsx('app-sidebar flex shrink-0 flex-col border-r border-edge-soft bg-surface', collapsed ? 'is-collapsed w-[76px]' : 'w-[230px]')}>
        <NavLink to="/" className="flex h-24 items-center gap-3 px-5" aria-label="Demand Sensing home">
          <div className="brand-mark grid size-9 shrink-0 place-items-center rounded-xl"><Activity className="size-5 text-white" /></div>
          {!collapsed && <div><p className="text-sm font-semibold tracking-tight">Demand Sensing</p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-ink-3">Intelligence workspace</p></div>}
        </NavLink>
        {!collapsed && <p className="label-caps mb-3 px-6">Workspace</p>}
        <nav aria-label="Main navigation" className="flex-1 space-y-1.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} title={collapsed ? label : undefined} aria-label={label} className={({ isActive }) => clsx('nav-item relative flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium', isActive ? 'nav-active text-momentum' : 'text-ink-2 hover:bg-surface-2')}>
            {({ isActive }) => <><Icon className="size-[18px] shrink-0" />{!collapsed && <span>{label}</span>}{isActive && <motion.span layoutId="nav-indicator" className="absolute right-0 h-5 w-[3px] rounded-full bg-momentum" />}</>}
          </NavLink>)}
        </nav>
        <div className="space-y-3 border-t border-edge-soft p-3">
          {!collapsed && <details className="rounded-xl bg-surface-2 p-3 text-xs"><summary className="cursor-pointer text-ink-2"><span className={clsx('mr-2 inline-block size-1.5 rounded-full', health?.status === 'ok' ? 'bg-coverage' : 'bg-gap')} />System status</summary><div className="mt-3 space-y-2 text-ink-3"><p>Research model: {health?.capabilities.llm ? 'configured' : 'unavailable'}</p><p>Web search: {health?.capabilities.web_search ? 'configured' : 'unavailable'}</p><p>Library index: {health?.capabilities.vector_index ? 'ready' : 'unavailable'}</p></div></details>}
          <button className="sidebar-control" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Switch theme">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}{!collapsed && <span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span>}</button>
          <button className="sidebar-control" onClick={collapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}{!collapsed && <span>Collapse sidebar</span>}</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto" id="main-content">
        <div className="workspace-bar flex flex-wrap items-center justify-between gap-3 border-b border-edge-soft px-7 py-3 text-xs text-ink-3"><span>Workspace <span className="mx-2 opacity-40">/</span><span className="text-ink-2">{NAV.find(n => n.to === location.pathname)?.label ?? 'Topic analysis'}</span></span><div className="flex items-center gap-2"><button onClick={()=>setShowcase('architecture')} className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2 text-ink-2 hover:text-momentum"><Network className="size-3.5" />Current Architecture</button><button onClick={()=>setShowcase('slides')} className="flex items-center gap-2 rounded-lg bg-momentum/10 px-3 py-2 text-momentum"><Presentation className="size-3.5" />Slides</button></div></div>
        <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28 }}><Outlet /></motion.div>
      </main>
      {showcase && <Showcase view={showcase} onClose={()=>setShowcase(null)} />}
    </div>
  </MotionConfig>
}
