// The current Studio's own pieces the next UI hosts as they are, not rewritten (docs/decisions/0013-react-ui-coexists.md):
// the Studio's kits (web/kit-*.js, spec 37), which draw their cards and inspectors into an element they are given,
// and Hermia's cursor (web/pet.js, spec 41). Reached only through this folder (ui/.dependency-cruiser.cjs). When a
// kit or the pet moves to React, it leaves here.
import { KITS } from '@studio/kits'
import { makePet, type Pet } from '@studio/pet'
export type { Pet, PetKind, PetData } from '@studio/pet'
import type { Nav } from '../nav/nav'
// the current Studio's styles the hosted kits' cards and inspectors are drawn with: the board and its cards
// (project.css, plan.css, scaffold.css), the brand's swatches (brand.css), the kit's buttons, menus and toast
// (home.css) and Hermia's cursor (pet.css). Every rule in them is scoped to a class; none styles the page itself.
// Imported one by one, so vite.config.ts's swarm:web-fonts sees each and their fonts come from the server's /fonts/.
import '../../../web/home.css'
import '../../../web/project.css'
import '../../../web/plan.css'
import '../../../web/brand.css'
import '../../../web/scaffold.css'
import '../../../web/pet.css'

export { KITS }
export type { Kit, KitCard, KitCtx, StoreItem, Studio } from '@studio/kits'

// Hermia, once for the page: she follows the machine (C.nav) and treats the screen on show (C.scaffoldView.el)
// as hers to watch for loading. She has no stop of her own, so she starts once and stays.
let pet: Pet | null = null
const view: { el: HTMLElement | null } = { el: null }
// a screen that has its own element to watch gives it (the Studio scaffold); the frame's PetProvider gives none, and
// leaves the screen's in place
export function startPet(nav: Nav, screen?: HTMLElement | null): Pet | null {
  if (screen !== undefined) view.el = screen
  if (!pet && typeof document !== 'undefined') pet = makePet({ sw: null, C: { nav, get scaffoldView() { return view.el ? { el: view.el } : null } } })
  return pet
}
