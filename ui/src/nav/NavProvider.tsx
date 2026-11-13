// The machine for the React tree: one running actor (web/nav.js's makeNav), read with @xstate/react's useSelector.
// A screen reads the view and sends events through go(); it never keeps its own copy of where the person is.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSelector } from '@xstate/react'
import { followAddress } from './address'
import { makeNav, sameView, view, type Nav, type NavEvent, type View } from './nav'

const NavContext = createContext<Nav | null>(null)

// `nav` is given by stories and tests (a machine that starts where they need); the app makes its own from the
// address and keeps the address in step with it
export function NavProvider({ nav, children }: { nav?: Nav, children: ReactNode }) {
  const [own] = useState(() => nav ?? makeNav({ search: location.search }))
  useEffect(() => (nav ? undefined : followAddress(own)), [nav, own])
  return <NavContext value={own}>{children}</NavContext>
}

export function useNav(): { view: View, go: (e: NavEvent) => View | null, can: (e: NavEvent) => boolean } {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useNav needs a NavProvider')
  const v = useSelector(nav.actor, view, sameView)
  return { view: v, go: nav.go, can: e => nav.actor.getSnapshot().can(e) }
}
