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

export function TopBar() {
  const { view, go } = useNav()
  const { name, action } = useTrailShown()
  return (
    <header className="flex h-14 items-center gap-2 border-b border-edge px-3">
      <Button role="ghost" onPress={() => go({ type: 'home' })} className="font-display text-xl font-extrabold">Swarm</Button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-monospace text-sm text-muted">
        {view.room !== 'home' && name && <><span aria-hidden className="max-[760px]:hidden">›</span><button type="button" onClick={() => go({ type: 'home' })} className="cursor-pointer rounded-[6px] px-1 hover:text-text max-[760px]:hidden">Projects</button></>}
        {view.room !== 'home' && name && <><span aria-hidden>›</span><b className="truncate font-semibold text-text">{name}</b></>}
        {view.room !== 'home' && <span aria-hidden>›</span>}
        {view.room !== 'home' && <span aria-current="page" className="truncate text-text">{SCREEN_NAMES[view.room]}</span>}
      </nav>
      {action && <span className="ml-auto">{action}</span>}
      <span aria-label="Next Studio" className={`${action ? '' : 'ml-auto '}rounded-full border border-line-2 px-2 py-0.5 font-label text-xs font-semibold uppercase tracking-[.07em] text-muted`}>Next</span>
      <Menu label="☰" name="Settings" onAction={key => setTheme(key === 'light' ? 'light' : 'dark')}>
        <MenuItem id="light">Light</MenuItem>
        <MenuItem id="dark">Dark</MenuItem>
      </Menu>
    </header>
  )
}
