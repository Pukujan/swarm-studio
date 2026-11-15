// The board gauge's main-thread-work statistic (scripts/board-gauge.mjs compare): speed-normalised and paired, so a slower
// runner is not a slower board and a slower board is. Recordings are made up here: frame times with a calibration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const SCRIPT = fileURLToPath(new URL('../scripts/board-gauge.mjs', import.meta.url))
// a board's frames: mostly 2 ms with a slow tail, the same shape every time, scaled by how fast the machine is
const frames = k => Array.from({ length: 400 }, (_, i) => (i % 20 === 0 ? 9 : 2 + (i % 5) * 0.4) * k)
// one recording: a machine `speed` times slower than the reference runs its calibration and the board's frames that much slower
const rec = (speed, board = 1, layers = 20) => ({ root: '', runs: 1, fixture: {}, scenes: { deck: { runs: [{ crashed: false, ft: frames(speed * board), calibMs: 8 * speed, taskMs: 1000 * speed * board, iframes: 252, nodes: 16000, layers, jsHeapMB: 700, gpuMB: 18, gpuAllocMB: 18, playersAfter: 0, filmPlaying: 1, camera: 'c' }] } } })
function run(base, head) {
  const dir = mkdtempSync(join(tmpdir(), 'gauge-frame-'))
  try {
    const files = (side, list) => list.map((r, i) => { const f = join(dir, `${side}${i}.json`); writeFileSync(f, JSON.stringify(r)); return f }).join(',')
    const r = spawnSync(process.execPath, [SCRIPT, 'compare', files('base', base), files('head', head)], { encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('the same board on machines of different speeds is not a regression', () => {
  // each pair is two recordings on one machine; the machines run at 0.6, 1.0 and 1.7 times the reference's time
  const base = [rec(0.6), rec(1.0), rec(1.7)], head = [rec(0.6), rec(1.0), rec(1.7)]
  const r = run(base, head)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /main-thread work 1\.00×/)
})

test('a board whose frames take 25% longer fails, on a fast machine and a slow one alike', () => {
  const base = [rec(0.6), rec(1.0), rec(1.7)], head = [rec(0.6, 1.25), rec(1.0, 1.25), rec(1.7, 1.25)]
  const r = run(base, head)
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /main-thread work 1\.25× the base/)
})

test('one pair spoiled by a noisy minute does not decide it', () => {
  const base = [rec(1.0), rec(1.0), rec(1.0)], head = [rec(1.0), rec(1.0, 2.0), rec(1.0)]
  assert.equal(run(base, head).code, 0)
})

test('--no-gate-frame shows the ratio and does not fail on it', () => {
  const base = [rec(1), rec(1), rec(1)], head = [rec(1, 1.5), rec(1, 1.5), rec(1, 1.5)]
  const dir = mkdtempSync(join(tmpdir(), 'gauge-frame-'))
  try {
    const files = (side, list) => list.map((r, i) => { const f = join(dir, `${side}${i}.json`); writeFileSync(f, JSON.stringify(r)); return f }).join(',')
    const r = spawnSync(process.execPath, [SCRIPT, 'compare', files('base', base), files('head', head), '--no-gate-frame'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /main-thread work 1\.50×/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("a count that takes one of two values on the same code (the Overview's layers, 15 or 20) is held to the base's highest", () => {
  // two of three base recordings drew 15 layers, the head's drew 20: the same code, a different mode
  const base = [rec(1, 1, 15), rec(1, 1, 15), rec(1, 1, 20)], head = [rec(1, 1, 20), rec(1, 1, 20), rec(1, 1, 20)]
  assert.equal(run(base, head).code, 0)
  // layers well over the base's highest are still a regression
  const heavy = [rec(1, 1, 30), rec(1, 1, 30), rec(1, 1, 30)]
  const r = run(base, heavy)
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /layers 20 → 30/)
})
