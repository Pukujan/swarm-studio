// The types of web/pet.js (Hermia's cursor, docs/specs/41-pet-cursor.md) as the next UI uses it. The file itself
// is the current Studio's, checked by the root tsconfig.json; here it is `@studio/pet` (vite.config.ts resolves it
// to ../web/pet.js). tests/next.test.mjs checks that every name declared here is one web/pet.js exports.
import type { Nav } from '../nav/nav'

export type PetKind = 'step' | 'file' | 'link' | 'pick' | 'skip' | 'brief' | 'back' | 'built' | 'loading' | 'ready'
export interface PetData { step?: string, name?: string, type?: string, count?: number, url?: string, idea?: string, ms?: number, pages?: number }

export interface Pet {
  el: HTMLElement
  on(kind: PetKind, data?: PetData): void
  // something slow is on its way into el: she works on it, el is aria-busy, until done()
  working(el: Element | null | undefined): () => void
  readonly state: { dozing: boolean, loading: boolean, away: boolean, room: string, working: boolean }
}

export declare const PET_BUSY: string
export declare const PET_NOT: string
// sw: the current Studio's window.swarm (none at /next/); C: the controller, of which the pet reads only `nav`
export declare function makePet(o: { sw: unknown, C: { nav: Nav }, doc?: Document }): Pet
