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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || view.room === 'home') return
      go(can({ type: 'back' }) ? { type: 'back' } : { type: 'home' })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
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
