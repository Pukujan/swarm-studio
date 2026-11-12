// Runs the film regression set (spec 26, tests/films/set.json) and scores it.
//
//   node scripts/film-set.mjs                 rules and fallbacks only, no model
//   node scripts/film-set.mjs --model         the real writer (SWARM_PLANNER_API_KEY / _BASE_URL / _MODEL,
//                                             or SWARM_API_KEY / SWARM_BASE_URL / SWARM_PLANNER_MODEL)
//   --seed 7  --only game-trailer,shop-calm  --out scores.json  --boards dir
//
// Prints one row per film and the set's scores; exits 1 when a film does not finish.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureBuild, scoreSet, spokenSeconds } from '../engine/filmscore.mjs'
import { writeBoard, fallbackBoard, cueSheet } from '../engine/storyboard.mjs'
import { scoreWav } from '../engine/score.mjs'
import { readWav, analyse, cutToMusic } from '../engine/musiccut.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
export const loadSet = () => JSON.parse(readFileSync(join(here, '..', 'tests', 'films', 'set.json'), 'utf8'))

// Each beat's final length, the way the server times a cut (a spoken line stretches its beat).
export const timed = board => board.map(b => Number(Math.max(b.seconds || 2, board.voice && b.say ? spokenSeconds(b.say) + 0.6 : 0).toFixed(3)))

// The film cut to its music the way the server does it: the studio's score at the planned lengths,
// measured, the cuts moved onto it. Returns the final lengths and where the beat falls.
export function cutFilm(board, planned, seed, dir) {
  const file = join(dir, `t${seed}.wav`)
  scoreWav({ seconds: planned.reduce((a, b) => a + b, 0), music: board.music, cues: cueSheet(board, planned), file, seed })
  const { samples, rate } = readWav(file)
  const a = analyse(samples, rate, { bpm: board.music?.bpm })
  const least = planned.map((_, i) => (board.voice && board[i].say ? planned[i] : 0))
  const r = cutToMusic(board, planned, a, { min: least })
  return { lengths: r.lengths, bpm: a.bpm || board.music?.bpm, phase: a.phase || 0, report: r.report }
}

export async function runSet({ model = null, provider = null, seed = 1, only = null, chat, music = true, log = () => {} } = {}) {
  const set = loadSet()
  const tmp = music ? mkdtempSync(join(tmpdir(), 'film-set-')) : null
  const todo = set.prompts.filter(p => !only || only.includes(p.id))
  const results = []
  const one = async (p, i) => {
    const c = fixtureBuild(set.builds[p.build])
    const opts = { c, prompt: p.prompt, template: p.template || '', seed: seed * 1000 + i, shots: false }
    let board = null, floor = false, error = null
    try {
      if (model) board = await writeBoard({ ...opts, provider, model, chat, signal: AbortSignal.timeout(150000) })
      else { board = fallbackBoard(c, opts); floor = false }
    } catch (err) {
      error = String(err.message || err).slice(0, 120)
      try { board = fallbackBoard(c, { ...opts, fixes: [`no writer: ${error}`] }); floor = true } catch (e) { error = String(e.message || e).slice(0, 120) }
    }
    if (board?.fixes?.some(f => /fallback/.test(f))) floor = true
    log(`${p.id}${floor ? ' (floor)' : ''}`)
    const planned = board ? timed(board) : null
    let cut = null
    if (board && tmp) try { cut = cutFilm(board, planned, seed * 1000 + i, tmp) } catch (e) { log(`${p.id}: no music cut (${e.message})`) }
    results[i] = { id: p.id, build: p.build, expect: p.expect, c, board, planned, lengths: cut ? cut.lengths : planned, bpm: cut?.bpm, phase: cut?.phase, musicCut: cut?.report, floor, error }
  }
  // four at a time: the writer is one model call per film
  for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map((p, k) => one(p, i + k)))
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  return { results, ...scoreSet(results) }
}

export function table(films) {
  const cols = ['id', 'kind', 'fit', 'beats', 'seconds', 'shot', 'type', 'opens', 'closes', 'onBeat', 'onGrid', 'repairs', 'floor', 'shape']
  const cell = (f, k) => (f[k] === null || f[k] === undefined ? '-' : f[k] === true ? 'yes' : f[k] === false ? 'no' : String(f[k]))
  const w = cols.map(k => Math.max(k.length, ...films.map(f => cell(f, k).length)))
  return [cols, ...films.map(f => cols.map(k => (f.finished === false && k === 'kind' ? 'FAILED' : cell(f, k))))].map(r => r.map((x, i) => x.padEnd(w[i])).join('  ')).join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
  const env = process.env
  let model = null, provider = null
  if (args.includes('--model')) {
    model = arg('--model-name') || env.SWARM_PLANNER_MODEL
    provider = { baseUrl: (env.SWARM_PLANNER_BASE_URL || env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1').replace(/\/$/, ''), apiKey: env.SWARM_PLANNER_API_KEY || env.SWARM_API_KEY || env.HERMES_CUSTOM_INFERHUB_API_KEY }
    if (!model || !provider.apiKey) { console.error('--model needs SWARM_PLANNER_MODEL and a key (SWARM_PLANNER_API_KEY or SWARM_API_KEY)'); process.exit(2) }
  }
  const out = await runSet({ model, provider, music: !args.includes('--no-music'), seed: Number(arg('--seed')) || 1, only: arg('--only')?.split(','), log: s => process.stderr.write(`  ${s}\n`) })
  console.log(table(out.films))
  console.log('\n' + Object.entries(out.summary).map(([k, v]) => `${k}: ${v ?? '-'}`).join('   '))
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify({ model: model || 'none', summary: out.summary, films: out.films }, null, 2))
  if (arg('--boards')) {
    mkdirSync(arg('--boards'), { recursive: true })
    for (const r of out.results) if (r.board) writeFileSync(join(arg('--boards'), `${r.id}.json`), JSON.stringify({ ...Object.fromEntries(Object.entries(r.board).filter(([k]) => !/^\d+$/.test(k))), lengths: r.lengths, beats: [...r.board] }, null, 2))
  }
  process.exit(out.summary.finishes === out.summary.films ? 0 : 1)
}
