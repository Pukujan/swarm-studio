// Hermia's cursor in the next UI (docs/specs/41-pet-cursor.md): the current Studio's own pet (web/pet.js), the one
// src/legacy/ starts for the page (startPet), and the one way a screen tells her something is slow. Every port uses these:
//
//   usePet()                      the pet, or null (Storybook, tests: no cursor, nothing breaks)
//   useWorking(ref, busy)         while busy, she works on ref's element and it is aria-busy
//   <Working busy label>…</Working>   a skeleton in the shape of what is coming while busy, the children after
//
// She also finds skeletons on screen herself (PET_BUSY: .wait-in, [aria-busy="true"]), as in the current Studio.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { startPet, type Pet, type PetKind, type PetData } from '../legacy'
// the crew's marks (window.SwarmCrew), which draw her avatar
import '@studio/crew'
import type { Nav } from '../nav/nav'

const PetContext = createContext<Pet | null>(null)

// `nav` is the running machine (NavProvider's); she follows its screens and steps
export function PetProvider({ nav, children }: { nav: Nav, children: ReactNode }) {
  const [pet, setPet] = useState<Pet | null>(null)
  // one for the page: the Studio scaffold's screen may have started her already, and she has no stop of her own
  useEffect(() => { setPet(startPet(nav)) }, [nav])
  return <PetContext value={pet}>{children}</PetContext>
}

export function usePet(): Pet | null {
  return useContext(PetContext)
}

// tell her what happened (a step, a file, a pick…): lines from rules, never a model call
export function usePetSay(): (kind: PetKind, data?: PetData) => void {
  const pet = usePet()
  return (kind, data) => pet?.on(kind, data)
}

// while busy, she works on the element and it is marked aria-busy (the audit gates' loading check)
export function useWorking(ref: RefObject<Element | null>, busy: boolean) {
  const pet = usePet()
  useEffect(() => {
    const el = ref.current
    if (!busy || !el) return
    if (!pet) {
      // no cursor here (a story): the marker still says it is on its way
      el.setAttribute('aria-busy', 'true')
      return () => el.removeAttribute('aria-busy')
    }
    return pet.working(el)
  }, [pet, busy, ref])
}

// A skeleton while what is coming is on its way, then the thing itself. `skeleton` draws the shape; without one, a
// plain block of the given class. `label` names what is loading for a screen reader.
export function Working({ busy, label, skeleton, className, children }: { busy: boolean, label: string, skeleton?: ReactNode, className?: string, children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useWorking(ref, busy)
  if (!busy) return <>{children}</>
  return (
    <div ref={ref} role="status" aria-label={label} className={`wait-in ${className ?? ''}`}>
      {skeleton ?? <div className="h-full min-h-24 w-full rounded-[4px] border border-line bg-surface-2 motion-safe:animate-pulse" />}
    </div>
  )
}
