import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NavProvider } from './nav/NavProvider'
import { SheetsProvider } from './screens/setup/Sheets'
import './app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NavProvider>
      <SheetsProvider>
        <App />
      </SheetsProvider>
    </NavProvider>
  </StrictMode>
)
