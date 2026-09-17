import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'

import Layout from './components/Layout'
import Console from './pages/Console'
const Demand = lazy(() => import('./pages/Demand'))
const GraphExplorer = lazy(() => import('./pages/GraphExplorer'))
const LibraryPage = lazy(() => import('./pages/Library'))
const Operations = lazy(() => import('./pages/Operations'))
const Signals = lazy(() => import('./pages/Signals'))
const TopicDetail = lazy(() => import('./pages/TopicDetail'))

export default function App() {
  return (
    <Suspense fallback={<div role="status" className="p-8 text-ink-3">Opening workspace…</div>}><Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Console />} />
        <Route path="/guide" element={<Navigate to="/" replace />} />
        <Route path="/demand" element={<Demand />} />
        <Route path="/topic/:slug" element={<TopicDetail />} />
        <Route path="/graph" element={<GraphExplorer />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/ops" element={<Operations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></Suspense>
  )
}
