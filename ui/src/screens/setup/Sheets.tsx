// Setup and Settings for the whole app, one sheet at a time: `useSheets().open('setup', row?)` and
// `open('settings')` from any menu (the ☰, and the Projects user menu once it has moved). Setup opens by itself
// once, the first time Projects shows (spec 6). `warn` is true while the last models check failed (the server
// keeps it across restarts), for the avatar's warning dot and the Setup item's ⚠.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNav } from '../../nav/NavProvider'
import { get } from './api'
import type { SetupRow } from './machines'
import { SettingsSheet } from './SettingsSheet'
import { SetupSheet } from './SetupSheet'

type Open = { sheet: 'setup', row: SetupRow } | { sheet: 'settings' } | null
type Sheets = { open: (sheet: 'setup' | 'settings', row?: SetupRow) => void, warn: boolean }

const SheetsContext = createContext<Sheets | null>(null)

export function SheetsProvider({ children, first = true }: { children: ReactNode, first?: boolean }) {
  const [at, setAt] = useState<Open>(null)
  const [warn, setWarn] = useState(false)
  const { view } = useNav()
  const home = view.room === 'home'

  // the warning in every room; the sheet itself only the first time Projects shows
  useEffect(() => {
    if (!first) return
    let alive = true
    get<{ seen?: boolean, models?: unknown, modelsOk?: boolean | null }>('/api/setup').then(v => {
      if (!alive || !v) return
      setWarn(v.modelsOk === false)
      if (home && v.models && v.seen === false) setAt(a => a ?? { sheet: 'setup', row: '' })
    })
    return () => { alive = false }
  }, [first, home])

  const open = useCallback((sheet: 'setup' | 'settings', row: SetupRow = '') => setAt(sheet === 'setup' ? { sheet, row } : { sheet }), [])
  const onModels = useCallback((ok: boolean | undefined) => setWarn(ok === false), [])
  const value = useMemo(() => ({ open, warn }), [open, warn])

  return (
    <SheetsContext value={value}>
      {children}
      {at?.sheet === 'setup' && <SetupSheet row={at.row} onClose={() => setAt(null)} onModels={onModels} />}
      {/* Settings › Setup: Settings closes and Setup opens on its Parts (the statechart's #projects.setup.parts) */}
      {at?.sheet === 'settings' && <SettingsSheet onClose={() => setAt(null)} onSetup={() => setAt({ sheet: 'setup', row: 'parts' })} />}
    </SheetsContext>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetsContext)
  if (!s) throw new Error('useSheets needs a SheetsProvider')
  return s
}
