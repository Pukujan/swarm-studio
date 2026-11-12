// The play checks: what a play test asserts, made from the game's own spec. The
// old play test pressed a few keys and looked for "game over"; it passed a game
// whose hero could not crouch, whose crow paced on the spot and whose builder had
// taught it to play itself when a test was watching (issue #245). These checks
// hold each control the spec names and read the game's state to see that the
// move happened, watch how enemies move and count the companions, and say what
// went wrong as an ask the builder can act on.
//
// The game publishes its state for this on window.__swarm (web engines and the
// Godot web export alike), see probeBrief below. Reading only: a game must never
// behave differently because it is being tested.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { companionOf, sideView } from './game.mjs'

const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const SHOWN = { ArrowRight: 'Right', ArrowLeft: 'Left', ArrowUp: 'Up', ArrowDown: 'Down', KeyA: 'A', KeyD: 'D', KeyW: 'W', KeyS: 'S', KeyZ: 'Z', KeyC: 'C', ControlLeft: 'Ctrl', Space: 'Space' }
export const keyName = k => SHOWN[k] || k

// The checks for a spec: one per control it names, one per enemy, one for the companion.
// Only what the spec says is asserted; a mouse or touch game gets no key checks.
export function checklist(spec) {
  const text = String(spec?.controls || '')
  const clauses = text.split(/[.;\n]+/).map(c => c.trim()).filter(Boolean)
  const clause = words => clauses.find(c => new RegExp(`^(${words})\\b`, 'i').test(c)) || clauses.find(c => new RegExp(`\\b(${words})`, 'i').test(c)) || ''
  const out = []
  const move = clause('move|run|walk|steer')
  if (move || /\b(wasd|arrow)/i.test(text)) {
    const arrows = /arrow|left\s*(\/|or)\s*right|[←→]/i.test(move || text)
    const [r, l] = arrows || !/\bA\s*\/\s*D\b|wasd/i.test(move || text) ? ['ArrowRight', 'ArrowLeft'] : ['KeyD', 'KeyA']
    out.push({ id: 'right', kind: 'control', keys: [r], say: `holding ${keyName(r)} moves the hero right` })
    out.push({ id: 'left', kind: 'control', keys: [l], say: `holding ${keyName(l)} moves the hero left` })
  }
  const jump = clause('jump')
  if (jump) {
    const k = /space/i.test(jump) ? 'Space' : /\bup\b|↑/i.test(jump) ? 'ArrowUp' : /\bW\b/.test(jump) ? 'KeyW' : /\bZ\b/.test(jump) ? 'KeyZ' : 'Space'
    out.push({ id: 'jump', kind: 'control', keys: [k], say: `${keyName(k)} lifts the hero off the ground and they land again` })
  }
  const low = clause('slide|crouch|duck')
  if (low) {
    const k = /\bdown\b|↓/i.test(low) ? 'ArrowDown' : /\bS\b/.test(low) ? 'KeyS' : /ctrl|control/i.test(low) ? 'ControlLeft' : /\bC\b/.test(low) ? 'KeyC' : 'ArrowDown'
    const run = out.find(c => c.id === 'right')?.keys[0] || 'ArrowRight'
    // a player who holds the low key standing still expects to duck: a slide that only works at a run reads as a dead key
    out.push({ id: 'low-still', kind: 'control', keys: [k], say: `holding ${keyName(k)} while standing still crouches: the hero's hitbox gets lower for as long as it is held` })
    if (/slide/i.test(low) || sideView(spec)) out.push({ id: 'low-run', kind: 'control', keys: [k], run, say: `holding ${keyName(k)} at a run slides: the hero's hitbox gets lower` })
  }
  const pal = companionOf(spec)
  if (pal) out.push({ id: 'companion', kind: 'companion', name: pal.name, max: 1, say: `there is one ${pal.name}, never more` })
  for (const e of (Array.isArray(spec?.enemies) ? spec.enemies : []).slice(0, 6)) {
    const name = typeof e === 'string' ? e : e?.name
    if (!name) continue
    const does = typeof e === 'string' ? '' : String(e.attack || '').slice(0, 160)
    out.push({ id: `enemy-${slug(name)}`, kind: 'enemy', name: String(name).slice(0, 60), does, say: `${name} moves as the spec says${does ? ` ("${does}")` : ''}, not pacing on the spot` })
  }
  return out
}

// The hook the game publishes, and the checks it will be held to: a line for the builder's prompt.
export function probeBrief(spec, { godot = false } = {}) {
  const checks = checklist(spec)
  const how = godot
    ? 'In the web build (OS.has_feature("web")), about ten times a second from an autoload, publish the game\'s state: JavaScriptBridge.eval("window.__swarm=" + JSON.stringify(state), true), where state is'
    : 'Every frame, set window.__swarm ='
  return `- The play-test hook. ${how} { scene: "title" | "play" | "pause" | "win" | "lose", hero: { x, y, w, h, ground }, actors: [{ id, kind: "enemy" | "companion" | "pickup", name, x, y }] }. x and y are world positions (y grows downward), w and h are the hero's collision box as it is right now (a crouch or a slide makes h smaller), ground is true while the hero stands on something, id is unique per actor and name is the spec's own name for it; actors lists every enemy and companion alive in the scene. After each slice the Studio's play test starts the game with the real keys, holds each control and reads this to see that the move happened${checks.length ? `:\n${checks.map(c => `  - ${c.say}`).join('\n')}\n  What fails comes back as your next job.` : '.'}
- The hook is read only. The game must play the same for the test as for a player: never check navigator.webdriver or the address for a test, never skip the title, ignore the keyboard or run an autopilot when it is being tested.`
}

// Code that makes the game behave differently under the test → the files that do it
const DODGE = /navigator\s*\.\s*webdriver|headless_?playtest/i
export function testDodges(dir, { godot = false } = {}) {
  const roots = godot ? [join(dir, 'ports', 'godot', 'scripts'), join(dir, 'ports', 'godot', 'scenes')] : [join(dir, 'src')]
  const hits = []
  const walk = (d, depth = 0) => {
    if (depth > 6 || !existsSync(d)) return
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) walk(p, depth + 1) } else if (/\.(gd|ts|tsx|js|jsx|mjs)$/.test(f) && st.size < 400000) {
        try { if (DODGE.test(readFileSync(p, 'utf8'))) hits.push(p.slice(dir.length + 1)) } catch {}
      }
    }
  }
  for (const r of roots) walk(r)
  return hits.slice(0, 8)
}
export const dodgeProblem = files => (files.length
  ? `The game checks whether it is being tested and then plays differently (${files.join(', ')}): the play test was watching a demo, not the game. Remove that check and any autopilot it switches on, so the title, the keyboard and the controls are the same for the test as for a player.`
  : '')

// ---------- judging what was seen (pure, so it is tested without a browser)

const named = (a, name) => { const n = slug(a?.name), want = slug(name); return !!n && !!want && (n === want || n.includes(want) || want.includes(n)) }

// How one actor moved along x: how often it turned round, and inside how wide a stretch.
// track: [{ t (ms), x }]
export function pacing(track, unit = 40) {
  let turns = 0, dir = 0, lo = Infinity, hi = -Infinity, last = null
  for (const p of track) {
    lo = Math.min(lo, p.x); hi = Math.max(hi, p.x)
    if (last) {
      const d = p.x - last.x
      if (Math.abs(d) > unit * 0.02) { const s = Math.sign(d); if (dir && s !== dir) turns++; dir = s }
    }
    last = p
  }
  const seconds = track.length > 1 ? (track.at(-1).t - track[0].t) / 1000 : 0
  return { turns, span: track.length ? hi - lo : 0, seconds }
}

// The companion and enemy checks, from the samples taken while the controls were tried.
// samples: [{ t, hero, actors }] → the checks with ok (true, false, or null: not seen) and saw
export function judgeActors(checks, samples) {
  const unit = Math.max(8, ...samples.map(s => Number(s.hero?.w) || 0))
  return checks.filter(c => c.kind === 'companion' || c.kind === 'enemy').map(c => {
    const seen = samples.map(s => ({ t: s.t, list: (s.actors || []).filter(a => (c.kind === 'companion' ? a.kind === 'companion' || named(a, c.name) : named(a, c.name))) }))
    const most = Math.max(0, ...seen.map(s => s.list.length))
    if (!most) return { ...c, ok: null, saw: `no ${c.name} was in the scene during the test` }
    if (c.kind === 'companion') {
      return most > (c.max || 1)
        ? { ...c, ok: false, saw: `${most} of ${c.name} were in the scene at once`, ask: `There were ${most} of ${c.name} in the scene at once; the spec has one. Find where a second one is made (a spawn that runs again on a respawn, a retry or a new stage without freeing the old one, or the figure drawn twice) and keep exactly one.` }
        : { ...c, ok: true, saw: `one ${c.name}` }
    }
    // each enemy of that name, followed by its id
    const tracks = new Map()
    for (const s of seen) s.list.forEach((a, i) => { const k = a.id ?? `#${i}`; if (!tracks.has(k)) tracks.set(k, []); tracks.get(k).push({ t: s.t, x: Number(a.x) || 0 }) })
    let worst = null
    for (const tr of tracks.values()) {
      const p = pacing(tr, unit)
      if (p.seconds >= 1.5 && p.turns >= 2 && p.seconds / p.turns < 1.6 && p.span < unit * 5 && (!worst || p.turns > worst.turns)) worst = p
    }
    return worst
      ? { ...c, ok: false, saw: `turned round ${worst.turns} times in ${worst.seconds.toFixed(1)} s inside ${Math.round(worst.span)} px`, ask: `${c.name} turned round ${worst.turns} times in ${worst.seconds.toFixed(1)} s inside a stretch ${Math.round(worst.span)} px wide: it paces on the spot.${c.does ? ` The spec says: "${c.does}".` : ''} Give it the movement the spec describes: a path long enough to read (several times the hero's width), speed that eases in and out instead of an instant turn, and its own animation while it moves.` }
      : { ...c, ok: true, saw: 'moves along a path' }
  })
}

// ---------- playing: hold each control and read the state (page and frame are Playwright's)

const sleep = (page, ms) => page.waitForTimeout(ms)
export const readProbe = frame => frame.evaluate(() => { const s = window.__swarm; return s && typeof s === 'object' ? JSON.parse(JSON.stringify(s)) : null }).catch(() => null)

// wait for the game to publish its state (a Godot export takes seconds to boot)
export async function waitProbe(page, frame, ms = 25000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) {
    if (await readProbe(frame)) return true
    await sleep(page, 250)
  }
  return false
}

const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)

// → { probe, checks: [{ id, kind, say, ok, saw, ask? }], problems: [ask] }
export async function runChecks({ page, frame, checks, press = () => {} }) {
  const samples = [], t0 = Date.now()
  let live = true
  const read = async () => { const s = await readProbe(frame); if (s) samples.push({ t: Date.now() - t0, ...s }); return s }
  const sampler = (async () => { while (live) { await read(); await sleep(page, 90) } })()
  const until = async (ok, ms) => { for (const s0 = Date.now(); Date.now() - s0 < ms;) { const s = await readProbe(frame); if (ok(s)) return s; await sleep(page, 80) } return null }
  const down = async k => { press(keyName(k)); await page.keyboard.down(k).catch(() => {}) }
  const up = k => page.keyboard.up(k).catch(() => {})
  const done = []
  try {
    const playing = await until(s => s?.scene === 'play' && s.hero && num(s.hero.x) !== null, 9000)
    if (!playing) {
      const s = await readProbe(frame)
      const ask = s
        ? `After the start press the game never reached play: window.__swarm.scene stayed "${s.scene}"${s.hero ? '' : ' and there was no hero in it'}. One press of Enter, Space or a click on the title must start the run, and the hook must then say scene "play" with the hero in it.`
        : 'The game stopped publishing window.__swarm after the start press.'
      return { probe: true, checks: checks.map(c => ({ ...c, ok: null, saw: 'the game never reached play' })), problems: [ask] }
    }
    for (const c of checks.filter(c => c.kind === 'control')) {
      const a = await until(s => s?.scene === 'play' && s.hero?.ground !== false, 2500) || await readProbe(frame)
      if (!a || a.scene !== 'play' || !a.hero) { done.push({ ...c, ok: null, saw: `not tried: the game had left play (scene "${a?.scene || 'unknown'}")` }); continue }
      const w = Math.max(8, num(a.hero.w) || 0), h = Math.max(8, num(a.hero.h) || 0), key = c.keys[0]
      if (c.id === 'right' || c.id === 'left') {
        await down(key); await sleep(page, 700)
        const b = await readProbe(frame); await up(key)
        const dx = (num(b?.hero?.x) ?? a.hero.x) - a.hero.x, want = c.id === 'right' ? 1 : -1
        const ok = dx * want > w * 0.3
        done.push({ ...c, ok, saw: `x changed by ${Math.round(dx)} in 0.7 s`, ...(ok ? {} : { ask: `Holding ${keyName(key)} for 0.7 s ${Math.abs(dx) < w * 0.05 ? 'did not move the hero' : `moved the hero ${Math.round(dx)} px, the wrong way or hardly at all`} (window.__swarm.hero.x went from ${Math.round(a.hero.x)} to ${Math.round(num(b?.hero?.x) ?? a.hero.x)}). ${keyName(key)} must move the hero ${c.id} while it is held, from the real keyboard.` }) })
      } else if (c.id === 'jump') {
        const from = samples.length
        await down(key); await sleep(page, 260); await up(key); await sleep(page, 500)
        const top = Math.min(a.hero.y, ...samples.slice(from).map(s => num(s.hero?.y) ?? a.hero.y))
        const rose = a.hero.y - top
        const landed = await until(s => s?.hero?.ground !== false, 2500)
        const ok = rose > h * 0.15 && !!landed
        done.push({ ...c, ok, saw: `rose ${Math.round(rose)} (hero is ${Math.round(h)} tall)${landed ? '' : ', never landed'}`, ...(ok ? {} : { ask: rose > h * 0.15 ? `After a ${keyName(key)} jump the hero never came back to the ground within 2.5 s (hero.ground stayed false).` : `Pressing ${keyName(key)} on the ground did not lift the hero: hero.y only changed by ${Math.round(rose)} (the hero is ${Math.round(h)} tall). ${keyName(key)} must jump.` }) })
      } else {
        const run = c.id === 'low-run' ? c.run : null
        if (run) { await down(run); await sleep(page, 650) } else await sleep(page, 350)
        await down(key); await sleep(page, run ? 220 : 450)
        const b = await readProbe(frame)
        await up(key); if (run) await up(run)
        const now = num(b?.hero?.h) ?? h
        const ok = now <= h * 0.85
        done.push({ ...c, ok, saw: `hitbox ${Math.round(h)} → ${Math.round(now)} tall while held`, ...(ok ? {} : { ask: `Holding ${keyName(key)} ${run ? 'at a run' : 'while standing still'} did nothing: the hero's hitbox stayed ${Math.round(now)} tall (it is ${Math.round(h)} standing). ${keyName(key)} must ${run ? 'slide' : 'crouch'}: lower the hitbox (hero.h in window.__swarm) and show the low pose for as long as the key is held${run ? '' : ', at any speed including standing still'}.` }) })
        await sleep(page, 300)
      }
    }
    // a little longer in play, so enemies and the companion are seen moving
    if (checks.some(c => c.kind !== 'control')) await sleep(page, 2600)
  } finally { live = false; await sampler.catch(() => {}) }
  const all = [...done, ...judgeActors(checks, samples)]
  return { probe: true, checks: all, problems: all.filter(c => c.ok === false).map(c => c.ask) }
}

// one line for the build's log: "5 of 7 play checks passed; failed: crouch; not seen: Gutter Crow"
export function checkLine(checks = []) {
  if (!checks.length) return ''
  const label = c => (c.kind === 'control' ? ({ 'low-still': 'crouch', 'low-run': 'slide' }[c.id] || c.id) : c.name)
  const bad = checks.filter(c => c.ok === false).map(label), unseen = checks.filter(c => c.ok === null).map(label)
  return `${checks.filter(c => c.ok).length} of ${checks.length} play checks passed${bad.length ? `; failed: ${bad.join(', ')}` : ''}${unseen.length ? `; not checked: ${unseen.join(', ')}` : ''}`
}
