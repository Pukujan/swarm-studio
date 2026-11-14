// The tier manager on the Studio first (spec 43 §4: the scaffold gets the tier manager, not the PixiJS layer). Its
// cards have no photos and no live pages, so two tiers matter: a card in view or within the margin is drawn, and one
// beyond it is `hidden`, which here means the browser skips rendering it (content-visibility, its size kept), with the
// same plan, margin and hysteresis as every board. Applied straight to the cards, never through React.
import { useEffect, useMemo, useState } from 'react'
import type { Camera } from '../../board/camera'
import { machineBudgets, useTiers } from '../../board/useTiers'
import type { Item } from '../../board/tiers'

// `on`: behind the board flag (src/board/flag.ts) until the gauge says
export function useCardTiers(root: { current: HTMLElement | null }, camera: Camera, version: unknown, on: boolean) {
  const budgets = useMemo(() => machineBudgets(), [])
  const [items, setItems] = useState<Item[]>([])
  const [stage, setStage] = useState({ w: 0, h: 0 })

  // the cards' places on the board, in its own units (measured once they are drawn)
  useEffect(() => {
    const world = root.current?.querySelector<HTMLElement>('.pj-world'), s = root.current?.querySelector<HTMLElement>('.pj-stage')
    if (!on || !world || !s) return
    const raf = requestAnimationFrame(() => {
      const wr = world.getBoundingClientRect(), k = camera.get().k || 1
      setItems([...world.querySelectorAll<HTMLElement>('.ab[data-key]')].map(el => {
        const r = el.getBoundingClientRect()
        return { id: el.dataset.key as string, rect: { x: (r.left - wr.left) / k, y: (r.top - wr.top) / k, w: r.width / k || 1, h: r.height / k || 1 }, photoW: 0 }
      }))
      setStage({ w: s.clientWidth, h: s.clientHeight })
    })
    return () => cancelAnimationFrame(raf)
  }, [root, camera, version, on])

  const plan = useTiers({ camera, items, stage, wants: useMemo(() => ({}), []), budgets })

  useEffect(() => {
    for (const i of items) {
      const el = root.current?.querySelector<HTMLElement>(`.ab[data-key="${CSS.escape(i.id)}"]`)
      if (!el) continue
      const hidden = plan.get(i.id)?.tier === 'hidden'
      el.style.contentVisibility = hidden ? 'hidden' : ''
      el.style.containIntrinsicSize = hidden ? `${Math.round(i.rect.w)}px ${Math.round(i.rect.h)}px` : ''
      el.dataset.tier = plan.get(i.id)?.tier ?? ''
    }
  }, [plan, items, root])
}
