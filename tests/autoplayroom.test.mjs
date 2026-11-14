// The Game room's Autoplay switch (web/canvas/autoplay.js): the typed phrases, when it is offered, and what the
// switch does with the server's answers and events.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoplayAsk, autoplayOffered, autoplayNone, autoplayRoom } from '../web/canvas/autoplay.js'

test('the typed switch takes only a whole phrase', () => {
  for (const t of ['play it for me', 'Play it for me.', 'please play it for me', 'autoplay', 'Autoplay on', 'start autoplay', 'turn autoplay on', 'let the AI play', 'play the game for me', 'watch it play']) assert.equal(autoplayAsk(t), 'start', t)
  for (const t of ['stop playing', 'Stop playing!', 'stop autoplay', 'autoplay off', 'turn off autoplay', 'let me play', "I'll play", 'stop the AI player']) assert.equal(autoplayAsk(t), 'stop', t)
  // a change for the builder, or the build's own Stop
  for (const t of ['stop', 'play', 'play it for me but faster', 'make the game play itself in the intro', 'add an autoplay button', 'stop the music playing', '']) assert.equal(autoplayAsk(t), null, t)
})

test('it is offered for a running game only, on a Studio that has a player', () => {
  const room = { run: 'r1', kind: 'game', url: 'http://127.0.0.1:5000/' }
  assert.equal(autoplayOffered(room, true), true)
  assert.equal(autoplayOffered(room, false), false)
  assert.equal(autoplayOffered({ ...room, kind: 'app' }, true), false)
  assert.equal(autoplayOffered({ ...room, url: null }, true), false)
  assert.match(autoplayNone({ ...room, kind: 'app' }, true), /Only a game/)
  assert.match(autoplayNone({ ...room, url: null }, true), /not running yet/)
  assert.match(autoplayNone(room, false), /no AI player/)
  assert.match(autoplayNone({ ...room, url: null }, false), /not running yet/)
})

// a stand-in for the few DOM parts the switch touches
function el() {
  const attrs = {}, kids = {}
  return {
    hidden: false, dataset: {}, innerHTML: '', textContent: '', onclick: null, onload: null,
    classList: { on: new Set(), toggle(c, v) { v ? this.on.add(c) : this.on.delete(c) } },
    setAttribute(k, v) { attrs[k] = v }, getAttribute: k => attrs[k] ?? null, removeAttribute(k) { delete attrs[k] },
    querySelector(sel) { return (kids[sel] ||= el()) },
  }
}
function setup(answers = {}) {
  const calls = [], said = [], btn = el(), cover = el(), img = cover.querySelector('img')
  // an <img>'s src is an attribute too
  Object.defineProperty(img, 'src', { set(v) { img.setAttribute('src', v) }, get() { return img.getAttribute('src') || '' } })
  const api = async (path, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null
    calls.push({ path, body })
    const a = body ? (body.stop ? { on: false } : answers.start || { on: true, live: false, say: 'starting' }) : answers.get || { on: false, jev: false }
    if (a.error) return { ok: false, status: 400, json: async () => a }
    return { ok: true, json: async () => a }
  }
  let pinned = 0
  const room = autoplayRoom({ btn, cover, api, stream: run => `/stream/${run}`, ico: n => `<svg data-n="${n}"></svg>`, cursor: '<span class="cur"></span>', showLive: () => { pinned++ }, botMsg: t => said.push(t), youSaid: t => said.push(`you: ${t}`) })
  return { room, btn, cover, img, calls, said, pins: () => pinned }
}
const tick = () => new Promise(r => setTimeout(r, 5))
const live = { run: 'r1', kind: 'game', url: 'http://127.0.0.1:5000/', live: true }

test('the switch is hidden until the server says it has a player, then one press plays', async () => {
  const s = setup()
  s.room.render(live)
  assert.equal(s.btn.hidden, true)
  await tick()
  assert.equal(s.btn.hidden, false)
  assert.equal(s.cover.hidden, true)
  assert.match(s.btn.innerHTML, /data-n="play"><\/svg>Autoplay$/)
  s.btn.onclick()
  // at once: pressed, the cover with the crew cursor at work, no picture asked for yet
  assert.equal(s.pins(), 1)
  assert.equal(s.cover.hidden, false)
  assert.equal(s.cover.querySelector('.app-skel').hidden, false)
  assert.equal(s.img.getAttribute('src'), null)
  assert.equal(s.cover.querySelector('.app-auto-say').textContent, 'starting')
  assert.match(s.btn.innerHTML, /data-n="square-stop"><\/svg>Autoplay$/)
  await tick()
  assert.deepEqual(s.calls.at(-1), { path: '/api/runs/r1/autoplay', body: { start: true } })
  assert.equal(s.img.getAttribute('src'), '/stream/r1')
  // the first picture, and a decision
  s.room.event({ run: 'r1', on: true, live: true, say: 'going for the crow' })
  assert.equal(s.cover.querySelector('.app-skel').hidden, true)
  assert.equal(s.img.hidden, false)
  assert.equal(s.cover.querySelector('.app-auto-say').textContent, 'going for the crow')
  // an event of another run is not this room's
  s.room.event({ run: 'r2', on: false, line: 'x' })
  assert.equal(s.room.now().on, true)
  // a second press stops it; a decision still on its way does not switch it back on
  s.btn.onclick()
  assert.equal(s.cover.hidden, true)
  assert.equal(s.img.getAttribute('src'), null)
  s.room.event({ run: 'r1', on: true, live: true, say: 'reads on' })
  assert.equal(s.room.now().on, false)
  await tick()
  assert.deepEqual(s.calls.at(-1).body, { stop: true })
  s.room.event({ run: 'r1', on: false, line: '' })
  assert.deepEqual(s.said, [])
})

test('leaving Live stops the player, and a play that ends by itself says what it did', async () => {
  const s = setup()
  s.room.render(live)
  await tick()
  s.btn.onclick()
  await tick()
  s.room.render({ ...live, live: false })
  assert.equal(s.room.now().on, false)
  await tick()
  assert.deepEqual(s.calls.at(-1).body, { stop: true })
  s.room.event({ run: 'r1', on: false, line: '' })
  // again, and this time it ends by itself
  s.room.render(live)
  s.btn.onclick()
  await tick()
  s.room.event({ run: 'r1', on: false, line: 'AI player won the game in 12 s · scripted moves' })
  assert.equal(s.cover.hidden, true)
  assert.deepEqual(s.said, ['AI player won the game in 12 s · scripted moves'])
  // leaving the room ends a play
  s.btn.onclick()
  await tick()
  s.room.leave()
  assert.equal(s.room.now().on, false)
  await tick()
  assert.deepEqual(s.calls.at(-1).body, { stop: true })
  // another run on screen: nothing of the first is kept
  s.room.render({ run: 'r2', kind: 'game', url: null })
  assert.equal(s.btn.hidden, true)
})

test('a player that could not start says why in the chat, and one already playing is picked up', async () => {
  const s = setup({ start: { error: 'the game is not running' } })
  s.room.render(live)
  await tick()
  s.btn.onclick()
  await tick()
  assert.equal(s.room.now().on, false)
  assert.deepEqual(s.said, ['The AI player could not start: the game is not running'])
  const t = setup({ get: { on: true, live: true, say: 'heads for the door' } })
  t.room.render(live)
  await tick()
  assert.equal(t.cover.hidden, false)
  assert.equal(t.img.getAttribute('src'), '/stream/r1')
  assert.equal(t.cover.querySelector('.app-auto-say').textContent, 'heads for the door')
})

test('the same switch, typed in the chat', async () => {
  const s = setup()
  s.room.render({ run: 'r1', kind: 'game', url: null, live: false })
  assert.equal(s.room.say('make the jump higher'), false)
  assert.equal(s.room.say('play it for me'), true)
  await tick()
  assert.deepEqual(s.said, ['you: play it for me', 'The game is not running yet. Say “show the game”, then ask again.'])
  // typed the moment the game is up, before the server has said it has a player: it waits for that answer
  s.room.render(live)
  assert.equal(s.room.say('Play it for me.'), true)
  await tick()
  assert.equal(s.room.now().on, true)
  await tick()
  assert.equal(s.room.say('stop playing'), true)
  assert.equal(s.room.now().on, false)
  assert.equal(s.room.say('stop playing'), true)
  assert.equal(s.said.at(-1), 'The AI player is not playing.')
})

test('the page has the switch beside the stage switch, with no tooltip, and the file is in the page once', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  assert.match(html, /id="app-stageview"[^\n]*\n\s*<button class="toggle" id="app-auto" aria-pressed="false" hidden>/)
  const auto = html.match(/<button class="toggle" id="app-auto"[^>]*>|<div class="app-auto" id="app-auto-view".*?<\/span><\/div>/gs).join('')
  assert.doesNotMatch(auto, /title=|data-tip/)
  const page = readFileSync(new URL('../server/page.mjs', import.meta.url), 'utf8')
  assert.equal(page.split("'canvas/autoplay.js'").length - 1, 1)
  assert.ok(page.indexOf("'canvas/autoplay.js'") < page.indexOf("'canvas/rooms.js'"))
})
