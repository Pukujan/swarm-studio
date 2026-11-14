import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { aiPlay, observe, decisionBody, intentFrom, scripted, sayFor, jevDecider, line } from '../engine/aiplayer.mjs'
import { DECISIONS } from '../engine/autoplay.mjs'

const usher = { id: 'f1', name: 'usher', x: 300, y: 200, px: 300, py: 200, d: 120 }
const golem = { id: 'f2', name: 'golem', x: 500, y: 200, px: 500, py: 200, d: 300 }
const door = { id: 't1', name: 'hub door', x: 640, y: 208, px: 640, py: 208, d: 310 }
const fight = { seen: true, read: 'phaser', scene: 'game', state: 'run', hero: { x: 200, y: 200, hp: 80, maxHp: 100 }, foes: [usher, golem], foeCount: 2, things: [door], controls: [], text: '' }

test('the Decisions request offers only what is on screen, numbered', () => {
  const b = decisionBody(fight)
  assert.equal(b.model, 'typesafe/jev-1.14')
  assert.deepEqual(Object.keys(b.questions.operation.criteria).sort(), ['ADVANCE', 'DODGE', 'FIGHT', 'GO_TO'])
  assert.match(b.questions.fight_target.criteria['1'].element, /^\[1\] usher, 120px away/)
  assert.equal(b.questions.click_target, undefined)
  assert.match(b.state.page.text, /2 enemies: usher 120px away/)
  const title = decisionBody({ seen: false, controls: [{ id: 'c1', label: 'Play', name: 'Play' }], text: 'Lokee' })
  assert.deepEqual(Object.keys(title.questions.operation.criteria).sort(), ['ADVANCE', 'CLICK', 'ESCAPE', 'PLAY'])
})

test("Jev's answer becomes an intent on a real target, or nothing", () => {
  assert.deepEqual(intentFrom({ operation: { choice: 'FIGHT' }, fight_target: { choice: '2' } }, fight), { kind: 'fight', target: golem })
  assert.deepEqual(intentFrom({ operation: { choice: 'GO_TO' }, go_to_target: { choice: '1' } }, fight), { kind: 'goto', target: door })
  assert.equal(intentFrom({ operation: { choice: 'FIGHT' }, fight_target: { choice: '9' } }, fight), null)
  assert.equal(intentFrom({ operation: { choice: 'DONE' } }, fight), null)
})

test('the scripted policy fights, takes cards, reads on and heads for doors', () => {
  assert.equal(scripted(fight).kind, 'fight')
  assert.equal(scripted({ ...fight, hero: { ...fight.hero, hp: 10 }, foes: [{ ...usher, d: 40 }] }).kind, 'dodge')
  const cards = [{ id: 'c1', name: 'Fan Dance', label: 'Fan Dance · +20% speed', big: true }, { id: 'c2', name: 'Velvet Madame', label: 'Velvet Madame · heal', big: true }]
  assert.equal(scripted({ ...fight, foes: [], foeCount: 0, state: 'choice', controls: [...cards, { id: 'c3', name: 'Settings', label: 'Settings' }] }).kind, 'click')
  assert.equal(scripted({ ...fight, foes: [], foeCount: 0, dialog: 'Lokee: the show must go on' }).kind, 'advance')
  const walk = scripted({ ...fight, foes: [], foeCount: 0, things: [{ ...door, name: 'piano', id: 't2' }, door] })
  assert.deepEqual([walk.kind, walk.target.name], ['goto', 'hub door'])
  const prompt = scripted({ ...fight, foes: [], foeCount: 0, things: [{ ...door, name: 'Step through the stage door', press: 'KeyE' }] })
  assert.equal(prompt.target.press, 'KeyE')
  assert.equal(scripted({ seen: false, controls: [], text: '' }).kind, 'play')
  // a store left open over the game: closed once the hero has stood still a while
  const store = { ...fight, foes: [], foeCount: 0, things: [], controls: [{ id: 'c1', name: 'WEAPONS', label: 'WEAPONS' }, { id: 'c2', name: 'Close', label: 'Close' }] }
  assert.equal(scripted({ ...store, stillMs: 5000 }).target.name, 'Close')
  assert.equal(scripted({ ...store, stillMs: 5000, controls: [store.controls[0]] }).kind, 'escape')
  assert.equal(scripted({ seen: false, controls: [{ id: 'c1', name: 'Play', label: 'Play' }, { id: 'c2', name: 'Credits', label: 'Credits' }], text: '' }).target.name, 'Play')
})

test('labels are short and calm', () => {
  assert.equal(sayFor({ kind: 'fight', target: usher }), 'going for the usher')
  assert.equal(sayFor({ kind: 'click', target: { name: 'FAN DANCE', big: true } }), 'picks fan dance')
  assert.equal(sayFor({ kind: 'click', target: { name: 'Play' } }), 'presses Play')
  assert.equal(sayFor({ kind: 'goto', target: { name: 'Step through the stage door', press: 'KeyE' } }), 'step through the stage door')
  assert.equal(line({ seconds: 30, reached: 'clear', picks: ['Fan Dance'], jev: 4, decisions: 9 }), 'AI player cleared a room in 30 s · picked Fan Dance · 4 of 9 moves chosen by Jev')
  assert.equal(line({ skipped: 'no browser for the AI player' }), 'The AI player did not play: no browser for the AI player')
})

test('the Jev decider posts to Decisions and refuses a bad answer', async () => {
  assert.equal(jevDecider({ key: '' }), null)
  let sent
  const ok = jevDecider({ key: 'k', fetchImpl: async (url, opts) => { sent = { url, opts }; return { ok: true, json: async () => ({ answers: { operation: { choice: 'FIGHT' }, fight_target: { choice: '1' } } }) } } })
  assert.deepEqual(await ok(fight, []), { kind: 'fight', target: usher })
  assert.equal(sent.url, DECISIONS)
  assert.equal(sent.opts.headers.authorization, 'Bearer k')
  const blocked = jevDecider({ key: 'k', fetchImpl: async () => ({ ok: false, status: 404 }) })
  await assert.rejects(blocked(fight, []), /404/)
})

test('a game that publishes window.__swarm is read from it, with no place on the page to aim at', () => {
  const o = observe({ controls: [], text: '', phaser: false, swarm: { scene: 'play', hero: { x: 100, y: 300, w: 20, h: 40, ground: true }, actors: [{ id: 'crow-1', kind: 'enemy', name: 'Night_Crow', x: 400, y: 300 }, { id: 2, kind: 'enemy', name: 'rat', x: 160, y: 300 }, { id: 'pal', kind: 'companion', name: 'moth', x: 90, y: 280 }, { id: 'c', kind: 'pickup', name: 'lantern', x: 130, y: 300 }, { kind: 'enemy', name: 'broken' }] } })
  assert.deepEqual([o.read, o.seen, o.scene, o.foeCount], ['swarm', true, 'play', 2])
  assert.deepEqual(o.foes.map(f => [f.name, f.d, f.px]), [['rat', 60, undefined], ['night crow', 300, undefined]])
  assert.deepEqual(o.things.map(t => [t.name, t.kind]), [['lantern', 'pickup']])
  assert.equal(o.swarm, undefined)
  assert.equal(scripted(o).kind, 'fight')
  // its title, pause and end screens are pressed past; in play with nothing around, the usual keys
  assert.equal(scripted(observe({ controls: [], swarm: { scene: 'title', hero: { x: 0, y: 0 }, actors: [] } })).kind, 'advance')
  assert.equal(scripted(observe({ controls: [], swarm: { scene: 'play', hero: { x: 0, y: 0 }, actors: [] } })).kind, 'play')
  assert.equal(observe({ controls: [], swarm: { scene: 'pause' } }).paused, true)
  // no hook: the page's buttons and the usual keys
  assert.deepEqual([observe({ controls: [], text: '', phaser: false }).read, observe({ controls: [], phaser: true }).read], ['page', 'phaser'])
})

test('a game that opted in is asked for a tactic, as engine/autoplay.mjs asks', async () => {
  const play = { mode: 'play', goal: 'Beat the boss', tactics: { rush: 'close in', kite: 'keep away' }, hp: 3 }
  const o = observe({ controls: [], text: '', play })
  assert.deepEqual(Object.keys(o.tactics), ['rush', 'kite'])
  let body
  const jev = jevDecider({ key: 'k', fetchImpl: async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ answers: { tactic: { choice: 'kite' } } }) } } })
  const intent = await jev(o, [{ action: 'tactic rush' }])
  assert.deepEqual(intent, { kind: 'tactic', target: { name: 'kite' } })
  assert.deepEqual(body.questions.tactic.criteria, play.tactics)
  assert.equal(sayFor(intent), 'tries kite')
  const off = jevDecider({ key: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ answers: { tactic: { choice: 'fly' } } }) }) })
  await assert.rejects(off(o, []), /nothing that is on screen/)
  // one tactic is no choice
  assert.equal(observe({ controls: [], play: { mode: 'play', tactics: { rush: 'x' } } }).tactics, undefined)
})

// A small game that publishes window.__swarm, as the Studio's games do: a Start button, a hero that walks with
// the arrow keys, one enemy to walk into. The enemy's name says where the game runs: a sandboxed frame's origin is "null".
const game = `<!doctype html><body style="margin:0"><button id=p style="position:absolute;left:20px;top:20px">Start</button><canvas width=400 height=300 style="width:400px;height:300px"></canvas><script>
const keys = new Set(), hero = { x: 60, y: 150, w: 16, h: 16, ground: true }
let scene = 'title', foes = [{ id: 'crow', kind: 'enemy', name: self.origin === 'null' ? 'crow' : 'crow outside a frame', x: 300, y: 150 }]
addEventListener('keydown', e => keys.add(e.code)); addEventListener('keyup', e => keys.delete(e.code))
p.onclick = () => { p.remove(); scene = 'play' }
const c = document.querySelector('canvas').getContext('2d')
setInterval(() => {
  if (scene === 'play') {
    if (keys.has('ArrowRight')) hero.x += 6
    if (keys.has('ArrowLeft')) hero.x -= 6
    foes = foes.filter(f => Math.abs(f.x - hero.x) > 30)
    if (!foes.length) scene = 'win'
  }
  window.__swarm = { scene, hero, actors: foes }
  c.fillStyle = '#222'; c.fillRect(0, 0, 400, 300); c.fillStyle = '#fd3'; c.fillRect(hero.x - 8, hero.y - 8, 16, 16)
}, 40)
window.__swarm = { scene, hero, actors: foes }
</script></body>`

test('the player plays a game inside a sandboxed frame from its own state, and streams its screen', { timeout: 90000 }, async () => {
  const srv = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(game) })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  try {
    const said = [], frames = []
    let calls = 0
    // Jev stand-in: press a button when there is one, else fight the first enemy listed
    const decide = jevDecider({ key: 'k', fetchImpl: async (url, opts) => {
      calls++
      const sent = JSON.parse(opts.body)
      const q = sent.questions
      const answers = q.click_target ? { operation: { choice: 'CLICK' }, click_target: { choice: '1' } } : q.fight_target ? { operation: { choice: 'FIGHT' }, fight_target: { choice: '1' } } : { operation: { choice: 'ADVANCE' } }
      return { ok: true, json: async () => ({ answers }) }
    } })
    const r = await aiPlay(`http://127.0.0.1:${srv.address().port}/`, { seconds: 40, until: 'progress', decide, onSay: s => said.push(s), onFrame: f => frames.push(f) })
    if (r.skipped) return // no browser here
    assert.equal(r.reached, 'win', JSON.stringify(r))
    assert.equal(r.read, 'swarm')
    assert.ok(calls > 0 && r.jev > 0)
    assert.ok(said.includes('presses Start'), said.join(' | '))
    // the crow's name: the game ran inside the sandboxed frame
    assert.ok(said.includes('going for the crow'), said.join(' | '))
    assert.equal(r.ok, true)
    assert.match(r.line, /won the game/)
    // the screen is streamed as JPEG pictures
    assert.ok(frames.length > 0 && frames[0][0] === 0xff && frames[0][1] === 0xd8)
    assert.ok(r.saw.some(x => x.text === 'scene play'))
  } finally { srv.close() }
})
