// The top bar: the logo goes home, the breadcrumb says where the person is (RULES.md rule 7), and ☰ holds the
// settings (rule 5). It reads the machine's view and nothing else.
import { Button } from '../primitives/Button'
import { Menu, MenuItem } from '../primitives/Menu'
import { useNav } from '../nav/NavProvider'
import { SCREEN_NAMES } from '../screens'
import { useTrailShown } from './Trail'

// the same key the current Studio's ☰ → Light / Dark writes (web/index.html reads it before the first paint)
function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('swarm-theme', theme) } catch { /* private window: this page only */ }
}

// a room's name in the trail, where it reads shorter than the screen's own name (openspec/specs/studio)
const CRUMB_ROOM: Partial<Record<keyof typeof SCREEN_NAMES, string>> = { studio: 'Studio' }

export function TopBar() {
  const { view, go } = useNav()
  const { name, action } = useTrailShown()
  return (
    <header className="flex h-14 items-center gap-2 border-b border-edge px-3">
      <Button role="ghost" onPress={() => go({ type: 'home' })} className="font-display text-xl font-extrabold">Swarm</Button>
      {/* a screen that names its build gets the whole trail, Home › Projects › build › room (Home is the Feed,
          which has no address here yet, so it is the trail's start, not a link) */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-hidden font-monospace text-sm text-muted">
        {view.room !== 'home' && name && <>
          <span className="flex-none">Home</span><span aria-hidden>›</span>
          <button type="button" onClick={() => go({ type: 'home' })} className="flex-none cursor-pointer rounded-[6px] px-1 hover:text-text">Projects</button><span aria-hidden>›</span>
          <b className="min-w-0 truncate font-semibold text-text">{name}</b>
        </>}
        {view.room !== 'home' && <span aria-hidden>›</span>}
        {view.room !== 'home' && <span aria-current="page" className="flex-none text-text">{name ? CRUMB_ROOM[view.room] ?? SCREEN_NAMES[view.room] : SCREEN_NAMES[view.room]}</span>}
      </nav>
      {action && <span className="ml-auto flex-none">{action}</span>}
      <span aria-label="Next Studio" className={`${action ? '' : 'ml-auto '}flex-none rounded-full border border-line-2 px-2 py-0.5 font-label text-xs font-semibold uppercase tracking-[.07em] text-muted max-[760px]:hidden`}>Next</span>
      <Menu label="☰" name="Settings" onAction={key => setTheme(key === 'light' ? 'light' : 'dark')}>
        <MenuItem id="light">Light</MenuItem>
        <MenuItem id="dark">Dark</MenuItem>
      </Menu>
    </header>
  )
}
