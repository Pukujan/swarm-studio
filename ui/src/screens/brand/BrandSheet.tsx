// The brand sheet (docs/specs/31-brand-sheet.md), the screen: a project's sheet, opened from its Studio, at
// ?room=brand&project=<id>&step=<step>. Where the person is comes from the machine (useNav); the sheet from the
// project's brand routes (server/brand.mjs), made from the project's idea as the Studio's Brand card makes it
// (web/scaffold.js). The top bar gets its crumb, Projects › the project › Brand, and its one primary, Lock.
import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../../api'
import { useToast } from '../../board/Toast'
import { useNav } from '../../nav/NavProvider'
import { Button } from '../../primitives/Button'
import { useTopBar } from '../../shell/topBarSlots'
import { BrandBoard } from './BrandBoard'
import type { BrandActions, BrandView } from './types'

interface Studio { project?: { title?: string, name?: string }, studio?: { idea?: string, kind?: string } }

export function BrandSheet() {
  const { view, go } = useNav()
  const project = view.project
  const [title, setTitle] = useState('')
  const [sheet, setSheet] = useState<BrandView | null>(null)
  const [busy, setBusy] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [toastEl, toast] = useToast()
  const base = `/api/projects/${encodeURIComponent(project || '')}/brand`

  useEffect(() => {
    if (!project) return
    let live = true
    setSheet(null)
    setBusy(true)
    get<Studio>(`/api/studio/${encodeURIComponent(project)}`)
      .then(d => {
        if (live) setTitle(d.project?.title || d.project?.name || 'Studio')
        return post<BrandView>(base, { brief: d.studio?.idea || '', kind: d.studio?.kind === 'app' ? 'app' : 'site' })
      })
      .then(v => { if (live) setSheet(v) })
      .catch(err => { if (live) toast(err.message) })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [project, base, toast])

  // every change answers with the new sheet; an error keeps what was there and says so once
  const call = useCallback((what: string, body?: unknown) => post<BrandView>(`${base}/${what}`, body).then(setSheet, err => { toast(err.message); throw err }), [base, toast])
  const back = () => go({ type: 'back' })
  const actions: BrandActions = {
    pick: p => call('pick', p),
    edit: e => call('edit', e),
    // locked, it goes back where it came from
    lock: () => call('lock').then(() => { back() }),
    unlock: () => call('unlock')
  }
  const locked = !!sheet?.brand?.lockedAt

  useTopBar({
    crumb: [{ label: 'Projects', onPress: () => go({ type: 'home' }) }, { label: title, onPress: back }, { label: 'Brand' }],
    primary: (
      <Button role={locked ? 'secondary' : 'primary'} className="min-w-[120px]" isDisabled={busy || !sheet?.brand}
        onPress={() => { (locked ? actions.unlock() : actions.lock()).catch(() => {}) }}>
        {locked ? 'Unlock' : 'Lock'}
      </Button>
    )
  })

  return (
    <>
      <BrandBoard brand={sheet?.brand || null} packs={sheet?.packs} busy={busy} sel={sel} onSelect={setSel} actions={actions} />
      {toastEl}
    </>
  )
}
