// The studio's own design review, pointed at the studio itself (docs/ux/RULES.md checklist).
// Screenshots each main screen at 1280 and 768 wide and asks the same vision model the review step
// uses (engine/review.mjs) what a designer would fix first, adapted from "a page of a website" to
// "a screen of an app".
//
//   node scripts/ui-review.mjs [--base http://127.0.0.1:4420] [--run <run id>] [--only projects,project]
//                              [--model <id>] [--out <folder for screenshots and review.json>]
//
// The model: --model, else SWARM_REVIEWER_MODEL / SWARM_STUDIO_REVIEWER_MODEL, else the studio's own
// pick in <data dir>/models.json, else ali/qwen3.8-flash (what the review step has been using), with
// the review step's fallbacks when a route is busy. The key: SWARM_REVIEWER_API_KEY, SWARM_API_KEY or
// HERMES_CUSTOM_INFERHUB_API_KEY, read from the environment or from ~/.hermes/.env. It is never printed.
// Playwright as in scripts/ui-check.mjs. Exits 1 only when it could not review; the issues are advice.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { streamChat } from '../engine/llm.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', process.env.UI_BASE || 'http://127.0.0.1:4420').replace(/\/$/, '')
const OUT = resolve(arg('out', join(homedir(), '.cache', 'acs', 'scratch', 'ui-review')))
const ONLY = (arg('only', '') || '').split(',').filter(Boolean)
let RUN = arg('run', process.env.UI_RUN || '')

// ---------- the model and its key, like the server's reviewer role
function dotenv(file) {
  try {
    return Object.fromEntries(readFileSync(file, 'utf8').split('\n').map(l => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]))
  } catch { return {} }
}
const env = { ...dotenv(join(process.env.HERMES_HOME || join(homedir(), '.hermes'), '.env')), ...process.env }
const apiKey = env.SWARM_REVIEWER_API_KEY || env.SWARM_API_KEY || env.HERMES_CUSTOM_INFERHUB_API_KEY || env.SWARM_STUDIO_API_KEY
if (!apiKey) { console.error('ui-review: no API key (SWARM_API_KEY or HERMES_CUSTOM_INFERHUB_API_KEY, in the environment or ~/.hermes/.env)'); process.exit(1) }
const provider = { baseUrl: (env.SWARM_REVIEWER_BASE_URL || env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1').replace(/\/$/, ''), apiKey }
let picked = ''
try { picked = JSON.parse(readFileSync(join(env.SWARM_DATA_DIR || join(homedir(), '.hermes', 'swarm-studio'), 'models.json'), 'utf8')).reviewer || '' } catch {}
const MODEL = arg('model', env.SWARM_REVIEWER_MODEL || env.SWARM_STUDIO_REVIEWER_MODEL || (picked !== 'off' && picked) || 'ali/qwen3.8-flash')
const FALLBACKS = ['ali/qwen3.8-omni-flash', 'cc/claude-haiku-5-5', 'ag/gemini-3.8-flash-high'] // server.mjs REVIEW_FALLBACKS
const NO_THINKING = { reasoning_effort: 'none', reasoning: { enabled: false } }

// engine/review.mjs's prompt, for one screen of an app instead of one page of a website
const messages = (screen, width, image) => [
  {
    role: 'system',
    content: `You are a senior product designer reviewing a screenshot of one screen of a web app: Swarm Studio, where a crew of AI agents builds websites, games and videos. Its look is deliberate: a dark space theme, yellow for the main action, a condensed display font in capitals for names.

Name only real, visible problems a user would notice, worst first: text cut off, overlapping or unreadable; poor contrast; controls that overlap, hide each other or run off the screen; a checkbox or switch far from its label; broken or lopsided layout; buttons that don't look clickable, or things that look clickable and aren't; clutter, such as explanatory sentences on screen by default. Ignore taste. If the screen looks good, return no issues.

Return JSON only: {"verdict":"one short sentence on the screen","issues":[{"area":"where on the screen, 2 to 4 words","problem":"what is wrong, under 15 words","fix":"what to change, under 25 words"}]}
At most 3 issues.`
  },
  {
    role: 'user',
    content: [
      { type: 'text', text: `Screen: ${screen}\nWindow: ${width} px wide` },
      { type: 'image_url', image_url: { url: image } }
    ]
  }
]
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
async function review(screen, width, image) {
  let lastErr
  for (const model of [MODEL, ...FALLBACKS.filter(m => m !== MODEL)]) {
    try {
      const res = await streamChat(provider, { trace: { kind: 'ui-review', page: screen }, model, messages: messages(screen, width, image), maxTokens: 900, temperature: 0.2, extra: NO_THINKING, signal: AbortSignal.timeout(90000) })
      const t = res.text, a = t.indexOf('{'), b = t.lastIndexOf('}')
      if (a < 0 || b <= a) throw new Error('no JSON in the review')
      const raw = JSON.parse(t.slice(a, b + 1))
      const issues = (raw.issues || []).filter(i => i.problem).slice(0, 3).map(i => ({ area: clip(i.area, 40), problem: clip(i.problem, 120), fix: clip(i.fix, 200) }))
      return { model, verdict: clip(raw.verdict, 160), issues, ms: Math.round(res.totalMs) }
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

// ---------- the screens
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: npm i -D playwright, or set PLAYWRIGHT_DIR to a folder that has it')
  return createRequire(join(resolve(dir), 'package.json'))('playwright')
}
const wait = ms => new Promise(r => setTimeout(r, ms))
async function fresh(page, url = '/') {
  await page.goto(BASE + url)
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.goto(BASE + url)
  await page.waitForFunction(() => window.swarmCosmos?.homeView && window.swarmCosmos.projectView, null, { timeout: 15000 })
  await wait(url.includes('run=') ? 4500 : 1800)
}
const project = () => `/?run=${encodeURIComponent(RUN)}`
const room = view => async p => { await fresh(p, project()); await p.evaluate(v => window.swarmCosmos.go('station', v), view); await wait(1500) }
const SCREENS = [
  ['projects', 'Projects: a file browser of every project, a sidebar, one input at the top', p => fresh(p)],
  ['start-sheet', 'Start sheet: the Auto box that starts a build from one prompt', async p => { await fresh(p); await p.evaluate(() => window.swarm.submit('', true)); await wait(600) }],
  ['project', 'A project: one canvas of artboards (Site, App, Film, Art, Uploads), Files on the left, a dock at the bottom', p => fresh(p, project())],
  ['project-auto-open', 'A project with the Auto progress panel expanded', async p => { await fresh(p, project()); await p.click('.auto-panel .ap-head').catch(() => {}); await wait(500) }],
  ['design-deck', 'Design deck room: the canvas of designed pages', room('canvas')],
  ['film-studio', 'Film studio room: the promo video', room('video')],
  ['engine-room', 'Engine room: the working app', room('app')],
  ['new-game', 'New game wizard, first step', async p => { await fresh(p, project()); await p.evaluate(() => document.querySelector('#game-btn').click()); await wait(1200) }],
  ['project-menu', 'A project\'s ☰ menu (Sound, Game, Classic view)', async p => { await fresh(p, project()); await p.click('#more-btn'); await wait(400) }],
]

const { chromium } = await loadPlaywright()
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  if (!RUN) {
    const p = await browser.newPage()
    await p.goto(BASE + '/')
    await p.waitForFunction(() => window.swarm, null, { timeout: 15000 })
    RUN = await p.evaluate(async () => (await (await window.swarm.api('/api/runs')).json()).find(f => f.pages > 1 && !f.live)?.id || '')
    await p.close()
  }
  if (!RUN) throw new Error('no finished build on this server: pass --run')
  console.log(`ui-review: ${BASE}, build ${RUN}, model ${MODEL}`)
  for (const [w, h] of [[1280, 800], [768, 1024]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    for (const [key, what, setup] of SCREENS) {
      if (ONLY.length && !ONLY.includes(key)) continue
      await setup(page)
      const file = join(OUT, `${key}-${w}.jpg`)
      const buf = await page.screenshot({ path: file, type: 'jpeg', quality: 82 })
      try {
        const r = await review(what, w, `data:image/jpeg;base64,${buf.toString('base64')}`)
        results.push({ screen: key, width: w, ...r })
        console.log(`\n${key} @${w} (${r.model}, ${(r.ms / 1000).toFixed(1)} s): ${r.verdict}`)
        for (const i of r.issues) console.log(`  - ${i.area}: ${i.problem} → ${i.fix}`)
        if (!r.issues.length) console.log('  no issues')
      } catch (e) {
        results.push({ screen: key, width: w, error: clip(e.message, 200) })
        console.log(`\n${key} @${w}: review failed: ${clip(e.message, 200)}`)
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
}
writeFileSync(join(OUT, 'review.json'), JSON.stringify({ base: BASE, run: RUN, model: MODEL, at: new Date().toISOString(), results }, null, 2))
const n = results.reduce((a, r) => a + (r.issues?.length || 0), 0), failed = results.filter(r => r.error).length
console.log(`\nui-review: ${results.length} screens, ${n} issues${failed ? `, ${failed} not reviewed` : ''}. Screenshots and review.json in ${OUT}`)
process.exit(failed === results.length ? 1 : 0)
