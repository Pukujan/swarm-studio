// The top bar: the logo goes home, the breadcrumb says where the person is (RULES.md rule 7), the screen's one
// primary action, and ☰ holds the settings (rule 5). A screen gives its own crumb and primary (useTopBar); without
// one, the crumb is the screen's name.
import { Button as AriaButton } from 'react-aria-components'
import { Button } from '../primitives/Button'
import { Menu, MenuItem } from '../primitives/Menu'
import { useNav } from '../nav/NavProvider'
import { SCREEN_NAMES } from '../screens/names'
import { useTopBarParts, type Crumb } from './topBarSlots'

// the same key the current Studio's ☰ → Light / Dark writes (web/index.html reads it before the first paint)
function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('swarm-theme', theme) } catch { /* private window: this page only */ }
}

function Breadcrumb({ parts }: { parts: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted">
      {parts.map((p, i) => {
        const last = i === parts.length - 1
        return [
          i > 0 && <span key={`s${i}`} aria-hidden>›</span>,
          last ? <b key={i} aria-current="page" className="truncate px-1.5 font-semibold text-text">{p.label}</b>
            : <AriaButton key={i} onPress={p.onPress} className="min-h-10 max-w-[30vw] cursor-pointer truncate rounded-[8px] px-1.5 outline-none data-[hovered]:bg-surface-2 data-[hovered]:text-text data-[focus-visible]:outline-2 data-[focus-visible]:outline-frame-hi">{p.label}</AriaButton>
        ]
      })}
    </nav>
  )
}

export function TopBar() {
  const { view, go } = useNav()
  const { crumb, primary } = useTopBarParts()
  return (
    <header className="flex h-14 items-center gap-2 border-b border-edge px-3">
      <Button role="ghost" onPress={() => go({ type: 'home' })} className="font-display text-xl font-extrabold">Swarm</Button>
      <Breadcrumb parts={crumb ?? (view.room === 'home' ? [] : [{ label: SCREEN_NAMES[view.room] }])} />
      <span aria-label="Next Studio" className="ml-auto rounded-full border border-line-2 px-2 py-0.5 font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">Next</span>
      {primary}
      <Menu label="☰" name="Settings" onAction={key => setTheme(key === 'light' ? 'light' : 'dark')}>
        <MenuItem id="light">Light</MenuItem>
        <MenuItem id="dark">Dark</MenuItem>
      </Menu>
    </header>
  )
}
