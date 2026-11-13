// The next Studio's frame: the top bar and the screen the machine names. Esc goes up one level (RULES.md rule 7):
// back where the machine has a back (a Studio step, the brand sheet), else to Projects.
// The top bar takes the screen's crumb and primary (shell/topBarSlots.tsx); Hermia's cursor follows the machine
// (pet/usePet.ts).
import { useEffect } from 'react'
import { useNav, useNavObject } from './nav/NavProvider'
import { usePet } from './pet/usePet'
import { NotMovedYet } from './screens/NotMovedYet'
import { MOVED, SCREENS } from './screens'
import { TopBar } from './shell/TopBar'
import { TopBarSlots } from './shell/topBarSlots'

export function App({ pet = true }: { pet?: boolean }) {
  const { view, go, can } = useNav()
  const running = useNavObject()
  usePet(pet ? running : null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || view.room === 'home') return
      go(can({ type: 'back' }) ? { type: 'back' } : { type: 'home' })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [view.room, go, can])
  const Screen = (MOVED(view) && SCREENS[view.room]) || NotMovedYet
  return (
    <TopBarSlots>
      <div className="min-h-dvh bg-bg text-text">
        <TopBar />
        <main><Screen /></main>
      </div>
    </TopBarSlots>
  )
}
