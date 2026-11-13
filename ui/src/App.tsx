// The next Studio's frame: the top bar and the screen the machine names. Esc goes up one level (RULES.md rule 7):
// back where the machine has a back (a Studio step, the brand sheet), else to Projects.
import { useEffect } from 'react'
import { useNav } from './nav/NavProvider'
import { NotMovedYet } from './screens/NotMovedYet'
import { SCREENS } from './screens'
import { TopBar } from './shell/TopBar'
import { TrailProvider } from './shell/Trail'

export function App() {
  const { view, go, can } = useNav()
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
    <TrailProvider>
      <div className="flex min-h-dvh flex-col bg-bg text-text">
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col"><Screen /></main>
      </div>
    </TrailProvider>
  )
}
