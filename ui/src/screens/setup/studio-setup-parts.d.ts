// The types of web/setup-parts.js as the next UI uses it: the current Studio's table of parts, imported by name
// (`@studio/setup-parts`, resolved by vite.config.ts) and typed here, so both apps show the same parts, states and
// fixes. A fix names a key, never a value (catalog rule 11).

// what the sheet has fetched, by route (web/setup-parts.js's header lists which gives what)
export type Facts = { [k: string]: unknown }

export type PartState = { st: 'ok' | 'later' | 'off' | 'fail' | 'wait', why: string }

export interface PartFix {
  cmd?: string
  note?: string
  row?: 'account' | 'models' | 'pictures'
  label?: string
  link?: string
  connect?: string
}

export interface Part {
  k: string
  name: string
  need: boolean
  for: string
  by: string
  without?: string
  goes?: string
  state(F: Facts): PartState
  fix(F: Facts): PartFix | null
}

export interface Group { k: string, name: string, parts: Part[] }

export declare const GROUPS: Group[]
export declare function statesOf(F: Facts, g: Group): { p: Part, s: PartState }[]
// the command a model provider's key is given to Hermes with (Hermes asks for the key itself)
export declare function keyCommand(slug: string): string
export declare function tally(rows: { s: PartState }[]): { ok: number, all: number, bad: boolean }
