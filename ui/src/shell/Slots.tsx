// What a screen puts in the frame's top bar, as the Plan board and the brand sheet say it: the build's name in the
// breadcrumb, a menu beside it (▾), and the one primary button (RULES.md rule 27). It is the frame's one trail
// (Trail.tsx) under these names, so every screen reaches the same top bar; it is cleared when the screen goes.
import type { ReactNode } from 'react'
import { useTrail, useTrailShown } from './Trail'

export interface TopBarParts {
  build?: string | null
  // the build's name goes back to its level, e.g. the brand sheet's project to its Studio
  onBuild?: () => void
  menu?: ReactNode
  primary?: ReactNode
}

// the frame (App.tsx) holds the trail; this stays for stories that draw a top bar of their own
export { TrailProvider as TopBarSlots } from './Trail'

export function useTopBarParts(): TopBarParts {
  const { name, menu, action, onName } = useTrailShown()
  return { build: name, onBuild: onName, menu, primary: action }
}

export function useTopBar({ build, onBuild, menu, primary }: TopBarParts) {
  useTrail(build ?? undefined, primary, menu, onBuild)
}
