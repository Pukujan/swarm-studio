#!/usr/bin/env node
// The strategy starter, measured (docs/specs/38-game-starters.md, slice 3): 500 units in Godot itself and
// in the Web export. Assembles the starter into a temporary folder, then either runs a local Godot
// (SWARM_GODOT) or copies it to the Windows PC (--ssh windows) and runs Godot there with godot-run.ps1.
//   node bench/starter-strategy.mjs [--units 500] [--ssh windows] [--window] [--web] [--out bench/results/strategy-500.json]
// --window also measures in a real window (the GPU), --web exports to Web, brings the export back to a
// temporary folder, serves it on 127.0.0.1 and measures it in a headless Chromium (bench/browser.mjs).
// Every folder it makes is deleted at the end, here and on the PC.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleStarter } from '../engine/starters.mjs'
import { WEB_PRESET, serveStatic, unpersist } from '../engine/godotfirst.mjs'
import { pageResult } from './browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const units = Number(arg('--units', 500))
const ssh = arg('--ssh', '')
const web = process.argv.includes('--web')
const windowed = process.argv.includes('--window')
const out = arg('--out', '')
const dir = mkdtempSync(join(tmpdir(), 'starter-'))
const proj = join(dir, 'strategy')
assembleStarter('strategy-topdown', proj)
writeFileSync(join(proj, 'export_presets.cfg'), WEB_PRESET)
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000, ...opts })
const benchOf = text => { const m = /BENCH (\{.*\})/.exec(text); return m ? JSON.parse(m[1]) : null }
const result = { at: new Date().toISOString(), units }
try {
  let exported = null
  if (ssh) {
    const remote = 'D:\\managed\\starter-bench'
    const ps = (...a) => sh('ssh', [ssh, `powershell -NoProfile -ExecutionPolicy Bypass -File ${remote}\\godot-run.ps1 -Project ${remote}\\strategy ${a.join(' ')}`])
    sh('ssh', [ssh, `if exist ${remote} rmdir /s /q ${remote}`])
    sh('ssh', [ssh, `mkdir ${remote}`])
    sh('scp', ['-r', '-q', proj, join(here, 'godot-run.ps1'), `${ssh}:D:/managed/starter-bench/`])
    ps('-Mode', 'import')
    result.headless = benchOf(ps('-Mode', 'bench', '-Units', units))
    if (windowed) result.window = benchOf(ps('-Mode', 'bench', '-Units', units, '-Window'))
    if (web) {
      ps('-Mode', 'web')
      exported = join(dir, 'web')
      mkdirSync(exported)
      sh('scp', ['-r', '-q', `${ssh}:D:/managed/starter-bench/strategy/build/web/*`, exported])
    }
    sh('ssh', [ssh, `rmdir /s /q ${remote}`])
  } else {
    const g = process.env.SWARM_GODOT
    if (!g) throw new Error('set SWARM_GODOT or pass --ssh windows')
    sh(g, ['--headless', '--path', proj, '--import'])
    result.headless = benchOf(sh(g, ['--headless', '--path', proj, '--', '--bench', String(units)]))
    if (windowed) result.window = benchOf(sh(g, ['--path', proj, '--resolution', '1280x720', '--', '--bench', String(units)]))
    if (web) {
      exported = join(proj, 'build', 'web')
      mkdirSync(exported, { recursive: true })
      sh(g, ['--headless', '--path', proj, '--export-release', 'Web', 'build/web/index.html'])
    }
  }
  if (exported) {
    unpersist(join(exported, 'index.html'))
    const s = await serveStatic(exported, Number(arg('--port', 4431)))
    try { result.web = await pageResult(`${s.url}?bench=${units}`, { timeout: 240000 }) } finally { await s.close() }
  }
} finally { rmSync(dir, { recursive: true, force: true }) }
console.log(JSON.stringify(result, null, 1))
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1) + '\n') }
