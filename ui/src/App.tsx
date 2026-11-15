// The next Studio's frame: the top bar and the screen the machine names. Esc goes up one level (RULES.md rule 7):
// back where the machine has a back (a Studio step, the brand sheet), else to Projects.
import { useEffect } from 'react'
import { useNav, useNavMachine } from './nav/NavProvider'
import { PetProvider } from './pet/Pet'
import { ToastProvider } from './primitives/Toast'
import { NotMovedYet } from './screens/NotMovedYet'
import { classicHref } from './shell/classic'
import { SCREENS } from './screens'
import { TopBar } from './shell/TopBar'
import { TrailProvider } from './shell/Trail'

export function App() {
  const { view, go, can } = useNav()
  const nav = useNavMachine()
  useEffect(() => {
    // Esc in a dialog, a menu or a field is theirs: it closes them, it does not also leave the screen. Whether one
    // was open is seen in the capture phase (React Aria has closed it by the time the key bubbles up); the move is
    // made as it bubbles, after a screen has had it (a board clearing its selection prevents the default)
    const theirs = new WeakSet<Event>()
    const mark = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.querySelector('[role="dialog"], [role="menu"]')) theirs.add(e) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || theirs.has(e) || view.room === 'home') return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      go(can({ type: 'back' }) ? { type: 'back' } : { type: 'home' })
    }
    addEventListener('keydown', mark, true)
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', mark, true); removeEventListener('keydown', onKey) }
  }, [view.room, go, can])
  // a screen the next UI has not moved (the Game room, the Film studio, a new project's deck) opens in the classic
  // Studio at the same address, rather than a stand-in (decision 0024)
  const moved = !!SCREENS[view.room]
  useEffect(() => { if (!moved) location.replace(classicHref()) }, [moved, view.room])
  const Screen = SCREENS[view.room] ?? NotMovedYet
  return (
    <PetProvider nav={nav}>
      <TrailProvider>
        <ToastProvider>
          <div className="flex min-h-dvh flex-col bg-bg text-text">
            {/* Projects fills the window, as the current Studio's does (web/home.css .home): its sidebar has the logo, and
                its account menu holds Setup and Settings, so it has no top bar */}
            {view.room !== 'home' && <TopBar />}
            <main className="flex min-h-0 flex-1 flex-col"><Screen /></main>
          </div>
        </ToastProvider>
      </TrailProvider>
    </PetProvider>
  )
}
