// The strategy starter holds 500 units (docs/specs/38-game-starters.md, slice 3). bench/strategy-500.json is
// the measured run (node bench/starter-strategy.mjs --ssh windows --window --web --out bench/strategy-500.json):
// Godot headless, Godot in a window, and the Web export in a headless Chromium. This test holds those numbers
// to the bar; with SWARM_GODOT set it measures again on this machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BAR = { units: 500, p95: 25, avg: 20 } // ms: a playable 60 fps frame with room for the game on top
const run = JSON.parse(readFileSync(new URL('../bench/strategy-500.json', import.meta.url), 'utf8'))
const holds = (r, where) => {
  assert.ok(r, `${where}: measured`)
  assert.equal(r.units, BAR.units, `${where}: units`)
  assert.equal(r.alive, BAR.units, `${where}: every unit alive to the end`)
  assert.ok(r.frames >= 600, `${where}: frames measured`)
  assert.ok(r.frame_ms.avg <= BAR.avg, `${where}: average frame ${r.frame_ms.avg} ms`)
  assert.ok(r.frame_ms.p95 <= BAR.p95, `${where}: p95 frame ${r.frame_ms.p95} ms`)
}

test('Godot itself holds 500 units at a playable frame rate, headless and in a window', () => {
  holds(run.headless, 'headless')
  holds(run.window, 'window')
  assert.equal(run.window.headless, false)
})

test('the Web export holds 500 units at a playable frame rate in a browser', () => {
  holds(run.web, 'web')
  assert.equal(run.web.web, true)
  assert.ok(run.web.fps_avg >= 50, `web: ${run.web.fps_avg} fps`)
  assert.ok(run.web.gpu, 'web: the GPU it ran on is recorded')
})

test('measured again with this machine\'s Godot', { skip: !process.env.SWARM_GODOT && 'set SWARM_GODOT to measure here' }, () => {
  const out = execFileSync(process.execPath, [new URL('../bench/starter-strategy.mjs', import.meta.url).pathname, '--units', '500'], { encoding: 'utf8', timeout: 600000 })
  holds(JSON.parse(out.slice(out.indexOf('{'))).headless, 'headless here')
})
