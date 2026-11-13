#!/usr/bin/env node
// The crew's model output for the metamorphic relations (relations.mjs), made the way engine/run.mjs makes it:
// the sitemap for each wording of each brief (briefs.json), the home page's plan, three of its sections built,
// and each section reworked by the reviewer's fix pass for a layout problem.
//
//   node tests/metamorphic/record.mjs record   writes recorded/<brief>.json, which CI checks the relations on
//   node tests/metamorphic/record.mjs live     makes the same output fresh and checks the relations on it (the
//                                              nightly job); it is kept only in SWARM_META_OUT, when set
//
// The model key is SWARM_API_KEY, else Hermes's InferHub key on this machine (as bench/evals/run.mjs reads it).
// It is only ever sent to the endpoint. The model is cb/deepseek-v4.1-flash (SWARM_EVAL_MODEL).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { streamChat } from '../../engine/llm.mjs'
import { SITEMAP_SYSTEM, pagePlannerMessages, workerMessages } from '../../engine/prompts.mjs'
import { fixSection } from '../../engine/review.mjs'
import { lookBrief } from '../../engine/pagetype.mjs'
import { brandTheme, brandBrief } from '../../engine/brand.mjs'
import { planLines } from './relations.mjs'
import { checkAll, BRIEFS } from './suite.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MODEL = process.env.SWARM_EVAL_MODEL || 'cb/deepseek-v4.1-flash'
const NO_THINKING = { reasoning_effort: 'none', reasoning: { enabled: false } }
// a layout problem, never a copy one: the rework is asked to keep the words and move things
const PROBLEM = { problem: 'The section feels cramped: its items sit too close together and the headline has no room above it.', fix: 'Give it more room: larger gaps between the items, more padding above the headline and around the section. Change nothing else.' }
const SECTIONS = 3

function key() {
  if (process.env.SWARM_API_KEY) return process.env.SWARM_API_KEY
  const env = [join(process.env.LOCALAPPDATA || '', 'hermes', '.env'), join(homedir(), '.hermes', '.env')].find(existsSync)
  return env && readFileSync(env, 'utf8').match(/^HERMES_CUSTOM_INFERHUB_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1]
}
const provider = () => ({ baseUrl: process.env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1', apiKey: key() })

async function make(brief) {
  const prov = provider()
  const theme = brandTheme(brief.brand)
  const ask = (messages, opts = {}) => streamChat(prov, { model: MODEL, messages, maxTokens: 2000, extra: NO_THINKING, ...opts }).then(r => r.text)
  // the sitemap, as runSwarm asks for it with a locked brand sheet: the page type pinned, no random look
  const sitemaps = await Promise.all(brief.wordings.map(async (w, i) => ({
    id: i,
    text: await ask([{ role: 'system', content: SITEMAP_SYSTEM }, { role: 'user', content: `Brief: ${w}\n\n${lookBrief(brief.pageType, [], null)}\n${brandBrief(brief.brand)}` }], { temperature: 0.8, trace: { kind: 'sitemap' } })
  })))
  const lines = planLines(sitemaps[0].text)
  const pages = lines.filter(o => o.type === 'page').map((p, index) => ({ id: String(p.id), title: p.title || p.id, purpose: p.purpose || '', sections: p.sections || '', index, layers: [] }))
  const shared = lines.filter(o => o.type === 'layer' && o.page === '*')
  if (!pages.length) throw new Error(`${brief.id}: the sitemap came back with no pages`)
  const plan = { theme, pages, shared, pageType: brief.pageType }
  const home = pages[0]
  const planned = planLines(await ask(pagePlannerMessages({ brief: brief.wordings[0], theme, plan, page: home }), { maxTokens: 3000, trace: { kind: 'page-plan' } }))
  home.layers = planned.filter(o => o.type === 'layer' && o.content).map(o => ({ ...o, page: home.id, id: String(o.id) }))
  const sections = await Promise.all(home.layers.slice(0, SECTIONS).map(async layer => {
    const html = await ask(workerMessages({ theme, plan, page: home, layer }), { maxTokens: 8000, trace: { kind: 'build' } })
    const after = await fixSection({ provider: prov, model: MODEL, theme, html, role: layer.role, ...PROBLEM })
    return { id: layer.id, role: layer.role, content: layer.content, html, ...PROBLEM, after }
  }))
  return { id: brief.id, model: MODEL, recorded: new Date().toISOString().slice(0, 10), sitemaps, plan: { pages: pages.map(({ layers, ...p }) => p), shared, home: home.layers }, sections }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const cmd = process.argv[2]
  if (!['record', 'live'].includes(cmd)) { console.error('usage: record.mjs record|live'); process.exit(2) }
  if (!key()) { console.error('no model key: set SWARM_API_KEY'); process.exit(cmd === 'live' ? 0 : 2) }
  const made = []
  for (const b of BRIEFS) {
    const rec = await make(b)
    made.push(rec)
    console.log(`${b.id}: ${rec.sitemaps.length} sitemaps, ${rec.plan.home.length} home sections planned, ${rec.sections.length} built and reworked`)
    // live output is kept only where SWARM_META_OUT says (the nightly uploads it, so a break can be read)
    const dir = cmd === 'record' ? join(HERE, 'recorded') : process.env.SWARM_META_OUT
    if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${b.id}.json`), JSON.stringify(rec, null, 1) + '\n') }
  }
  const breaks = await checkAll(made)
  if (breaks) { console.error(breaks); process.exitCode = 1 } else console.log('every relation holds')
}
