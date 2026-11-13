// @ts-check
// How each kind is made (docs/specs/37-studio-first.md, "How each kind is made"; docs/ux/SITEMAP.md 5c): the
// ways Make offers for a kind, each to a different place and named by where it goes. Never two to one screen.
// A kind left with one way has no menu: Make goes straight there.
//   studio  the kind's Studio, opened on `step` (a scaffold section, web/nav.js STEPS); a game's is its Plan board
//   now     Build now: the talk's brief, then Build. It needs the words; a Brand or a Deck is made in the Studio only
// The brand sheet is not a way of its own: the Studio's Brand step opens it.

/** @typedef {{ k: 'studio' | 'now', icon: string, label: string, step?: string }} MakeWay */

/** @type {MakeWay} */
const MAKE_NOW = { k: 'now', icon: 'zap', label: 'Build now' }
/** @type {(label: string, step: string) => MakeWay} */
const makeStudio = (label, step) => ({ k: 'studio', icon: 'grid', label: `Studio · ${label}`, step })

/** @type {Record<string, MakeWay[]>} */
export const MAKE_WAYS = {
  // every page reads the brand, so a website starts there
  site: [makeStudio('Brand', 'brand'), MAKE_NOW],
  // an app starts from its screens (the kit's first start)
  app: [makeStudio('Screens', 'plan'), MAKE_NOW],
  // a game's look and parts are decided on its Plan board
  game: [{ k: 'studio', icon: 'grid', label: 'Plan board' }, MAKE_NOW],
  // a film starts from its storyboard (docs/specs/40-video-kit.md)
  video: [makeStudio('Storyboard', 'plan'), MAKE_NOW],
  // a deck starts from what it says, its outline; the brand dresses it later
  deck: [makeStudio('Outline', 'plan')],
  // a brand on its own is its Brand step
  brand: [makeStudio('Brand', 'brand')]
}

/** the ways Make offers for a kind, with or without words in the box
 * @param {string} kind
 * @param {boolean} words
 * @returns {MakeWay[]} */
export const makeWays = (kind, words) => (MAKE_WAYS[kind] || MAKE_WAYS.site).filter(w => w.k !== 'now' || words)
