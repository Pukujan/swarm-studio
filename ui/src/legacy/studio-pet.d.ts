// The types of web/pet.js's makePet as the next UI uses it (Hermia's cursor, docs/specs/41-pet-cursor.md): the
// current Studio's file, imported by name (`@studio/pet`, resolved by vite.config.ts) and started as it is.
export interface Pet {
  el: HTMLElement
  on(kind: string, data?: Record<string, unknown>): void
  working(node: HTMLElement): () => void
}
// C is the current Studio's controller; she reads C.nav (the machine) and C.<room>View.el (the screen on show)
export declare function makePet(options: { sw: unknown, C: unknown, doc?: Document }): Pet
