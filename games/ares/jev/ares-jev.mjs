#!/usr/bin/env node
// Jev plays ARES. The game (run with --jev) streams its state as JSON lines on
// 127.0.0.1:47800. This client asks Jev (OpenRouter Decisions API) which resource
// to chase and on which target, and sends back {"tactic","target","why"}.
// The game's reflex controller aims, strafes and dashes between decisions; if Jev
// is slow or fails, the game's scripted tactics take over after 2.5 s.
//
// Usage: JEV_KEY=... node jev/ares-jev.mjs [--host 127.0.0.1] [--port 47800] [--model typesafe/jev-1.14]
// With the game on another machine, forward the port first:  ssh -N -L 47800:127.0.0.1:47800 windows
import net from 'node:net'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const HOST = arg('host', '127.0.0.1')
const PORT = Number(arg('port', 47800))
const MODEL = arg('model', 'typesafe/jev-1.14')
const URL = 'https://openrouter.ai/api/alpha/decisions'
const KEY = process.env.JEV_KEY || process.env.OPENROUTER_API_KEY
const EVERY = 900
const GOAL = 'Win a first-person arena boss fight fast without dying. Health comes only from finishing staggered enemies, ammo only from ripping them (uses fuel), armor only from burning groups. Break weak points to disable boss attacks.'

if (!KEY) { console.error('set JEV_KEY (an OpenRouter key)'); process.exit(1) }

const OPS = {
  PRESSURE: 'Shoot the boss and keep moving.',
  FINISH: 'Melee-finish a staggered enemy to get health back.',
  RIP: 'Rip an enemy with fuel to get ammo back.',
  BURN: 'Set a group of enemies on fire so they drop armor.',
  PUNCH: 'Power punch: area blast that breaks shields. Needs a punch charge.',
  WEAKPOINT: 'Shoot a boss weak point to disable one of its attacks.',
  EVADE: 'Dodge out of a telegraphed attack or projectiles.',
}

export function summary(s) {
  const h = s.hero || {}, b = s.boss
  const lines = [h.ammo < 8 ? 'AMMO EMPTY: rip an enemy or finish one.' : h.health < 40 ? 'LOW HEALTH: finish a staggered enemy.' : '', `hero health ${h.health} armor ${h.armor} ammo ${h.ammo} fuel ${h.fuel} burn ${h.fire_cd > 0 ? `ready in ${h.fire_cd}s` : 'ready'} punch charges ${h.punch} dash ${h.dash} weapon ${h.weapon}${h.frozen ? ' FROZEN' : ''}${h.silenced ? ' SILENCED' : ''}`]
  if (b) lines.push(`boss ${b.handle} (${b.title}) hp ${b.hp}/${b.max} phase ${b.phase} doing ${b.move || 'nothing'}${b.staggered ? ' STAGGERED' : ''}`)
  lines.push(`${s.enemies.length} minions, ${s.enemies.filter(e => e.staggered).length} staggered, ${s.enemies.filter(e => e.burning).length} burning, ${s.enemies.filter(e => e.shield).length} shielded`)
  if (s.threats.length) lines.push(`danger: ${s.threats.map(t => `${t.kind} in ${t.t}s`).join(', ')}`)
  if (s.projectiles.length) lines.push(`${s.projectiles.length} projectiles incoming`)
  return lines.filter(Boolean).join('\n')
}

export function decisionBody(s, history) {
  // Offer only what makes sense right now: the reflex layer already dodges, so EVADE is
  // only on the table when danger is close; shooting options vanish with an empty gun.
  const ops = {}
  const heads = {}
  const h = s.hero
  const near = [...s.enemies].sort((a, b) => a.dist - b.dist).slice(0, 8)
  const stag = near.filter(e => e.staggered)
  const canShoot = h.ammo >= 8
  const close = (p) => Math.hypot(p[0] - h.pos[0], p[2] - h.pos[2])
  const danger = s.threats.some(t => t.t < 1.0 && close(t.pos) < (t.radius || 3) + 2) || s.projectiles.filter(p => close(p.pos) < 5).length >= 3
  if (canShoot) ops.PRESSURE = OPS.PRESSURE
  if (danger) ops.EVADE = OPS.EVADE
  if (stag.length) { ops.FINISH = OPS.FINISH; heads.finish_target = stag }
  if (near.length && h.fuel >= 1 && h.ammo < 60) { ops.RIP = OPS.RIP; heads.rip_target = near }
  if (near.length >= 2 && h.fire_cd <= 0 && h.armor < 60) ops.BURN = OPS.BURN
  if (h.punch > 0 && (near.length >= 3 || near.some(e => e.shield))) ops.PUNCH = OPS.PUNCH
  const wps = s.boss?.weakpoints || []
  if (wps.length && canShoot) { ops.WEAKPOINT = OPS.WEAKPOINT; heads.weakpoint_target = wps }
  // empty gun with fuel in the tank: only the moves that refill it
  if (!canShoot && ops.RIP) { delete ops.BURN; delete ops.PUNCH }
  if (!Object.keys(ops).length) ops.PRESSURE = OPS.PRESSURE
  const questions = { operation: { type: 'choice', criteria: ops, instructions: { goal: GOAL } } }
  for (const [name, list] of Object.entries(heads)) {
    const criteria = Object.fromEntries(list.map((x, i) => [String(i + 1), { element: x.name ? `[${i + 1}] ${x.name} (disables ${x.disables}), hp ${x.hp}` : `[${i + 1}] ${x.kind}, ${x.dist}m away, hp ${x.hp}${x.shield ? ', shielded' : ''}` }]))
    questions[name] = { type: 'choice', criteria, instructions: { goal: GOAL, operation: name.replace(/_target$/, '').toUpperCase(), rules: 'Choose only an offered index.' } }
  }
  return { body: { model: MODEL, state: { page: { url: 'ares', title: `ARES vs ${s.boss?.handle || '?'}`, text: summary(s) }, elements: [], recent_actions: history.slice(-6) }, questions }, heads }
}

function pick(answers, heads, op) {
  const head = `${op.toLowerCase()}_target`
  const list = heads[head]
  if (!list) return -1
  const i = Number(answers?.[head]?.choice) - 1
  return list[i]?.id ?? list[0].id
}

let latest = null, busy = false, history = [], stats = { asked: 0, ok: 0, failed: 0, ms: [] }
const sock = net.connect(PORT, HOST, () => console.log(`connected to ARES ${HOST}:${PORT}, model ${MODEL}`))
let buf = ''
sock.on('data', d => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1)
    try { latest = JSON.parse(line) } catch {}
  }
})
sock.on('close', () => { console.log(`game closed. Jev answered ${stats.ok}/${stats.asked}, median ${median(stats.ms)} ms`); process.exit(0) })
sock.on('error', e => { console.error(`bridge: ${e.message}`); process.exit(1) })

const median = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0

async function decide() {
  const s = latest
  if (busy || !s || s.state !== 'fight' || !s.hero) return
  busy = true
  const { body, heads } = decisionBody(s, history)
  const t0 = Date.now()
  stats.asked++
  try {
    const r = await fetch(URL, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = await r.json()
    const op = j.answers?.operation?.choice
    if (!OPS[op]) throw new Error(`no operation (${op})`)
    const target = op === 'PRESSURE' || op === 'EVADE' || op === 'BURN' || op === 'PUNCH' ? -1 : pick(j.answers, heads, op)
    const why = `${op.toLowerCase()}${target >= 0 ? ' #' + target : ''}`
    sock.write(JSON.stringify({ tactic: op.toLowerCase(), target, why }) + '\n')
    history.push(op); stats.ok++; stats.ms.push(Date.now() - t0)
    console.log(`${s.t.toFixed(1)}s ${op} ${target} (${Date.now() - t0} ms)`)
  } catch (e) {
    stats.failed++
    if (stats.failed <= 3 || stats.failed % 20 === 0) console.log(`jev failed: ${e.message} (game falls back to scripted tactics)`)
  } finally { busy = false }
}
setInterval(decide, EVERY)
