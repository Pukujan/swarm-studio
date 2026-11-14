// The App room's stage switch, Crew · Art · Live (web/canvas/stage.js): which options a build offers, what the
// stage shows for a build and a pin, when a pin lets go, and the phrases the chat takes for the same switch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stageOffers, stageAuto, stageNow, stagePick, stageAsk, stageNone, canOpen, playFail } from '../web/canvas/stage.js'

const gameArt = { working: true, state: 'working', kind: 'game', hasApp: false, url: null, painted: 3, steps: 12 }
const gameLive = { working: true, state: 'working', kind: 'game', hasApp: true, url: 'http://localhost:5173/', painted: 18, steps: 80 }
const gameDone = { working: false, state: 'done', kind: 'game', hasApp: true, url: 'http://localhost:5173/', painted: 18, steps: 90 }
const appBuild = { working: true, state: 'working', kind: 'site', hasApp: false, url: null, steps: 4 }
const appDone = { working: false, state: 'done', kind: 'site', hasApp: true, url: 'http://localhost:5174/' }

test('each option is offered only when it has something to show', () => {
  assert.deepEqual(stageOffers({ state: 'idle', kind: 'site' }), [])
  assert.deepEqual(stageOffers(appBuild), ['crew'])
  assert.deepEqual(stageOffers({ ...appBuild, url: 'http://localhost:5174/' }), ['crew', 'live'])
  assert.deepEqual(stageOffers(appDone), ['live'])
  assert.deepEqual(stageOffers({ ...gameArt, painted: 0 }), ['crew'], 'no picture painted yet: no Art')
  assert.deepEqual(stageOffers(gameArt), ['crew', 'art'])
  assert.deepEqual(stageOffers(gameLive), ['crew', 'art', 'live'])
  assert.deepEqual(stageOffers(gameDone), ['art', 'live'], 'a finished game keeps its art sheet')
  assert.deepEqual(stageOffers({ ...appDone, painted: 4 }), ['live'], 'only a game has an art sheet')
  assert.deepEqual(stageOffers({ state: 'failed', kind: 'site', hasApp: false, url: 'http://localhost:5174/' }), [], 'the empty starter of a failed first build is not Live')
  assert.deepEqual(stageOffers({ state: 'stopped', kind: 'game', hasApp: false, painted: 17, steps: 40 }), ['art'])
})

test('by itself the stage follows the build, as it did before the switch', () => {
  assert.equal(stageAuto({ state: 'idle', kind: 'site' }), 'card')
  assert.equal(stageAuto(appBuild), 'crew')
  assert.equal(stageAuto(gameArt), 'crew')
  assert.equal(stageAuto(gameLive), 'crew')
  assert.equal(stageAuto(gameDone), 'live')
  assert.equal(stageAuto(appDone), 'live')
  assert.equal(stageAuto({ state: 'paused', kind: 'game', hasApp: false, url: null, steps: 30, painted: 18 }), 'art', 'a game with nothing to play yet: its sheet')
  assert.equal(stageAuto({ state: 'paused', kind: 'game', hasApp: false, url: 'http://localhost:5173/', steps: 30 }), 'live')
  assert.equal(stageAuto({ state: 'stopped', kind: 'game', hasApp: false, steps: 30, painted: 17 }), 'card', 'the Stopped card')
  assert.equal(stageAuto({ state: 'failed', kind: 'game', hasApp: false, steps: 30 }), 'card')
  assert.equal(stageAuto({ state: 'failed', kind: 'site', hasApp: false, url: 'http://localhost:5174/' }), 'card', 'the failure, not the blank starter')
  assert.equal(stageAuto({ state: 'failed', kind: 'site', hasApp: true, url: 'http://localhost:5174/' }), 'live', 'the app that worked before stays up')
  assert.equal(stageAuto({ state: 'idle', kind: 'game', hasApp: false, steps: 0 }), 'card', 'a game starts with a few questions')
  assert.equal(stageAuto({ state: 'done', kind: 'site', hasApp: true, url: null }), 'card')
  assert.equal(stageAuto({ state: 'done', kind: 'site', hasApp: true, url: null, opening: true }), 'live', 'starting the app: its skeleton')
})

test('under the wall lies what lay there before: the live app, the sheet, or the card', () => {
  assert.deepEqual(pick(stageNow(appBuild)), { shown: 'crew', empty: true, sheet: false })
  assert.deepEqual(pick(stageNow(gameArt)), { shown: 'crew', empty: true, sheet: true })
  assert.deepEqual(pick(stageNow(gameLive)), { shown: 'crew', empty: false, sheet: false })
})
const pick = n => ({ shown: n.shown, empty: n.empty, sheet: n.sheet })

test('a pin holds its view and stops the following', () => {
  const live = stageNow(gameLive, 'live')
  assert.deepEqual([live.shown, live.pin, live.auto, live.empty], ['live', 'live', 'crew', false])
  const art = stageNow(gameLive, 'art')
  assert.deepEqual([art.shown, art.pin, art.empty, art.sheet], ['art', 'art', true, true], 'the sheet covers a game that already plays')
  const crew = stageNow(gameLive, 'crew')
  assert.deepEqual([crew.shown, crew.pin], ['crew', 'crew'])
  const done = stageNow(gameDone, 'art')
  assert.deepEqual([done.shown, done.pin, done.sheet], ['art', 'art', true], 'the art of a finished game')
  assert.equal(stageNow(gameDone).pin, null)
  assert.equal(stageNow(gameDone).sheet, false)
})

test('a pin lets go when its view is gone, and the stage follows the build again', () => {
  // the build ends: no crew
  const ended = stageNow(gameDone, 'crew')
  assert.deepEqual([ended.shown, ended.pin], ['live', null])
  // the app's server is stopped for being idle: Live holds, and the room starts it again
  const parked = stageNow({ ...gameDone, url: null }, 'live')
  assert.deepEqual([parked.shown, parked.pin, parked.open], ['live', 'live', true])
  // it cannot be started again: no Live
  const gone = stageNow({ ...gameDone, url: null, openFailed: true }, 'live')
  assert.deepEqual([gone.shown, gone.pin, gone.open], ['card', null, false])
  // a pin that outlives the build keeps holding: Live stays Live when the build ends
  const kept = stageNow(gameDone, 'live')
  assert.deepEqual([kept.shown, kept.pin], ['live', 'live'])
  // a pin on a view the build never offered is no pin
  assert.equal(stageNow(appBuild, 'art').pin, null)
  assert.equal(stageNow(appBuild, 'art').shown, 'crew')
})

test('a click pins; a click on the pinned option lets go', () => {
  assert.equal(stagePick(null, 'live'), 'live')
  assert.equal(stagePick('live', 'art'), 'art')
  assert.equal(stagePick('art', 'art'), null)
})

test('the chat takes the same switch', () => {
  for (const t of ['show the crew', 'Show the windows', 'show me the crew', 'show the wall', 'watch the crew.']) assert.equal(stageAsk(t), 'crew', t)
  for (const t of ['show the art', 'show the sheet', 'show the art sheet', '  Show the art!  ', 'please show the art']) assert.equal(stageAsk(t), 'art', t)
  for (const t of ['show the game', 'show the app', 'show the preview', 'show it live', 'show the live game', 'go to the game']) assert.equal(stageAsk(t), 'live', t)
  for (const t of ['follow the build', 'follow', 'Follow along.', 'unpin']) assert.equal(stageAsk(t), 'follow', t)
})

test('anything more than the phrase is a message for the builder', () => {
  for (const t of ['show the app a dark theme', 'show the art on the title screen', 'show the crew names in the credits', 'show the game over screen sooner', 'follow the build with a second level', 'make the jump higher', 'show', 'the art', '', 'show the score']) assert.equal(stageAsk(t), null, t)
})

test('a view with nothing to show gets a plain answer', () => {
  assert.match(stageNone('crew', appDone), /not building/)
  assert.match(stageNone('art', appDone), /Only a game/)
  assert.match(stageNone('art', { ...gameArt, painted: 0 }), /No art is painted/)
  assert.match(stageNone('live', gameArt), /game is not running yet/)
  assert.match(stageNone('live', { state: 'idle', kind: 'site' }), /no app to run/)
  assert.match(stageNone('live', { state: 'paused', kind: 'game', canServe: false }), /files are not on this machine/)
})

// The owner, 2026-11-14: a big game paused after a slice ("your turn"), its server stopped while nobody looked;
// "Play it live" did nothing and the stage showed the art sheet.
const slice = { working: false, state: 'paused', kind: 'game', hasApp: false, canServe: true, url: null, painted: 17, steps: 95 }
test('a game waiting after a slice whose server stopped can be started: Live is offered', () => {
  assert.equal(canOpen(slice), true)
  assert.deepEqual(stageOffers(slice), ['art', 'live'])
  assert.equal(canOpen({ ...slice, canServe: false }), false, 'no files, nothing to start')
  assert.equal(canOpen({ ...slice, openFailed: true }), false, 'it was tried and failed')
  assert.equal(canOpen({ ...slice, url: 'http://localhost:5173/' }), false, 'it is up')
  assert.equal(canOpen({ ...slice, state: 'working', working: true }), false, 'the crew has it')
  assert.equal(canOpen({ state: 'done', kind: 'site', hasApp: true, url: null }), true, 'an app built before, asleep')
  assert.equal(canOpen({ state: 'stopped', kind: 'game', hasApp: false, canServe: true, url: null }), false)
})

test('Play it live pins Live: the room starts the game, with the Starting skeleton meanwhile', () => {
  // by itself the sheet stays until the game is starting
  assert.equal(stageAuto(slice), 'art')
  assert.equal(stageAuto({ ...slice, opening: true }), 'live')
  const asked = stageNow(slice, 'live')
  assert.deepEqual([asked.shown, asked.pin, asked.open, asked.empty, asked.sheet], ['live', 'live', true, true, false], 'start it; the card covers the empty frame')
  const starting = stageNow({ ...slice, opening: true }, 'live')
  assert.deepEqual([starting.shown, starting.open, starting.empty, starting.sheet], ['live', false, true, false], 'one start at a time')
  const up = stageNow({ ...slice, url: 'http://localhost:5173/' }, 'live')
  assert.deepEqual([up.shown, up.pin, up.open, up.empty], ['live', 'live', false, false])
  // it could not be started: Live is gone, the pin lets go, and nothing starts it again by itself
  const failed = stageNow({ ...slice, openFailed: true }, 'live')
  assert.deepEqual([failed.shown, failed.pin, failed.open, failed.offers], ['art', null, false, ['art']])
  // nobody asked: nothing is started from the stage alone
  assert.equal(stageNow(slice).open, false)
})

test('a start that failed is said in the chat, short', () => {
  assert.equal(playFail('game', "the app's build failed: Could not resolve \"./hero\" from /Users/someone/runs/2026/app/src/main.ts\n    at file:///x"), 'The game could not be started: the app\'s build failed: Could not resolve "./hero" from …/src/main.ts')
  assert.equal(playFail('site', ''), 'The app could not be started.')
  assert.ok(playFail('game', 'x'.repeat(900)).length < 260)
})

test('the room is wired to the switch: the bar has its options, the wall has no button of its own', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  const group = html.match(/<div class="seg" id="app-stageview"[^>]*>(.*?)<\/div>/s)
  assert.ok(group, 'the switch is in the App bar')
  assert.deepEqual([...group[1].matchAll(/data-stage="(\w+)"[^>]*>(\w+)</g)].map(m => [m[1], m[2]]), [['crew', 'Crew'], ['art', 'Art'], ['live', 'Live'], ['map', 'Map']])
  assert.ok(!/title=/.test(group[0]), 'names only: no title attribute')
  assert.ok(html.indexOf('id="app-stageview"') < html.indexOf('id="app-mode"'), 'beside Preview / Code')
  const read = f => readFileSync(new URL(`../web/canvas/${f}`, import.meta.url), 'utf8')
  assert.ok(!/cw-peek|cw-back|wallBack/.test(read('dock.js') + read('wander.js') + readFileSync(new URL('../web/canvas.css', import.meta.url), 'utf8')), 'the wall\'s Preview and Crew buttons are gone')
  assert.match(read('dock.js'), /cw\.hide = stageOf\(\)\.shown !== 'crew'/)
  assert.match(read('loop.js'), /if \(stageSay\(brief\)\)/)
  const page = readFileSync(new URL('../server/page.mjs', import.meta.url), 'utf8')
  assert.ok(page.indexOf("'canvas/stage.js'") > 0 && page.indexOf("'canvas/stage.js'") < page.indexOf("'canvas/rooms.js'"), 'stage.js loads before the room that uses it')
})
