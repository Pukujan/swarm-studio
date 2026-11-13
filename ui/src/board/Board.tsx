// The board shell the Plan board and the brand sheet share (web/board.js, ported): the dotted stage that pans and
// zooms, the world of sections and artboards on it, the inspector on the right only while something is selected,
// Esc and a click on the empty stage to clear the selection, and one toast spot. Each board keeps its own cards, its
// own selection and its own data; this only moves the camera and reports gestures back.
//
//   <Board ref label fit selected onClear inspector toast>{sections}</Board>
//   ref.current.frameAll(animate) / .focus(target, animate)   target: a section's name or an artboard's key
//   <Section name label wide>{artboards}</Section>   <Artboard id selected onSelect className>…</Artboard>
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref, type KeyboardEvent, type MouseEvent } from 'react'
import { Button } from '../primitives/Button'
import { Icon } from '../primitives/Icon'
import './board.css'

export interface BoardHandle {
  // false when the board has no size yet (call it again once it has)
  frameAll(animate?: boolean): boolean
  focus(target: string, animate?: boolean): boolean
}

const INSP = 272

export function Board({ ref, label, fit = [0.3, 1.25], selected, onClear, inspector, toast, children }: {
  ref?: Ref<BoardHandle>, label: string, fit?: [number, number], selected: boolean, onClear: () => void,
  inspector?: ReactNode, toast?: string | null, children: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null)
  const cam = useRef({ x: 0, y: 0, k: 1 })
  const insp = !!inspector
  const apply = useCallback((animate = false) => {
    const w = world.current
    if (!w) return
    w.style.transition = animate ? 'transform .3s var(--ease)' : ''
    w.style.transform = `translate(${cam.current.x}px, ${cam.current.y}px) scale(${cam.current.k})`
  }, [])

  useImperativeHandle(ref, () => ({
    frameAll(animate = true) {
      const s = stage.current, w = world.current
      if (!s || !w) return false
      const w0 = s.clientWidth - (insp ? INSP : 0), h0 = s.clientHeight - 40
      const ww = w.scrollWidth, hh = w.scrollHeight
      if (!ww || !hh || w0 <= 0) return false
      const k = Math.min(fit[1], Math.max(fit[0], Math.min(w0 / ww, h0 / hh)))
      cam.current = { k, x: Math.max(0, (w0 - ww * k) / 2), y: Math.max(0, Math.min(40, (h0 - hh * k) / 2)) }
      apply(animate)
      return true
    },
    // a section by name, an artboard by key: it fits with a margin, never zoomed past 1
    focus(target, animate = true) {
      const s = stage.current, w = world.current
      if (!s || !w) return false
      const el = w.querySelector(`[data-sec="${CSS.escape(target)}"]`) ?? w.querySelector(`[data-key="${CSS.escape(target)}"]`)
      if (!el) return false
      const wr = w.getBoundingClientRect(), r = el.getBoundingClientRect(), k0 = cam.current.k || 1
      const x = (r.left - wr.left) / k0, y = (r.top - wr.top) / k0, ew = r.width / k0, eh = r.height / k0
      const w0 = s.clientWidth - (insp ? INSP : 0), h0 = s.clientHeight
      if (!ew || !eh || w0 <= 0) return false
      const k = Math.min(1, Math.max(fit[0], Math.min((w0 - 80) / ew, (h0 - 80) / eh)))
      cam.current = { k, x: (w0 - ew * k) / 2 - x * k, y: 40 - y * k }
      apply(animate)
      return true
    }
  }), [apply, fit, insp])

  // drag the empty stage to pan; a click on it (no drag) clears the selection
  const drag = useRef<{ x: number, y: number, cx: number, cy: number, moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-key], aside')) return
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false }
    stage.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.moved) { cam.current.x = d.cx + dx; cam.current.y = d.cy + dy; apply(); setPanning(true) }
  }
  const up = () => { if (drag.current && !drag.current.moved && selected) onClear(); drag.current = null; setPanning(false) }

  // the wheel scrolls; ctrl/⌘ + wheel zooms at the pointer (React's onWheel is passive, so it is added here)
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = cam.current
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
        const k = Math.min(3, Math.max(0.2, c.k * Math.exp(-e.deltaY * 0.01)))
        cam.current = { x: px - (px - c.x) * k / c.k, y: py - (py - c.y) * k / c.k, k }
      } else cam.current = { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }
      apply()
    }
    s.addEventListener('wheel', wheel, { passive: false })
    return () => s.removeEventListener('wheel', wheel)
  }, [apply])

  // Esc clears the selection first (before the frame's Esc, which goes up a level), never inside a field
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !selected) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      e.preventDefault()
      onClear()
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [selected, onClear])

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-w-0 overflow-hidden bg-void text-text">
      <div ref={stage} tabIndex={-1} aria-label={label} role="region" onPointerDown={down} onPointerMove={move} onPointerUp={up}
        className={`relative min-w-0 flex-1 touch-none overflow-hidden outline-none [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px] ${panning ? 'cursor-grabbing' : 'cursor-default'}`}>
        <div ref={world} className="absolute top-0 left-0 flex w-max origin-top-left gap-[72px] px-14 pt-12 pb-36">{children}</div>
      </div>
      {inspector && (
        <aside aria-label="Inspector" className="absolute inset-y-0 right-0 z-20 flex w-[272px] flex-col gap-3 overflow-y-auto border-l border-line bg-void p-4 max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:max-h-[70vh] max-md:w-auto max-md:border-t max-md:border-l-0">
          {inspector}
        </aside>
      )}
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-[10px] border border-edge bg-surface-2 px-4 py-2 font-monospace text-sm text-text">{toast}</div>}
    </div>
  )
}

// a column of sections
export function Column({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-16">{children}</div>
}

// a named section of artboards; `name` is what focus() finds it by
export function Section({ name, label, className, children }: { name?: string, label: string, className?: string, children: ReactNode }) {
  return (
    <section data-sec={name} className="relative">
      <h2 className="mb-3 font-label text-[13px] font-semibold uppercase tracking-[.14em] text-muted">{label}</h2>
      <div className={`flex flex-wrap items-start gap-[22px] ${className ?? 'max-w-[700px]'}`}>{children}</div>
    </section>
  )
}

// one artboard: selectable by click, Enter or Space; a selection frame with four handles while selected. A click
// on a selected artboard goes to onPress first (a sheet's cell pick); it returns true when it took the click.
export function Artboard({ id, selected, onSelect, onPress, className, label, children }: {
  id: string, selected: boolean, onSelect: (id: string) => void, onPress?: (e: MouseEvent<HTMLDivElement>) => boolean,
  className?: string, label?: string, children?: ReactNode
}) {
  const click = (e: MouseEvent<HTMLDivElement>) => { if (selected && onPress?.(e)) return; onSelect(id) }
  const key = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) } }
  return (
    <div data-key={id} role="button" tabIndex={0} aria-label={label} aria-pressed={selected} onClick={click} onKeyDown={key}
      className={`relative flex-none cursor-pointer rounded-[4px] border border-line bg-surface-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-text ${className ?? ''}`}>
      {children}
      {selected && <SelectionFrame />}
    </div>
  )
}

function SelectionFrame() {
  const h = 'absolute size-2 border-[1.5px] border-text bg-void'
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-[5px] z-[5] border-[1.5px] border-text">
      <i className={`${h} -top-[5px] -left-[5px]`} /><i className={`${h} -top-[5px] -right-[5px]`} />
      <i className={`${h} -bottom-[5px] -left-[5px]`} /><i className={`${h} -right-[5px] -bottom-[5px]`} />
    </div>
  )
}

// a crew cursor at work on an artboard: the arrow and the name (web/icons.js cursor())
export function CrewCursor({ name, className }: { name: string, className?: string }) {
  return (
    <span aria-hidden className={`cur pointer-events-none absolute z-[6] flex items-start gap-1 ${className ?? 'top-[58%] left-[62%]'}`} data-n={name}>
      <svg viewBox="0 0 20 20" className="size-4"><path d="M2 2 L17 9 L10 11 L7 18 Z" fill="#f4f4f5" stroke="#0b0b0c" strokeWidth="1.2" /></svg>
      <span className="mt-3 rounded-full bg-text px-1.5 py-px font-label text-[10px] font-semibold uppercase tracking-[.06em] text-void">{name}</span>
    </span>
  )
}

// the inspector's head: the selected thing's name and ×
export function InspectorHead({ name, onClose }: { name: string, onClose: () => void }) {
  return (
    <h3 className="flex items-center justify-between gap-2 font-label text-sm font-semibold uppercase tracking-[.1em]">
      <span className="truncate">{name}</span>
      <Button role="ghost" aria-label="Close" onPress={onClose}><Icon name="x" size={16} /></Button>
    </h3>
  )
}
