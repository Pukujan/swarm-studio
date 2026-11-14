// An AI player for a built game: the Game room's Autoplay. It plays in a headless
// browser and the Studio shows its screen live (server/autoplay.mjs).
//
// It is for any game, opted in or not. engine/autoplay.mjs is the other one: a
// command-line run for a game that hands Jev its own tactics on window.SWARM_PLAY.
//
// Two speeds. Every ~0.7 s a decision picks what to do next: with a key, Jev
// (OpenRouter Decisions) chooses an operation and a target from numbered things on
// screen (buttons and cards, enemies, labelled spots in the scene). Between decisions
// a local controller presses the keys every ~110 ms: walk, aim, swing, dash. When Jev
// is missing, slow or failing, a scripted policy makes the same kind of decision, so
// the player never stops.
//
// What it reads, in this order:
//   1. window.__swarm, the state every game the Studio builds publishes for the play
//      test (engine/playcheck.mjs probeBrief): the scene, the hero, the actors.
//   2. window.SWARM_PLAY, when the game opted in: its tactics, and its own autopilot.
//   3. A Phaser game from the inside, when the page has one: the served bundle is
//      patched to keep a handle on the game. Best effort: a bundle the patch does not
//      match is played as 4.
//   4. The page's buttons and the usual keys.
//
// The game is played inside a sandboxed frame (scripts only), the way Hermes shows it
// and the way the build's play test plays it (engine/playtest.mjs).

import { launch, loadPlaywright } from './playtest.mjs'
import { DECISIONS, decisionBody as tacticBody } from './autoplay.mjs'

export const JEV_URL = DECISIONS
// the model engine/autoplay.mjs asks by default
export const JEV_MODEL = 'typesafe/jev-1.14'
const TICK = 110
const DECIDE_EVERY = 700
const JEV_TIMEOUT = 2500

// ---------------------------------------------------------------- the page ---

// What the player sees, read inside the page in one call. Every position is in
// page pixels, so the controller never needs the camera.
const PROBE = `(() => {
  const W = window, seq = () => (W.__apSeq = (W.__apSeq || 0) + 1)
  const tag = o => (o.__ap ||= seq())
  const words = s => String(s || '').replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\\s+/g, ' ').trim().toLowerCase()
  const shown = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth }
  // buttons and cards on the page (a game's menus, blessing cards, dialogue)
  const controls = [], els = []
  for (const el of document.querySelectorAll('button, [role=button], a[href], [data-choice], [onclick]')) {
    if (els.some(p => p.contains(el)) || !shown(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue
    if (el.tagName === 'A') { try { if (new URL(el.href).origin !== location.origin) continue } catch { continue } }
    const lines = (el.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean)
    const label = (lines.join(' · ') || el.getAttribute('aria-label') || el.title || '').slice(0, 90)
    if (!label) continue
    els.push(el)
    const r = el.getBoundingClientRect(), id = tag(el)
    el.setAttribute('data-ap', id)
    controls.push({ id: 'c' + id, label, name: (lines[0] || label).slice(0, 40), big: r.width * r.height > 24000 || lines.length > 2, x: r.x + r.width / 2, y: r.y + r.height / 2 })
  }
  const text = (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 500)
  // a dialogue or modal box open over the game
  const box0 = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open], [class*=dialog i], [class*=speech i]')].find(shown)
  const g = W.__game, out = { controls, text, phaser: !!g, canvas: !!document.querySelector('canvas'), dialog: box0 ? (box0.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160) || 'open' : null }
  // the state the game publishes itself: read only, and copied so nothing of the game's is held
  try { if (W.__swarm && typeof W.__swarm === 'object') out.swarm = JSON.parse(JSON.stringify(W.__swarm)) } catch {}
  try { if (W.SWARM_PLAY && typeof W.SWARM_PLAY.state === 'function') out.play = JSON.parse(JSON.stringify(W.SWARM_PLAY.state())) } catch {}
  { const c = document.querySelector('canvas'); if (c) { const r = c.getBoundingClientRect(); out.view = { x: r.x + r.width / 2, y: r.y + r.height / 2 } } }
  if (!g || !g.scene || !g.canvas) return out
  const box = g.canvas.getBoundingClientRect(), sx = box.width / g.scale.width, sy = box.height / g.scale.height
  const live = g.scene.scenes.filter(s => s.sys.isActive() || s.sys.isPaused())
  out.scenes = live.map(s => s.sys.settings.key)
  out.paused = live.some(s => s.sys.isPaused())
  const isObj = v => v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number' && v.scene && v.active !== false
  // the hero: a game object kept on the scene (or one level down) under a hero-like name
  let main = null, hero = null
  for (const s of live.slice().reverse()) {
    const look = (o, depth) => {
      for (const k of Object.keys(o)) {
        let v; try { v = o[k] } catch { continue }
        if (/^(hero|player|avatar|ship|character|pc)$/i.test(k) && isObj(v) && v.texture) return v
        if (depth && v && typeof v === 'object' && !v.scene && !Array.isArray(v) && !(v instanceof Node) && k !== 'sys' && k !== 'game' && !/^(load|cache|textures|anims|sound|registry|plugins|make|add|events|input|physics|tweens|time|cameras|scale|data|renderer|lights)$/.test(k)) { const f = look(v, depth - 1); if (f) return f }
        if (depth && v && typeof v === 'object' && v.scene === s && !v.texture && !v.getChildren) { const f = look(v, depth - 1); if (f) return f }
      }
      return null
    }
    hero = look(s, 1)
    if (hero) { main = s; break }
  }
  main ||= live.at(-1)
  if (!main) return out
  const cam = main.cameras && main.cameras.main
  const toPage = (x, y) => cam ? [box.left + (x - cam.worldView.x) * cam.zoom * sx, box.top + (y - cam.worldView.y) * cam.zoom * sy] : [box.left + x * sx, box.top + y * sy]
  out.scene = main.sys.settings.key
  out.paused = out.paused || main.sys.isPaused()
  if (typeof main.state === 'string') out.state = main.state
  if (hero) {
    const [px, py] = toPage(hero.x, hero.y)
    out.hero = { x: hero.x, y: hero.y, px, py, hp: typeof hero.hp === 'number' ? Math.round(hero.hp) : null, maxHp: typeof hero.maxHp === 'number' ? Math.round(hero.maxHp) : null }
  }
  // the foes: children of an enemy-like group on the scene
  const foes = [], foeSet = new Set()
  for (const k of Object.keys(main)) {
    let v; try { v = main[k] } catch { continue }
    if (!/enem|foe|monster|mob|baddie|zombie|alien|invader|boss|creep/i.test(k) || /shot|bullet|projectile|missile|spell|fx|hit/i.test(k) || !v) continue
    const list = typeof v.getChildren === 'function' ? v.getChildren() : Array.isArray(v) ? v : isObj(v) ? [v] : []
    for (const f of list) {
      if (!isObj(f) || f.active === false || f.visible === false || foeSet.has(f)) continue
      if (typeof f.hp === 'number' && f.hp <= 0) continue
      foeSet.add(f)
      const [px, py] = toPage(f.x, f.y)
      const d = hero ? Math.hypot(f.x - hero.x, f.y - hero.y) : 0
      foes.push({ id: 'f' + tag(f), name: words(f.kind || f.name || (f.texture && f.texture.key) || 'enemy'), x: f.x, y: f.y, px, py, d: Math.round(d), hp: typeof f.hp === 'number' ? Math.round(f.hp) : null })
    }
  }
  foes.sort((a, b) => a.d - b.d)
  out.foes = foes.slice(0, 8)
  out.foeCount = foes.length
  // labelled spots in the scene: words drawn on the canvas, and pictures that are not the hero, a foe or a backdrop
  const things = [], seen = new Set(), area = g.scale.width * g.scale.height
  for (const o of (main.children && main.children.list) || []) {
    if (!o || o === hero || foeSet.has(o) || o.visible === false || o.alpha === 0 || typeof o.x !== 'number') continue
    if (o.scrollFactorX === 0) continue // HUD, pinned to the screen
    let name = '', kind = 'image'
    if (typeof o.text === 'string') { name = o.text.replace(/\\s+/g, ' ').trim(); kind = 'text' }
    else if (o.texture && o.texture.key && !/^__/.test(o.texture.key) && o.displayWidth * o.displayHeight < area * 0.2 && o.displayWidth > 12) name = words(o.texture.key)
    if (!name || name.length > 40 || /^[\\d\\s.:/%×x+-]+$/.test(name) || /glow|shadow|particle|spark|vignette|light|floor|wall|bg|background|tile/i.test(name)) continue
    const [px, py] = toPage(o.x, o.y)
    if (px < box.left || px > box.right || py < box.top || py > box.bottom) continue
    // a prompt drawn by the game ("E — Step through the stage door"): the key to press, and what it does
    const pr = /^(?:\\[?([A-Z]|space|enter)\\]?)\\s*[—–:-]\\s*(.+)$/i.exec(name)
    const press = pr ? (pr[1].length === 1 ? 'Key' + pr[1].toUpperCase() : pr[1][0].toUpperCase() + pr[1].slice(1).toLowerCase()) : null
    if (pr) name = pr[2]
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    things.push({ id: 't' + tag(o), name, x: o.x, y: o.y, px, py, d: hero ? Math.round(Math.hypot(o.x - hero.x, o.y - hero.y)) : 0, kind: press ? 'prompt' : kind, ...(press ? { press } : {}) })
  }
  things.sort((a, b) => a.d - b.d)
  out.things = things.slice(0, 16)
  return out
})()`

// The probe's answer as one observation. A game that publishes window.__swarm is read from that:
// its positions are the game's own (world) coordinates and say nothing of the camera, so the hero,
// the enemies and the pickups get no place on the page (px, py): the controller steers with the
// keys and never aims the mouse at them. `seen`: the scene can be read (not just the page's buttons).
const words = s => String(s || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
export function observe(raw) {
  const o = { controls: [], text: '', ...raw }
  const sw = raw?.swarm, num = v => typeof v === 'number' && Number.isFinite(v)
  if (sw && typeof sw === 'object') {
    const hero = sw.hero && num(sw.hero.x) && num(sw.hero.y) ? { x: sw.hero.x, y: sw.hero.y, hp: num(sw.hero.hp) ? Math.round(sw.hero.hp) : null, maxHp: num(sw.hero.maxHp) ? Math.round(sw.hero.maxHp) : null } : null
    const near = a => (hero ? Math.round(Math.hypot(a.x - hero.x, a.y - hero.y)) : 0)
    const actors = (Array.isArray(sw.actors) ? sw.actors : []).filter(a => a && num(a.x) && num(a.y)).slice(0, 40)
    const list = (kind, tag) => actors.filter(a => a.kind === kind).map((a, i) => ({ id: `${tag}${String(a.id ?? i).slice(0, 40)}`, name: words(a.name || kind).slice(0, 40) || kind, x: a.x, y: a.y, d: near(a) })).sort((a, b) => a.d - b.d)
    const foes = list('enemy', 's'), things = list('pickup', 'p').map(t => ({ ...t, kind: 'pickup' }))
    Object.assign(o, { seen: true, read: 'swarm', scene: String(sw.scene || '').slice(0, 40), paused: sw.scene === 'pause', hero, foes: foes.slice(0, 8), foeCount: foes.length, things: things.slice(0, 16) })
    delete o.state
  } else Object.assign(o, { seen: !!raw?.phaser, read: raw?.phaser ? 'phaser' : 'page' })
  // a game that opted in (engine/autoplay.mjs): its tactics, for Jev to choose among
  const tactics = raw?.play?.tactics
  if (tactics && typeof tactics === 'object' && Object.keys(tactics).length > 1) o.tactics = tactics
  delete o.swarm
  return o
}

// ---------------------------------------------------------- the decisions ---

const GOAL = 'Play this game well and see as much of it as you can: start it, read through dialogue, beat the enemies in each room, take a blessing or upgrade when one is offered, then go through the next door. Stay alive: back away when low on health. Never open settings, credits, links or quit.'

// One short line about the game for the decision, from what the probe saw
export function summary(o) {
  const bits = []
  if (o.scene) bits.push(`Scene: ${o.scene}${o.state ? ` (state ${o.state})` : ''}${o.paused ? ', paused (a dialogue or menu is open)' : ''}.`)
  if (o.dialog) bits.push(`A dialogue is open: ${o.dialog}`)
  if (o.hero) bits.push(`Hero${o.hero.hp != null ? ` health ${o.hero.hp}${o.hero.maxHp ? `/${o.hero.maxHp}` : ''}` : ''}.`)
  if (o.foeCount) bits.push(`${o.foeCount} enemies: ${o.foes.map(f => `${f.name} ${f.d}px away`).join(', ')}.`)
  else if (o.hero) bits.push('No enemies on screen.')
  if (o.things?.length) bits.push(`In the scene: ${o.things.map(t => `${t.name} (${t.d}px)`).join(', ')}.`)
  if (o.text) bits.push(`Page text: ${o.text.slice(0, 300)}`)
  return bits.join(' ')
}

// The Decisions request: the operations open right now, and one target head per operation
export function decisionBody(o, history = [], model = JEV_MODEL) {
  const ops = {}, heads = {}
  if (o.controls?.length) {
    ops.CLICK = 'Click a button or card on the page: start the game, pick a blessing or upgrade, continue a dialogue.'
    heads.click_target = Object.fromEntries(o.controls.map((c, i) => [String(i + 1), { element: `[${i + 1}] ${c.label}` }]))
  }
  if (o.foeCount) {
    ops.FIGHT = 'Go for an enemy and attack it.'
    ops.DODGE = 'Back away from the nearest enemy and dash out of danger.'
    heads.fight_target = Object.fromEntries(o.foes.map((f, i) => [String(i + 1), { element: `[${i + 1}] ${f.name}, ${f.d}px away${f.hp != null ? `, health ${f.hp}` : ''}` }]))
  }
  if (o.hero && o.things?.length) {
    ops.GO_TO = 'Walk the hero to something in the scene and use it: a door, a person to talk to, a chest, a stall.'
    heads.go_to_target = Object.fromEntries(o.things.map((t, i) => [String(i + 1), { element: `[${i + 1}] ${t.name}, ${t.d}px away` }]))
  }
  ops.ADVANCE = 'Press on: continue dialogue, skip a title or intro.'
  if (o.controls?.length) ops.ESCAPE = 'Close a menu, store or overlay that is in the way (Escape).'
  if (!o.seen) ops.PLAY = 'Keep playing with the usual keys (arrows, space, clicks).'
  const questions = { operation: { type: 'choice', criteria: ops, instructions: { goal: GOAL } } }
  for (const [name, criteria] of Object.entries(heads)) {
    const op = name.replace(/_target$/, '').toUpperCase()
    if (ops[op]) questions[name] = { type: 'choice', criteria, instructions: { goal: GOAL, operation: op, rules: 'Choose only an offered index. This picks the target only if that operation is chosen.' } }
  }
  return { model, state: { page: { url: 'game', title: o.scene || 'game', text: summary(o) }, elements: [], recent_actions: history.slice(-6) }, questions }
}

const OP = { ESCAPE: 'escape', CLICK: 'click', FIGHT: 'fight', DODGE: 'dodge', GO_TO: 'goto', ADVANCE: 'advance', PLAY: 'play' }
// Jev's answer → an intent on something the probe saw; null when it does not fit
export function intentFrom(answers, o) {
  const op = answers?.operation?.choice
  const kind = OP[op]
  if (!kind) return null
  const pick = (head, list) => {
    const i = Number(answers?.[head]?.choice) - 1
    return Number.isInteger(i) && list?.[i] ? list[i] : null
  }
  if (kind === 'click') { const c = pick('click_target', o.controls); return c && { kind, target: c } }
  if (kind === 'fight') { const f = pick('fight_target', o.foes); return f && { kind, target: f } }
  if (kind === 'goto') { const t = pick('go_to_target', o.things); return t && { kind, target: t } }
  if (kind === 'dodge') return o.foes?.[0] ? { kind, target: o.foes[0] } : null
  return { kind }
}

const START = /^(play|start|begin|enter|continue|next|ok|go|resume|new (game|run)|tap to|press .* to)/i
const AVOID = /setting|option|credit|quit|exit to|menu|mute|sound|music|volume|full ?screen|help|share|back|close|leave|abandon|give up|made with/i
const CLOSE = /^(close|done|back|leave|return|resume|×|✕|x)\b/i
const DOOR = /door|exit|gate|stair|portal|next|onward|path|tunnel|trapdoor/i
// stores and HUD captions ("Armory · credits taken") lead nowhere
const SHOP = /armou?ry|shop|store|market|browse|buy|vendor|merchant|·/i

// The scripted policy: the same kind of decision with no model, used whenever Jev cannot answer
export function scripted(o, memory = {}) {
  const hero = o.hero
  const usable = (o.controls || []).filter(c => !AVOID.test(c.label))
  const talking = o.paused || !!o.dialog
  const busy = !hero || talking || !o.foeCount
  const start = usable.find(c => START.test(c.name))
  if (start && !o.foeCount) return { kind: 'click', target: start }
  if (usable.length && (busy || start)) {
    const cards = usable.filter(c => c.big)
    const c = cards.length >= 2 ? cards[(memory.picks = (memory.picks || 0) + 1) % cards.length] : start || (talking || !hero ? usable[0] : null)
    if (c) return { kind: 'click', target: c }
  }
  // a menu or store open over the game and the hero not moving: close it
  if (o.controls?.length && !o.foeCount && o.stillMs > 3000) {
    const close = o.controls.find(c => CLOSE.test(c.name))
    return close ? { kind: 'click', target: close } : { kind: 'escape' }
  }
  if (talking || (o.state && /intro|dialog|talk|cutscene|story|speech/i.test(o.state))) return { kind: 'advance' }
  // a game that says where it is: its title, pause and end screens are pressed past
  if (o.read === 'swarm' && o.scene && o.scene !== 'play') return { kind: 'advance' }
  // a prompt on screen ("E — Step through the stage door"): a door's is taken, others once
  const prompt = o.things?.find(t => t.press && DOOR.test(t.name)) || o.things?.find(t => t.press && !SHOP.test(t.name) && !(memory.used || []).includes(t.name))
  if (prompt && !o.foeCount) { memory.used = [...(memory.used || []), prompt.name].slice(-4); return { kind: 'goto', target: prompt } }
  if (!o.seen) return { kind: 'play' }
  if (o.foeCount) {
    const low = hero?.hp != null && hero.maxHp && hero.hp / hero.maxHp < 0.3
    return low && o.foes[0].d < 90 ? { kind: 'dodge', target: o.foes[0] } : { kind: 'fight', target: o.foes[0] }
  }
  if (hero && o.things?.length) {
    // a door first: a prompt over one, then a picture of one, then a word; the same door until it has had six goes
    memory.tries ||= {}
    const rank = { prompt: 0, image: 1, text: 2 }
    const doors = o.things.filter(t => DOOR.test(t.name) && (memory.tries[t.name] || 0) < 6 && !SHOP.test(t.name)).sort((a, b) => (rank[a.kind] ?? 2) - (rank[b.kind] ?? 2) || a.d - b.d)
    memory.tried ||= []
    const fresh = o.things.filter(t => !memory.tried.includes(t.name) && !SHOP.test(t.name))
    const t = doors[0] || fresh[0] || o.things[(memory.n = (memory.n || 0) + 1) % o.things.length]
    memory.tries[t.name] = (memory.tries[t.name] || 0) + 1
    memory.tried = [...memory.tried.filter(n => n !== t.name), t.name].slice(-6)
    return { kind: 'goto', target: t }
  }
  // a game that says it is in play, with nothing to head for: the usual keys
  return o.read === 'swarm' ? { kind: 'play' } : { kind: 'advance' }
}

// The calm label the Studio shows: what the player just decided
export function sayFor(intent) {
  const t = intent.target
  const name = t ? String(t.name || t.label || '').replace(/^the /i, '') : ''
  const title = s => (s && s === s.toUpperCase() ? s.toLowerCase() : s)
  switch (intent.kind) {
    case 'click': return t.big ? `picks ${title(name)}` : `presses ${title(name)}`
    case 'fight': return `going for the ${title(name)}`
    case 'dodge': return `dodges the ${title(name)}`
    case 'goto': return t.press ? title(name).replace(/^./, c => c.toLowerCase()) : `heads for the ${title(name)}`
    case 'tactic': return `tries ${words(name)}`
    case 'advance': return 'reads on'
    case 'escape': return 'closes the menu'
    default: return 'plays on'
  }
}

// Jev over OpenRouter Decisions; throws on anything that is not a clean answer
export function jevDecider({ key, url = JEV_URL, model = JEV_MODEL, fetchImpl = fetch, timeout = JEV_TIMEOUT } = {}) {
  if (!key) return null
  return async (o, history) => {
    // a game with its own tactics is asked the way engine/autoplay.mjs asks: which tactic next
    const own = o.tactics && o.play?.mode === 'play'
    const body = own ? tacticBody(o.play, history.map(h => h.action), model) : decisionBody(o, history, model)
    const r = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
    if (!r.ok) throw new Error(`Jev answered ${r.status}`)
    const j = await r.json()
    const pick = own ? j.answers?.tactic?.choice : null
    const intent = own ? (Object.keys(o.tactics).includes(pick) ? { kind: 'tactic', target: { name: pick } } : null) : intentFrom(j.answers, o)
    if (!intent) throw new Error('Jev picked nothing that is on screen')
    return intent
  }
}

// ---------------------------------------------------------------- the play ---

// aiPlay(url, opts) → a report of what the player did and saw
//   seconds   longest run; until: 'progress' stops at a room clear, a win or a choice screen
//   decide    (observation, history) → intent, e.g. jevDecider(); null plays scripted only
//   onFrame   (jpeg Buffer) for a live view; onSay (text, from) for each new decision label
//   signal    stops it
export async function aiPlay(url, { seconds = 60, until = null, decide = null, onFrame = null, onSay = null, signal = null, viewport = { width: 1280, height: 720 } } = {}) {
  const pw = await loadPlaywright()
  if (!pw) return { ok: true, skipped: 'no browser for the AI player' }
  let browser
  try { browser = await launch(pw.chromium, { args: ['--autoplay-policy=no-user-gesture-required'] }) } catch (e) { return { ok: true, skipped: `the browser would not start: ${String(e.message).slice(0, 120)}` } }
  const t0 = Date.now(), errors = [], saw = [], picks = [], history = []
  const stats = { decisions: 0, jev: 0, jevFailed: 0, scripted: 0, jevMs: [] }
  const note = text => { const at = Math.round((Date.now() - t0) / 100) / 10; if (saw.at(-1)?.text !== text) saw.push({ at, text }) }
  let reached = null, ended = null, probeErr = null, read = 'page'
  try {
    const ctx = await browser.newContext({ viewport })
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)))
    // keep a handle on a Phaser game: the bundle's Game constructor stores itself on window
    await page.route(/\.m?js(\?|$)/, async route => {
      if (route.request().resourceType() !== 'script' || !/phaser|index|main|vendor|chunk/i.test(route.request().url())) return route.continue()
      try {
        const r = await route.fetch()
        const body = await r.text()
        if (!body.includes('this.config = new Config(config);')) return route.fulfill({ response: r, body })
        await route.fulfill({ response: r, body: body.replace('this.config = new Config(config);', 'window.__game = this; this.config = new Config(config);') })
      } catch { await route.continue().catch(() => {}) }
    })
    let cdp = null
    if (onFrame) {
      cdp = await ctx.newCDPSession(page)
      cdp.on('Page.screencastFrame', f => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); try { onFrame(Buffer.from(f.data, 'base64')) } catch {} })
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: viewport.width, maxHeight: viewport.height })
    }
    // The game sits in a sandboxed frame (scripts only, origin null), as Hermes shows it and as the play
    // test plays it. The outer page is an empty one on the game's own origin first, so the frame is a
    // secure context (a Godot web export refuses to start without one).
    const blank = new URL('/__aiplayer', url).href
    await page.route(blank, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>AI player</title>' }))
    await page.goto(blank, { timeout: 30000 }).catch(() => {})
    await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe sandbox="allow-scripts allow-forms" src="${String(url).replace(/"/g, '&quot;')}" style="display:block;width:100vw;height:100vh;border:0"></iframe>`, { waitUntil: 'load', timeout: 30000 })
    const holder = await page.$('iframe')
    const g = await holder.contentFrame()
    await g.waitForSelector('canvas', { timeout: 15000 }).catch(() => {})
    // a game that publishes its state says when it is up (a Godot export boots for seconds)
    await g.waitForFunction(() => window.__swarm || (window.__game && window.__game.isBooted) || !document.querySelector('canvas'), null, { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1200)
    // the keys go to the game: the frame, then its canvas, hold the focus
    await holder.focus().catch(() => {})
    // (a canvas that takes the focus itself, as a Godot export's does, gets it; its focus ring is left out of
    // the picture: this is the player's own browser, the person's game is not touched)
    await g.addStyleTag({ content: 'canvas:focus { outline: none !important }' }).catch(() => {})
    await g.evaluate(() => { const c = document.querySelector('canvas'); if (c && c.hasAttribute('tabindex')) c.focus() }).catch(() => {})
    // a game that opted in starts its own run, with its own autopilot between decisions
    await g.evaluate(() => { const p = window.SWARM_PLAY; if (p && typeof p.start === 'function') p.start(null) }).catch(() => {})

    // the controller's hands
    const held = new Set()
    const hold = async want => {
      for (const k of [...held]) if (!want.has(k)) { held.delete(k); await page.keyboard.up(k).catch(() => {}) }
      for (const k of want) if (!held.has(k)) { held.add(k); await page.keyboard.down(k).catch(() => {}) }
    }
    const toward = (dx, dy, dead = 18) => {
      const k = new Set()
      if (dx > dead) k.add('KeyD'), k.add('ArrowRight'); if (dx < -dead) k.add('KeyA'), k.add('ArrowLeft')
      if (dy > dead) k.add('KeyS'), k.add('ArrowDown'); if (dy < -dead) k.add('KeyW'), k.add('ArrowUp')
      return k
    }

    const memory = {}
    let intent = null, intentAt = 0, pending = null, lastDecide = 0, jevOffUntil = 0, jevFails = 0, tick = 0
    let lastSay = '', seenFoes = 0, clearSince = 0, heroWas = null, stillSince = Date.now(), lastScene = '', lastState = ''
    const setIntent = (next, from) => {
      intent = next; intentAt = Date.now(); stats.decisions++
      stats[from]++
      history.push({ action: `${next.kind}${next.target ? ` ${next.target.name || next.target.label}` : ''}`, kind: next.kind })
      const say = sayFor(next)
      if (next.kind === 'click' && next.target.big) picks.push(next.target.name)
      if (say !== lastSay) { lastSay = say; onSay?.(say, from); note(say) }
    }

    while (Date.now() - t0 < seconds * 1000 && !signal?.aborted) {
      const raw = await g.evaluate(PROBE).catch(e => { probeErr ||= String(e.message).slice(0, 160); return null })
      if (!raw) { await page.waitForTimeout(300); continue }
      const o = observe(raw)
      read = o.read
      // what changed, for the report
      if (o.scene && o.scene !== lastScene) { note(`scene ${o.scene}`); lastScene = o.scene }
      if (o.state && o.state !== lastState) { if (lastState) note(`state ${o.state}`); lastState = o.state }
      if (o.foeCount) { seenFoes = Math.max(seenFoes, o.foeCount); clearSince = 0 }
      const cleared = (o.state && /clear|won|victory|complete/i.test(o.state)) || (seenFoes && !o.foeCount && o.hero && !o.paused && (clearSince ||= Date.now()) && Date.now() - clearSince > 1500)
      if (o.read === 'swarm' && o.scene === 'win' && reached !== 'win') { reached = 'win'; note('won') }
      if (cleared && !reached) { reached = 'clear'; note('room cleared') }
      if (seenFoes && o.controls.filter(c => c.big).length >= 2 && !reached) { reached = 'choice'; note(`a choice: ${o.controls.filter(c => c.big).map(c => c.name).join(' / ')}`) }
      if (((o.hero?.hp != null && o.hero.hp <= 0) || (o.read === 'swarm' && o.scene === 'lose')) && !ended) { ended = 'the hero fell'; note('the hero fell') }
      if (/game over|you (lost|died)|run over/i.test(o.text) && !ended) { ended = 'game over'; note('game over') }
      if (until === 'progress' && (reached || ended)) { await page.waitForTimeout(900); break }
      if (o.hero) {
        if (heroWas && Math.hypot(o.hero.x - heroWas.x, o.hero.y - heroWas.y) > 4) stillSince = Date.now()
        heroWas = o.hero
      }

      o.stillMs = Date.now() - stillSince
      // the slow loop: a new decision every ~0.7 s, or when the last intent is done
      // a walk to somewhere runs until it arrives (or gives up), unless enemies show up
      const walking = intent?.kind === 'goto' && !intent.target.press && !o.foeCount && !o.paused && !o.dialog && o.controls.length === 0
      const due = !intent || (!walking && Date.now() - lastDecide > DECIDE_EVERY)
      if (due && !pending) {
        lastDecide = Date.now()
        if (decide && Date.now() > jevOffUntil) {
          const t = Date.now()
          pending = decide(o, history).then(next => {
            stats.jevMs.push(Date.now() - t); jevFails = 0
            setIntent(next, 'jev')
          }, err => {
            stats.jevFailed++; jevFails++
            if (jevFails === 1) note(`Jev could not answer (${String(err.message).slice(0, 60)}): scripted moves meanwhile`)
            if (jevFails >= 3) jevOffUntil = Date.now() + 20000
            setIntent(scripted(o, memory), 'scripted')
          }).finally(() => { pending = null })
          // the hands keep going while Jev thinks: the scripted move covers the gap
          if (!intent) setIntent(scripted(o, memory), 'scripted')
        } else setIntent(scripted(o, memory), 'scripted')
      }

      // the fast loop: carry out the intent with keys and the mouse
      await act(page, g, o, intent, { hold, toward, tick, since: Date.now() - intentAt, stuck: Date.now() - stillSince > 2500, done: () => { intent = null } })
      tick++
      await page.waitForTimeout(TICK)
    }
    await hold(new Set())
    if (cdp) await cdp.send('Page.stopScreencast').catch(() => {})
    await ctx.close()
    const ms = stats.jevMs.sort((a, b) => a - b)
    const report = {
      ok: !errors.length,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
      reached, ended, read, picks: [...new Set(picks)],
      saw: saw.slice(-24),
      decisions: stats.decisions, jev: stats.jev, scripted: stats.scripted, jevFailed: stats.jevFailed,
      jevMedianMs: ms.length ? ms[ms.length >> 1] : null,
      errors: [...new Set(errors)].slice(0, 3),
    }
    if (!stats.decisions && probeErr) report.skipped = `the AI player could not read the page: ${probeErr}`
    report.line = line(report)
    return report
  } catch (e) {
    return { ok: true, skipped: `the AI player could not run: ${String(e.message).slice(0, 160)}` }
  } finally {
    await browser.close().catch(() => {})
  }
}

// One sentence for what the player did
export function line(r) {
  if (r.skipped) return `The AI player did not play: ${r.skipped}`
  const where = r.reached === 'win' ? 'won the game' : r.reached === 'clear' ? 'cleared a room' : r.reached === 'choice' ? 'reached a choice screen' : 'played on'
  const bits = [`AI player ${where} in ${r.seconds} s`]
  if (r.picks?.length) bits.push(`picked ${r.picks.slice(0, 3).join(', ')}`)
  if (r.ended) bits.push(r.ended)
  bits.push(r.jev ? `${r.jev} of ${r.decisions} moves chosen by Jev` : 'scripted moves')
  if (r.errors?.length) bits.push(`errors: ${r.errors[0]}`)
  return bits.join(' · ')
}

// One tick of the controller
async function act(page, g, o, intent, { hold, toward, tick, since, stuck, done }) {
  if (!intent) return hold(new Set())
  const hero = o.hero
  const target = intent.target && (intent.kind === 'fight' || intent.kind === 'dodge' ? o.foes?.find(f => f.id === intent.target.id) || o.foes?.[0] : intent.kind === 'goto' ? o.things?.find(t => t.id === intent.target.id) : intent.target)
  switch (intent.kind) {
    case 'click': {
      await hold(new Set())
      const sel = `[data-ap="${intent.target.id.slice(1)}"]`
      const el = await g.$(sel)
      if (el) await el.click({ timeout: 1500 }).catch(() => page.mouse.click(intent.target.x, intent.target.y))
      return done()
    }
    case 'tactic': {
      // the game's own tactic (window.SWARM_PLAY): it carries it out itself until the next one
      await hold(new Set())
      await g.evaluate(([name, why]) => window.SWARM_PLAY?.act?.(name, why), [intent.target.name, 'ai player']).catch(() => {})
      return done()
    }
    case 'escape': {
      await hold(new Set())
      await page.keyboard.press('Escape').catch(() => {})
      return done()
    }
    case 'advance': {
      await hold(new Set())
      await page.keyboard.press(since < TICK * 2 ? 'Space' : 'Enter').catch(() => {})
      if (since > TICK * 3) done()
      return
    }
    case 'fight': {
      if (!hero || !target) return done()
      // close in when far, back off when very close, sidestep when stuck
      const dx = target.x - hero.x, dy = target.y - hero.y, d = Math.hypot(dx, dy)
      // (with no place to aim at, a swing only lands up close: walk right up to it)
      const sign = target.px == null ? (d > 24 ? 1 : 0) : d > 120 ? 1 : d < 60 ? -1 : 0
      let keys = sign ? toward(dx * sign, dy * sign) : new Set()
      if (stuck && sign) keys = toward(-dy, dx)
      await hold(keys)
      // aim where the enemy is on the page; a game read from window.__swarm gives no such place, so the
      // swing goes to the middle of the canvas
      const at = target.px != null ? { x: target.px, y: target.py } : o.view
      if (at) { await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up() }
      if (tick % 9 === 4) await page.keyboard.press('Shift').catch(() => {})
      if (tick % 13 === 7) await page.keyboard.press('Space').catch(() => {})
      return
    }
    case 'dodge': {
      if (!hero || !target) return done()
      await hold(toward(hero.x - target.x, hero.y - target.y, 0))
      if (since < TICK * 2) await page.keyboard.press('Shift').catch(() => {})
      if (since > 650) done()
      return
    }
    case 'goto': {
      if (!hero || !target) return done()
      // a prompt the game drew: press its key
      if (target.press) { await hold(new Set()); await page.keyboard.press(target.press).catch(() => {}); return done() }
      const dx = target.x - hero.x, dy = target.y - hero.y, d = Math.hypot(dx, dy)
      // a click on it first: many games walk there or use it on a click
      if (since < TICK * 2 && target.px != null) await page.mouse.click(target.px, target.py).catch(() => {})
      let keys = toward(dx, dy, 10)
      if (stuck) keys = toward(-dy + dx * 0.3, dx + dy * 0.3, 10)
      await hold(d < 44 ? new Set() : keys)
      // use it once close, but only when nothing else is nearer (E would use that instead)
      const nearest = Math.min(...(o.things || []).filter(t => !t.press).map(t => t.d))
      if (d < 140 && target.d <= nearest + 1 && tick % 3 === 0) await page.keyboard.press('KeyE').catch(() => {})
      if (since > 7000 || (d < 44 && since > 1200)) done()
      return
    }
    default: {
      // a game the player cannot read: the usual keys, a tap now and then
      await hold(new Set())
      const keys = ['Space', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'KeyW', 'KeyD']
      if (tick % 3 === 0) {
        const box = await g.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.7 } }).catch(() => null)
        if (box) { await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.waitForTimeout(180); await page.mouse.up() }
      } else await page.keyboard.press(keys[tick % keys.length]).catch(() => {})
      if (since > 1500) done()
    }
  }
}
