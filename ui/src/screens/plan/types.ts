// A game's Plan as GET /api/plans/:id returns it (engine/plan.mjs, server/plans.mjs; docs/specs/21-plan-before-spend.md).
// Only what the Plan board reads is typed; the rest passes through.

export type PicState = 'painting' | 'making' | 'done' | 'failed' | 'again'
export interface Pic { state?: PicState, src?: string, error?: string }
export interface Sheet extends Pic { id: string, kind: string, grid?: [number, number], picks?: number[], notes?: Record<number, string> }
export interface Mock extends Pic { shot: string }
export interface Backdrop extends Pic { id: string, stage: number, n: number, name: string, shape: 'equirect' | 'strip' }
export interface Model extends Pic { thumb?: string }
export interface Character {
  name: string
  front?: Pic, side?: Pic, back?: Pic, cutin?: Pic, portrait?: Pic
  model?: Model
}
export interface Sprite extends Pic { name: string }

export interface RosterEntry { name: string, role?: string, look?: string, weapon?: string }
// a card's lines: text by name, and the cast's roster
export interface CardBody { [line: string]: string | RosterEntry[] | undefined, roster?: RosterEntry[] }
export interface Card { id: string, name: string, body: CardBody }

export interface Option { id: string, name: string, why: string, fits?: boolean }
export interface StarterChoice { value: string | null, why: string, by: 'planner' | 'person', name: string, options: Option[] }
export interface StarterSystem { id: string, name: string, why: string, on: boolean, required?: boolean }
export interface StarterView {
  engine: StarterChoice
  template: StarterChoice
  assets: StarterChoice
  systems: StarterSystem[]
  addons: { name: string, version: string, licence: string }[]
}

export interface PricePart { what: string, n: number, each: number, credits: number }
export interface Price {
  credits: number, runs: number, images: number, parts: PricePart[]
  first: { credits: number }, rest?: { credits: number }
}

export interface Plan {
  id: string
  title: string
  cards: Card[]
  starterView?: StarterView
  sheets?: Sheet[]
  mocks?: Mock[]
  backdrops?: Backdrop[]
  style?: { name?: string, locked?: boolean }
  gate?: { locked: boolean, phase?: 'first' | 'rest' | null }
  build?: { state?: 'building' | 'done' | 'failed', characters?: Character[], sprites?: Sprite[] }
  art?: { sheets?: string[] | null, shots?: [string, ...unknown[]][] | null, sprites?: { name: string }[] }
  shape?: { size?: string, closeups?: boolean, backdrops?: boolean }
  price?: Price
  first?: { name: string, src?: string } | null
  summary?: string
}
