// The types of web/pet.js's makePet as the next UI uses it (Hermia's cursor, docs/specs/41-pet-cursor.md): the
// current Studio's file, imported by name (`@studio/pet`, resolved by vite.config.ts) and started as it is.
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
// C is the current Studio's controller; she reads C.nav (the machine) and C.<room>View.el (the screen on show)
export declare function makePet(options: { sw: unknown, C: unknown, doc?: Document }): Pet
