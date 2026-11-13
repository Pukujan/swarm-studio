// Make (docs/specs/42-ways-to-make.md): the kinds the box makes, which way is pre-selected, and the guided prompt's
// rules (the same as engine/intake.mjs; web/home.js restates them between guide:start and guide:end, and
// tests/next-projects.test.mjs runs these against intake.mjs). The ways each kind offers are web/makeways.js's,
// imported as `@studio/makeways`, not copied. Only types come from it here, so Node runs this file in the tests.
import type { MakeMode, MakeWay } from '@studio/makeways'

export type Kind = 'site' | 'app' | 'game' | 'video' | 'brand' | 'deck'
export interface Make { k: Kind, icon: string, label: string, only?: string[], games?: 'none' | 'big' }

// A website builds live on the canvas; App, Game and Video run the steps they need, one after another
export const MAKES: Make[] = [
  { k: 'site', icon: 'site', label: 'Website' },
  { k: 'app', icon: 'code', label: 'App', only: ['app', 'data', 'deploy'], games: 'none' },
  { k: 'game', icon: 'game', label: 'Game', only: ['app', 'games', 'deploy'], games: 'big' },
  { k: 'video', icon: 'film', label: 'Video', only: ['review', 'video'], games: 'none' },
  { k: 'brand', icon: 'sliders', label: 'Brand' },
  { k: 'deck', icon: 'layers', label: 'Deck' }
]
export const makeOf = (k: unknown) => MAKES.find(m => m.k === k) || MAKES[0]

// The steps each kind's Studio kit names (web/kit-*.js `steps`): a brand has no Plan step. The current Studio reads
// them from the kits it loads; /next/ loads no kit, so they are listed here (tests/next-projects.test.mjs checks them).
export const KIT_STEPS: Record<Kind, string[]> = {
  site: ['brand', 'references', 'assets', 'plan'],
  app: ['brand', 'references', 'assets', 'plan'],
  game: ['brand', 'references', 'assets', 'plan'],
  video: ['brand', 'references', 'assets', 'plan'],
  deck: ['brand', 'references', 'assets', 'plan'],
  brand: ['brand', 'references', 'assets']
}

// what a build of this kind runs: a website builds live (/api/run); the rest run their steps (/api/auto)
export const runOf = (m: Make) => (m.k === 'site' ? null : { games: m.games, only: m.only })
// the guided prompt's and the talk's word for the kind
export const guideKind = (k: Kind) => (({ site: 'site', app: 'app', video: 'film', game: 'game' } as Record<string, string>)[k] || 'site')

// the Studio fits a game, a vague idea, or one where the look matters (spec 37)
const LOOKS = /\b(look|feel|vibe|mood|brand(ing)?|style|aesthetic|colou?rs?|logo|palette|typography|font|premium|elegant|beautiful|moody|minimal|bold)\b/i
export function studioFits(k: Kind, text: string) {
  if (k === 'game') return true
  return text.split(/\s+/).filter(Boolean).length < 8 || LOOKS.test(text)
}

// the way Make's menu pre-selects: the last one picked for this kind, else what the words suggest
export function pickWay(k: Kind, ways: MakeWay[], text: string, remembered: MakeMode | null): MakeMode {
  const fit: MakeMode = k === 'game' ? 'guided' : text && !studioFits(k, text) ? 'now' : 'studio'
  return [remembered, fit].find(x => ways.some(w => w.k === x)) || ways[0].k
}

export interface Question { id: string, q: string, label?: string, chips: string[], covers?: string, sets?: string }

// guide:start: the same as pending, guideBrief and guideSets in engine/intake.mjs
export function guidePending(qs: Question[], text: string) {
  const left = qs.filter(q => !(q.covers && new RegExp(q.covers, 'i').test(String(text || ''))))
  return left.some(q => !q.sets) ? left : []
}
export function guideBrief(prompt: string, answers: Record<string, string>, qs: Question[]) {
  const base = String(prompt || '').trim()
  const said = qs.filter(q => !q.sets)
    .map(q => [q.label || q.q.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, ''), String(answers[q.id] || '').trim()])
    .filter(([, v]) => v && !/^(surprise me|nothing in particular)$/i.test(v))
    .map(([k, v]) => `${k}: ${v.replace(/[.\s]+$/, '')}.`)
  return [base && !/[.!?]$/.test(base) && said.length ? `${base}.` : base, ...said].filter(Boolean).join(' ')
}
export function guideSets(answers: Record<string, string>, qs: Question[]) {
  const chips: Record<string, string> = { Painted: 'painted', 'Stock photos': 'stock', Drawn: 'drawn' }, out: { pictures?: string } = {}
  for (const q of qs) if (q.sets === 'pictures' && chips[answers[q.id]]) out.pictures = chips[answers[q.id]]
  return out
}
// guide:end

// the lightbulb's examples, by kind (a kind with none has no lightbulb)
export const EXAMPLES: Partial<Record<Kind, string>> = { site: 'site', app: 'app', game: 'game', video: 'film', brand: 'brand' }
