// What the Plan board shows, worked out from the Plan: the same rules as web/plan.js, so both apps draw one board.
import type { Card, Plan, Price } from './types'

export const NO_PRICE: Price = { credits: 0, runs: 0, images: 0, parts: [], first: { credits: 0 }, rest: { credits: 0 } }
export const priceOf = (p: Plan | null): Price => p?.price ?? NO_PRICE

// a card's one value at rest
export function cardValue(c: Card): string {
  const b = c.body || {}
  if (c.id === 'cast') return `${(b.roster || []).length}`
  if (c.id === 'systems') return `${Object.values(b).filter(v => v === 'on').length}`
  const first = Object.values(b).find((v): v is string => typeof v === 'string' && !!v.trim())
  return first ? first.split(/[,.]/)[0].slice(0, 28) : ''
}

// the sheets and shots follow the plan's genre family (engine/planshape.mjs); the action RPG's by default
const SHEETS: [string, string][] = [['cast', 'Cast'], ['weapons', 'Weapons']]
const SHOTS: [string, string][] = [['combat', 'Combat'], ['boss', 'Boss'], ['ult', 'Ult'], ['levelup', 'Level-up'], ['select', 'Select']]
const named = (k: string) => k.replace(/^\w/, c => c.toUpperCase())
export const sheetsOf = (p: Plan): [string, string][] => p.art?.sheets ? p.art.sheets.slice(0, p.shape?.size === 'tiny' ? 2 : 4).map(k => [k, named(k)]) : SHEETS
export const shotsOf = (p: Plan): [string, string][] => p.art?.shots ? p.art.shots.map(([k]) => [k, named(k)]) : SHOTS

// the crew are still painting something: look again in a few seconds
export function painting(p: Plan): boolean {
  if (p.build?.state === 'building') return true
  const chars = (p.build?.characters || []).flatMap(c => [c.cutin, c.portrait, c.front, c.side, c.back])
  return [...(p.sheets || []), ...(p.mocks || []), ...(p.backdrops || []), ...(p.build?.sprites || []), ...chars].some(e => e?.state === 'painting')
}

// a plan with no Meshy parts (every 2D plan) costs no credits, so its price counts pictures
export const cost = (credits: number, pr: Price) => pr.credits ? `${credits} credits` : `${pr.images} pictures`

// the top bar's one button: Lock with the price, then Build one / Build, Building while it builds
export function primaryLabel(p: Plan | null): string {
  if (!p) return ''
  const pr = priceOf(p)
  if (p.build?.state === 'building') return 'Building'
  if (p.gate?.locked) return p.gate.phase === 'first' ? 'Build one' : 'Build'
  return `Lock · ${cost(pr.credits, pr)}`
}

// a card's field names as a person reads them
export const fieldLabel = (k: string) => ({ levelUp: 'Level-ups', ngPlus: 'New Game+', enemyAI: 'Enemy AI' } as Record<string, string>)[k]
  ?? k.replace(/([A-Z])/g, ' $1').replace(/^\w/, s => s.toUpperCase())

// the fields a card's inspector edits (the roster and a few kept values have their own controls)
export const fieldsOf = (c: Card) => Object.entries(c.body || {}).filter(([k]) => k !== 'roster' && !(c.id === 'cast' && k === 'count') && !(c.id === 'look' && k === 'locked'))

// the first picture is a cheap check of direction: which slot it is
export const firstKey = (p: Plan) => p.first && (p.art?.sprites?.length ? `sp:${p.first.name}` : `vw:${p.first.name}:front`)

// which sheet cell a click at (x, y) inside a sheet of size (w, h) lands on
export function cellAt(x: number, y: number, w: number, h: number, [cols, rows]: [number, number] = [5, 4]): number {
  return Math.min(rows - 1, Math.floor(y / h * rows)) * cols + Math.min(cols - 1, Math.floor(x / w * cols))
}
