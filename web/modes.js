// @ts-check
// A project's modes, in the top bar's one menu (web/studio.js modeMenu). The Studio is the expanded Overview:
// what was chosen before the design (the idea, pages, brand, references, assets), open again from a built
// project, where it can be changed and built again. Brand is its sheet. The rest are the build's rooms.
// (The owner, 2026-11-13: "the studio should be accessible as an expanded version of overview so we know exact
// things we chose before we got to the website design".)
export const MODES = [['studio', 'Studio'], ['overview', 'Overview'], ['canvas', 'Canvas'], ['brand', 'Brand'], ['video', 'Video'], ['app', 'App'], ['game', 'Game']]
const MODE_OF_ROOM = { studio: 'studio', brand: 'brand', overview: 'overview', deck: 'canvas', draft: 'canvas', video: 'video', app: 'app', game: 'game' }
/**
 * The mode a room is. A game's own build is shown in the App room: for a game that room is Game (the menu used to
 * say App, and picking Game then opened the new-game wizard on a project that already is a game).
 * @param {string} room  @param {string} [kind] the open build's kind
 */
export const modeOf = (room, kind = '') => (room === 'app' && kind === 'game' ? 'game' : MODE_OF_ROOM[/** @type {keyof typeof MODE_OF_ROOM} */ (room)] || 'overview')

const inStudio = (/** @type {any} */ C) => C.nav.view.room === 'studio' || C.nav.view.room === 'brand'
const pidOf = (/** @type {any} */ C) => C.nav.view.project || C.project || C.scaffoldView?.project || null

/**
 * Studio and Brand from anywhere in a project, and a build's rooms from the Studio. True when it was handled
 * here; false leaves it to the menu's own rooms.
 * @param {string} id  @param {any} C the studio controller (window.swarmCosmos)  @param {string} [kind] the open build's kind
 */
export function studioMode(id, C, kind = '') {
  const pid = pidOf(C), was = inStudio(C)
  // the build that is open is the game: Game is where the person already is (its App room)
  if (kind === 'game' && !was && (id === 'game' || id === 'app')) { if (C.nav.view.room !== 'app' && C.nav.view.room !== 'game') C.go('station', 'app'); return true }
  // the build the person came from is remembered, so the Studio always has a way back to it
  if ((id === 'studio' || id === 'brand') && !was && pid) C.cameFrom = { pid, run: C.nav.view.version || C.nav.view.run || null }
  if (id === 'studio') { if (pid && C.nav.view.room !== 'studio') C.studio(pid); return true }
  if (id === 'brand') {
    if (!pid || C.nav.view.room === 'brand') return true
    if (C.nav.view.room !== 'studio') C.studio(pid)
    C.scaffoldView?.brand?.()
    return true
  }
  if (!was) return false
  // from the Studio to a room of the build: its newest version, then the room
  const head = C.scaffoldView?.head || (C.cameFrom?.pid === pid ? C.cameFrom.run : null)
  if (head) Promise.resolve(C.open(head, pid)).then(() => { if (id !== 'overview') C.go('station', id) }).catch(() => {})
  return true
}

/**
 * Which options show: Studio and Brand only inside a project; a build's rooms only when there is a build.
 * @param {HTMLElement[]} options  @param {any} C  @param {string} [kind] the open build's kind
 */
export function modesShown(options, C, kind = '') {
  const pid = pidOf(C), built = !inStudio(C) || !!C.scaffoldView?.head || (C.cameFrom?.pid === pid && !!C.cameFrom.run)
  // a game has no Studio of its own (its Plan board is that), so it is not offered one
  const noStudio = kind === 'game' && !inStudio(C)
  for (const o of options) { const own = o.dataset.mode === 'studio' || o.dataset.mode === 'brand'; o.hidden = own ? !pid || noStudio : !built || (kind === 'game' && o.dataset.mode === 'app') }
}
