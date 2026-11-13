// The next Studio's frame: the top bar and the screen the machine names. Esc goes up one level (RULES.md rule 7):
// back where the machine has a back (a Studio step, the brand sheet), else to Projects.
import { useEffect } from 'react'
import { useNav, useNavMachine } from './nav/NavProvider'
import { PetProvider } from './pet/Pet'
import { NotMovedYet } from './screens/NotMovedYet'
import { SCREENS } from './screens'
import { TopBarSlots } from './shell/Slots'
import { TopBar } from './shell/TopBar'

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
  const Screen = SCREENS[view.room] ?? NotMovedYet
  return (
    <PetProvider nav={nav}>
      <TopBarSlots>
        <div className="min-h-dvh bg-bg text-text">
          <TopBar />
          <main><Screen /></main>
        </div>
      </TopBarSlots>
    </PetProvider>
  )
}
