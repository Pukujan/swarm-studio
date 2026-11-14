// Replay in words (web/replaytalk.js): a replay is a recording, so its mark reads Replay, nothing it shows reads
// as work going on, and the chat answers for it. Plus the wiring the canvas keeps: the App room starts nothing
// while a replay plays, and the chat asks the replay first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { REPLAY_WORD, REPLAY_SAYS, replayPct, statusWords, progressLine, appPill, replayAsk } from '../web/replaytalk.js'

test('the mark reads Replay and how far along it is', () => {
  assert.equal(REPLAY_WORD, 'Replay')
  assert.deepEqual([0, 0.004, 0.416, 1, 7, -1, NaN].map(replayPct), ['0%', '0%', '42%', '100%', '100%', '0%', '0%'])
  // whatever the recording is showing: planning, agents at work, all built
  for (const state of ['idle', 'planning', 'working', 'done', 'paused']) assert.deepEqual(statusWords({ replay: true, at: 0.42, state, working: 3, pages: 2, done: 4, total: 9 }), { text: 'Replay', num: '42%' })
})

test('a live build keeps its words', () => {
  assert.deepEqual(statusWords({ state: 'working', working: 3, pages: 2, done: 4, total: 9 }), { text: '3 agents building', num: '4/9' })
  assert.deepEqual(statusWords({ state: 'working', working: 1, done: 0, total: 9 }), { text: '1 agent building', num: '0/9' })
  assert.deepEqual(statusWords({ state: 'planning' }), { text: 'Planning the pages', num: '' })
  assert.deepEqual(statusWords({ state: 'done', pages: 3, done: 9, total: 9 }), { text: '3 pages built', num: '9/9' })
  assert.deepEqual(statusWords({ state: 'idle' }), { text: 'Ready', num: '' })
  assert.deepEqual(statusWords({ state: 'paused', done: 2, total: 9 }), { text: 'Stopped', num: '2/9' })
  assert.equal(progressLine({ plan: 'Planned 3 pages.', working: 4, done: 2, total: 9, pages: 3 }), 'Planned 3 pages. 4 agents building · 2/9 sections across 3 pages')
  assert.equal(progressLine({ working: 4, done: 2, total: 9, pages: 3 }), '4 agents building · 2/9 sections across 3 pages')
  assert.equal(progressLine({}), 'Planning the pages…')
  assert.deepEqual(['working', 'done', 'failed', 'stopped', 'paused', 'idle'].map(state => appPill({ state })), ['building', 'built', 'failed', 'stopped', 'your turn', 'no app yet'])
  assert.equal(appPill({ state: 'done', url: 'http://127.0.0.1:1/' }), 'running')
  assert.equal(appPill({ state: 'idle', hasApp: true }), 'built')
})

test('nothing a replay shows reads as work going on', () => {
  const shown = [
    statusWords({ replay: true, at: 0.3, state: 'working', working: 8, done: 1, total: 9 }).text,
    progressLine({ replay: true, plan: 'Planned 3 pages.', working: 8, done: 1, total: 9, pages: 3 }),
    progressLine({ replay: true }),
    ...['working', 'done', 'idle'].map(state => appPill({ replay: true, at: 0.3, state, url: 'http://127.0.0.1:1/' }))
  ]
  for (const s of shown) {
    assert.match(s, /^Replay/, s)
    assert.doesNotMatch(s, /agents? building|\bbuilding$|running|Planning the pages…/, s)
  }
  assert.equal(progressLine({ replay: true, done: 1, total: 9, pages: 3 }), 'Replay: 1/9 sections across 3 pages')
  assert.equal(appPill({ replay: true, at: 0.3, state: 'working' }), 'Replay 30%')
})

test('the chat during a replay: stop, a true answer, and anything else ends it first', () => {
  for (const t of ['stop', 'Stop.', 'stop replay', 'stop the replay', 'Stop it', 'end replay', 'please stop', 'cancel', 'stop the recording']) assert.equal(replayAsk(t, true), 'stop', t)
  // the owner's own questions (2026-11-14)
  for (const t of ['is this building?', 'what is this?', 'What is this', 'is it building another version of the app?', 'what does replay actually do?', 'does it simulate and walk back how the app was made or does it actually build another version of the app?', 'is it just simulate or not', 'is this live?', 'is this real', "what's happening", 'what am I looking at?', 'why is it building again?', 'replay', 'replay it']) assert.equal(replayAsk(t, true), 'what', t)
  // a change, a new brief, a question about something else: the replay ends, then the chat does what was asked
  for (const t of ['add a FAQ page with search', 'make the hero bigger', 'how many pages are there?', '/review', 'stop the music on the home page', 'show the crew']) assert.equal(replayAsk(t, true), 'first', t)
  assert.equal(replayAsk('', true), null)
  assert.equal(replayAsk('   ', true), null)
})

test('the chat with no replay playing: "replay" starts one, and only replay talk is taken', () => {
  for (const t of ['replay', 'Replay.', 'replay it', 'replay this version', 'replay the build', 'show me the replay', 'play it back', 'watch the build again', 'start a replay', 'please replay']) assert.equal(replayAsk(t, false), 'start', t)
  for (const t of ['what does replay do?', 'what is a replay', 'does replay build another version?', 'is the replay a recording?']) assert.equal(replayAsk(t, false), 'about', t)
  for (const t of ['stop replay', 'stop the replay']) assert.equal(replayAsk(t, false), 'idle', t)
  // everything else is the chat's as ever: stop (a build), a change, a brief that only mentions the word
  for (const t of ['stop', 'is this building?', 'what is this?', 'make the hero bigger', 'add an instant replay button to the player', 'A site for a replay studio', '']) assert.equal(replayAsk(t, false), null, t)
})

test('each answer is one line that says what a replay is', () => {
  assert.match(REPLAY_SAYS.what, /^This is a replay of how this version was made\. Nothing is being built\. Say “stop” to end it\.$/)
  assert.match(REPLAY_SAYS.about, /Nothing is built\./)
  assert.match(REPLAY_SAYS.first, /^Stopped the replay/)
  for (const [k, s] of Object.entries(REPLAY_SAYS)) { assert.ok(s.length <= 120, k); assert.ok(!s.includes('\n'), k) }
})

test('the canvas keeps its side of it', () => {
  const read = f => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8')
  const rooms = read('canvas/rooms.js'), replay = read('canvas/replay.js'), loop = read('canvas/loop.js'), panels = read('canvas/panels.js'), html = read('index.html')
  // a replay never reads or starts the real app: starting it wrote app:ready and a photo into the run being replayed
  assert.match(rooms, /if \(rec\.on\) return renderApp\(\)\n  try \{\n    const st = await appApi\(\)/)
  assert.match(rooms, /function openApp\(run\) \{[^}]*?if \(appv\.opening \|\| appv\.run !== run \|\| rec\.on\) return/s)
  // a replayed event's address is the recording's, never shown; the room's own Stop ends the replay, not a build
  assert.match(rooms, /const real = fresh_ && !rec\.on/)
  assert.ok(!/fresh_\) appv\.url|&& fresh_\) appv\.url/.test(rooms), 'no replayed address reaches the frame')
  assert.match(rooms, /appEls\.stop\.onclick = \(\) => \(rec\.on \? void stopReplay\(\{ any: true \}\) : appApi\('\/stop', \{\}\)/)
  // asked for from the menu or the chat, it ends on the finished build opened again; the chat asks the replay first
  assert.match(replay, /if \(replayAsked\) return void await backToBuild\(id, false\)/)
  assert.ok(loop.indexOf('await replaySay(els.brief.value)') > 0 && loop.indexOf('await replaySay(els.brief.value)') < loop.indexOf('await modeSend(modeHelp)'), 'before the chat\'s modes')
  // its lines in the chat are tagged; the mark is said once (role=status), names only, no title attribute
  assert.match(panels, /if \(rec\.event\) \{ item\.classList\.add\('replayed'\)/)
  assert.match(html, /<span class="replay-live" id="replay-live" role="status"><\/span>/)
  assert.match(panels, /<button type="button" class="st-stop" aria-label="Stop replay" hidden>Stop<\/button>/)
  assert.ok(!/title=/.test(read('replaytalk.js')))
  const page = readFileSync(new URL('../server/page.mjs', import.meta.url), 'utf8')
  assert.equal(page.split("'replaytalk.js'").length, 2, 'listed once')
  assert.ok(page.indexOf("'replaytalk.js'") < page.indexOf("'canvas/core.js'"), 'loads before the canvas that uses it')
})
