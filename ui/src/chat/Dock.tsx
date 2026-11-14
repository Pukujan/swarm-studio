// The chat's dock (decision 0015): always along the bottom, at every width. It sits low by default; a handle drags it
// to one of three heights, and it stays where the person left it: a new turn, a question or a drop never moves it.
//   low     the message box and the last line
//   middle  about half the screen
//   high    the whole history, up to the top bar
// The height is kept for this person (localStorage), and the page's --chat-h says how much of the bottom it takes,
// so a screen can keep its own controls clear of it.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export type DockLevel = 0 | 1 | 2
export const LEVELS = ['Low', 'Middle', 'High'] as const
const KEY = 'swarm.chatHeight'
const LOW = 216
const TOP = 56 + 8

const read = (): DockLevel => { try { const n = Number(localStorage.getItem(KEY)); return n === 1 || n === 2 ? n : 0 } catch { return 0 } }
const heightOf = (level: DockLevel, h: number) => (level === 0 ? LOW : level === 1 ? Math.max(LOW, Math.round(h * 0.46)) : Math.max(LOW, h - TOP))

export function useDock() {
  const [level, setLevelState] = useState<DockLevel>(read)
  const [vh, setVh] = useState(() => (typeof innerHeight === 'number' ? innerHeight : 800))
  // while the handle is dragged: the height under the pointer; on release it snaps to the nearest level
  const [drag, setDrag] = useState<number | null>(null)
  useEffect(() => { const on = () => setVh(innerHeight); addEventListener('resize', on); return () => removeEventListener('resize', on) }, [])
  const setLevel = useCallback((l: DockLevel) => {
    setLevelState(l)
    try { localStorage.setItem(KEY, String(l)) } catch { /* private window: this page only */ }
  }, [])
  const px = drag ?? heightOf(level, vh)
  useEffect(() => {
    document.documentElement.style.setProperty('--chat-h', `${heightOf(level, vh)}px`)
    return () => { document.documentElement.style.removeProperty('--chat-h') }
  }, [level, vh])
  const nearest = (y: number): DockLevel => {
    const d = ([0, 1, 2] as DockLevel[]).map(l => Math.abs(heightOf(l, vh) - y))
    return d.indexOf(Math.min(...d)) as DockLevel
  }
  return { level, setLevel, px, drag, setDrag, nearest, vh }
}

// The handle: a window splitter (WAI-ARIA), so it is a focusable separator with three values. Drag it, or Arrow
// Up / Down (Home, End) to move a level.
export function DockHandle({ dock }: { dock: ReturnType<typeof useDock> }) {
  const { level, setLevel, setDrag, nearest, vh } = dock
  const moved = useRef(false)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    moved.current = true
    setDrag(Math.min(vh - TOP, Math.max(LOW, vh - e.clientY)))
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    // a press with no drag goes one level up (from high, back to low)
    setLevel(moved.current ? nearest(vh - e.clientY) : ((level + 1) % 3) as DockLevel)
    setDrag(null)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = e.key === 'ArrowUp' ? Math.min(2, level + 1) : e.key === 'ArrowDown' ? Math.max(0, level - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : null
    if (to == null) return
    e.preventDefault()
    setLevel(to as DockLevel)
  }
  return (
    <div role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Chat height" aria-valuemin={0} aria-valuemax={2} aria-valuenow={level} aria-valuetext={LEVELS[level]}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onKeyDown={key}
      className="group absolute top-0 left-1/2 z-10 flex h-5 w-24 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-frame-hi">
      <span aria-hidden className="h-1 w-10 rounded-full bg-line-2 group-hover:bg-muted" />
    </div>
  )
}
