// The Design deck's canvas as an image-first board (behind `?board=tiers`, src/board/flag.ts; spec 43 §2,
// §3): the camera lives outside React (src/board/camera.ts) and moves the world with one transform; on every settled
// frame the tier manager (src/board/tiers.ts) decides each page's tier. Only live pages are real pages (PageFrame,
// sandboxed); the rest are their saved photos, as <img>. Going live, the photo stays until the frame has laid itself out (its first `geo`); going back, the
// frame is removed and the last saved photo shows (the in-page capture of §3.7 has not been built, so nothing is
// photographed again here yet). The crew's cursors stay HTML on top. Same props and handle as DeckStage.
//
// It is the board's host for its pages (src/board/host.ts): the tier manager's (src/board/tierHost.ts), so the
// deck's PageFrame attaches and talks to its frame here as it does under slice 1's host, and live is asked for by
// reason (an agent at work, the person's pick).
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { createCamera, type Cam } from '../../board/camera'
import type { BoardMode } from '../../board/flag'
import { photoFor, usePhotos, SNAP_W } from '../../board/photos'
import { machineBudgets, useTiers } from '../../board/useTiers'
import type { Item } from '../../board/tiers'
import { BoardHostContext } from '../../board/host'
import { tierHost } from '../../board/tierHost'
import { crew } from './crew'
import { FRAME_W, GAP, PageFrame, frameX, type FrameGeo } from './PageFrame'
import { layersOf, type DeckAgent, type DeckModel } from './model'
import type { StageHandle } from './DeckStage'


const LABEL = 28
const MIN_K = 0.04, MAX_K = 2
const followed = (m: DeckModel) => m.agents.find(a => a.layer && m.layers[a.layer]?.status === 'streaming') ?? m.agents.find(a => a.layer)

function target(m: DeckModel, geo: Record<string, FrameGeo>, a: DeckAgent): { x: number, y: number } | null {
  const l = a.layer ? m.layers[a.layer] : null
  if (!l) return null
  const page = l.page === '*' ? m.pages[0] : m.pages.find(p => p.id === l.page)
  const g = page && geo[page.id]?.slots[l.key]
  if (!page || !g) return page ? { x: frameX(page) + FRAME_W / 2, y: LABEL + 200 } : null
  const [left, top, width, height] = g.box, x0 = frameX(page), y0 = LABEL
  if (!l.text.trim() || l.status === 'assigned') return { x: x0 + left + width - 40, y: y0 + top + Math.max(height, l.height) - 30 }
  if (!g.last) return { x: x0 + left + 40, y: y0 + top + 40 }
  return { x: x0 + g.last[0], y: y0 + g.last[1] - 6 }
}

export function DeckBoard({ ref, model, mode, onZoom, follow = false, onFollow, selected = null }: {
  ref?: Ref<StageHandle>, model: DeckModel, mode: Exclude<BoardMode, 'dom'>, onZoom?: (k: number) => void, follow?: boolean, onFollow?: (on: boolean) => void, selected?: string | null
}) {
  const stage = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const cursors = useRef<HTMLDivElement>(null)
  const camera = useMemo(() => createCamera({ x: 40, y: 40, k: 0.16 }), [])
  useEffect(() => () => camera.destroy(), [camera])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [geo, setGeo] = useState<Record<string, FrameGeo>>({})
  // the pages whose live frame has laid itself out: their photo can go
  const [painted, setPainted] = useState<Set<string>>(() => new Set())
  const onGeo = useCallback((page: string, g: FrameGeo) => setGeo(all => ({ ...all, [page]: g })), [])
  const [panning, setPanning] = useState(false)
  const budgets = useMemo(() => machineBudgets(), [])
  const host = useMemo(() => tierHost(), [])

  // the saved photos, asked for again as sections finish (a page's photo changes with its version)
  const done = Object.values(model.layers).filter(l => l.status === 'done').length
  const photos = usePhotos(model.run, done)
  const height = (id: string) => Math.min(36000, Math.max(700, geo[id]?.height || 900))
  const items: Item[] = useMemo(() => model.pages.map(p => ({ id: p.id, rect: { x: frameX(p), y: LABEL, w: FRAME_W, h: height(p.id) }, photoW: SNAP_W.f })),
    [model.pages, geo]) // height() reads geo
  useEffect(() => { host.place(items.map(i => ({ id: i.id, kind: 'page', rect: i.rect }))) }, [host, items])
  // a page an agent is writing asks to be live (a section on every page asks for the first), and so does the pick
  const agentPages = [...new Set(model.agents.flatMap(a => {
    const l = a.layer ? model.layers[a.layer] : null
    return l ? [l.page === '*' ? model.pages[0]?.id : l.page].filter((x): x is string => !!x) : []
  }))].sort().join('|')
  useEffect(() => {
    const ids = agentPages ? agentPages.split('|') : []
    for (const id of ids) host.requestLive(id, 'agent')
    return () => { for (const id of ids) host.releaseLive(id, 'agent') }
  }, [host, agentPages])
  useEffect(() => {
    if (!selected) return
    host.requestLive(selected, 'selected')
    return () => host.releaseLive(selected, 'selected')
  }, [host, selected])
  const [wants, setWants] = useState(() => host.wants())
  useEffect(() => host.onWants(() => setWants(host.wants())), [host])
  const plan = useTiers({ camera, items, stage: size, wants, budgets })
  useEffect(() => { host.apply(plan) }, [host, plan])

  // the camera moves the world and the cursors with one transform each, never through React; will-change only while it moves
  const worldW = model.pages.length ? model.pages.length * FRAME_W + (model.pages.length - 1) * GAP : FRAME_W
  const worldH = LABEL + Math.max(700, ...model.pages.map(p => height(p.id)))
  const place = useRef<(c: Cam) => void>(() => {})
  place.current = c => {
    const w = world.current
    if (w) { w.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.k})`; w.style.willChange = camera.moving() ? 'transform' : '' }
    for (const el of cursors.current?.querySelectorAll<HTMLElement>('[data-tx]') ?? []) {
      el.style.transform = `translate(${Math.round(c.x + Number(el.dataset.tx) * c.k)}px, ${Math.round(c.y + Number(el.dataset.ty) * c.k)}px)`
    }
  }
  useEffect(() => camera.subscribe(c => place.current(c)), [camera])
  useEffect(() => camera.onSettled(s => { if (world.current) world.current.style.willChange = ''; onZoom?.(s.cam.k) }), [camera, onZoom])

  const frame = useCallback((x: number, w: number, h: number) => {
    const s = stage.current
    if (!s || !s.clientWidth) return
    const vw = s.clientWidth - 48, vh = s.clientHeight - 48
    const k = Math.min(1, Math.max(MIN_K, Math.min(vw / w, vh / Math.min(h, vh * 6))))
    camera.set({ k, x: 24 + Math.max(0, (vw - w * k) / 2) - x * k, y: 24 })
  }, [camera])
  const fit = useCallback(() => frame(0, worldW, worldH), [frame, worldW, worldH])
  const focusPage = useCallback((id: string) => { const p = model.pages.find(x => x.id === id); if (p) frame(frameX(p), FRAME_W, LABEL + 900) }, [frame, model.pages])
  useImperativeHandle(ref, () => ({ fit, focusPage }), [fit, focusPage])

  // Follow: the page the agent is writing
  useEffect(() => {
    const s = stage.current, a = follow ? followed(model) : undefined
    const t = a && target(model, geo, a)
    if (!s || !t || !s.clientWidth) return
    const k = Math.min(1, Math.max(MIN_K, (s.clientWidth - 48) / FRAME_W))
    camera.set({ k, x: Math.round(s.clientWidth / 2 - t.x * k), y: Math.round(s.clientHeight / 3 - t.y * k) })
  }, [follow, model, geo, camera])

  const moved = useRef(false)
  useEffect(() => { if (!moved.current) fit() }, [fit, model.pages.length])
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const o = new ResizeObserver(() => { setSize({ w: s.clientWidth, h: s.clientHeight }); if (!moved.current) fit() })
    o.observe(s)
    return () => o.disconnect()
  }, [fit])

  // drag the empty canvas to pan; the wheel scrolls, ctrl/⌘ + wheel zooms at the pointer
  const drag = useRef<{ x: number, y: number, cx: number, cy: number } | null>(null)
  const stopFollow = useRef(() => {})
  stopFollow.current = () => { moved.current = true; if (follow) onFollow?.(false) }
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const c = camera.get()
    drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y }
    stage.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!panning && Math.abs(dx) + Math.abs(dy) < 3) return
    stopFollow.current()
    setPanning(true)
    camera.set({ x: d.cx + dx, y: d.cy + dy })
  }
  const up = () => { drag.current = null; setPanning(false) }
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      stopFollow.current()
      const c = camera.get()
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
        const k = Math.min(MAX_K, Math.max(MIN_K, c.k * Math.exp(-e.deltaY * 0.01)))
        camera.set({ x: px - (px - c.x) * k / c.k, y: py - (py - c.y) * k / c.k, k })
      } else camera.set({ x: c.x - e.deltaX, y: c.y - e.deltaY })
    }
    s.addEventListener('wheel', wheel, { passive: false })
    return () => s.removeEventListener('wheel', wheel)
  }, [camera])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.shiftKey && e.code === 'Digit1') || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      moved.current = false
      fit()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [fit])

  // a live frame's first `geo` (web/frame.html, through the host) is its first paint: then its photo goes
  const liveIds = model.pages.filter(p => plan.get(p.id)?.tier === 'live').map(p => p.id).join('|')
  useEffect(() => {
    const offs = (liveIds ? liveIds.split('|') : []).map(id => host.onMessage(id, m => {
      if (m.type === 'geo') requestAnimationFrame(() => setPainted(s => (s.has(id) ? s : new Set(s).add(id))))
    }))
    return () => { for (const off of offs) off() }
  }, [host, liveIds])
  // a page that is no longer live has to paint again next time
  useEffect(() => { setPainted(s => { const keep = new Set([...s].filter(id => plan.get(id)?.tier === 'live')); return keep.size === s.size ? s : keep }) }, [plan])

  const pageLayers = useMemo(() => Object.fromEntries(model.pages.map(p => [p.id, layersOf(model, p.id)])), [model])
  const working = model.agents.filter(a => a.layer)

  return (
    <BoardHostContext value={host}>
    <div ref={stage} role="region" aria-label="Canvas" data-board={mode} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => onFollow?.(true)}
      className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden bg-void outline-none [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px] ${panning ? 'cursor-grabbing' : 'cursor-default'}`}>
      <div ref={world} className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ width: worldW }}>
        {model.pages.map(p => {
          const d = plan.get(p.id)
          if (!d || d.tier === 'hidden') return null
          const live = d.tier === 'live', shown = live && painted.has(p.id)
          const src = photoFor(photos[p.id], d.px)
          return (
            <div key={p.id} className="absolute top-0" style={{ left: frameX(p), width: FRAME_W }} data-page={p.id} data-tier={d.tier}>
              <div className="flex h-7 items-baseline gap-3 truncate font-label text-[18px] font-semibold uppercase tracking-[.08em] text-muted">
                <span className="text-text">Page {p.index + 1} · {p.title}</span><small className="font-monospace normal-case">/{p.id}</small>
              </div>
              <div className="relative" style={{ height: height(p.id) }}>
                {!shown && (src
                  ? <img src={src} alt="" decoding="async" draggable={false} className="absolute inset-0 block size-full bg-paper object-cover object-top" />
                  : <div aria-hidden className="absolute inset-0 rounded-[2px] border border-line bg-surface-2" />)}
                {live && (
                  <div className={`absolute inset-0 motion-safe:transition-opacity motion-safe:duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}>
                    <PageFrame page={p} layers={pageLayers[p.id]} agents={model.agents} theme={model.theme} onGeo={onGeo} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div ref={cursors} aria-hidden className="pointer-events-none absolute inset-0">
        {working.map(a => {
          const t = target(model, geo, a)
          if (!t) return null
          const c = crew().color(a.name), cam = camera.get()
          return (
            <div key={a.id} data-agent={a.name} data-tx={t.x} data-ty={t.y} className="absolute top-0 left-0"
              style={{ transform: `translate(${Math.round(cam.x + t.x * cam.k)}px, ${Math.round(cam.y + t.y * cam.k)}px)` }}>
              <svg viewBox="0 0 10 10" className="block size-3.5"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill={c} stroke="#0b0b0c" strokeWidth="1" strokeLinejoin="round" /></svg>
              <span className="ml-3 inline-flex items-center gap-1 rounded-full px-1.5 py-px font-label text-[11px] font-semibold uppercase tracking-[.06em]" style={{ background: c, color: crew().ink(c) }}>{a.name}</span>
            </div>
          )
        })}
      </div>
    </div>
    </BoardHostContext>
  )
}
