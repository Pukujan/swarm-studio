// What a screen puts in the top bar: its breadcrumb (RULES.md rule 7) and its one primary action (rule 17), always
// in the same place. The bar stays the frame's; a screen only contributes, with useTopBar(), and its parts go when
// it does. Two contexts: the screen reads only the setter (stable), so setting its parts never re-renders it.
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'

export interface Crumb { label: string, onPress?: () => void }
export interface TopBarParts { crumb?: Crumb[], primary?: ReactNode }

const Parts = createContext<TopBarParts>({})
const SetParts = createContext<(p: TopBarParts) => void>(() => {})

export function TopBarSlots({ children }: { children: ReactNode }) {
  const [parts, set] = useState<TopBarParts>({})
  return <SetParts value={set}><Parts value={parts}>{children}</Parts></SetParts>
}

export const useTopBarParts = () => useContext(Parts)

// a screen's crumb and primary, as they are this render
export function useTopBar(parts: TopBarParts) {
  const set = useContext(SetParts)
  useLayoutEffect(() => { set(parts) })
  useLayoutEffect(() => () => set({}), [set])
}
