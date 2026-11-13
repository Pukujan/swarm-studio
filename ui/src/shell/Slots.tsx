// What a screen puts in the frame's top bar (RULES.md rule 27: the breadcrumb on the left, the one primary button on
// the right): the build's name in the breadcrumb, a menu beside it (▾), and the primary button. A screen calls
// useTopBar({ … }) and the top bar draws it; it is cleared when the screen goes. Screens that have not moved set
// nothing, and the breadcrumb names only the room.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface TopBarParts {
  build?: string | null
  menu?: ReactNode
  primary?: ReactNode
}

const Ctx = createContext<{ parts: TopBarParts, set: (p: TopBarParts) => void }>({ parts: {}, set: () => {} })

export function TopBarSlots({ children }: { children: ReactNode }) {
  const [parts, set] = useState<TopBarParts>({})
  return <Ctx value={{ parts, set }}>{children}</Ctx>
}

export const useTopBarParts = () => useContext(Ctx).parts

export function useTopBar(parts: TopBarParts) {
  const { set } = useContext(Ctx)
  const { build, menu, primary } = parts
  useEffect(() => { set({ build, menu, primary }) }, [set, build, menu, primary])
  useEffect(() => () => set({}), [set])
}
