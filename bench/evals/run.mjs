#!/usr/bin/env node
// Prompt evals (decision 0019 point 5, issue #464): a change to a crew prompt is measured before and after on
// the crew's test sets (bench/evals/sets/), and fails past the thresholds (bench/evals/thresholds.json).
//
//   node bench/evals/run.mjs fingerprint [--root <tree>]          the prompts' fingerprint, as the crew sends them
//   node bench/evals/run.mjs measure <out.json> [--root <tree>] [--runs 2]
//                                                                 build every set with that tree's prompts and
//                                                                 code, lint it, photograph it, have it reviewed
//   node bench/evals/run.mjs compare <before.json> <after.json>  the table, and exit 1 past a threshold
//   node bench/evals/run.mjs gate --base <git ref> [--runs 2]     both sides locally, into
//                                                                 bench/evals/reports/<fingerprint>.json
//   node bench/evals/run.mjs check --base <git ref>              CI with no model key: the committed report for
//                                                                 this fingerprint, made against the base's
//
// What a set measures, per run of a crew of eight on one page:
//   score     the reviewer's 0-10 on a screenshot of the page (engine/review.mjs reviewPage, a vision model)
//   findings  slop-linter findings per section (engine/lint), P0 and P1, after the builder's fix pass
//   time      the page's wall time, fix passes included
//   tokens    prompt and completion tokens, as the endpoint counts them
// The model key: SWARM_API_KEY (CI: the SWARM_EVAL_API_KEY secret), else Hermes's InferHub key on this machine.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const [cmd, ...rest] = process.argv.slice(2)
const flag = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d }
const pos = rest.filter((x, i) => !x.startsWith('--') && !rest[i - 1]?.startsWith('--'))
const THRESHOLDS = JSON.parse(readFileSync(join(HERE, 'thresholds.json'), 'utf8'))
const SETS = readdirSync(join(HERE, 'sets')).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(HERE, 'sets', f), 'utf8')))
const MODEL = process.env.SWARM_EVAL_MODEL || 'cb/deepseek-v4.1-flash'
const REVIEWER = process.env.SWARM_EVAL_REVIEWER || 'ali/qwen3.8-omni-flash'
const NO_THINKING = { reasoning_effort: 'none', reasoning: { enabled: false } }
const engine = (root, f) => import(pathToFileURL(join(root, 'engine', f)).href)

function key() {
  if (process.env.SWARM_API_KEY) return process.env.SWARM_API_KEY
  const env = [join(process.env.LOCALAPPDATA || '', 'hermes', '.env'), join(homedir(), '.hermes', '.env')].find(existsSync)
  return env && readFileSync(env, 'utf8').match(/^HERMES_CUSTOM_INFERHUB_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1]
}
const provider = () => ({ baseUrl: process.env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1', apiKey: key() })

// ---------- the fingerprint: every crew prompt exactly as it is sent, caught at fetch, never sent
export async function fingerprint(root = ROOT) {
  const { workerMessages, pagePlannerMessages, SITEMAP_SYSTEM } = await engine(root, 'prompts.mjs')
  const review = await engine(root, 'review.mjs')
  const set = SETS[0], page = pageOf(set), plan = planOf(set)
  const sent = [SITEMAP_SYSTEM]
  for (const images of [false, true]) sent.push(JSON.stringify(workerMessages({ theme: set.theme, plan, page, layer: page.layers[1], images })))
  try { sent.push(JSON.stringify(pagePlannerMessages({ brief: set.brief, theme: set.theme, plan, page }))) } catch { /* its shape changed: its text is in prompts.mjs's hash below */ }
  const real = globalThis.fetch
  globalThis.fetch = async (_url, init) => { sent.push(init.body); throw new Error('fingerprint: not sent') }
  const p = { baseUrl: 'http://fingerprint.invalid/v1', apiKey: 'x' }
  const section = { key: 'home/hero', role: 'hero', top: 0, height: 600 }
  try {
    await review.reviewPage({ provider: p, model: 'm', brief: set.brief, page: 'Home', sections: [section], image: 'data:image/png;base64,' }).catch(() => {})
    await review.fixSection({ provider: p, model: 'm', theme: set.theme, html: '<section></section>', role: 'hero', problem: 'p', fix: 'f' }).catch(() => {})
    await review.fixSection({ provider: p, model: 'm', theme: set.theme, html: '<section></section>', role: 'hero', comment: 'c' }).catch(() => {})
    await review.routeComment({ provider: p, model: 'm', text: 'c', sections: [section] }).catch(() => {})
  } finally { globalThis.fetch = real }
  return createHash('sha256').update(sent.map(s => String(s).replace(/"model":"[^"]*"/g, '')).join('\n\u0000')).digest('hex').slice(0, 16)
}

const pageOf = set => ({ id: 'home', title: set.title, purpose: set.purpose, layers: set.layers.map(([id, role, content]) => ({ id, role, content, page: 'home' })) })
const planOf = set => ({ theme: set.theme, pages: [pageOf(set)], shared: [] })

// ---------- one page: a crew of eight builds it, as engine/run.mjs does (the fix pass included)
async function buildPage(root, set) {
  const { streamChat } = await engine(root, 'llm.mjs')
  const { workerMessages } = await engine(root, 'prompts.mjs')
  const { fixSection } = await engine(root, 'review.mjs')
  // the tree's own linter drives its fix pass (a tree from before engine/lint has none); this tree's counts
  // the findings on both sides, so the two are judged by the same rules
  const own = p => existsSync(join(p, 'engine/lint/index.mjs')) ? engine(p, 'lint/index.mjs') : null
  const lint = await own(root), judgeLint = await own(ROOT) || lint
  const prov = provider(), page = pageOf(set), plan = planOf(set)
  const tokens = { in: 0, out: 0 }
  const count = u => { tokens.in += u?.prompt_tokens || 0; tokens.out += u?.completion_tokens || 0 }
  const queue = [...page.layers], out = [], started = performance.now()
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let layer; (layer = queue.shift());) {
      try {
        const res = await streamChat(prov, { model: MODEL, messages: workerMessages({ theme: set.theme, plan, page, layer, images: false }), maxTokens: 8000, extra: NO_THINKING })
        count(res.usage)
        let html = res.text
        // the tree's own fix pass, when it has one
        const must = lint ? lint.lintSection(html, { content: layer.content }).filter(f => f.severity === 'P0') : []
        if (must.length) {
          let usage
          const fixed = await fixSection({ provider: { ...prov, onUsage: u => { usage = u.usage } }, model: MODEL, theme: set.theme, html, role: layer.role, ...lint.forBuilder(must) }).catch(() => null)
          count(usage)
          if (fixed && lint.lintSection(fixed, { content: layer.content }).filter(f => f.severity === 'P0').length < must.length) html = fixed
        }
        out.push({ id: layer.id, html })
      } catch (err) { out.push({ id: layer.id, html: '', error: String(err.message || err).slice(0, 200) }) }
    }
  }))
  const wallMs = Math.round(performance.now() - started)
  const sections = page.layers.map(l => out.find(s => s.id === l.id))
  const found = judgeLint ? sections.map(s => judgeLint.lintSection(s.html, { content: page.layers.find(l => l.id === s.id).content })) : []
  return { wallMs, tokens, sections, errors: sections.filter(s => s.error).length, p0: found.flat().filter(f => f.severity === 'P0').length, p1: found.flat().filter(f => f.severity === 'P1').length, ids: found.flat().map(f => f.id) }
}

// ---------- the reviewer's score on a photo of the page (Tailwind from its CDN, as web/frame.html does)
async function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, join(ROOT, 'tools/dev/node_modules/playwright')].filter(Boolean)
  for (const d of dirs) { try { return createRequire(join(resolve(d), 'package.json'))('playwright') } catch {} }
  return import('playwright')
}
async function scorePage(root, set, built, browser) {
  const { reviewPage } = await engine(root, 'review.mjs')
  const vars = Object.entries(set.theme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  const doc = `<!doctype html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com/3.4.17"></script>
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(set.theme.fonts.heading)}&family=${encodeURIComponent(set.theme.fonts.body)}&display=swap" rel="stylesheet">
<style>:root{${vars};--font-heading:'${set.theme.fonts.heading}',serif;--font-body:'${set.theme.fonts.body}',sans-serif;--radius:${set.theme.radius}}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-body)}</style></head>
<body>${built.sections.map(s => `<div data-key="home/${s.id}">${s.html}</div>`).join('\n')}</body></html>`
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(doc, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(500)
    const sections = await page.$$eval('[data-key]', els => els.map(el => ({ key: el.dataset.key, top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.getBoundingClientRect().height) })))
    const height = Math.min(9000, Math.max(...sections.map(s => s.top + s.height), 800))
    const shot = await page.screenshot({ type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 1280, height } })
    const r = await reviewPage({ provider: provider(), model: REVIEWER, brief: set.brief, page: set.title, sections: sections.map(s => ({ ...s, role: set.layers.find(l => `home/${l[0]}` === s.key)?.[1] || '' })), image: `data:image/jpeg;base64,${shot.toString('base64')}` })
    // a reviewer without a score (a tree before the scored review) is scored by its issues; judge() compares
    // the score only when both sides were really scored
    return { score: r.score ?? Math.max(0, 10 - 2 * r.issues.length), scored: r.score != null, issues: r.issues.length, verdict: r.verdict }
  } finally { await page.close() }
}

async function measure(out, root = ROOT, runs = 2) {
  if (!provider().apiKey) { console.error('no model key: set SWARM_API_KEY'); process.exit(2) }
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const sets = {}
  try {
    for (const set of SETS) {
      const rs = []
      for (let i = 0; i < runs; i++) {
        const b = await buildPage(root, set)
        const s = await scorePage(root, set, b, browser).catch(err => ({ score: null, error: String(err.message || err).slice(0, 200) }))
        rs.push({ wallMs: b.wallMs, tokensIn: b.tokens.in, tokensOut: b.tokens.out, sections: b.sections.length, errors: b.errors, p0: b.p0, p1: b.p1, ids: b.ids, ...s })
        console.log(`· ${set.id} run ${i + 1}: ${(b.wallMs / 1000).toFixed(1)} s, score ${s.score ?? '-'}, ${b.p0} P0 ${b.p1} P1, ${b.tokens.in}+${b.tokens.out} tokens`)
      }
      const mean = k => { const v = rs.map(r => r[k]).filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100 : null }
      sets[set.id] = { runs: rs, scored: rs.every(r => r.scored), wallMs: mean('wallMs'), tokensIn: mean('tokensIn'), tokensOut: mean('tokensOut'), score: mean('score'), findings: Math.round((mean('p0') + mean('p1')) / set.layers.length * 100) / 100, p0: mean('p0'), errors: mean('errors') }
    }
  } finally { await browser.close() }
  const report = { fingerprint: await fingerprint(root), model: MODEL, reviewer: REVIEWER, runs, at: new Date().toISOString(), sets }
  mkdirSync(dirname(resolve(out)), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  return report
}

// ---------- the thresholds: after against before, per set
export function judge(before, after, t = THRESHOLDS) {
  const rows = [], fails = []
  for (const [id, a] of Object.entries(after.sets)) {
    const b = before.sets[id]
    if (!b) { rows.push(`| ${id} | new set | | | | |`); continue }
    const pct = (x, y) => y ? Math.round((x - y) / y * 100) : 0
    const checks = [
      ['score', a.score != null && b.score != null && b.scored !== false && a.scored !== false && a.score < b.score - t.scoreDrop, b.scored === false && a.scored !== false ? `${a.score} (the base gives no score)` : `${b.score} → ${a.score}`],
      ['findings per section', a.findings > b.findings + t.findingsRise, `${b.findings} → ${a.findings}`],
      ['P0 findings', a.p0 > b.p0 + t.p0Rise, `${b.p0} → ${a.p0}`],
      ['wall time', pct(a.wallMs, b.wallMs) > t.timeRisePct, `${(b.wallMs / 1000).toFixed(1)} s → ${(a.wallMs / 1000).toFixed(1)} s (${pct(a.wallMs, b.wallMs)}%)`],
      ['prompt tokens', pct(a.tokensIn, b.tokensIn) > t.tokensRisePct, `${b.tokensIn} → ${a.tokensIn} (${pct(a.tokensIn, b.tokensIn)}%)`]
    ]
    for (const [name, bad, text] of checks) if (bad) fails.push(`${id}: ${name} ${text}, past the threshold`)
    rows.push(`| ${id} | ${checks.map(([, bad, text]) => `${bad ? '**' : ''}${text}${bad ? '**' : ''}`).join(' | ')} |`)
  }
  const table = ['| set | score | findings per section | P0 | wall time | prompt tokens |', '|---|---|---|---|---|---|', ...rows].join('\n')
  return { table, fails }
}
function compare(beforeFile, afterFile) {
  const before = JSON.parse(readFileSync(beforeFile, 'utf8')), after = JSON.parse(readFileSync(afterFile, 'utf8'))
  const { table, fails } = judge(before, after)
  console.log(`before ${before.fingerprint}, after ${after.fingerprint}\n\n${table}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Prompt evals\n\nbefore \`${before.fingerprint}\`, after \`${after.fingerprint}\`\n\n${table}\n\n${fails.length ? fails.map(f => `- ${f}`).join('\n') : 'Within the thresholds.'}\n`, { flag: 'a' })
  if (fails.length) { console.log(fails.join('\n')); process.exit(1) }
  console.log('Within the thresholds.')
}

// a tree at a git ref, for the base side
function tree(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'evals-base-'))
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: ROOT, stdio: 'ignore' })
  return { dir, done: () => { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' }); rmSync(dir, { recursive: true, force: true }) } }
}
const reportFile = fp => join(HERE, 'reports', `${fp}.json`)

async function gate(base, runs) {
  const b = tree(base)
  try {
    const [bf, hf] = [await fingerprint(b.dir), await fingerprint(ROOT)]
    if (bf === hf) { console.log(`the prompts are the same as ${base}'s (${hf}): nothing to measure`); return }
    const before = await measure(join(tmpdir(), `evals-${bf}.json`), b.dir, runs)
    const after = await measure(join(tmpdir(), `evals-${hf}.json`), ROOT, runs)
    const { table, fails } = judge(before, after)
    writeFileSync(reportFile(hf), JSON.stringify({ base, before, after, table, fails }, null, 2) + '\n')
    console.log(`\n${table}\n\nwrote bench/evals/reports/${hf}.json${fails.length ? `\n${fails.join('\n')}` : ''}`)
    if (fails.length) process.exit(1)
  } finally { b.done() }
}

// CI with no model key: this tree's prompts must have a committed report, made against the base's prompts
async function check(base) {
  const b = tree(base)
  try {
    const [bf, hf] = [await fingerprint(b.dir), await fingerprint(ROOT)]
    if (bf === hf) { console.log(`the prompts are unchanged (${hf}): nothing to measure`); return }
    const f = reportFile(hf)
    if (!existsSync(f)) {
      console.log(`The crew's prompts changed (${bf} → ${hf}) and there is no eval report for them.\nRun: node bench/evals/run.mjs gate --base ${base}\nand commit bench/evals/reports/${hf}.json (or add the SWARM_EVAL_API_KEY secret, and CI measures it).`)
      process.exit(1)
    }
    const r = JSON.parse(readFileSync(f, 'utf8'))
    if (r.before.fingerprint !== bf || r.after.fingerprint !== hf) { console.log(`bench/evals/reports/${hf}.json was measured against ${r.before.fingerprint}, not this base's ${bf}: run the gate again`); process.exit(1) }
    const tmpB = join(tmpdir(), `b-${bf}.json`), tmpA = join(tmpdir(), `a-${hf}.json`)
    writeFileSync(tmpB, JSON.stringify(r.before)); writeFileSync(tmpA, JSON.stringify(r.after))
    compare(tmpB, tmpA)
  } finally { b.done() }
}

const MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const root = resolve(flag('root', ROOT)), runs = Number(flag('runs', 2))
if (!MAIN) { /* imported by tests/evals.test.mjs */ }
else if (cmd === 'fingerprint') console.log(await fingerprint(root))
else if (cmd === 'measure' && pos[0]) await measure(resolve(pos[0]), root, runs)
else if (cmd === 'compare' && pos[1]) compare(resolve(pos[0]), resolve(pos[1]))
else if (cmd === 'gate' && flag('base')) await gate(flag('base'), runs)
else if (cmd === 'check' && flag('base')) await check(flag('base'))
else { console.log('node bench/evals/run.mjs fingerprint | measure <out> | compare <before> <after> | gate --base <ref> | check --base <ref>'); process.exit(2) }
