import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { ThemeProvider } from './lib/theme'
import { ActivityProvider } from './lib/activity'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider><ActivityProvider><App /></ActivityProvider></ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
