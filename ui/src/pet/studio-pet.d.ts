// The types of web/pet.js (Hermia's cursor, docs/specs/41-pet-cursor.md) as the next UI uses it. Imported by name
// (`@studio/pet`: vite.config.ts resolves it to ../web/pet.js) and typed here, like `@studio/nav`.
// tests/next.test.mjs checks that every name declared here is one web/pet.js exports.
import type { Nav } from '../nav/nav'

export interface Pet {
  el: HTMLElement
  on(kind: string, data?: Record<string, unknown>): void
  working(node: Element | null | undefined): () => void
  readonly state: { dozing: boolean, loading: boolean, away: boolean, room: string, working: boolean }
}

export declare function makePet(o: { sw?: unknown, C?: { nav: Nav }, doc?: Document }): Pet
