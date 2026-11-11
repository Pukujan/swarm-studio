// Drive one guided big game through the Studio's own left chat, as a person would, and keep a
// screenshot of the chat at every turn: the look board and its pick, each slice's report, the
// slice questions and answers, and steers typed while it builds. For the before/after write-up
// (docs/guided-chat.md) and to check the chat end to end. Run it on a machine with a Studio up:
//   node scripts/guided-run.mjs --url http://127.0.0.1:4359 --token <token> --out <dir> [--run <id>]
// Without --run it writes a spec from the answers below and starts the build.

import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : '' }
const URL_ = arg('url') || 'http://127.0.0.1:4359', TOKEN = arg('token') || process.env.SWARM_TOKEN || '', OUT = arg('out') || 'guided-shots'
mkdirSync(OUT, { recursive: true })
const log = m => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; console.log(l); appendFileSync(join(OUT, 'driver.log'), `${l}\n`) }
const api = async (path, body) => {
  const r = await fetch(URL_ + path, { method: body ? 'POST' : 'GET', headers: { 'x-swarm-token': TOKEN, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${path}: ${j.error || r.status}`)
  return j
}
const wait = ms => new Promise(r => setTimeout(r, ms))

// what the person says, and when
const ANSWERS = { type: 'Roguelike', like: 'Hades', goal: 'Clear rooms, beat a boss', controls: 'Keyboard + mouse', look: 'Hand-drawn', length: '5 minutes', world: 'Mika, a playful sword girl with a red scarf, clears the lantern-festival rooftops of a hillside town, with her cat Kumo', scope: 'Big game', target: 'Web (plays here)' }
const WHILE = { 2: 'Add a night stage: the last rooftops after the lanterns are lit', 3: 'Some of the FX look rough, the slash trails especially' }
const AT_PAUSE = { 1: 'Give Mika sound effects: a whoosh on every slash and a chime on pickups' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(join(root, 'dyad', 'package.json'))('playwright')

let run = arg('run')
if (!run) {
  log('writing the spec')
  const { spec } = await api('/api/game/spec', { idea: ANSWERS.world, answers: ANSWERS })
  log(`spec: ${spec.title} (${(spec.stages || []).length} slices)`)
  run = (await api('/api/game', { spec })).run
}
log(`run ${run}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${URL_}/?run=${run}`)
await wait(4000)
let n = 0
const shot = async name => {
  n++
  const file = join(OUT, `${String(n).padStart(2, '0')}-${name}.png`)
  try {
    await page.evaluate(() => { const f = document.getElementById('feed'); if (f) f.scrollTop = f.scrollHeight })
    await wait(1200)
    const box = await page.locator('#feed').boundingBox()
    await page.screenshot({ path: file, ...(box ? { clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 40), width: Math.min(560, box.width + 16), height: Math.min(900, box.height + 48) } } : {}) })
    await page.screenshot({ path: file.replace('.png', '-full.png') })
  } catch (err) { log(`shot failed: ${err.message}`) }
  log(`shot ${file}`)
}
const say = async text => {
  await page.locator('#brief').fill(text)
  await page.locator('#brief').press('Enter')
  log(`said: ${text}`)
}

const seen = new Set()
for (let t0 = Date.now(); Date.now() - t0 < 6 * 3600e3; await wait(15000)) {
  let st
  try { st = await api(`/api/runs/${run}/app`) } catch (err) { log(err.message); continue }
  const at = st.at?.[0] || 0
  if (st.state === 'working' && WHILE[at] && !seen.has(`while-${at}`) && (st.steps || []).filter(s => /^turn \d+/.test(s.text || '')).length) {
    seen.add(`while-${at}`)
    await say(WHILE[at])
    await wait(20000)
    await shot(`steer-during-slice-${at}`)
  }
  if (st.state === 'paused' && st.slice) {
    const s = st.slice, key = `pause-${s.kind || s.i}`
    if (seen.has(key)) continue
    seen.add(key)
    await page.reload(); await wait(5000)
    await shot(s.kind === 'board' ? 'look-board' : `slice-${s.i + 1}-question`)
    if (s.kind === 'board') {
      const opt = page.locator('.board-card .bd-opt').nth(1)
      log(`picking the look: ${await opt.getAttribute('aria-label')}`)
      await opt.click()
    } else if (AT_PAUSE[s.i + 1]) await say(AT_PAUSE[s.i + 1])
    else await page.locator('.slice-card:not(.past) .sc-ideas button').first().click()
    await wait(8000)
    await shot(s.kind === 'board' ? 'look-picked' : `slice-${s.i + 1}-answered`)
  }
  if (st.state === 'done' || st.state === 'failed' || st.state === 'stopped') {
    await page.reload(); await wait(6000)
    await shot(`end-${st.state}`)
    log(`ended: ${st.state} ${st.message || ''}`)
    break
  }
}
await browser.close()
