// One brand sheet on screen, whichever record it is kept on (source.ts SheetSource: a project's brand, or a chat's):
// it opens the sheet, sends every pick and edit, and puts the sheet's name and its one primary, Lock, in the top bar.
// Locked, the sheet goes back where it came from. BrandSheet.tsx draws a project's with it; ChatSheet.tsx a chat's.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../primitives/Button'
import { useTopBar } from '../../shell/Slots'
import { BrandBoard } from './BrandBoard'
import type { SheetSource } from './source'
import type { BrandActions, BrandView } from './types'

export function Sheet({ source, name, onBack, onSheet, fill }: {
  source: SheetSource<BrandView>
  // the breadcrumb's part before Brand sheet: the project, or Chat; it goes back where the sheet was opened from
  name: string | null
  onBack: () => void
  // the sheet as it stands, after it opens and after every change
  onSheet?: (v: BrandView) => void
  fill?: boolean
}) {
  const [sheet, setSheet] = useState<BrandView | null>(null)
  const [busy, setBusy] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef(0)
  const say = useCallback((t: string) => { setToast(t); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 3000) }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const heard = useRef(onSheet)
  heard.current = onSheet
  const take = useCallback((v: BrandView) => { setSheet(v); heard.current?.(v) }, [])

  useEffect(() => {
    let live = true
    setSheet(null)
    setSel(null)
    setBusy(true)
    source.open()
      .then(v => { if (live) take(v) })
      .catch(err => { if (live) say((err as Error).message) })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [source, say, take])

  // every change answers with the new sheet; an error keeps what was there and says so once
  const call = useCallback((what: string, body?: unknown) => source.change(what, body).then(take, err => { say((err as Error).message); throw err }), [source, say, take])
  const locked = !!sheet?.brand?.lockedAt
  const actions: BrandActions = useMemo(() => ({
    pick: p => call('pick', p),
    edit: e => call('edit', e),
    lock: () => call('lock'),
    unlock: () => call('unlock')
  }), [call])
  const ready = !busy && !!sheet?.brand
  const primary = useMemo(() => (
    <Button role={locked ? 'secondary' : 'primary'} className="min-w-[120px] max-md:min-w-0" isDisabled={!ready}
      // locked, it goes back where it was opened from
      onPress={() => { if (locked) actions.unlock().catch(() => {}); else actions.lock().then(onBack, () => {}) }}>
      {locked ? 'Unlock' : 'Lock'}
    </Button>
  ), [locked, ready, actions, onBack])
  useTopBar({ build: name, onBuild: onBack, primary })

  return <BrandBoard brand={sheet?.brand || null} packs={sheet?.packs} busy={busy} sel={sel} onSelect={setSel} actions={actions} toast={toast} fill={fill} />
}
