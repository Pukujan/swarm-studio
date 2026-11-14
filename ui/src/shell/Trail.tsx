// What a screen adds to the top bar: the name of the thing it shows (the breadcrumb's build, RULES.md rule 7), a menu
// beside that name (▾: the Plan board's, the brand sheet's) and its one primary action (rule 3). The screen says it with useTrail(); the top bar draws it. Nothing else crosses.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// onName: the build's name goes back to its level (RULES.md rule 7: each crumb goes to its level), e.g. the brand
// sheet's project to its Studio
export interface Trail { name?: string, action?: ReactNode, menu?: ReactNode, onName?: () => void }

const TrailContext = createContext<{ trail: Trail, set: (t: Trail) => void } | null>(null)

export function TrailProvider({ children }: { children: ReactNode }) {
  const [trail, set] = useState<Trail>({})
  return <TrailContext value={{ trail, set }}>{children}</TrailContext>
}

// the top bar's read
export const useTrailShown = (): Trail => useContext(TrailContext)?.trail ?? {}

// a screen's write: what it shows while it is on screen, cleared when it leaves
export function useTrail(name: string | undefined, action?: ReactNode, menu?: ReactNode, onName?: () => void) {
  const set = useContext(TrailContext)?.set
  useEffect(() => { set?.({ name, action, menu, onName }) }, [set, name, action, menu, onName])
  useEffect(() => () => set?.({}), [set])
}
