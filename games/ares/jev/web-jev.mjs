#!/usr/bin/env node
// Jev plays the web build of ARES. Same idea as ares-jev.mjs (the Godot bridge), but the
// game runs in Chromium and exposes window.SWARM_PLAY:
//   state()         -> { mode, t, goal, hero, hp, boss, enemies, ..., tactics: {name: what it does} }
//   act(name, why)  -> follow that tactic until the next one
//   start(hero)     -> start a run with the in-game pilot on;  auto(on) -> pilot on/off
// The in-game pilot aims, jumps and dashes between decisions, and picks its own tactics
// when Jev has been quiet for 2.5 s, so a slow or failed call never freezes a run.
//
// Usage:
//   JEV_KEY=... node jev/web-jev.mjs [--stage 1] [--hero messenger|runner] [--seconds 180]
//        [--url http://localhost:8777/web/index.html?auto&stage=1] [--model typesafe/jev-1.14]
//        [--every 400] [--headless] [--shot out.png] [--keep]
//   node jev/web-jev.mjs --dry ...   random allowed tactic, no API call, no key needed
// Browser: attaches to http://127.0.0.1:9222 (CDP) if it is up, else launches Chromium headful.
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = k => argv.includes(`--${k}`)
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const DRY = flag('dry')
const STAGE = arg('stage', '1')
const PAGE_URL = arg('url', `http://localhost:8777/web/index.html?auto&stage=${STAGE}`)
const HERO = arg('hero', null)
const SECONDS = Number(arg('seconds', 180))
const MODEL = arg('model', 'typesafe/jev-1.14')
const CDP = arg('cdp', 'http://127.0.0.1:9222')
const EVERY = Number(arg('every', 400)) // ms between decisions: about 2.5 a second at most
const SHOT = arg('shot', null)
const URL = 'https://openrouter.ai/api/alpha/decisions'
const KEY = process.env.JEV_KEY || process.env.OPENROUTER_API_KEY
const FALLBACK_GOAL = 'Beat the stage without dying. Dash makes you invincible; hit hardest while the boss rests.'

if (!DRY && !KEY) { console.error('set JEV_KEY (an OpenRouter key), or use --dry'); process.exit(1) }

// What Jev reads: the web state flattened into short lines, the same style as ares-jev.mjs summary().
export function summary(s) {
  const b = s.boss, en = s.enemies || []
  const lines = [
    s.hp != null && s.max && s.hp < s.max * 0.4 ? 'LOW HEALTH: stay out of the bullets.' : '',
    `hero ${s.hero} hp ${s.hp}/${s.max} meter ${s.meter}${s.meter >= 100 ? ' (ULT READY)' : ''} ${s.ground ? 'on the ground' : 'in the air'} combo ${s.combo ?? 0}`,
    s.ready?.length ? `ready: ${s.ready.join(', ')}` : '',
    s.wave != null ? `wave ${s.wave}` : '',
  ]
  if (b) lines.push(`boss hp ${b.hp}/${b.max} phase ${b.phase} doing ${b.doing || 'nothing'}${b.resting ? ' RESTING (attack window)' : ''}${b.active ? '' : ' (not in the fight yet)'}`)
  if (en.length) lines.push(`${en.length} enemies: ${[...en].sort((a, c) => Math.abs(a.dx) - Math.abs(c.dx)).slice(0, 6).map(e => `${e.kind} ${e.dx > 0 ? '+' : ''}${e.dx}px hp ${e.hp}${e.burning ? ' burning' : ''}${e.shocked ? ' shocked' : ''}`).join(', ')}`)
  if (s.bullets_near) lines.push(`${s.bullets_near} bullets close`)
  if (s.danger?.length) lines.push(`danger: ${s.danger.join(', ')}`)
  // anything a newer stage adds shows up too, without changing this file
  const known = new Set(['mode', 't', 'goal', 'hero', 'hp', 'max', 'meter', 'ground', 'ready', 'wave', 'boss', 'enemies', 'bullets_near', 'danger', 'tactic', 'src', 'combo', 'tactics'])
  for (const [k, v] of Object.entries(s)) {
    if (known.has(k) || v == null) continue
    lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : v}`)
  }
  return lines.filter(Boolean).join('\n')
}

export function decisionBody(s, history) {
  const goal = s.goal || FALLBACK_GOAL
  return {
    model: MODEL,
    state: { page: { url: 'ares-web', title: `ARES web, stage ${s.stage ?? STAGE}`, text: summary(s) }, elements: [], recent_actions: history.slice(-6) },
    questions: { operation: { type: 'choice', criteria: s.tactics, instructions: { goal } } },
  }
}

async function askJev(s, history) {
  const r = await fetch(URL, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(decisionBody(s, history)), signal: AbortSignal.timeout(2500) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  const op = j.answers?.operation?.choice
  if (!s.tactics[op]) throw new Error(`no operation (${op})`)
  const why = String(j.answers?.operation?.reason || j.answers?.operation?.why || op).slice(0, 80)
  return { op, why }
}

async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const here = dirname(fileURLToPath(import.meta.url))
  const repo = join(here, '..', '..', '..')
  for (const dir of [process.env.PLAYWRIGHT_DIR, join(repo, 'dyad'), join(repo, '..', 'swarm-studio', 'dyad')].filter(Boolean)) {
    if (!existsSync(join(dir, 'node_modules', 'playwright'))) continue
    try { return createRequire(join(dir, 'package.json'))('playwright') } catch {}
  }
  return null
}

// Chromium builds Playwright downloaded before (any version), newest first; same place ~/bin/claude-chrome looks
function cachedChromium() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright')
  const out = []
  try {
    for (const d of readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))) {
      for (const sub of readdirSync(join(cache, d))) {
        const app = join(cache, d, sub)
        try {
          const exe = process.platform === 'darwin'
            ? readdirSync(app).filter(a => a.endsWith('.app')).map(a => join(app, a, 'Contents', 'MacOS', a.replace(/\.app$/, '')))[0]
            : join(app, process.platform === 'win32' ? 'chrome.exe' : 'chrome')
          if (exe && existsSync(exe)) out.push(exe)
        } catch {} // marker files next to the build folder
      }
    }
  } catch {}
  return out
}

async function openPage(chromium) {
  try {
    const r = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(800) })
    if (r.ok) {
      const browser = await chromium.connectOverCDP(CDP)
      const context = browser.contexts()[0] || await browser.newContext()
      console.log(`attached to Chromium at ${CDP}`)
      return { page: await context.newPage(), close: async () => {} } // leave the user's browser running
    }
  } catch {}
  const headless = flag('headless')
  let browser, last
  for (const opts of [{}, ...cachedChromium().map(executablePath => ({ executablePath })), { channel: 'chrome' }]) {
    try { browser = await chromium.launch({ headless, ...opts }); break } catch (e) { last = e }
  }
  if (!browser) throw last
  console.log(`launched Chromium${headless ? ' (headless)' : ''}`)
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  return { page, close: () => browser.close() }
}

const median = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0
const sleep = ms => new Promise(r => setTimeout(r, ms))

const pw = await loadPlaywright()
if (!pw) { console.error('playwright not found (set PLAYWRIGHT_DIR to a folder whose node_modules has it)'); process.exit(1) }
const { page, close } = await openPage(pw.chromium)
const errors = []
page.on('pageerror', e => errors.push(e.message))
let stop = false
process.on('SIGINT', () => { stop = true })

const stats = { asked: 0, ok: 0, failed: 0, ms: [] }, picks = {}, history = []
let s = null
try {
  await page.goto(PAGE_URL, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => window.SWARM_PLAY && window.SWARM_PLAY.state().mode !== 'loading', null, { timeout: 30000 })
  } catch {
    throw new Error(`the game never got ready (no SWARM_PLAY, or stuck loading)${errors.length ? `; page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`)
  }
  await page.evaluate(h => window.SWARM_PLAY.start(h), HERO)
  console.log(`${DRY ? 'dry run (random tactics)' : `Jev ${MODEL}`} on ${PAGE_URL}${HERO ? `, hero ${HERO}` : ''}`)
  const end = Date.now() + SECONDS * 1000
  while (!stop && Date.now() < end) {
    const t0 = Date.now()
    try { s = await page.evaluate(() => window.SWARM_PLAY.state()) } catch (e) { console.log(`page gone: ${e.message}`); break }
    if (s.mode === 'win' || s.mode === 'dead') { console.log(`${s.mode.toUpperCase()} at ${s.t}s`); break }
    const names = Object.keys(s.tactics || {})
    if (s.mode === 'play' && names.length > 1) {
      stats.asked++
      try {
        const { op, why } = DRY ? { op: names[(Math.random() * names.length) | 0], why: 'dry run' } : await askJev(s, history)
        await page.evaluate(([n, w]) => window.SWARM_PLAY.act(n, w), [op, why])
        history.push(op); picks[op] = (picks[op] || 0) + 1; stats.ok++; stats.ms.push(Date.now() - t0)
        console.log(`${s.t}s ${op} [${names.join(' ')}] hp ${s.hp}${s.boss ? ` boss ${s.boss.hp}/${s.boss.max}` : ''} (${Date.now() - t0} ms)`)
      } catch (e) {
        stats.failed++
        if (stats.failed <= 3 || stats.failed % 20 === 0) console.log(`jev failed: ${e.message} (the in-game pilot takes over after 2.5 s)`)
      }
    }
    await sleep(Math.max(0, EVERY - (Date.now() - t0)))
  }
  if (SHOT) { await page.screenshot({ path: SHOT }); console.log(`screenshot ${SHOT}`) }
} catch (e) {
  console.error(e.message); process.exitCode = 1
} finally {
  console.log(JSON.stringify({ mode: s?.mode, t: s?.t, hp: s?.hp, boss: s?.boss, jev: { asked: stats.asked, ok: stats.ok, failed: stats.failed, median_ms: median(stats.ms) }, picks, page_errors: errors.slice(0, 5) }))
  if (!flag('keep')) await close()
}
process.exit(process.exitCode || 0)
