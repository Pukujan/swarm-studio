// Autoplay for a web game the studio built: Jev (the OpenRouter Decisions API) plays it.
//
// The game opts in by putting `window.SWARM_PLAY` on the page:
//   state()        -> { mode, goal, tactics: {name: what it does}, ...anything Jev should read }
//   act(name, why) -> carry out that tactic until the next one
//   start(hero?)   -> start a run with the game's own autopilot on
// The game keeps playing between answers: its reflexes dodge, and when no answer came
// for a while it picks tactics itself, so a slow or failed call never freezes a run.
// Without a key the run is the game's own autopilot, which is still a useful play test.
//
//   node engine/autoplay.mjs <url> [--seconds 180] [--hero runner] [--model typesafe/jev-1.14]
//        [--every 900] [--video <dir>] [--headed]
//
// Key: JEV_KEY or OPENROUTER_API_KEY. Prints one JSON line at the end:
// { result, seconds, state, jev: { asked, ok, failed, median_ms }, tactics }.

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, loadPlaywright } from './playtest.mjs'

export const DECISIONS = 'https://openrouter.ai/api/alpha/decisions'

// What Jev reads: the game's own state, flattened into short lines.
export function describe(s) {
  const lines = []
  for (const [k, v] of Object.entries(s)) {
    if (['tactics', 'goal', 'mode', 'tactic', 'src'].includes(k) || v == null) continue
    if (Array.isArray(v)) lines.push(`${k}: ${v.length ? v.slice(0, 8).map(x => (typeof x === 'object' ? Object.entries(x).map(([a, b]) => `${a} ${b}`).join(', ') : x)).join(' | ') : 'none'}`)
    else if (typeof v === 'object') lines.push(`${k}: ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', ')}`)
    else lines.push(`${k}: ${v}`)
  }
  return lines.join('\n')
}

export function decisionBody(s, history, model) {
  return {
    model,
    state: { page: { url: 'game', title: s.goal || 'play the game', text: describe(s) }, elements: [], recent_actions: history.slice(-6) },
    questions: { tactic: { type: 'choice', criteria: s.tactics, instructions: { goal: s.goal || 'Win without dying.' } } },
  }
}

const median = a => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0)

export async function autoplay(url, { seconds = 180, hero, model = 'typesafe/jev-1.14', every = 900, key = process.env.JEV_KEY || process.env.OPENROUTER_API_KEY, video, headed = false, log = console.log } = {}) {
  const pw = await loadPlaywright()
  if (!pw) throw new Error('playwright is not installed (set PLAYWRIGHT_DIR to a folder that has it)')
  const browser = headed ? await pw.chromium.launch({ headless: false }) : await launch(pw.chromium)
  const ctxOpts = { viewport: { width: 1280, height: 720 } }
  if (video) { mkdirSync(video, { recursive: true }); ctxOpts.recordVideo = { dir: video, size: { width: 1280, height: 720 } } }
  const context = await browser.newContext(ctxOpts)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const stats = { asked: 0, ok: 0, failed: 0, ms: [] }, tactics = {}, history = []
  let s = null
  try {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => window.SWARM_PLAY && window.SWARM_PLAY.state().mode !== 'loading', null, { timeout: 30000 })
    await page.evaluate(h => window.SWARM_PLAY.start(h), hero || null)
    const end = Date.now() + seconds * 1000
    while (Date.now() < end) {
      s = await page.evaluate(() => window.SWARM_PLAY.state())
      if (s.mode === 'win' || s.mode === 'dead') break
      const names = Object.keys(s.tactics || {})
      if (key && s.mode === 'play' && names.length > 1) {
        const t0 = Date.now()
        stats.asked++
        try {
          const r = await fetch(DECISIONS, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(decisionBody(s, history, model)), signal: AbortSignal.timeout(2500) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const j = await r.json()
          const pick = j.answers?.tactic?.choice
          if (!names.includes(pick)) throw new Error(`no tactic (${pick})`)
          await page.evaluate(([p, why]) => window.SWARM_PLAY.act(p, why), [pick, 'jev'])
          history.push(pick); tactics[pick] = (tactics[pick] || 0) + 1
          stats.ok++; stats.ms.push(Date.now() - t0)
          log(`${s.t}s jev: ${pick} (${Date.now() - t0} ms) hp ${s.hp}${s.boss ? ` boss ${s.boss.hp}/${s.boss.max}` : ''}`)
        } catch (e) {
          stats.failed++
          if (stats.failed <= 3 || stats.failed % 20 === 0) log(`jev failed: ${e.message} (the game picks its own tactic)`)
        }
      }
      await page.waitForTimeout(Math.max(50, every - 0))
    }
    s = await page.evaluate(() => window.SWARM_PLAY.state())
  } finally {
    await context.close()
    await browser.close()
  }
  return {
    result: s?.mode === 'win' ? 'win' : s?.mode === 'dead' ? 'dead' : 'time',
    seconds: s?.t, state: s && { hp: s.hp, hero: s.hero, wave: s.wave, boss: s.boss },
    jev: key ? { model, asked: stats.asked, ok: stats.ok, failed: stats.failed, median_ms: median(stats.ms) } : null,
    tactics, errors,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2)
  const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d)
  const url = a[0]
  if (!url || url.startsWith('--')) { console.error('usage: node engine/autoplay.mjs <url> [--seconds 180] [--hero id] [--model m] [--every ms] [--video dir] [--headed]'); process.exit(2) }
  const res = await autoplay(url, { seconds: Number(opt('--seconds', 180)), hero: opt('--hero'), model: opt('--model', 'typesafe/jev-1.14'), every: Number(opt('--every', 900)), video: opt('--video'), headed: a.includes('--headed') })
  console.log(JSON.stringify(res))
  process.exit(res.errors.length ? 1 : 0)
}
