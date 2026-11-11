// Outfit packs for painted 2D characters: every sprite sheet of one outfit, painted
// from that outfit's design picture with the same move list and layout rules as every
// other outfit, then cut into frame strips and checked.
//
// The config (for ARES: games/ares/data/heroes.json) holds the contract under `sheet`
// (grid, layout, effect style), and per hero `art`: look, personality, extra
// reference pictures, `outfits` ({id: {design}}) and `sheets` ({name: what the six
// frames show}). Effect sheets live under `fx.sheets`. A new outfit is one design
// picture plus one entry, then:
//
//   node engine/skins.mjs games/ares/data/heroes.json --hero runner [--outfit gala] [--only o-idle,o-run]
//        [--from <folder of already painted <sheet>.png>] [--fx] [--dry]
//
// Painting goes through imagegen.py (the person's own image login, e.g. openai-codex);
// SWARM_HERMES_PY is the Python that runs it and SWARM_IMAGEGEN another launcher if
// needed. Cutting runs games/ares/tools/sheets/cut.py (numpy, scipy, Pillow).
// Output: <game>/assets/skins/<hero>/<outfit>/<sheet>.webp + .json, and pack.json.

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const run = (cmd, args, opts = {}) => new Promise(ok => execFile(cmd, args, { maxBuffer: 1 << 22, timeout: 600000, ...opts }, (err, out, errOut) => ok({ err, out: String(out || ''), errOut: String(errOut || '') })))
const lastJson = s => { try { return JSON.parse(s.trim().split('\n').pop()) } catch { return null } }

// What to paint for one hero's outfit: one job per sheet, prompt and references ready.
export function skinJobs(config, { root = '.', hero, outfit = 'default', only } = {}) {
  const h = config.heroes?.[hero]
  if (!h) throw new Error(`no hero "${hero}"`)
  const art = h.art
  if (!art?.sheets) throw new Error(`${hero} has no art.sheets`)
  const o = art.outfits?.[outfit]
  if (!o?.design) throw new Error(`${hero} has no outfit "${outfit}" with a design picture`)
  const layout = config.sheet?.layout || ''
  const pick = only ? new Set(only) : null
  return Object.entries(art.sheets)
    .filter(([name]) => !pick || pick.has(name))
    .map(([name, frames]) => ({
      hero, outfit, sheet: name,
      prompt: [art.look, o.look, art.personality, layout, `The frames: ${frames}`].filter(Boolean).join(' '),
      refs: [o.design, ...(art.refs || [])].map(p => join(root, p)),
      out: join(root, 'assets', 'skins', hero, outfit, `${name}.webp`),
    }))
}

// Effect sheets: no character, painted on black.
export function fxJobs(config, { root = '.', only } = {}) {
  const pick = only ? new Set(only) : null
  return Object.entries(config.fx?.sheets || {})
    .filter(([name]) => !pick || pick.has(name))
    .map(([name, what]) => ({ sheet: name, fx: true, prompt: `${config.sheet?.fx_style || ''} The effect: ${what}`, refs: [], out: join(root, 'assets', 'fx', `${name}.webp`) }))
}

// The level a move's effect is at: the highest level entry at or below `level`.
export function fxAt(move, level) {
  const levels = move?.fx?.levels || {}
  const keys = Object.keys(levels).map(Number).filter(n => n <= level).sort((a, b) => a - b)
  return keys.length ? { level: keys.at(-1), ...levels[keys.at(-1)] } : null
}

async function paint(job, { py, script }) {
  const args = [script, job.prompt, '--aspect', 'landscape']
  for (const r of job.refs) args.push('--ref', r)
  if (job.refs.length) args.push('--edit')
  const r = await run(py, args)
  const j = lastJson(r.out)
  if (!j?.ok) throw new Error(`painting ${job.sheet} failed: ${j?.error || r.errOut.slice(-200) || r.err?.message}`)
  return j.path
}

async function cutSheet(src, job, py) {
  mkdirSync(dirname(job.out), { recursive: true })
  const args = [join(here, '..', 'games', 'ares', 'tools', 'sheets', 'cut.py'), src, job.out]
  if (job.fx) args.push('--fx')
  const r = await run(py, args)
  const j = lastJson(r.out)
  if (!j) throw new Error(`cutting ${job.sheet} failed: ${r.errOut.slice(-300)}`)
  return j
}

// Paint (or take from `from`), cut and check every job; writes pack.json beside them.
export async function buildPack(jobs, { from, dry = false, py = process.env.SWARM_HERMES_PY || 'python3', cutPy = process.env.SWARM_CUT_PY || 'python3', script = process.env.SWARM_IMAGEGEN || join(here, '..', 'imagegen.py'), log = console.log } = {}) {
  const res = []
  for (const job of jobs) {
    if (dry) { log(`would paint ${job.sheet}: ${job.prompt.slice(0, 120)}…`); res.push({ ...job, status: 'dry' }); continue }
    try {
      const painted = from ? join(from, `${job.sheet}.png`) : await paint(job, { py, script })
      if (!existsSync(painted)) throw new Error(`no painting at ${painted}`)
      mkdirSync(dirname(job.out), { recursive: true })
      const meta = await cutSheet(painted, job, cutPy)
      log(`${job.sheet}: ${meta.qc.ok ? 'ok' : 'CHECK'} ${JSON.stringify(meta.qc)}`)
      res.push({ ...job, status: meta.qc.ok ? 'ok' : 'check', meta })
    } catch (e) {
      log(`${job.sheet}: failed: ${e.message}`)
      res.push({ ...job, status: 'failed', error: e.message })
    }
  }
  const dirs = new Set(res.filter(r => r.meta).map(r => dirname(r.out)))
  for (const d of dirs) {
    const mine = res.filter(r => r.meta && dirname(r.out) === d)
    const old = existsSync(join(d, 'pack.json')) ? JSON.parse(readFileSync(join(d, 'pack.json'), 'utf8')) : { sheets: {} }
    for (const r of mine) old.sheets[r.sheet] = { file: `${r.sheet}.webp`, ...r.meta }
    writeFileSync(join(d, 'pack.json'), JSON.stringify(old, null, 1) + '\n')
  }
  return res
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2)
  const opt = k => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined)
  const file = a[0]
  if (!file || file.startsWith('--')) { console.error('usage: node engine/skins.mjs <heroes.json> --hero <id> [--outfit id] [--only a,b] [--from dir] [--fx] [--dry]'); process.exit(2) }
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const root = resolve(dirname(file), '..')
  const only = opt('--only')?.split(',')
  const jobs = a.includes('--fx') ? fxJobs(config, { root, only }) : skinJobs(config, { root, hero: opt('--hero'), outfit: opt('--outfit') || 'default', only })
  const res = await buildPack(jobs, { from: opt('--from'), dry: a.includes('--dry') })
  const n = s => res.filter(r => r.status === s).length
  console.log(`${res.length} sheets: ${n('ok')} ok, ${n('check')} to check, ${n('failed')} failed`)
  process.exit(n('failed') ? 1 : 0)
}
