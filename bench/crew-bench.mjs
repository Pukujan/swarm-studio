#!/usr/bin/env node
// Crew bench (decision 0007: a change to a crew prompt or a review loop comes with a test set). A crew of
// eight builds the same twelve sections of one page through the real worker prompt (engine/prompts.mjs
// workerMessages) and the real model, and the slop linter (engine/lint) reads each one, with its fix pass
// as the build runs it (engine/run.mjs). Run it on two trees to compare a prompt change:
//
//   node bench/crew-bench.mjs [--runs 2] [--crew 8] [--model cb/deepseek-v4.1-flash] [--no-fix]
//
// Reports wall time for the page, time per section, how many sections the linter sent back (P0) and how many
// it still flags after the pass, and the worker prompt's size. Writes bench/results/<time>-crew.json.
// The key: SWARM_API_KEY, else Hermes's InferHub key (HERMES_CUSTOM_INFERHUB_API_KEY in Hermes's .env).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { streamChat } from '../engine/llm.mjs'
import { workerMessages } from '../engine/prompts.mjs'
import { lintSection, forBuilder } from '../engine/lint/index.mjs'
import { fixSection } from '../engine/review.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const RUNS = Number(flag('runs', 2)), CREW = Number(flag('crew', 8)), MODEL = flag('model', 'cb/deepseek-v4.1-flash')
const FIX = !args.includes('--no-fix')

function key() {
  if (process.env.SWARM_API_KEY) return process.env.SWARM_API_KEY
  const env = [join(process.env.LOCALAPPDATA || '', 'hermes', '.env'), join(homedir(), '.hermes', '.env')].find(existsSync)
  return env && readFileSync(env, 'utf8').match(/^HERMES_CUSTOM_INFERHUB_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1]
}
const provider = { baseUrl: process.env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1', apiKey: key() }
if (!provider.apiKey) { console.error('no key: set SWARM_API_KEY'); process.exit(2) }

// one page of a pottery studio's site: the same twelve sections every run
const theme = { name: 'Kiln', direction: 'warm, earthy, calm, handmade', fonts: { heading: 'Fraunces', body: 'Inter' }, radius: '14px' }
const LAYERS = [
  ['nav', 'nav', 'Logo "Kiln"; links Studios, Classes, Pricing; button "Book a wheel".'],
  ['hero', 'hero', 'Headline "Fill every wheel, every week." Subline "Kiln handles bookings, waitlists and kiln schedules so you can stay at the wheel." Buttons "Start free", "See a studio".'],
  ['logos', 'logos', '"Used by 140 studios": Mudroom, Slip & Co, Earthbound, The Wheelhouse, Clayground.'],
  ['problem', 'problem', 'Title "Spreadsheets were never a booking system." Three pains: double-booked wheels, no-shows nobody chases, kiln loads tracked on paper.'],
  ['booking', 'feature', 'Title "Bookings that fill themselves." Members book wheels and classes from their phone; the waitlist moves up when someone cancels.'],
  ['kiln', 'feature', 'Title "Kiln loads, scheduled." Each firing: bisque or glaze, cone, shelf space left, whose pieces are in it.'],
  ['stats', 'stats', '92% fewer no-shows; 6 hours saved a week; 31% more class revenue. Caption "Averages across studios after 3 months."'],
  ['steps', 'how-it-works', '1 Add your wheels and kilns. 2 Share your booking link. 3 Watch the calendar fill.'],
  ['quote', 'testimonial', '"We stopped losing Saturdays to no-shows." Ana Ruiz, owner, Mudroom Ceramics.'],
  ['pricing', 'pricing', 'Studio $39/month: 4 wheels, waitlists. Collective $89/month: 12 wheels, kiln schedule, class packs.'],
  ['faq', 'faq', 'Can members pay in the app? Yes, by card. Do you take a fee per booking? No. Can I import my spreadsheet? Yes, a CSV.'],
  ['footer', 'footer', 'Kiln, made in Leeds. Links Privacy, Terms, Contact.']
]
const page = { id: 'home', title: 'Kiln', purpose: 'Sell Kiln to small ceramics studios', layers: LAYERS.map(([id, role]) => ({ id, role })) }
const plan = { theme, pages: [page], shared: [] }

async function build(layer) {
  const started = performance.now()
  const res = await streamChat(provider, { model: MODEL, messages: workerMessages({ theme, plan, page, layer, images: false }), maxTokens: 8000, extra: { reasoning_effort: 'none', reasoning: { enabled: false } } })
  const ms = performance.now() - started
  const found = lintSection(res.text, { content: layer.content })
  const must = found.filter(f => f.severity === 'P0')
  let fixMs = 0, after = must
  if (FIX && must.length) {
    const t = performance.now()
    try {
      const html = await fixSection({ provider, model: MODEL, theme, html: res.text, role: layer.role, ...forBuilder(must) })
      after = lintSection(html, { content: layer.content }).filter(f => f.severity === 'P0')
    } catch { /* kept as it was */ }
    fixMs = performance.now() - t
  }
  return { id: layer.id, ms: Math.round(ms), fixMs: Math.round(fixMs), chars: res.text.length, p0: must.map(f => f.id), p1: found.filter(f => f.severity === 'P1').map(f => f.id), leftP0: after.map(f => f.id) }
}

// a crew: CREW agents take sections off one queue, as engine/run.mjs does
async function page1() {
  const queue = LAYERS.map(([id, role, content]) => ({ id, role, content, page: 'home' }))
  const out = [], started = performance.now()
  await Promise.all(Array.from({ length: CREW }, async () => { for (let l; (l = queue.shift());) out.push(await build(l).catch(e => ({ id: l.id, error: String(e.message || e) }))) }))
  return { wallMs: Math.round(performance.now() - started), sections: out }
}

const system = workerMessages({ theme, plan, page, layer: { ...page.layers[1], page: 'home', content: '' } })[0].content
const runs = []
for (let i = 0; i < RUNS; i++) { runs.push(await page1()); console.log(`run ${i + 1}: ${(runs.at(-1).wallMs / 1000).toFixed(1)} s`) }
const all = runs.flatMap(r => r.sections).filter(s => !s.error)
const mean = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0
const summary = {
  model: MODEL, crew: CREW, runs: RUNS, fix: FIX, systemChars: system.length,
  wallMs: mean(runs.map(r => r.wallMs)), sectionMs: mean(all.map(s => s.ms)), fixMs: mean(all.filter(s => s.fixMs).map(s => s.fixMs)),
  sections: all.length, errors: runs.flatMap(r => r.sections).filter(s => s.error).length,
  sentBack: all.filter(s => s.p0.length).length, stillP0: all.filter(s => s.leftP0.length).length,
  p0: Object.entries(all.flatMap(s => s.p0).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {})),
  p1: Object.entries(all.flatMap(s => s.p1).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {}))
}
console.log(summary)
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}-crew.json`), JSON.stringify({ summary, runs }, null, 2))
