// Hermia's cursor (web/pet.js), wrapped, not rewritten: one for the whole page, started once with the running
// machine, so she follows the address the same way she does in the current Studio. She finds the board's cards
// (.ab[data-key]) and its loading areas ([aria-busy="true"]) herself; a screen needs no code for her.
import { useEffect } from 'react'
import { makePet, type Pet } from '@studio/pet'
import type { Nav } from '../nav/nav'
import '../../../web/pet.css'

let pet: Pet | null = null

export function usePet(nav: Nav | null) {
  useEffect(() => {
    // StrictMode runs this twice, and stories mount many frames: she is made once per page
    if (!nav || pet || (window as { swarmPet?: Pet }).swarmPet) return
    pet = makePet({ C: { nav } })
  }, [nav])
}
