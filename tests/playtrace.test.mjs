// A play test that fails hands the crew the first error with its stack, and a game that never drew is said to
// have not started (engine/playtrace.mjs, engine/playtest.mjs, engine/appjob.mjs playGame). From the owner's
// Rooftop Signal build: a null-reference error thrown as the game opened reached the builder as one sentence
// with no file or line, two fix turns missed it, and a film of a white page was shown as the play test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { playtest } from '../engine/playtest.mjs'
import { parseStack, mapFrames, loadTracer, fixBrief, playLine, sameFailure, playAndFix, noStart, FIX_TRIES } from '../engine/playtrace.mjs'
import { playFacts, playCarry, lastPlay, buildMedia, processNotes } from '../engine/appjob.mjs'
import { sliceAsk } from '../engine/game.mjs'
import { talk, saysYes, offeredToShow } from '../engine/talk.mjs'
import { neverDrew, sliceSay, sliceWords } from '../web/canvas/wander.js'

// a stand-in game that throws while it starts, before it makes its canvas (the scene's clouds are gone)
const bootJs = `class Scene {
  constructor() { this.clouds = [null] }
  update(dt) {
    for (const c of this.clouds) c.x += dt
  }
}
console.error('art sheet missing: clouds.png')
const scene = new Scene()
scene.update(0.016)
document.body.append(document.createElement('canvas'))
`
const bootPage = '<!doctype html><meta charset="utf-8"><body><p>Tuning in…</p><script src="/src/game.js"></script></body>'

function serve(handler) {
  const srv = createServer(handler)
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })))
}

const STACK = `TypeError: Cannot read properties of null (reading 'x')
    at Scene.update (http://127.0.0.1:5173/src/game/scene.ts?t=17:3:9)
    at RooftopSignal.frame (http://127.0.0.1:5173/src/game/RooftopSignal.ts:40:18)
    at get x (http://127.0.0.1:5173/node_modules/.vite/deps/pixi.js?v=1:900:20)
    at http://127.0.0.1:5173/src/main.tsx:7:1`

test('a stack is read into frames, the game\'s own apart from its libraries', () => {
  const f = parseStack(STACK, 'http://127.0.0.1:5173')
  assert.deepEqual(f.map(x => [x.fn, x.file, x.line, x.col, x.own]), [
    ['Scene.update', 'src/game/scene.ts', 3, 9, true],
    ['RooftopSignal.frame', 'src/game/RooftopSignal.ts', 40, 18, true],
    ['get x', 'node_modules/.vite/deps/pixi.js', 900, 20, false],
    ['', 'src/main.tsx', 7, 1, true]
  ])
  assert.deepEqual(parseStack('no stack here'), [])
  // the debugger's frames, counted from 0, read as the same lines
  assert.deepEqual(parseStack('Uncaught TypeError: x\n    at update (http://127.0.0.1:5173/src/game.js:2:4)\n    at <anonymous> (http://127.0.0.1:5173/src/game.js:6:71)').map(x => [x.fn, x.line, x.col]), [['update', 3, 5], ['', 7, 72]])
})

test('frames are mapped to the game\'s source lines through the served file\'s source map', async () => {
  // line 3, column 1 of the served file is line 10, column 3 of scene.ts (";;AASE")
  const map = { version: 3, sources: ['scene.ts'], sourcesContent: [`${'\n'.repeat(9)}  c.x += dt * 6\n`], names: [], mappings: ';;AASE' }
  const served = `a\nb\nc.x+=dt*6\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
  const frames = parseStack(STACK, 'http://127.0.0.1:5173').slice(0, 1)
  // a stand-in reader, so the wiring is tested on a machine without the library too
  const fake = { TraceMap: class { constructor(j) { this.j = j } }, originalPositionFor: (m, p) => (p.line === 3 ? { source: m.j.sources[0], line: 10, column: 2 } : {}), sourceContentFor: m => m.j.sourcesContent[0] }
  const [got] = await mapFrames(frames, { fetchText: async () => served, tracer: fake })
  assert.deepEqual(got.src, { file: 'src/game/scene.ts', line: 10, col: 3 })
  assert.equal(got.code, 'c.x += dt * 6')
  const real = await loadTracer()
  if (real) {
    const [r] = await mapFrames(frames, { fetchText: async () => served, tracer: real })
    assert.deepEqual(r.src, { file: 'src/game/scene.ts', line: 10, col: 3 })
    assert.equal(r.code, 'c.x += dt * 6')
  }
  // no reader on this machine: the served file's line, said to be that
  const [raw] = await mapFrames(frames, { fetchText: async () => served, tracer: null })
  assert.equal(raw.src, undefined)
  assert.equal(raw.served, true)
  assert.equal(raw.code, 'c.x+=dt*6')
})

// the play test's result for the stand-in game, as the browser gives it (used where no browser is needed)
const crashed = (over = {}) => ({
  ok: false, started: false,
  problem: 'The game crashed while starting and never drew: Cannot read properties of null (reading \'x\'). No game canvas appeared within 15 s of opening the page inside a sandboxed frame (allow-scripts, no same origin), the way Hermes shows it.',
  evidence: {
    started: false, firstKey: null, lastKey: '', text: 'Tuning in…', others: [],
    console: [{ t: 0.2, type: 'error', text: 'art sheet missing: clouds.png', where: 'src/game.js:7' }],
    first: { message: 'Cannot read properties of null (reading \'x\')', t: 0.3, count: 1, frames: [{ fn: 'Scene.update', url: 'http://x/src/game.js', file: 'src/game.js', line: 4, col: 39, own: true, served: false, code: 'for (const c of this.clouds) c.x += dt' }] }
  },
  ...over
})

test('a game that throws while it starts and never draws: the play test says it did not start, and why', { timeout: 90000 }, async () => {
  const { srv, base } = await serve((req, res) => {
    if (req.url.startsWith('/src/game.js')) { res.setHeader('content-type', 'text/javascript'); return res.end(bootJs) }
    res.setHeader('content-type', 'text/html'); res.end(bootPage)
  })
  const dir = mkdtempSync(join(tmpdir(), 'nostart-'))
  try {
    const t = await playtest(`${base}/`, { seconds: 2, canvasWait: 2500, clip: join(dir, 'playtest-1.webm') })
    if (t.skipped) return // no browser here
    assert.equal(t.ok, false)
    assert.equal(t.started, false, 'the game never drew')
    // the crash is the failure; the missing canvas is what it left behind
    assert.match(t.problem, /^The game crashed while starting and never drew: Cannot read properties of null/)
    assert.match(t.problem, /No game canvas appeared/)
    // the film of the empty page is kept, and never handed on as the play test's clip
    assert.equal(t.clip, undefined)
    assert.equal(t.poster, undefined)
    assert.ok(t.blankClip && existsSync(t.blankClip))
    const e = t.evidence
    assert.equal(e.started, false)
    assert.match(e.first.message, /Cannot read properties of null \(reading 'x'\)/)
    assert.equal(e.firstKey, null, 'no key was pressed')
    assert.equal(e.text, 'Tuning in…')
    const [top] = e.first.frames
    // (this page's script is not described to the sandboxed frame, so the stack is the debugger's: 0-based, put right)
    // or, where the browser does describe it, V8's own, with the class: the same line either way
    assert.deepEqual([top.fn.replace(/^Scene\./, ''), top.file, top.line, top.own], ['update', 'src/game.js', 4, true])
    assert.match(top.code, /this\.clouds\) c\.x \+= dt/)
    assert.ok(e.console.some(c => /art sheet missing/.test(c.text) && c.type === 'error'), 'the console around the crash')
    assert.equal(playLine(t), 'Cannot read properties of null (reading \'x\'), in src/game.js line 4')
    const brief = fixBrief(t, { finish: 'Finish with a working build.' })
    assert.match(brief, /at (Scene\.)?update \(src\/game\.js:4\)\s+> for \(const c of this\.clouds\) c\.x \+= dt/)
    assert.match(brief, /before the test pressed anything/)
    assert.match(brief, /The game never drew anything/)
    assert.match(brief, /art sheet missing: clouds\.png/)
    assert.match(brief, /Start at src\/game\.js:4, in (Scene\.)?update/)
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('an error thrown as the game opens is not said to be "while playing"', { timeout: 90000 }, async () => {
  const page = `<!doctype html><body><canvas width=400 height=300></canvas><button>Play</button><script>
const c = document.querySelector('canvas').getContext('2d'); c.fillStyle = '#c23'; c.fillRect(20, 20, 200, 120); c.fillStyle = '#fd3'; c.fillRect(120, 160, 240, 100)
const clouds = [null]; function frame() { requestAnimationFrame(frame); clouds[0].x += 1 } requestAnimationFrame(frame)</script></body>`
  const { srv, base } = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(page) })
  try {
    const t = await playtest(`${base}/`, { seconds: 2 })
    if (t.skipped) return
    assert.equal(t.ok, false)
    assert.equal(t.started, true, 'this one drew: its film is a real play test')
    assert.match(t.problem, /as soon as it opens, before any key is pressed/)
    assert.ok(t.evidence.first.count > 1, 'the same error every frame is one error, counted')
    assert.equal(t.evidence.first.frames[0].fn, 'frame')
  } finally { srv.close() }
})

test('the fix request carries the first error, its stack, the console and whether the game drew', () => {
  const t = crashed()
  const brief = fixBrief(t, { finish: 'Finish with a working build: the typecheck and build must pass.' })
  assert.match(brief, /^A play test of this game failed\. The game crashed while starting/)
  assert.match(brief, /The first error \(thrown 0\.3 s after the page opened, before the test pressed anything\):\nCannot read properties of null \(reading 'x'\)\n {2}at Scene\.update \(src\/game\.js:4\) {4}> for \(const c of this\.clouds\) c\.x \+= dt/)
  assert.match(brief, /\[0\.2 s error\] art sheet missing: clouds\.png \(src\/game\.js:7\)/)
  assert.match(brief, /The page showed only: "Tuning in…"/)
  assert.match(brief, /Keep everything else as it is\. Finish with a working build/)
  // the second request says what the first one changed and that it missed
  const again = fixBrief(t, { attempt: 2, before: [{ changed: ['src/game/storage.ts', 'src/game/assets.ts'], same: true }] })
  assert.match(again, /^This is fix attempt 2\. The last attempt changed src\/game\/storage\.ts, src\/game\/assets\.ts and the play test, run again, fails with the same error/)
  assert.match(fixBrief(t, { attempt: 2, before: [{ changed: [], same: true }] }), /The last attempt changed no file/)
  // a mapped frame is named by its source line; a frame of a built bundle by the code to search for
  const mapped = crashed()
  mapped.evidence.first.frames[0].src = { file: 'src/game/scene.ts', line: 229, col: 7 }
  assert.match(fixBrief(mapped), /Start at src\/game\/scene\.ts:229, in Scene\.update/)
  assert.equal(playLine(mapped), 'Cannot read properties of null (reading \'x\'), in src/game/scene.ts line 229')
  const bundle = crashed()
  Object.assign(bundle.evidence.first.frames[0], { bundled: true, file: 'assets/index-Un2Fa78P.js', line: 1006, col: 21115 })
  assert.match(fixBrief(bundle), /built bundle, so the names in that stack are shortened/)
  assert.equal(playLine(bundle), 'Cannot read properties of null (reading \'x\')')
  assert.equal(sameFailure(t, crashed()), true)
  assert.equal(sameFailure(t, mapped), false)
})

test('the crew is sent at a failed play test twice at most, each time played again, and the log says what happened', async () => {
  const steps = [], prompts = []
  let n = 0
  const r = await playAndFix({
    play: async () => { n++; return crashed() },
    fix: async p => { prompts.push(p) },
    step: s => steps.push(s),
    changedSince: () => (prompts.length === 1 ? ['src/game/storage.ts'] : []),
    finish: 'Finish with a working build.'
  })
  assert.equal(FIX_TRIES, 2)
  assert.equal(n, 3, 'played, and played again after each fix')
  assert.equal(prompts.length, 2)
  assert.match(prompts[0], /at Scene\.update \(src\/game\.js:4\)/)
  assert.match(prompts[1], /^This is fix attempt 2\. The last attempt changed src\/game\/storage\.ts .* fails with the same error/)
  assert.deepEqual(steps.map(s => s.text), [
    'play test failed: The game did not start: Cannot read properties of null (reading \'x\'), in src/game.js line 4',
    'fix 1 of 2: the crew is sent at The game did not start: Cannot read properties of null (reading \'x\'), in src/game.js line 4',
    'still wrong after fix 1 of 2 (it changed src/game/storage.ts; the same error): The game did not start: Cannot read properties of null (reading \'x\'), in src/game.js line 4',
    'fix 2 of 2: the crew is sent at The game did not start: Cannot read properties of null (reading \'x\'), in src/game.js line 4',
    'still wrong after fix 2 of 2 (it changed no file; the same error): The game did not start: Cannot read properties of null (reading \'x\'), in src/game.js line 4'
  ])
  // the "did not start" state: no clip anywhere, and the steps say so for the room
  assert.ok(steps.every(s => !s.clip))
  assert.ok(steps.filter(s => s.ok === false).every(s => s.started === false && noStart(s) && neverDrew(s)))
  assert.equal(r.ok, false)
  assert.equal(r.started, false)
  assert.equal(r.clip, undefined)
  assert.equal(r.tries, 2)
  assert.equal(r.line, 'Cannot read properties of null (reading \'x\'), in src/game.js line 4')
  assert.match(r.problem, /This is fix attempt 3\./)
  // what the next slice is told first: the findings, with no attempt count and no "keep everything else"
  const carried = playCarry(r)
  assert.match(carried, /^the play test of the slice before this one still fails after 2 fix attempts\. Fix it before building anything new/)
  assert.match(carried, /The last fix attempt changed no file and did not cure it: the same error is still thrown/)
  assert.match(carried, /at Scene\.update \(src\/game\.js:4\)/)
  assert.doesNotMatch(carried, /fix attempt 3|Keep everything else as it is/)
  assert.deepEqual(playFacts(r), { started: false, line: r.line, tries: 2 })
})

test('a fix that works is played again and filmed: the clip shown is the last test\'s', async () => {
  const steps = []
  let n = 0, clip = ''
  const r = await playAndFix({
    play: async () => { n++; if (n === 1) { clip = ''; return crashed() } clip = '/img/r/playtest-2.webm'; return { ok: true, started: true, seconds: 4 } },
    film: () => (clip ? { clip, keys: [] } : {}),
    fix: async () => {},
    step: s => steps.push(s),
    changedSince: () => ['src/game/scene.ts']
  })
  assert.deepEqual(r, { ok: true, fixed: true, seconds: 4, tries: 1, clip: '/img/r/playtest-2.webm' })
  assert.equal(steps.at(-1).text, 'the game passes its checks after fix 1 (it changed src/game/scene.ts)')
  assert.equal(steps.at(-1).clip, '/img/r/playtest-2.webm')
  // a test that could not run spends no fix turn; a pass spends none either
  let fixes = 0
  assert.deepEqual(await playAndFix({ play: async () => ({ ok: false, skipped: 'no browser for the play test' }), fix: async () => { fixes++ }, step: () => {} }), { ok: false, skipped: 'no browser for the play test' })
  assert.equal((await playAndFix({ play: async () => ({ ok: true, seconds: 3 }), fix: async () => { fixes++ }, step: () => {} })).ok, true)
  assert.equal(fixes, 0)
})

test('an older Studio\'s "no canvas" step, saved with its white film, reads as "did not start"', () => {
  const old = { kind: 'test', ok: false, clip: '/img/r/playtest-1.webm', text: 'play test failed: No game canvas appeared within 15 s of opening the page inside a sandboxed frame (allow-scripts, no same origin), the way Hermes shows it' }
  assert.equal(noStart(old), true)
  assert.equal(neverDrew(old), true)
  assert.equal(neverDrew({ kind: 'test', ok: false, clip: '/x.webm', text: 'play test failed: The game threw errors while playing: boom' }), false)
  assert.equal(neverDrew({ kind: 'test', text: 'play test passed: still playing after 4.0 s', clip: '/x.webm' }), false)
  // and Hermia is not handed that film to show
  const m = buildMedia({ id: 'r', steps: [{ ...old, t: 2 }, { clip: '/img/r/playtest-0.webm', t: 1 }], slices: [{ clip: '/img/r/playtest-9.webm', started: false, t: 3 }] })
  assert.deepEqual(m.clipList.map(c => c.src), ['/img/r/playtest-0.webm'])
})

const spec = { title: 'Rooftop Signal', hero: 'Mika, a courier', big: true, stages: [{ id: 's1', name: 'the core loop' }, { id: 's2', name: 'the stages' }] }
test('the slice question says the play test failed and offers the fix first', () => {
  const play = { ok: false, started: false, tries: 2, line: 'Cannot read properties of null (reading \'x\'), in src/game/scene.ts line 229', problem: 'x' }
  const a = sliceAsk(spec, 0, play)
  assert.equal(a.failed, true)
  assert.equal(a.ideas[0], 'Fix it')
  assert.match(a.ask, /is built, but the game did not start: Cannot read properties of null \(reading 'x'\), in src\/game\/scene\.ts line 229\. The crew tried 2 fixes and it is still there\. Type "fix it"/)
  assert.doesNotMatch(a.ask, /bots have played/)
  assert.match(sliceAsk(spec, 0, { ok: false, line: 'boom' }).ask, /but its play test failed: boom\./)
  assert.match(sliceAsk(spec, 0, { ok: true }).ask, /the bots have played it/)
  assert.match(sliceAsk(spec, 0).ask, /the bots have played it/)
  assert.match(sliceAsk(spec, 0, { ok: false, skipped: 'no browser for the play test' }).ask, /could not play it here/)
})

test('a play test that still fails is the next slice\'s first job, also after the build waited', () => {
  const play = { ok: false, tries: 2, problem: 'A play test of this game failed. boom\n\nat Scene.update (src/game/scene.ts:229)' }
  assert.match(playCarry(play), /^the play test of the slice before this one still fails after 2 fix attempts\. Fix it before building anything new[\s\S]*src\/game\/scene\.ts:229/)
  assert.equal(playCarry({ ok: true }), '')
  assert.equal(playCarry({ ok: false, skipped: 'no browser' }), '')
  const events = [{ type: 'app:start' }, { type: 'app:paused', result: { stages: [{ playtest: play }] } }, { type: 'app:ready' }, { type: 'app:start', resume: 1 }]
  assert.equal(lastPlay(events), play)
  assert.equal(lastPlay([...events, { type: 'app:done' }]), null)
  // a Stop (or a failure) after the pause does not clear it: the error is still in the game
  assert.equal(lastPlay([...events, { type: 'app:failed', message: 'stopped' }, { type: 'app:start', resume: 1 }]), play)
  assert.match(processNotes({ kind: 'game', state: 'paused', failing: 'boom' }), /play test failed: boom\. Nothing is being fixed while it waits: when they type "fix it"/)
})

test('typed at a waiting slice: "fix it" fixes, "go on" goes on, anything else is the next slice\'s note', () => {
  for (const t of ['fix it', 'can u fix', 'Fix it', 'fix the game', 'please fix it now', 'can you fix it?', 'fix', 'fix the error', 'try again']) assert.equal(sliceSay(t), 'fix', t)
  for (const t of ['go on', 'Go on to the stages', 'Looks good, go on to the stages', 'continue', 'next']) assert.equal(sliceSay(t), 'go', t)
  for (const t of ['make Mika bigger', 'fix mode toggle in the menu and add a boss', 'lots of issues to fix with the game itself']) assert.equal(sliceSay(t), 'note', t)
  // a question or a hello is answered: it starts neither a fix nor the next slice
  for (const t of ['hi??', 'what is the error?', 'why did it crash', 'is it broken?', 'how do I play it']) assert.equal(sliceSay(t), 'ask', t)
})

test('a waiting slice an older Studio saved reads truthfully: no "the bots have played it" over a failed test', () => {
  const old = { i: 1, n: 4, name: 'the stages', play: false, clip: '/img/r/playtest-2.webm', next: 'the extras', ask: 'Slice 2 of 4, the stages, is built and the bots have played it. Watch their run here', ideas: ['Looks good, go on to the extras'] }
  const result = { stages: [{ playtest: { ok: false, problem: 'The game threw errors while playing: Cannot read properties of null (reading \'x\')' } }] }
  const w = sliceWords(old, result)
  assert.equal(w.failed, true)
  assert.equal(w.noStart, false)
  assert.equal(w.ask, 'Slice 2 of 4, the stages, is built, but its play test failed: The game threw errors while playing: Cannot read properties of null (reading \'x\'). Type "fix it" and the crew goes at this error now, or "go on" to start the extras with this as its first job.')
  assert.deepEqual(w.ideas, ['Fix it', 'Go on to the extras'])
  const blank = sliceWords({ ...old, i: 0 }, { stages: [{ playtest: { ok: false, problem: 'No game canvas appeared within 15 s of opening the page inside a sandboxed frame' } }] })
  assert.equal(blank.noStart, true)
  assert.match(blank.ask, /but the game did not start: No game canvas appeared/)
  // a new one brings its own words; a passed one is as it was
  assert.equal(sliceWords({ i: 0, n: 4, play: false, started: false, failed: true, line: 'boom', ask: 'said by the engine', ideas: ['Fix it'] }).ask, 'said by the engine')
  assert.equal(sliceWords({ i: 0, n: 4, play: true, ask: 'fine', ideas: ['Looks good'] }).failed, false)
})

test('a yes to "shall I show the clip?" shows the clip', async () => {
  const media = { clips: [{ src: '/img/r/playtest-2.webm', name: 'slice 2' }], pics: [] }
  assert.equal(saysYes('yes'), true)
  assert.equal(saysYes('yes make it bigger'), false)
  assert.equal(offeredToShow('The newest play test clip is playtest-2, so tell me if you want it under my answer.'), true)
  assert.equal(offeredToShow('The crew is on slice 3.'), false)
  // the owner's other line: a yes to it is a yes to a change, never a clip
  assert.equal(offeredToShow('The play test fails on a null x. Do you want me to send that as the change to fix before the next slice goes on?'), false)
  assert.equal(offeredToShow('I can show you the newest play test clip. Want to see it?'), true)
  let asked = 0
  const r = await talk({ chat: async () => { asked++; return '{"say":"no"}' }, appDir: tmpdir(), media, text: 'yes', before: { text: 'can i see it', answer: 'The newest play test clip is playtest-2, so tell me if you want it under my answer.' } })
  assert.equal(asked, 0, 'no model is asked: the offer is carried out')
  assert.equal(r.media.clip, '/img/r/playtest-2.webm')
  assert.match(r.answer, /^Here is the newest play test clip/)
  // anything else goes to the model with the exchange before it, so it knows what "that" is
  let seen = null
  await talk({ chat: async m => { seen = m; return '{"say":"ok"}' }, appDir: tmpdir(), media, text: 'send that', before: { text: 'why does it crash', answer: 'The clouds are destroyed.' } })
  assert.deepEqual(seen.slice(1).map(m => m.role), ['user', 'assistant', 'user'])
  assert.match(seen[2].content, /The clouds are destroyed/)
})
