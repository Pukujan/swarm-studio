// The Design deck's canvas: the build's pages side by side, the crew's cursors on the sections they are writing,
// and the camera. Drag the empty canvas to pan, the wheel scrolls, ctrl/⌘ + wheel zooms at the pointer, ⇧1 fits
// every page (PATTERNS.md, "The Design deck follows Figma"). While Follow is on the camera goes to the agent at work;
// a drag or the wheel turns it off and a double-click turns it back on (openspec/specs/design-deck/spec.md). The
// pages only show here: they take no pointer.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { BoardHostContext } from '../../board/host'
import { iframeHost } from '../../board/iframeHost'
import { crew } from './crew'
import { FRAME_W, GAP, PageFrame, frameX, type FrameGeo } from './PageFrame'
import { layersOf, type DeckAgent, type DeckModel } from './model'

export interface StageHandle {
  fit(): void
  focusPage(id: string): void
}

type Cam = { x: number, y: number, k: number }
const LABEL = 28
const MIN_K = 0.04, MAX_K = 2

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

// the agent the camera follows: one writing, else one just starting
const followed = (m: DeckModel) => m.agents.find(a => a.layer && m.layers[a.layer]?.status === 'streaming') ?? m.agents.find(a => a.layer)

// a section the person picked, on the page it was picked on (the nav and footer are on every page)
export interface Picked { key: string, page: string }

export function DeckStage({ ref, model, onZoom, follow = false, onFollow, selected = null, onSelect }: {
  ref?: Ref<StageHandle>, model: DeckModel, onZoom?: (k: number) => void, follow?: boolean, onFollow?: (on: boolean) => void,
  selected?: Picked | null, onSelect?: (p: Picked | null) => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState<Cam>({ x: 40, y: 40, k: 0.16 })
  const [geo, setGeo] = useState<Record<string, FrameGeo>>({})
  const [panning, setPanning] = useState(false)
  const onGeo = useCallback((page: string, g: FrameGeo) => setGeo(all => ({ ...all, [page]: g })), [])
  useEffect(() => { onZoom?.(cam.k) }, [cam.k, onZoom])

  const heights = model.pages.map(p => Math.min(36000, Math.max(700, geo[p.id]?.height || 0)))
  const worldW = model.pages.length ? model.pages.length * FRAME_W + (model.pages.length - 1) * GAP : FRAME_W
  const worldH = LABEL + Math.max(700, ...heights)

  // fit a box of the world into the stage, never past 1:1
  const frame = useCallback((x: number, w: number, h: number) => {
    const s = stage.current
    if (!s || !s.clientWidth) return
    const vw = s.clientWidth - 48, vh = s.clientHeight - 48
    const k = Math.min(1, Math.max(MIN_K, Math.min(vw / w, vh / Math.min(h, vh * 6))))
    setCam({ k, x: 24 + Math.max(0, (vw - w * k) / 2) - x * k, y: 24 })
  }, [])
  const fit = useCallback(() => frame(0, worldW, worldH), [frame, worldW, worldH])
  const focusPage = useCallback((id: string) => {
    const p = model.pages.find(x => x.id === id)
    if (p) frame(frameX(p), FRAME_W, LABEL + 900)
  }, [frame, model.pages])
  useImperativeHandle(ref, () => ({ fit, focusPage }), [fit, focusPage])

  // Follow: the page the agent is writing, at a width that reads, its cursor a third of the way down
  useEffect(() => {
    const s = stage.current, a = follow ? followed(model) : undefined
    const t = a && target(model, geo, a)
    if (!s || !t || !s.clientWidth) return
    const vw = s.clientWidth, vh = s.clientHeight
    const k = Math.min(1, Math.max(MIN_K, (vw - 48) / FRAME_W))
    const next = { k, x: Math.round(vw / 2 - t.x * k), y: Math.round(vh / 3 - t.y * k) }
    setCam(c => (Math.abs(c.x - next.x) + Math.abs(c.y - next.y) + Math.abs(c.k - next.k) * 1000 < 2 ? c : next))
  }, [follow, model, geo])

  // the first look fits every page; a page added later is fitted in until the person moves the camera
  const moved = useRef(false)
  useEffect(() => { if (!moved.current) fit() }, [fit, model.pages.length])
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const o = new ResizeObserver(() => { if (!moved.current) fit() })
    o.observe(s)
    return () => o.disconnect()
  }, [fit])

  // drag the empty canvas to pan
  const drag = useRef<{ x: number, y: number, cx: number, cy: number } | null>(null)
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return
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
  useEffect(() => {
    const ids = agentPages ? agentPages.split('|') : []
    for (const id of ids) host.requestLive(id, 'agent')
    return () => { for (const id of ids) host.releaseLive(id, 'agent') }
  }, [host, agentPages])
  const working = model.agents.filter(a => a.layer)

  return (
    <BoardHostContext value={host}>
    <div ref={stage} role="region" aria-label="Canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => onFollow?.(true)}
      className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden bg-void outline-none [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px] ${panning ? 'cursor-grabbing' : 'cursor-default'}`}>
      <div className={`absolute top-0 left-0 origin-top-left ${follow ? 'motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out' : ''}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, width: worldW }}>
        {model.pages.map(p => (
          <div key={p.id} className="absolute top-0" style={{ left: frameX(p), width: FRAME_W }}>
            <div className="flex h-7 items-baseline gap-3 truncate font-label text-[18px] font-semibold uppercase tracking-[.08em] text-muted">
              <span className="text-text">Page {p.index + 1} · {p.title}</span><small className="font-monospace normal-case">/{p.id}</small>
            </div>
            <PageFrame page={p} layers={pageLayers[p.id]} agents={model.agents} theme={model.theme} onGeo={onGeo} />
          </div>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {pick && <div data-picked className="absolute border-[1.5px] border-text" style={pick} />}
        {working.map(a => {
          const t = target(model, geo, a)
          if (!t) return null
          const c = crew().color(a.name)
          return (
            <div key={a.id} data-agent={a.name} className="absolute top-0 left-0 motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
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
