// What a screen adds to the top bar: the name of the thing it shows (the breadcrumb's build, RULES.md rule 7) and its
// one primary action (rule 3). The screen says it with useTrail(); the top bar draws it. Nothing else crosses.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface Trail { name?: string, action?: ReactNode }

const TrailContext = createContext<{ trail: Trail, set: (t: Trail) => void } | null>(null)

export function TrailProvider({ children }: { children: ReactNode }) {
  const [trail, set] = useState<Trail>({})
  return <TrailContext value={{ trail, set }}>{children}</TrailContext>
}

// the top bar's read
export const useTrailShown = (): Trail => useContext(TrailContext)?.trail ?? {}

// a screen's write: what it shows while it is on screen, cleared when it leaves
export function useTrail(name: string | undefined, action?: ReactNode) {
  const set = useContext(TrailContext)?.set
  useEffect(() => { set?.({ name, action }) }, [set, name, action])
  useEffect(() => () => set?.({}), [set])
}
