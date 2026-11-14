// @ts-check
// A crew cursor that works on a tile moves over it. On the build wall the cursors of the art and play-test tiles
// were pinned to one point, so the crew looked still while it worked (the owner, 2026-11-13: "the cursors arent
// moving around like they are supposed to… they are static while they are working"). A working cursor now
// sweeps slowly across its tile and back, with a small rise and fall, each one out of step with the others.
// With reduced motion it stays on its pin.

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A triangle wave, 0 to 1 to 0, with period 1.  @param {number} t */
export const sweep = t => { const f = t - Math.floor(t); return f < 0.5 ? f * 2 : 2 - f * 2 }

/**
 * Where cursor i is on its tile at time now (ms): inside the tile, away from its edges.
 * @param {{ left: number, top: number, width: number, height: number }} tile
 * @param {number} i  @param {number} now
 * @returns {{ x: number, y: number }}
 */
export function wanderOn(tile, i, now) {
  const t = now / 1000
  const x = tile.left + tile.width * (0.14 + 0.66 * sweep(t / (9 + (i % 3) * 2.5) + i * 0.31))
  const y = tile.top + tile.height * (0.5 + 0.2 * Math.sin(t * (0.55 + (i % 4) * 0.13) + i * 1.9))
  return { x, y }
}

/**
 * A pinned cursor's place: on its pin when still, over its tile when working.
 * @param {{ x: number, y: number }} pin  @param {Element | null | undefined} tileEl  @param {number} i
 * @param {boolean} working  @param {number} [now]
 */
export function workSpot(pin, tileEl, i, working, now = performance.now()) {
  if (!working || !tileEl || still()) return pin
  const r = tileEl.getBoundingClientRect()
  return r.width > 80 && r.height > 60 ? wanderOn(r, i, now) : pin
}

/**
 * What the room says to a message when there is nothing built to change yet. It names the thing (game or app)
 * and, when a build was stopped partway, says so and what continues it. (It used to answer every message with
 * "Build the app first", on a game, with a stopped build on screen.)
 * @param {{ kind?: string, state?: string, message?: string, steps?: unknown[] }} app
 */
export function noAppYet(app) {
  const what = app.kind === 'game' ? 'game' : 'app'
  const partway = (app.steps || []).length > 0
  if (partway && (app.state === 'stopped' || app.message === 'stopped')) return `The ${what} build is stopped partway; what is painted and written is kept. Press Go on to continue it. Once it is building again I can answer questions and take changes.`
  if (partway && app.state === 'failed') return `The ${what} build did not finish. Try again from its card; once it is building I can answer questions and take changes.`
  return what === 'game' ? 'There is no game here yet. Start it from this view, then ask or change it by chatting.' : 'Build the app first (the button in this view), then change it by chatting.'
}
