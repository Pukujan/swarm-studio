// @ts-check
// The ways to make something (docs/specs/42-ways-to-make.md): which of the five ways Make offers for a kind,
// each by its plain name, never two to one screen. A kind left with one way has no menu: Make goes straight there.
//   now       Just build: the brief in the Design deck's chat, then Build
//   guided    Guided: the questions the prompt left open, then the brief (a game: its Plan board's talk)
//   takes     Three takes: a Studio project on its Takes section, three looks to use one of or mix
//   scaffold  Scaffold: a Studio project with only its Plan step (the kind's structure, bare)
//   studio    Studio: a Studio project with every step, on the step path
// Just build, Guided and Three takes need the words; a game's Guided asks in its talk, so it does not.

/** @typedef {'now' | 'guided' | 'takes' | 'scaffold' | 'studio'} MakeMode */
/** @typedef {{ k: MakeMode, icon: string, label: string, words: boolean, steps?: string[], step?: string }} MakeWay */

/** @type {Record<MakeMode, MakeWay>} */
const MAKE_MODE = {
  now: { k: 'now', icon: 'zap', label: 'Just build', words: true },
  guided: { k: 'guided', icon: 'msg', label: 'Guided', words: true },
  takes: { k: 'takes', icon: 'remix', label: 'Three takes', words: true },
  scaffold: { k: 'scaffold', icon: 'frame', label: 'Scaffold', words: false, steps: ['plan'], step: 'plan' },
  studio: { k: 'studio', icon: 'grid', label: 'Studio', words: false }
}

/** @type {Record<string, MakeMode[]>} */
export const MAKE_KINDS = {
  site: ['now', 'guided', 'takes', 'scaffold', 'studio'],
  app: ['now', 'guided', 'takes', 'scaffold', 'studio'],
  video: ['now', 'guided', 'takes', 'scaffold', 'studio'],
  // a deck is built from its Studio's Lock, and has no questions of its own yet
  deck: ['takes', 'scaffold', 'studio'],
  // a brand is not built (its Lock is the end) and has no Plan step
  brand: ['takes', 'studio'],
  // a game's scaffold and studio are its Plan board, which its Guided talk opens
  game: ['now', 'guided']
}

/** the ways Make offers for a kind, with or without words in the box
 * @param {string} kind
 * @param {boolean} words
 * @returns {MakeWay[]} */
export function makeWays(kind, words) {
  const ways = (MAKE_KINDS[kind] || MAKE_KINDS.site).map(k => MAKE_MODE[k])
  return ways.filter(w => words || !w.words || (kind === 'game' && w.k === 'guided'))
}

/** where a kind's Studio opens: a website and a brand on their Brand step, the rest on their own structure
 * @param {string} kind */
export const makeStudioStep = kind => (kind === 'site' || kind === 'brand' ? 'brand' : 'plan')

/** a way remembered before spec 42 ('studio' was the only other) still pre-selects
 * @param {string | null} k
 * @returns {MakeMode | null} */
export const makeModeOf = k => (k && k in MAKE_MODE ? /** @type {MakeMode} */ (k) : null)
