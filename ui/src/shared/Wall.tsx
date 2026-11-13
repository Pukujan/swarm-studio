// A wall of four windows (spec 44; the game wall's pattern, web/canvas/dock.js codeWall and web/canvas.css .cw-*):
// two by two, and a click (or Enter on a window's name) enlarges one to about three quarters of the wall with the
// other three stacked on its right; a second click or Esc puts it back. The arrow keys move between the windows'
// names. On a phone (≤ 760 px) one window shows at a time, with four dots to switch (the web wall stacks them).
// Shared: the app build wall uses it now, the game room's port will.
//
// Each window says whether it is busy (its content is on its way: aria-busy, and the screen draws the skeleton) and
// may carry a line in a bubble over it (a crew member answering for that window).
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface WallWindow {
  id: string
  title: string
  busy?: boolean
  // a crew member's line over this window (who answered, and what), or none
  say?: { who: string, text: string } | null
  // what sits at the right of the window's name (a device switch, a state chip)
  tools?: ReactNode
  content: ReactNode
}

export function Wall({ label, windows, start = 0 }: { label: string, windows: WallWindow[], start?: number }) {
  const [big, setBig] = useState<number | null>(null)
  const [one, setOne] = useState(start)
  const names = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => { setOne(start) }, [start])

  // Esc puts an enlarged window back; it is this wall's, so the frame does not also leave the screen
  useEffect(() => {
    if (big == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setBig(null)
      names.current[big]?.focus()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [big])

  const move = (i: number, by: number) => {
    const n = (i + by + windows.length) % windows.length
    names.current[n]?.focus()
    setOne(n)
  }
  const toggle = (i: number) => setBig(b => (b === i ? null : i))

  return (
    <section aria-label={label} data-wall className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className={`grid min-h-0 flex-1 gap-[10px] motion-safe:transition-[grid-template-columns] motion-safe:duration-[250ms] max-[760px]:grid-cols-1 max-[760px]:grid-rows-1 ${big == null ? 'grid-cols-2 grid-rows-2' : 'grid-cols-[minmax(0,3fr)_minmax(0,1fr)] grid-rows-3'}`}>
        {windows.map((w, i) => {
          const isBig = big === i
          const place = big == null ? '' : isBig ? 'col-start-1 row-start-1 row-span-3' : 'col-start-2'
          return (
            <article key={w.id} data-window={w.id} aria-label={w.title}
              className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[12px] border border-edge bg-deep ${place} ${isBig ? 'border-line-2' : ''} ${one === i ? '' : 'max-[760px]:hidden'}`}>
              <header className="flex min-h-10 items-center gap-2 border-b border-edge px-2">
                <button type="button" ref={el => { names.current[i] = el }} aria-expanded={isBig}
                  onClick={() => toggle(i)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1) }
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1) }
                  }}
                  className="min-h-10 cursor-pointer rounded-[8px] px-2 font-label text-sm font-semibold uppercase tracking-[.07em] text-text outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-frame-hi">
                  {w.title}
                </button>
                <span className="ml-auto flex items-center gap-1">{w.tools}</span>
              </header>
              {/* a click on the window's body enlarges it too; what is inside it (a frame, a file) keeps its own clicks */}
              <div aria-busy={w.busy || undefined} className="relative min-h-0 flex-1 overflow-auto"
                onClick={e => { if (big !== i && e.target === e.currentTarget) toggle(i) }}>
                {w.content}
              </div>
              {w.say && (
                <p role="status" className="absolute right-3 bottom-3 left-3 max-w-[460px] rounded-[4px_12px_12px_12px] border border-line bg-[rgb(var(--deep-rgb)/.94)] px-3 py-2 font-monospace text-xs text-text shadow-[0_4px_14px_rgb(var(--shade-rgb)/.5)]">
                  <b className="mr-1.5 font-semibold">{w.say.who}</b>{w.say.text}
                </p>
              )}
            </article>
          )
        })}
      </div>
      {/* a phone: one window at a time */}
      <nav aria-label={`${label}: windows`} className="hidden justify-center gap-1 max-[760px]:flex">
        {windows.map((w, i) => (
          <button key={w.id} type="button" aria-label={w.title} aria-current={one === i || undefined} onClick={() => setOne(i)}
            className="grid size-10 cursor-pointer place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-frame-hi">
            <i className={`block size-2 rounded-full ${one === i ? 'bg-text' : 'bg-line-2'}`} />
          </button>
        ))}
      </nav>
    </section>
  )
}
