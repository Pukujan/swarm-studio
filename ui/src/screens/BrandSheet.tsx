// The brand sheet (docs/specs/31-brand-sheet.md; web/brand.js), the screen: a project's sheet, opened from its Studio,
// at ?room=brand&project=<id>&step=<step>. Where the person is comes from the machine (useNav); the sheet from the
// project's brand routes (server/brand.mjs), made from the project's idea as the Studio's Brand card makes it
// (web/scaffold.js). The top bar reads Home › Projects › the project › Brand sheet, the project going back to its
// Studio, and carries the one primary, Lock. Locked, the sheet goes back where it came from.
//
// Not here yet: a sheet opened from a chat's brief (no address of its own); it stays in the current Studio.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../nav/NavProvider'
import { Button } from '../primitives/Button'
import { useTopBar } from '../shell/Slots'
import { change, getStudio, openSheet } from './brand/api'
import { BrandBoard } from './brand/BrandBoard'
import type { BrandActions, BrandView } from './brand/types'

export function BrandSheet() {
  const { view, go } = useNav()
  const project = view.project
  const [title, setTitle] = useState<string | null>(null)
  const [sheet, setSheet] = useState<BrandView | null>(null)
  const [busy, setBusy] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef(0)
  const say = useCallback((t: string) => { setToast(t); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 3000) }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  // the project's name, then its sheet (made from its idea the first time: the slow part, under the skeleton)
  useEffect(() => {
    if (!project) return
    let live = true
    setSheet(null)
    setSel(null)
    setBusy(true)
    getStudio(project)
      .then(d => {
        if (live) setTitle(d.project?.title || d.project?.name || 'Studio')
        return openSheet(project, { brief: d.studio?.idea || '', kind: d.studio?.kind === 'app' ? 'app' : 'site' })
      })
      .then(v => { if (live) setSheet(v) })
      .catch(err => { if (live) { setTitle(t => t ?? 'Studio'); say((err as Error).message) } })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [project, say])

  // every change answers with the new sheet; an error keeps what was there and says so once
  const call = useCallback((what: string, body?: unknown) => {
    if (!project) return Promise.reject(new Error('No project'))
    return change(project, what, body).then(v => { setSheet(v) }, err => { say((err as Error).message); throw err })
  }, [project, say])
  const back = useCallback(() => { go({ type: 'back' }) }, [go])
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
      // locked, it goes back to the step it was opened from
      onPress={() => { if (locked) actions.unlock().catch(() => {}); else actions.lock().then(back, () => {}) }}>
      {locked ? 'Unlock' : 'Lock'}
    </Button>
  ), [locked, ready, actions, back])
  useTopBar({ build: title, onBuild: back, primary })

  return <BrandBoard brand={sheet?.brand || null} packs={sheet?.packs} busy={busy} sel={sel} onSelect={setSel} actions={actions} toast={toast} />
}
