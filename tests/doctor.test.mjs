// Fix mode's doctor (engine/doctor.mjs): the facts it reads, what they mean, the actions it may offer,
// and what it says with and without a model. The fixture is the night it was asked for (2026-11-13):
// a sprite cut-out failed with "No module named 'PIL'" because the Studio ran Hermes's bare Python.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GROUPS } from '../web/setup-parts.js'
import { partStates, brokenParts, failuresOf, causeOf, pythonFacts, pythonCommand, actionsFor, factLines, plainReply, readDoctor, diagnose, DOCTOR_PROMPT } from '../engine/doctor.mjs'
import { claimsDoing } from '../engine/honest.mjs'

const PIL = "could not cut out the Kumo sprite: ModuleNotFoundError: No module named 'PIL'"
const gameEvents = [
  { type: 'run:start', t: 1, kind: 'game' },
  { type: 'app:start', t: 2, kind: 'game' },
  { type: 'app:step', t: 3, step: { kind: 'setup', text: 'painting the Kumo sprite', t: 3 } },
  { type: 'app:step', t: 4, step: { kind: 'setup', text: PIL, ok: false, t: 4 } }
]
// Hermes's bare Python first on the PATH, then the system Python, as that night
const bare = () => pythonFacts({ candidates: ['python3', '/usr/bin/python3'], missing: async py => (py === 'python3' ? ['PIL'] : ['numpy', 'scipy', 'PIL']), inUse: null })
const F = {
  view: { test: { planner: { ok: true }, worker: { ok: true } }, models: { planner: { model: 'a/planner-x' }, worker: { model: 'a/builder-y' } }, pictures: { mode: 'painted', painted: { ready: false, error: 'Codex is out of quota.' } }, account: { connected: false } },
  hermes: { attached: true }, models: { roles: { reviewer: { model: 'reviewer' } } },
  local: { keys: {}, stripe: '', godot: false, chrome: true, ffmpeg: 'path', renderer: true, voice: false, appEngine: true },
  media: { music: { on: false }, clips: { on: false } }, publish: {}, conn: {}, gateway: { platforms: {} }
}

test('the parts are Setup\'s own list, with the state each has now', () => {
  const parts = partStates(GROUPS, F)
  assert.equal(parts.length, GROUPS.reduce((n, g) => n + g.parts.length, 0))
  const by = Object.fromEntries(parts.map(p => [p.k, p]))
  assert.deepEqual([by.hermes.st, by.planner.st, by.appengine.st, by.godot.st, by.voice.st], ['ok', 'ok', 'ok', 'off', 'later'])
  assert.equal(by.planner.why, 'planner-x')
  assert.deepEqual([by.pictures.st, by.pictures.why, by.pictures.fix.row, by.pictures.fix.cmd], ['fail', 'Codex is out of quota.', 'pictures', 'hermes tools'])
  // a part that stops something: set up and not working (Pictures), never an optional one that is just off (Godot)
  assert.deepEqual(brokenParts(parts).map(p => p.k), ['pictures'])
  // Hermes closed: it is needed, so it is broken
  assert.ok(brokenParts(partStates(GROUPS, { ...F, hermes: { attached: false } })).some(p => p.k === 'hermes'))
  // nothing fetched yet: every part waits, none throws
  assert.ok(partStates(GROUPS, {}).every(p => ['wait', 'ok'].includes(p.st)))
  // a key's fix is the command with a placeholder, never a value
  assert.match(by.meshy.fix.cmd, /<your key>/)
})

test('a build\'s failures are read from its events, and one put right later does not count', () => {
  const events = [
    { type: 'layer:failed', t: 1, page: 'home', layer: 'hero', message: 'the model timed out' },
    { type: 'layer:done', t: 2, page: 'home', layer: 'hero' },
    { type: 'layer:failed', t: 3, page: 'menu', layer: 'list', message: 'HTTP 429 usage limit' },
    { type: 'layer:failed', t: 4, page: 'menu', layer: 'cta', message: 'stopped' },
    { type: 'image:failed', t: 5, page: 'home', layer: 'hero', gen: 'a bakery at dawn', message: 'no image' },
    { type: 'image', t: 6, page: 'home', layer: 'hero', gen: 'a bakery at dawn' },
    { type: 'image:failed', t: 7, page: 'menu', layer: 'list', gen: 'croissants', message: 'quota' },
    { type: 'app:start', t: 8 }, { type: 'app:step', t: 9, step: { text: 'old failure', ok: false } }, { type: 'app:failed', t: 10, message: 'first try' },
    { type: 'app:start', t: 11 }, { type: 'app:step', t: 12, step: { kind: 'test', text: 'play test failed: fell through the floor', ok: false } }, { type: 'app:failed', t: 13, message: 'the engine exited (1) without a result' }
  ]
  assert.deepEqual(failuresOf(events).map(f => [f.kind, f.message]), [
    ['section', 'HTTP 429 usage limit'], ['picture', 'quota'], ['step', 'play test failed: fell through the floor'], ['app', 'the engine exited (1) without a result']
  ])
  assert.deepEqual(failuresOf(gameEvents).map(f => f.message), [PIL])
  assert.deepEqual(failuresOf([]), [])
})

test('a failure is the Studio\'s tooling, a model, or the project', () => {
  assert.deepEqual(causeOf(PIL), { where: 'studio', cause: 'the Python that Swarm Studio ran has no PIL module', module: 'PIL' })
  assert.equal(causeOf('spawn ffmpeg ENOENT').program, 'ffmpeg')
  assert.equal(causeOf('Godot 4 was asked for but is not installed on this machine: building it for the browser instead').where, 'studio')
  assert.deepEqual([causeOf('HTTP 429 usage limit').where, causeOf('no image model').part, causeOf('Hermes closed mid-build').part], ['model', 'pictures', 'hermes'])
  assert.equal(causeOf('the last stage did not pass its build: one fix turn').where, 'project')
  assert.equal(causeOf('something odd').where, 'unknown')
})

test('the cutters\' Python: which one has numpy, scipy and PIL, and the exact command when none does', async () => {
  const none = await bare()
  assert.equal(none.use, null)
  assert.equal(pythonCommand(none), 'python3 -m pip install pillow')
  // the system Python has them: that is the one, and nothing is installed
  const sys = await pythonFacts({ candidates: ['python3', '/usr/bin/python3'], missing: async py => (py === 'python3' ? ['PIL'] : []), inUse: '/usr/bin/python3' })
  assert.deepEqual([sys.use, sys.restart], ['/usr/bin/python3', false])
  // installed after the Studio started: the server still holds "none" until it restarts
  const late = await pythonFacts({ candidates: ['python3'], missing: async () => [], inUse: null })
  assert.deepEqual([late.use, late.restart], ['python3', true])
  // a Python that does not run is skipped, not counted as having them
  const gone = await pythonFacts({ candidates: ['nope', 'python3'], missing: async py => { if (py === 'nope') throw new Error('ENOENT'); return ['scipy', 'PIL'] } })
  assert.deepEqual([gone.use, gone.tried[0].missing, pythonCommand(gone)], [null, null, 'python3 -m pip install scipy pillow'])
})

test('the PIL night with no model: the facts, plainly, with the exact command and no promise', async () => {
  const facts = { parts: partStates(GROUPS, F), run: { id: 'r1', kind: 'game', working: false, failures: failuresOf(gameEvents) }, python: await bare(), hermes: { attached: true }, models: { planner: 'planner-x', worker: 'builder-y', reviewer: '', image: 'gpt-image', video: '' } }
  const r = await diagnose({ facts, text: 'why did the sprite fail?', chat: null })
  assert.equal(r.by, 'facts')
  assert.match(r.reply, /What failed: setup: could not cut out the Kumo sprite/)
  assert.match(r.reply, /Swarm Studio's own tooling, not your project/)
  assert.match(r.reply, /run this in a terminal on this computer, then restart Swarm Studio: python3 -m pip install pillow/)
  assert.match(r.reply, /Pictures: NOT WORKING \(Codex is out of quota\.\)/)
  assert.match(r.reply, /Models: planner planner-x, builders builder-y, reviewer none, image gpt-image, video none/)
  assert.equal(claimsDoing(r.reply), false)
  // a tooling failure is not offered a re-run (it would fail the same way); Setup on the broken part is
  assert.deepEqual(actionsFor(facts).map(a => a.id), ['setup:pictures'])
  assert.deepEqual(r.actions.map(a => a.id), ['setup:pictures'])
  // nothing open, nothing gathered: still an answer
  assert.match((await diagnose({ facts: {}, chat: null })).reply, /No build is open/)
})

test('actions are only the routes that exist, and only for what failed', () => {
  const fails = failuresOf([
    { type: 'layer:failed', t: 1, page: 'menu', layer: 'list', message: 'HTTP 429 usage limit' },
    { type: 'image:failed', t: 2, page: 'menu', layer: 'list', gen: 'croissants', message: 'no image' }
  ])
  const acts = actionsFor({ parts: partStates(GROUPS, F), run: { id: 'r2', kind: 'site', working: false, failures: fails } })
  assert.deepEqual(acts.map(a => a.kind), ['setup', 'repaint', 'resume'])
  assert.deepEqual(acts[1], { id: 'repaint', kind: 'repaint', run: 'r2', page: 'menu', layer: 'list', gen: 'croissants', label: 'Paint it again', does: 'paints the picture "croissants" again' })
  // while the build is running nothing is re-run
  assert.deepEqual(actionsFor({ run: { id: 'r2', working: true, failures: fails } }).map(a => a.kind), ['repaint'])
  assert.deepEqual(actionsFor({ run: { id: 'r3', kind: 'game', working: false, failures: [{ kind: 'app', message: 'the engine exited (1) without a result' }] } }).map(a => a.id), ['app-again'])
  assert.deepEqual(actionsFor({}), [])
})

test('with a model: it words the facts, offers only listed actions, and never says it will fix it itself', async () => {
  const facts = { parts: partStates(GROUPS, F), run: { id: 'r1', kind: 'game', working: false, failures: failuresOf(gameEvents) }, python: await bare() }
  const prompt = DOCTOR_PROMPT(facts, actionsFor(facts))
  assert.match(prompt, /No module named 'PIL'/)
  assert.match(prompt, /python3: lacks PIL/)
  assert.match(prompt, /To add them: python3 -m pip install pillow/)
  assert.match(prompt, /cannot install, restart, update or change anything/)
  assert.match(prompt, /- setup:pictures: opens Setup on Pictures/)
  // an honest answer with one real and one made-up action: only the real one is offered
  const seen = []
  const good = await diagnose({ facts, text: 'what broke?', chat: async m => { seen.push(m); return '{"say":"The sprite cut-out failed: the Studio\'s Python has no PIL. That is the Studio\'s tooling, not your game. Run python3 -m pip install pillow in a terminal on this computer, then restart Swarm Studio.","offer":["setup:pictures","install-pillow"]}' } })
  assert.equal(good.by, 'model')
  assert.match(good.reply, /Run python3 -m pip install pillow/)
  assert.deepEqual(good.actions.map(a => a.id), ['setup:pictures'])
  assert.equal(seen[0].at(-1).content, 'what broke?')
  // "can u install pillow then?" answered with a yes: asked again; still yes: the plain facts instead
  const lie = '{"say":"Yes, I\'ll install Pillow now.","offer":[]}'
  const bad = await diagnose({ facts, text: 'can u install pillow then?', chat: async () => lie })
  assert.equal(bad.by, 'facts')
  assert.equal(claimsDoing(bad.reply, true), false)
  assert.match(bad.reply, /python3 -m pip install pillow/)
  // a model that fails or answers nothing: the plain facts
  assert.equal((await diagnose({ facts, chat: async () => { throw new Error('503') } })).by, 'facts')
  assert.equal((await diagnose({ facts, chat: async () => '{}' })).by, 'facts')
  assert.deepEqual(readDoctor('The cut failed.'), { say: 'The cut failed.', offer: [] })
  assert.ok(factLines(facts).length > 4)
})
