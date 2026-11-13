// What a screen puts in the top bar's breadcrumb (RULES.md rule 7): the Overview says `Projects › name ▾`, as
// web/project.js does. A screen sets it while it is on screen and the top bar draws it; with none set, the top bar
// names the room. One value for the page, so the top bar needs no provider around it.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

let crumb: ReactNode = null
const subs = new Set<() => void>()
const set = (c: ReactNode) => { crumb = c; for (const f of subs) f() }

export const useCrumb = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => crumb)

// the screen's crumb, while the screen is drawn
export function useScreenCrumb(c: ReactNode) {
  useEffect(() => { set(c); return () => set(null) }, [c])
}
