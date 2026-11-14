// The tier manager on a board: each time the camera settles (and once more after the hysteresis delay, so a change
// that was held goes through), it asks the spatial index for the view plus the margin and plans every item. React
// re-renders on a new plan, never on a frame of a move.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Camera } from './camera'
import { Spatial } from './spatial'
import { TierManager, budgetsFor, type Budgets, type Decision, type Item, type Wants } from './tiers'

declare global { interface Navigator { deviceMemory?: number, connection?: { saveData?: boolean } } }

// this machine's budgets (src/board/tiers.ts budgetsFor), with `?board-live=N` and `?board-mb=N` to try others
export function machineBudgets(search: string = typeof location === 'undefined' ? '' : location.search): Budgets {
  const q = new URLSearchParams(search)
  const live = Number(q.get('board-live')), mb = Number(q.get('board-mb'))
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return budgetsFor({
    deviceMemoryGB: nav?.deviceMemory, saveData: nav?.connection?.saveData,
    override: { ...(live > 0 ? { live } : {}), ...(mb > 0 ? { bytes: mb * 1024 * 1024 } : {}) }
  })
}

export function useTiers({ camera, items, stage, wants, budgets }: {
  camera: Camera
  items: Item[]
  // the stage's size in pixels
  stage: { w: number, h: number }
  wants: Wants
  budgets: Budgets
}): Map<string, Decision> {
  const manager = useMemo(() => new TierManager(budgets), [budgets])
  const spatial = useMemo(() => new Spatial(), [])
  const [plan, setPlan] = useState<Map<string, Decision>>(() => new Map())
  const latest = useRef({ items, stage, wants })
  latest.current = { items, stage, wants }

  // the index follows the items
  useEffect(() => {
    const keep = new Set(items.map(i => i.id))
    for (const id of spatial.ids()) if (!keep.has(id)) spatial.remove(id)
    for (const i of items) spatial.upsert(i.id, i.rect)
  }, [items, spatial])

  useEffect(() => {
    let again: ReturnType<typeof setTimeout> | null = null
    const run = () => {
      const { items: list, stage: s, wants: w } = latest.current
      if (!s.w || !s.h) return
      const c = camera.settled().cam
      const rect = { x: -c.x / c.k, y: -c.y / c.k, w: s.w / c.k, h: s.h / c.k }
      const near = new Set(spatial.query(rect, manager.budgets.margin))
      setPlan(manager.plan({ rect, k: c.k, dpr: globalThis.devicePixelRatio || 1, now: performance.now() }, list, near, w))
    }
    const settle = () => {
      run()
      if (again) clearTimeout(again)
      again = setTimeout(run, manager.budgets.hysteresisMs + 20)
    }
    settle()
    const off = camera.onSettled(settle)
    return () => { off(); if (again) clearTimeout(again) }
  }, [camera, manager, spatial, items, stage.w, stage.h, wants])

  return plan
}
