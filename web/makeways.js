// @ts-check
// The ways to make something (docs/decisions/0020-ask-before-build.md, docs/specs/42-ways-to-make.md): Make has
// two ways, each by its plain name. A kind left with one way has no menu: Make goes straight there.
//   now       Just make it: one prompt. A new website then asks its one question before it builds
//   studio    Studio: the walk (Brand, References, Assets, Plan, Lock), every step open; a game's is its Plan board
// Just make it needs the words; the Studio's chat asks what it is, so it does not.
// Spec 42's other three are no longer ways of their own: Guided is the question's Step by step, a bare Plan is
// skipping Brand, and Three takes is the Brand step's three options.

/** @typedef {'now' | 'studio'} MakeMode */
/** @typedef {{ k: MakeMode, icon: string, label: string, words: boolean, steps?: string[], step?: string }} MakeWay */

/** @type {Record<MakeMode, MakeWay>} */
const MAKE_MODE = {
  now: { k: 'now', icon: 'zap', label: 'Just make it', words: true },
  studio: { k: 'studio', icon: 'grid', label: 'Studio', words: false }
}

/** @type {Record<string, MakeMode[]>} */
export const MAKE_KINDS = {
  site: ['now', 'studio'],
  app: ['now', 'studio'],
  video: ['now', 'studio'],
  // a game's Studio is its Plan board, where the planner asks what the idea leaves open
  game: ['now', 'studio'],
  // a deck is built from its Studio's Lock
  deck: ['studio'],
  // a brand is not built: its Lock is the end
  brand: ['studio']
}

/** the ways Make offers for a kind, with or without words in the box
 * @param {string} kind
 * @param {boolean} words
 * @returns {MakeWay[]} */
export function makeWays(kind, words) {
  const ways = (MAKE_KINDS[kind] || MAKE_KINDS.site).map(k => MAKE_MODE[k])
  return ways.filter(w => words || !w.words)
}

/** where a kind's Studio opens: a website and a brand on their Brand step, the rest on their own structure
 * @param {string} kind */
export const makeStudioStep = kind => (kind === 'site' || kind === 'brand' ? 'brand' : 'plan')

/** the way remembered for a kind; one that is no longer offered (Guided, Three takes) is forgotten
 * @param {string | null} k
 * @returns {MakeMode | null} */
export const makeModeOf = k => (k && k in MAKE_MODE ? /** @type {MakeMode} */ (k) : null)
