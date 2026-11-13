// The top bar: the logo goes home, the breadcrumb says where the person is (RULES.md rule 7: Home › Projects ›
// build › room), the screen's one primary button (rule 27), and ☰ holds the settings (rule 5). It reads the
// machine's view, and what the screen on show put in its slots (Slots.tsx), nothing else.
import { Button } from '../primitives/Button'
import { Menu, MenuItem } from '../primitives/Menu'
import { useNav } from '../nav/NavProvider'
import { CRUMB_NAMES } from '../screens'
import { useTopBarParts } from './Slots'

// the same key the current Studio's ☰ → Light / Dark writes (web/index.html reads it before the first paint)
function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('swarm-theme', theme) } catch { /* private window: this page only */ }
}

const Sep = () => <span aria-hidden>›</span>

export function TopBar() {
  const { view, go } = useNav()
  const { build, menu, primary } = useTopBarParts()
  const home = view.room === 'home'
  return (
    <header className="flex h-14 items-center gap-2 border-b border-edge px-3">
      <Button role="ghost" onPress={() => go({ type: 'home' })} className="font-display text-xl font-extrabold">Swarm</Button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 overflow-hidden font-monospace text-sm text-muted max-md:gap-1 max-md:text-xs">
        <span>Home</span>
        <Sep />
        {home ? <span aria-current="page" className="text-text">Projects</span> : <button type="button" onClick={() => go({ type: 'home' })} className="cursor-pointer rounded-[8px] px-1 hover:text-text">Projects</button>}
        {!home && build && <><Sep /><span className="flex min-w-0 items-center gap-1"><b className="truncate font-semibold text-text">{build}</b>{menu}</span></>}
        {!home && <><Sep /><span aria-current="page" className="truncate text-text">{CRUMB_NAMES[view.room]}</span></>}
      </nav>
      <span className="ml-auto" />
      {primary}
      <span aria-label="Next Studio" className="rounded-full border border-line-2 px-2 py-0.5 font-label text-xs font-semibold uppercase tracking-[.07em] text-muted max-md:hidden">Next</span>
      <Menu label="☰" name="Settings" onAction={key => setTheme(key === 'light' ? 'light' : 'dark')}>
        <MenuItem id="light">Light</MenuItem>
        <MenuItem id="dark">Dark</MenuItem>
      </Menu>
    </header>
  )
}
