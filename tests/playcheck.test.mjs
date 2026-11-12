import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { playtest } from '../engine/playtest.mjs'
import { checklist, probeBrief, judgeActors, pacing, testDodges, dodgeProblem, checkLine } from '../engine/playcheck.mjs'
import { bigStagePrompt, gamePrompt } from '../engine/game.mjs'
import { godotStagePrompt } from '../engine/godotfirst.mjs'

// the Rooftop Signal spec's own lines (issue #245)
const spec = {
  title: 'Rooftop Signal', view: 'side', big: true, engine: 'Phaser 3',
  hero: 'Mika, a girl courier with a messy dark brown ponytail; her calico cat Kumo runs at her heels',
  loop: 'run, jump and slide across rooftops', win: 'all relays repaired', lose: 'the timer runs out',
  controls: 'Move: A/D or Left/Right. Jump: Space, W or Up (hold for higher, run for a long jump). Climb: hold Up or W on a wall or ladder, jump off walls. Slide: S or Down. Pause: Esc. Gamepad works too.',
  enemies: [{ name: 'Gutter Crow', attack: 'swoops low across the path; jump over or slide under, or lose a few seconds', look: 'Sleek wet black crow' }],
  places: [{ name: 'Wet Slate Rooftops', what: 'low roofs' }],
  stages: [{ name: 'move, jump and climb', what: 'the hero moving' }, { name: 'against the clock', what: 'a timer and crows' }, { name: 'home', what: 'the ending' }]
}

test('the checklist comes from the spec: each control, the companion, each enemy', () => {
  const c = checklist(spec)
  assert.deepEqual(c.map(x => x.id), ['right', 'left', 'jump', 'low-still', 'low-run', 'companion', 'enemy-gutter-crow'])
  assert.deepEqual(c.find(x => x.id === 'right').keys, ['ArrowRight'])
  assert.deepEqual(c.find(x => x.id === 'jump').keys, ['Space'])
  assert.deepEqual(c.find(x => x.id === 'low-still').keys, ['ArrowDown'])
  assert.equal(c.find(x => x.id === 'companion').name, 'Kumo')
  // only what the spec says: a mouse game gets no key checks, WASD is used when that is all it names
  assert.deepEqual(checklist({ controls: 'Mouse / touch: tap a tile to flip it', hero: 'a fox' }), [])
  assert.deepEqual(checklist({ controls: 'WASD to move, J to attack' }).map(x => x.keys[0]), ['KeyD', 'KeyA'])
})

test('every game prompt carries the hook and its checks, and forbids playing differently under test', () => {
  for (const p of [gamePrompt(spec), bigStagePrompt(spec, 0), bigStagePrompt(spec, 1), godotStagePrompt(spec, 0), godotStagePrompt(spec, 2)]) {
    assert.match(p, /window\.__swarm/)
    assert.match(p, /holding Down while standing still crouches/)
    assert.match(p, /never check navigator\.webdriver/)
    assert.equal(p.split('The play-test hook.').length, 2, 'the hook is said once')
  }
  assert.match(probeBrief(spec, { godot: true }), /JavaScriptBridge\.eval/)
})

test('an enemy pacing on the spot fails; one crossing the path passes; two companions fail', () => {
  const checks = checklist(spec)
  const at = (t, crowX, cats = 1) => ({ t, hero: { x: 0, y: 0, w: 60, h: 190 }, actors: [{ id: 'c1', kind: 'enemy', name: 'Gutter Crow', x: crowX, y: -150 }, ...Array.from({ length: cats }, (_, i) => ({ id: `k${i}`, kind: 'companion', name: 'Kumo', x: -90, y: 0 }))] })
  // the run's own crow: 130 px/s between x 300 and 430, turning round at once
  const paced = Array.from({ length: 60 }, (_, i) => { const t = i * 100, p = (t * 0.13) % 260; return at(t, 300 + (p < 130 ? p : 260 - p)) })
  const bad = judgeActors(checks, paced)
  assert.equal(bad.find(c => c.id === 'enemy-gutter-crow').ok, false)
  assert.match(bad.find(c => c.id === 'enemy-gutter-crow').ask, /paces on the spot[\s\S]*swoops low across the path/)
  assert.equal(bad.find(c => c.id === 'companion').ok, true)
  const swoop = Array.from({ length: 60 }, (_, i) => at(i * 100, 1200 - i * 22))
  assert.equal(judgeActors(checks, swoop).find(c => c.id === 'enemy-gutter-crow').ok, true)
  const twins = Array.from({ length: 20 }, (_, i) => at(i * 100, 1200 - i * 22, i > 10 ? 2 : 1))
  assert.match(judgeActors(checks, twins).find(c => c.id === 'companion').ask, /2 of Kumo/)
  // not in the scene yet: not checked, and not a failure
  assert.equal(judgeActors(checks, [{ t: 0, hero: { w: 60 }, actors: [] }]).find(c => c.kind === 'enemy').ok, null)
  assert.equal(pacing([{ t: 0, x: 0 }, { t: 1000, x: 50 }, { t: 2000, x: 0 }]).turns, 1)
})

test('a game that looks for the test is caught in its source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dodge-'))
  try {
    mkdirSync(join(dir, 'ports', 'godot', 'scripts'), { recursive: true })
    mkdirSync(join(dir, 'src', 'game'), { recursive: true })
    writeFileSync(join(dir, 'ports', 'godot', 'scripts', 'controls.gd'), 'func headless_playtest():\n\tvar flag = js.eval("navigator.webdriver === true", true)\n')
    writeFileSync(join(dir, 'src', 'game', 'input.ts'), 'export const keys = new Set<string>()\n')
    assert.deepEqual(testDodges(dir, { godot: true }), ['ports/godot/scripts/controls.gd'])
    assert.deepEqual(testDodges(dir), [])
    assert.match(dodgeProblem(['ports/godot/scripts/controls.gd']), /watching a demo/)
    assert.equal(dodgeProblem([]), '')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The test game: a small side-view platformer drawn on a canvas, with the play-test hook.
// `bugs` builds in the three faults from the Rooftop Signal run; without them it is the fixed game.
const game = (bugs = []) => `<!doctype html><body style="margin:0;background:#223"><canvas width=800 height=400></canvas><button id=s>Play</button><script>
const B = ${JSON.stringify(bugs)}, c = document.querySelector('canvas').getContext('2d'), keys = new Set()
addEventListener('keydown', e => keys.add(e.code)); addEventListener('keyup', e => keys.delete(e.code))
const FLOOR = 340, hero = { x: 200, y: FLOOR, vx: 0, vy: 0, w: 40, h: 90, ground: true }
const crow = { id: 'crow1', x: B.includes('crow') ? 300 : 900, dir: -1 }, cats = [{ id: 'kumo1', x: 120 }]
let scene = 'title', last = performance.now(), t = 0
s.onclick = () => { s.remove(); scene = 'play' }
function step(dt) {
  if (scene !== 'play') return
  t += dt
  const ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), down = keys.has('ArrowDown')
  hero.vx += (ax * 320 - hero.vx) * Math.min(1, dt * 12)
  if (keys.has('Space') && hero.ground) { hero.vy = -620; hero.ground = false }
  hero.vy += 1800 * dt; hero.x += hero.vx * dt; hero.y += hero.vy * dt
  if (hero.y >= FLOOR) { hero.y = FLOOR; hero.vy = 0; hero.ground = true }
  // the fault: the low move only at a run, so Down is a dead key standing still
  const low = down && hero.ground && (!B.includes('crouch') || Math.abs(hero.vx) > 130)
  hero.h = low ? 45 : 90
  if (B.includes('crow')) { crow.x += 130 * dt * crow.dir; if (crow.x < 300) { crow.x = 300; crow.dir = 1 } else if (crow.x > 430) { crow.x = 430; crow.dir = -1 } }
  else { crow.x -= 260 * dt; if (crow.x < -100) crow.x = 900 }
  // the fault: one more cat every second
  if (B.includes('cat') && cats.length < 1 + Math.floor(t)) cats.push({ id: 'kumo' + (cats.length + 1), x: 120 - cats.length * 30 })
  for (const k of cats) k.x += (hero.x - 80 - k.x) * Math.min(1, dt * 4)
}
function draw() {
  c.fillStyle = '#436'; c.fillRect(0, 0, 800, 400); c.fillStyle = '#89a'; c.fillRect(0, FLOOR, 800, 60)
  c.fillStyle = '#fc3'; c.fillRect(hero.x - 20, hero.y - hero.h, 40, hero.h)
  c.fillStyle = '#111'; c.fillRect(crow.x - 20, 190, 40, 20)
  c.fillStyle = '#e94'; for (const k of cats) c.fillRect(k.x - 15, FLOOR - 24, 30, 24)
}
function frame(now) {
  step(Math.min(0.05, (now - last) / 1000)); last = now; draw()
  window.__swarm = { scene, hero: { x: hero.x, y: hero.y, w: hero.w, h: hero.h, ground: hero.ground }, actors: [{ id: crow.id, kind: 'enemy', name: 'Gutter Crow', x: crow.x, y: 200 }, ...cats.map(k => ({ id: k.id, kind: 'companion', name: 'Kumo', x: k.x, y: FLOOR }))] }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
</script></body>`

function serve(handler) {
  const srv = createServer(handler)
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })))
}

test('the play test catches a dead crouch, a pacing crow and a multiplying cat, and passes the fixed game', { timeout: 120000 }, async () => {
  const { srv, base } = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(game(req.url === '/bugs' ? ['crouch', 'crow', 'cat'] : [])) })
  try {
    const checks = checklist(spec)
    const bad = await playtest(`${base}/bugs`, { seconds: 2, checks })
    if (bad.skipped) return // no browser here (CI without Playwright's Chromium)
    assert.equal(bad.ok, false)
    const by = Object.fromEntries(bad.checks.map(c => [c.id, c.ok]))
    assert.deepEqual(by, { right: true, left: true, jump: true, 'low-still': false, 'low-run': true, companion: false, 'enemy-gutter-crow': false })
    assert.match(bad.problem, /Holding Down while standing still did nothing/)
    assert.match(bad.problem, /Gutter Crow turned round/)
    assert.match(bad.problem, /of Kumo in the scene at once/)
    assert.match(checkLine(bad.checks), /4 of 7 play checks passed; failed: crouch, Kumo, Gutter Crow/)
    const fine = await playtest(`${base}/fixed`, { seconds: 2, checks })
    assert.equal(fine.ok, true, fine.problem)
    assert.ok(fine.checks.every(c => c.ok === true), JSON.stringify(fine.checks))
  } finally { srv.close() }
})

test('a game with no hook is asked for one, and a game without checks is tested as before', { timeout: 120000 }, async () => {
  const plain = '<!doctype html><body><canvas width=400 height=300></canvas><button id=s>Play</button><script>const c = document.querySelector("canvas").getContext("2d"); c.fillStyle = "#c23"; c.fillRect(20, 20, 200, 120); c.fillStyle = "#fd3"; c.fillRect(120, 160, 240, 100); s.onclick = () => s.remove()</script></body>'
  const { srv, base } = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(plain) })
  try {
    const old = await playtest(`${base}/`, { seconds: 2 })
    if (old.skipped) return
    assert.equal(old.ok, true)
    assert.equal(old.checks, undefined)
    const asked = await playtest(`${base}/`, { seconds: 2, checks: checklist(spec), probeWait: 1500 })
    assert.equal(asked.ok, false)
    assert.match(asked.problem, /does not publish window\.__swarm/)
    assert.ok(asked.checks.every(c => c.ok === null))
  } finally { srv.close() }
})
