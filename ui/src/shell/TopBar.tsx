// The top bar: the logo goes home, the breadcrumb says where the person is (RULES.md rule 7), and ☰ holds the
// settings (rule 5). It reads the machine's view and nothing else.
import { Button } from '../primitives/Button'
import { Menu, MenuItem } from '../primitives/Menu'
import { useNav } from '../nav/NavProvider'
import { CRUMB_NAMES, SCREEN_NAMES } from '../screens'
import { useSheets } from '../screens/setup/Sheets'
import { useCrumb } from './crumb'
import { useTrailShown } from './Trail'

// the same key the current Studio's ☰ → Light / Dark writes (web/index.html reads it before the first paint)
function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('swarm-theme', theme) } catch { /* private window: this page only */ }
}

export function TopBar() {
  const { view, go } = useNav()
  const { name, action, menu, onName } = useTrailShown()
  const sheets = useSheets()
  // a screen that draws a whole crumb of its own (the Overview's Projects › name ▾) stands in for the trail
  const crumb = useCrumb()
  return (
    <header className="flex h-14 items-center gap-2 border-b border-edge px-3">
      <Button role="ghost" onPress={() => go({ type: 'home' })} className="font-display text-xl font-extrabold">Swarm</Button>
      {/* a screen that names its build gets the whole trail, Home › Projects › build › room (Home is the Feed,
          which has no address here yet, so it is the trail's start, not a link) */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-hidden font-monospace text-sm text-muted">
        {crumb ?? <>
        {view.room !== 'home' && name && <>
          <span className="flex-none">Home</span><span aria-hidden>›</span>
          <button type="button" onClick={() => go({ type: 'home' })} className="flex-none cursor-pointer rounded-[6px] px-1 hover:text-text">Projects</button><span aria-hidden>›</span>
          <span className="flex min-w-0 items-center gap-1">{onName
            ? <button type="button" onClick={onName} className="min-w-0 cursor-pointer truncate rounded-[6px] px-1 font-semibold text-text hover:bg-panel-2">{name}</button>
            : <b className="min-w-0 truncate font-semibold text-text">{name}</b>}{menu}</span>
        </>}
        {view.room !== 'home' && <span aria-hidden>›</span>}
        {view.room !== 'home' && <span aria-current="page" className="flex-none text-text">{name ? CRUMB_NAMES[view.room] : SCREEN_NAMES[view.room]}</span>}
        </>}
      </nav>
      {action && <span className="ml-auto flex-none">{action}</span>}
      <span aria-label="Next Studio" className={`${action ? '' : 'ml-auto '}flex-none rounded-full border border-line-2 px-2 py-0.5 font-label text-xs font-semibold uppercase tracking-[.07em] text-muted max-[760px]:hidden`}>Next</span>
      <Menu label="☰" name="Settings" onAction={key => (key === 'setup' || key === 'settings' ? sheets.open(key) : setTheme(key === 'light' ? 'light' : 'dark'))}>
        <MenuItem id="setup">Setup{sheets.warn ? ' ⚠' : ''}</MenuItem>
        <MenuItem id="settings">Settings</MenuItem>
        <MenuItem id="light">Light</MenuItem>
        <MenuItem id="dark">Dark</MenuItem>
      </Menu>
    </header>
  )
}
