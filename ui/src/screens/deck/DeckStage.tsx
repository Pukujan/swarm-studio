// The Design deck's canvas: the build's pages side by side, the crew's cursors on the sections they are writing,
// and the camera. Drag the empty canvas to pan, the wheel scrolls, ctrl/⌘ + wheel zooms at the pointer, ⇧1 fits
// every page (PATTERNS.md, "The Design deck follows Figma"). While Follow is on the camera goes to the agent at work;
// a drag or the wheel turns it off and a double-click turns it back on (openspec/specs/design-deck/spec.md). The
// pages only show here: they take no pointer.
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { BoardHostContext } from '../../board/host'
import { iframeHost } from '../../board/iframeHost'
import { CrewCursors } from './CrewCursors'
import { FRAME_W, GAP, PageFrame, frameX, type FrameGeo } from './PageFrame'
import { layersOf, type DeckAgent, type DeckModel } from './model'

export interface StageHandle {
  fit(): void
  focusPage(id: string): void
}

type Cam = { x: number, y: number, k: number }
const LABEL = 28
const MIN_K = 0.04, MAX_K = 2

// the box around every section the crew is writing (web/canvas/deck.js bboxActive); none at work: every page
function activeBox(m: DeckModel, geo: Record<string, FrameGeo>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = (ax: number, ay: number, bx: number, by: number) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by) }
  for (const a of m.agents) {
    const b = a.layer ? sectionBox(m, geo, a.layer) : null
    if (b) add(b.x, b.y, b.x + b.w, b.y + Math.max(b.h, 300))
  }
  if (x0 === Infinity) for (const p of m.pages) add(frameX(p), LABEL - 120, frameX(p) + FRAME_W, LABEL + (geo[p.id]?.height || 700))
  return x0 === Infinity ? null : { x0, y0: y0 - 160, x1, y1: y1 + 80 }
}

// where the reviewer looks on a page under review (web/canvas/auto.js rvSpot): a section, a little way in
function reviewSpot(m: DeckModel, geo: Record<string, FrameGeo>, id: string, n: number) {
  const page = m.pages.find(p => p.id === id)
  if (!page) return null
  const keys = Object.keys(geo[id]?.slots ?? {})
  if (!keys.length) return { x: frameX(page) + 640, y: LABEL + 300 }
  const [left, top, width, height] = geo[id].slots[keys[n % keys.length]].box
  return { x: frameX(page) + left + width * (0.25 + ((n * 37) % 50) / 100), y: LABEL + top + Math.min(height, 600) * 0.45 }
}

// a section's box in the world's coordinates, on the first page that shows it
function sectionBox(m: DeckModel, geo: Record<string, FrameGeo>, key: string) {
  const l = m.layers[key]
  const page = l && (l.page === '*' ? m.pages[0] : m.pages.find(p => p.id === l.page))
  const g = page && geo[page.id]?.slots[key]
  if (!page || !g) return null
  const [x, y, w, h] = g.box
  return { x: frameX(page) + x, y: LABEL + y, w, h: Math.max(h, l.height) }
}

// where an agent's cursor goes, in the world's coordinates (web/canvas/deck.js agentTarget)
function target(m: DeckModel, geo: Record<string, FrameGeo>, a: DeckAgent): { x: number, y: number } | null {
  const l = a.layer ? m.layers[a.layer] : null
  if (!l) return null
  const page = l.page === '*' ? m.pages[0] : m.pages.find(p => p.id === l.page)
  const g = page && geo[page.id]?.slots[l.key]
  if (!page || !g) return null
  const [left, top, width, height] = g.box, x0 = frameX(page), y0 = LABEL
  if (!l.text.trim() || l.status === 'assigned') return { x: x0 + left + width - 40, y: y0 + top + Math.max(height, l.height) - 30 }
  if (!g.last) return { x: x0 + left + 40, y: y0 + top + 40 }
  return { x: x0 + g.last[0], y: y0 + g.last[1] - 6 }
}

// a section the person picked, on the page it was picked on (the nav and footer are on every page)
export interface Picked { key: string, page: string }

export function DeckStage({ ref, model, onZoom, follow = false, onFollow, selected = null, onSelect, pickExtra }: {
  ref?: Ref<StageHandle>, model: DeckModel, onZoom?: (k: number) => void, follow?: boolean, onFollow?: (on: boolean) => void,
  selected?: Picked | null, onSelect?: (p: Picked | null) => void,
  // drawn at the picked section's top right (its comment pin)
  pickExtra?: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null)
  // where the camera starts (web/canvas/core.js cam): Follow glides from here to the crew
  const [cam, setCam] = useState<Cam>({ x: 40, y: 140, k: 0.16 })
  // The camera on screen: while Follow moves it, it eases a little each frame toward `cam` (web/canvas/loop.js), else
  // it is `cam` at once. Written straight to the world element, so React draws nothing per frame; the crew's cursors
  // read the same, so they stay on their sections while it moves.
  const world = useRef<HTMLDivElement>(null)
  const shown = useRef<Cam>({ ...cam })
  const want = useRef({ cam, follow })
  want.current = { cam, follow }
  // not easing (no Follow, reduced motion): the camera is written at once, also where no frame runs (a hidden tab)
  useLayoutEffect(() => {
    if (follow && !matchMedia('(prefers-reduced-motion: reduce)').matches) return
    Object.assign(shown.current, cam)
    if (world.current) world.current.style.transform = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.k.toFixed(4)})`
  }, [cam, follow])
  // the glide runs only while following: a board that is not followed draws no frame of its own (board gauge)
  useEffect(() => {
    if (!follow || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0, last = 0
    const tick = () => {
      const { cam: to, follow: ease } = want.current, s = shown.current
      if (ease) {
        // the same glide at any frame rate: 0.06 a frame at 60 fps, raised to the frames that passed
        const t0 = performance.now(), f = 1 - Math.pow(1 - 0.06, Math.min(100, t0 - (last || t0 - 16.7)) / 16.7)
        last = t0
        s.x += (to.x - s.x) * f; s.y += (to.y - s.y) * f; s.k += (to.k - s.k) * f
        if (Math.abs(to.x - s.x) + Math.abs(to.y - s.y) < 0.5 && Math.abs(to.k - s.k) < 1e-4) Object.assign(s, to)
      } else Object.assign(s, to)
      const t = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${s.k.toFixed(4)})`
      if (world.current && world.current.style.transform !== t) world.current.style.transform = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [follow])
  const [geo, setGeo] = useState<Record<string, FrameGeo>>({})
  const [panning, setPanning] = useState(false)
  const onGeo = useCallback((page: string, g: FrameGeo) => setGeo(all => ({ ...all, [page]: g })), [])
  useEffect(() => { onZoom?.(cam.k) }, [cam.k, onZoom])

  const heights = model.pages.map(p => Math.min(36000, Math.max(700, geo[p.id]?.height || 0)))
  const worldW = model.pages.length ? model.pages.length * FRAME_W + (model.pages.length - 1) * GAP : FRAME_W
  const worldH = LABEL + Math.max(700, ...heights)

  // the person (or a page asked for) has moved the camera: the automatic fits leave it
  const moved = useRef(false)
  // fit a box of the world into the stage, never past 1:1
  const frame = useCallback((x: number, w: number, h: number) => {
    const s = stage.current
    if (!s || !s.clientWidth) return
    const vw = s.clientWidth - 48, vh = s.clientHeight - 48
    const k = Math.min(1, Math.max(MIN_K, Math.min(vw / w, vh / Math.min(h, vh * 6))))
    setCam({ k, x: 24 + Math.max(0, (vw - w * k) / 2) - x * k, y: 24 })
  }, [])
  const fit = useCallback(() => frame(0, worldW, worldH), [frame, worldW, worldH])
  // a page asked for (Layers, the Overview's Open) keeps the camera: the fits below no longer take it back
  const focusPage = useCallback((id: string) => {
    const p = model.pages.find(x => x.id === id)
    if (p) { moved.current = true; frame(frameX(p), FRAME_W, LABEL + 900) }
  }, [frame, model.pages])
  useImperativeHandle(ref, () => ({ fit, focusPage }), [fit, focusPage])

  // Follow (web/canvas/loop.js, deck.js bboxActive and fit): every 700 ms the camera takes in every section the crew
  // is writing (each at least 300 tall, 160 of headroom above and 80 below), at least 1500 × 900 of the world and at
  // most half scale, centred; it glides there a little each frame
  const fitAt = useRef(0)
  useEffect(() => {
    const s = stage.current
    if (!follow || !s || !s.clientWidth) return
    const wait = fitAt.current - performance.now()
    const run = () => {
      fitAt.current = performance.now() + 700
      const b = activeBox(model, geo)
      if (!b) return
      const vw = s.clientWidth, vh = s.clientHeight - 90
      const w = Math.max(b.x1 - b.x0, 1500), h = Math.max(b.y1 - b.y0, 900)
      const k = Math.max(0.06, Math.min(0.5, Math.min(vw / (w * 1.08), vh / (h * 1.08))))
      const next = { k, x: vw / 2 - (b.x0 + b.x1) / 2 * k, y: vh / 2 + 10 - (b.y0 + b.y1) / 2 * k }
      setCam(c => (Math.abs(c.x - next.x) + Math.abs(c.y - next.y) + Math.abs(c.k - next.k) * 1000 < 1 ? c : next))
    }
    if (wait <= 0) { run(); return }
    const t = setTimeout(run, wait)
    return () => clearTimeout(t)
  }, [follow, model, geo])

  // the first look fits every page; a page added later is fitted in until the person moves the camera
  // (while Follow is on, it is Follow that frames the crew)
  useEffect(() => { if (!moved.current && !follow) fit() }, [fit, model.pages.length, follow])
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const o = new ResizeObserver(() => { if (!moved.current && !want.current.follow) fit() })
    o.observe(s)
    return () => o.disconnect()
  }, [fit])

  // drag the empty canvas to pan
  const drag = useRef<{ x: number, y: number, cx: number, cy: number } | null>(null)
  const down = (e: React.PointerEvent) => {
    // the pin, its thread and the flags are controls, not the canvas
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest('[data-ui]'))) return
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }
    stage.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!panning && Math.abs(dx) + Math.abs(dy) < 3) return
    moved.current = true
    if (follow) onFollow?.(false)
    setPanning(true)
    setCam(c => ({ ...c, x: d.cx + dx, y: d.cy + dy }))
  }
  // a click (no drag) picks the section under it, from where the frames say each one is; the empty canvas clears it
  const up = (e: React.PointerEvent) => {
    const clicked = !!drag.current && !panning
    drag.current = null
    setPanning(false)
    if (clicked && e.type === 'pointerup') onSelect?.(hit(e.clientX, e.clientY))
  }
  const hit = (sx: number, sy: number): Picked | null => {
    const r = stage.current?.getBoundingClientRect()
    if (!r) return null
    const wx = (sx - r.left - cam.x) / cam.k, wy = (sy - r.top - cam.y) / cam.k - LABEL
    const page = model.pages.find(p => wx >= frameX(p) && wx <= frameX(p) + FRAME_W)
    const g = page && geo[page.id]
    if (!page || !g) return null
    const fx = wx - frameX(page)
    const key = Object.entries(g.slots).find(([, s]) => fx >= s.box[0] && fx <= s.box[0] + s.box[2] && wy >= s.box[1] && wy <= s.box[1] + s.box[3])?.[0]
    return key && model.layers[key] ? { key, page: page.id } : null
  }
  // the Critic's issues (3 at most), a flag on each section until it is reworked, on the first page that shows it
  const flags = Object.entries(model.issues).slice(0, 3).flatMap(([key, issue]) => {
    const page = model.pages.find(p => geo[p.id]?.slots[key])
    const s = page && geo[page.id].slots[key]
    return page && s ? [{ key, problem: issue.problem, left: cam.x + (frameX(page) + s.box[0]) * cam.k, top: cam.y + (LABEL + s.box[1]) * cam.k }] : []
  })
  // the picked section's outline, in the stage's coordinates
  const pick = (() => {
    if (!selected) return null
    const page = model.pages.find(p => p.id === selected.page), s = page && geo[page.id]?.slots[selected.key]
    if (!page || !s) return null
    const [x, y, w, h] = s.box
    return { left: cam.x + (frameX(page) + x) * cam.k, top: cam.y + (LABEL + y) * cam.k, width: w * cam.k, height: h * cam.k }
  })()

  // the wheel scrolls; ctrl/⌘ + wheel zooms at the pointer (React's onWheel is passive, so it is added here)
  const off = useRef(() => {})
  off.current = () => { if (follow) onFollow?.(false) }
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      moved.current = true
      off.current()
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
        setCam(c => {
          const k = Math.min(MAX_K, Math.max(MIN_K, c.k * Math.exp(-e.deltaY * 0.01)))
          return { x: px - (px - c.x) * k / c.k, y: py - (py - c.y) * k / c.k, k }
        })
      } else setCam(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    s.addEventListener('wheel', wheel, { passive: false })
    return () => s.removeEventListener('wheel', wheel)
  }, [])

  // ⇧1 fits every page (Figma's key), never inside a field
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

  const pageLayers = useMemo(() => Object.fromEntries(model.pages.map(p => [p.id, layersOf(model, p.id)])), [model])

  // The board's host (src/board/host.ts): it holds the pages and carries their messages. This one is slice 1's,
  // every page a live frame; the tier manager's takes its place, and these calls stay as they are.
  const host = useMemo(() => iframeHost(), [])
  const placed = model.pages.map((p, i) => `${p.id}:${frameX(p)}:${heights[i]}`).join('|')
  useEffect(() => {
    host.place(model.pages.map((p, i) => ({ id: p.id, kind: 'page', rect: { x: frameX(p), y: LABEL, w: FRAME_W, h: heights[i] } })))
  // when a page is added, moved or grows
  }, [host, placed])
  // a page an agent is writing should be live (a section on every page asks for the first)
  const agentPages = [...new Set(model.agents.flatMap(a => {
    const l = a.layer ? model.layers[a.layer] : null
    return l ? [l.page === '*' ? model.pages[0]?.id : l.page].filter((x): x is string => !!x) : []
  }))].sort().join('|')
  // the page the person picked a section on should be live too (a tier manager shows it for real, not as a photo)
  const pickedPage = selected?.page ?? null
  useEffect(() => {
    if (!pickedPage) return
    host.requestLive(pickedPage, 'selected')
    return () => host.releaseLive(pickedPage, 'selected')
  }, [host, pickedPage])
  useEffect(() => {
    const ids = agentPages ? agentPages.split('|') : []
    for (const id of ids) host.requestLive(id, 'agent')
    return () => { for (const id of ids) host.releaseLive(id, 'agent') }
  }, [host, agentPages])

  return (
    <BoardHostContext value={host}>
    <div ref={stage} role="region" aria-label="Canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => onFollow?.(true)}
      className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden bg-void outline-none [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px] ${panning ? 'cursor-grabbing' : 'cursor-default'}`}>
      <div ref={world} className="absolute top-0 left-0 origin-top-left" style={{ width: worldW }}>
        {model.pages.map(p => (
          <div key={p.id} className="absolute top-0" style={{ left: frameX(p), width: FRAME_W }}>
            <div className="flex h-7 items-baseline gap-3 truncate font-label text-[18px] font-semibold uppercase tracking-[.08em] text-muted">
              <span className="text-text">Page {p.index + 1} · {p.title}</span><small className="font-monospace normal-case">/{p.id}</small>
            </div>
            <PageFrame page={p} layers={pageLayers[p.id]} agents={model.agents} theme={model.theme} onGeo={onGeo} scanning={model.reviewing.includes(p.id)} />
          </div>
        ))}
      </div>
      {pick && pickExtra && <div data-ui className="absolute z-20 flex justify-end" style={{ left: Math.max(8, pick.left + pick.width - 328), top: Math.max(8, pick.top + 8), width: 320 }}>{pickExtra}</div>}
      <CrewCursors model={model} cam={shown} stage={stage} target={a => target(model, geo, a)} box={k => sectionBox(model, geo, k)} spot={(p, n) => reviewSpot(model, geo, p, n)} />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {pick && <div data-picked className="absolute border-[1.5px] border-text" style={pick} />}
        {flags.map(f => (
          <span key={f.key} className="deck-flag absolute flex max-w-64 -translate-y-full items-center gap-1 truncate rounded-t-[6px] bg-hot px-1.5 py-0.5 font-label text-[11px] font-semibold uppercase tracking-[.06em] text-paper" style={{ left: f.left, top: f.top }}>
            Critic · {f.problem}
          </span>
        ))}
      </div>
    </div>
    </BoardHostContext>
  )
}
