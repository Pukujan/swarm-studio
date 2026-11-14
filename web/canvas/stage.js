// @ts-check
// What fills the stage of the App room (Game, for a game), and the one switch that picks it: Crew · Art · Live.
// By itself the stage follows the build: the crew's four windows while it builds, the live game or app once it
// has an address, a game's art sheet before there is anything to play. The owner (2026-11-14): "no where to
// change between views manually which is bad, i do like that it automatically took me here to show whats
// building tho". So the following stays the default, and a click (or the chat) pins one view until the person
// picks another, un-pins it, or it stops existing. Pure rules here, with tests (tests/stage.test.mjs); the
// room (web/canvas/rooms.js) and the wall (web/canvas/dock.js) only do what stageNow says.

/** @typedef {'crew' | 'art' | 'live'} StageView */
/**
 * The build, as the stage sees it.
 * @typedef {object} StageBuild
 * @property {boolean} [working] the build of the run on screen is running (the wall has tiles)
 * @property {string} [state] idle, working, paused, done, failed or stopped
 * @property {string} [kind] game, or anything else for an app
 * @property {boolean} [hasApp] a build finished once: there is something to play or use
 * @property {string | null} [url] the running app's address
 * @property {boolean} [canServe] the app's files are there (a big game waiting after a slice is not an app yet, but can be played)
 * @property {boolean} [opening] its server is being started
 * @property {boolean} [openFailed] the last try to start it failed
 * @property {number} [painted] pictures of the game's art plan that are painted
 * @property {number} [steps] steps the build has taken so far
 */

export const STAGE_VIEWS = /** @type {StageView[]} */ (['crew', 'art', 'live'])

/** The running app can be shown: it has an address, and it is not the empty starter of a build that never worked.  @param {StageBuild} b */
const liveOk = b => !!b.url && !(b.state === 'failed' && !b.hasApp)
/**
 * The app is not up, but it can be started: one built before whose server stopped, or a big game waiting after a
 * slice ("your turn"), whose server stops like any other when nobody looks at it.
 * @param {StageBuild} b
 */
export const canOpen = b => !liveOk(b) && !b.url && !b.working && !b.openFailed && (!!b.hasApp || (b.state === 'paused' && !!b.canServe))
/** A game with nothing to play yet shows its art sheet where the game will be.  @param {StageBuild} b */
const sheetFirst = b => b.kind === 'game' && !b.hasApp && b.state !== 'failed' && b.state !== 'stopped' && (!!b.working || (b.steps || 0) > 0)

/**
 * The options the switch offers: each one only when it has something to show.
 * @param {StageBuild} b  @returns {StageView[]}
 */
export function stageOffers(b) {
  const has = { crew: !!b.working, art: b.kind === 'game' && (b.painted || 0) > 0, live: liveOk(b) || canOpen(b) }
  return STAGE_VIEWS.filter(v => has[v])
}

/**
 * What the stage shows when nobody chose: the crew while it builds, else the live app (or its "Starting"
 * skeleton while its server comes up), else a game's art sheet, else the room's card (start, stopped, failed).
 * @param {StageBuild} b  @returns {StageView | 'card'}
 */
export function stageAuto(b) {
  return b.working ? 'crew' : liveOk(b) || (canOpen(b) && b.opening) ? 'live' : sheetFirst(b) ? 'art' : 'card'
}

/**
 * The stage for a build and a pin. A pin holds only while its view is offered; when it is gone (the build
 * ended, the app stopped) the pin is dropped and the stage follows the build again.
 * `empty`: the card or the sheet covers the frame. `sheet`: that cover is the art sheet. Under the crew's wall
 * lies what lay there before: the live app, or the sheet, or the card. `open`: Live is shown and nothing serves
 * the app, so the room starts it (the card is the "Starting" skeleton meanwhile).
 * @param {StageBuild} b  @param {StageView | null} [pin]
 * @returns {{ offers: StageView[], auto: StageView | 'card', shown: StageView | 'card', pin: StageView | null, empty: boolean, sheet: boolean, open: boolean }}
 */
export function stageNow(b, pin = null) {
  const offers = stageOffers(b), auto = stageAuto(b)
  const held = pin && offers.includes(pin) ? pin : null
  const shown = held || auto
  const under = shown === 'crew' ? (liveOk(b) ? 'live' : sheetFirst(b) ? 'art' : 'card') : shown
  return { offers, auto, shown, pin: held, empty: under !== 'live' || !liveOk(b), sheet: under === 'art', open: shown === 'live' && canOpen(b) && !b.opening }
}

/**
 * A click on an option: it pins that view; a click on the pinned one lets go.
 * @param {StageView | null} pin  @param {StageView} v  @returns {StageView | null}
 */
export const stagePick = (pin, v) => (pin === v ? null : v)

const STAGE_SAID = { crew: 'crew|windows|four windows|wall|build wall', art: 'art|sheet|art sheet|pictures', live: 'game|app|preview|live|live game|live app|live preview' }
/**
 * The same switch, typed: "show the crew", "show the windows", "show the art", "show the sheet", "show the
 * game", "show the app", "show the preview", "show it live", and "follow the build" to let go. Only a message
 * that is one of these, whole: "show the app a dark theme" is a change for the builder.
 * @param {string} text  @returns {StageView | 'follow' | null}
 */
export function stageAsk(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ')
  if (/^(please )?(follow( the build| along| it)?|unpin( it| the view)?|back to following)( please)?$/.test(t)) return 'follow'
  const m = /^(?:please )?(?:show|see|watch|open|switch to|go to|back to)(?: me)?(?: the| it)? (.+?)(?: please)?$/.exec(t)
  if (!m) return null
  return STAGE_VIEWS.find(v => STAGE_SAID[v].split('|').includes(m[1])) || null
}

/**
 * What the room answers when the chat asks for a view that has nothing to show (never sent to the builder).
 * @param {StageView} v  @param {StageBuild} b
 */
export function stageNone(v, b) {
  const what = b.kind === 'game' ? 'game' : 'app'
  if (v === 'crew') return 'The crew is not building right now.'
  if (v === 'art') return b.kind === 'game' ? 'No art is painted for this game yet.' : 'Only a game has an art sheet.'
  if (b.working) return `The ${what} is not running yet; it shows here once the crew has it up.`
  return b.state === 'paused' && !b.canServe ? `The ${what}'s files are not on this machine, so it cannot be started here.` : `There is no ${what} to run yet.`
}

/**
 * What the chat says when the app could not be started for "Play it live" or "show the game": the reason, short.
 * @param {string} [kind]  @param {string} [message]
 */
export function playFail(kind, message) {
  const why = String(message || '').split('\n')[0].replace(/(\/[\w.@-]+){3,}/g, m => `…/${m.split('/').slice(-2).join('/')}`).trim().slice(0, 220)
  return `The ${kind === 'game' ? 'game' : 'app'} could not be started${why ? `: ${why}` : '.'}`
}

/**
 * Draw the switch from stageNow. The group shows once there are two views to choose between. The pinned option
 * is pressed (aria-pressed, filled); while the stage follows the build, the one on now is current
 * (aria-current, a dot before its name), so the two never look the same.
 * @param {Element | null | undefined} el the group, with one button[data-stage] per view
 * @param {{ offers: string[], shown: string, pin: string | null }} now  @param {(v: StageView) => void} pick
 */
export function stageSwitch(el, now, pick) {
  if (!(el instanceof HTMLElement)) return
  el.hidden = now.offers.length < 2
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (el.querySelectorAll('button[data-stage]'))) {
    const v = /** @type {StageView} */ (b.dataset.stage)
    const pinned = now.pin === v, current = !now.pin && now.shown === v
    b.hidden = !now.offers.includes(v)
    b.classList.toggle('on', pinned)
    b.classList.toggle('now', current)
    b.setAttribute('aria-pressed', String(pinned))
    if (current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current')
    b.onclick = () => pick(v)
  }
}
