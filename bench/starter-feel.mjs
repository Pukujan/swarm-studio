#!/usr/bin/env node
// The platformer starter's feel, proved headless (docs/specs/38-game-starters.md, slice 4): puts the
// starter together in a temporary folder, runs its feel test (one physics step a frame) on a local Godot
// (SWARM_GODOT) or on the Windows PC (--ssh windows), and prints the FEEL line as JSON.
//   node bench/starter-feel.mjs [--ssh windows] [--out bench/platformer-feel.json]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleStarter } from '../engine/starters.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const ssh = arg('--ssh', '')
const out = arg('--out', '')
const dir = mkdtempSync(join(tmpdir(), 'starter-'))
const proj = join(dir, 'platformer')
assembleStarter('platformer-side', proj)
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 600000 })
const feelOf = text => { const m = /FEEL (\{.*\})/.exec(text); if (!m) throw new Error(`no FEEL line:\n${text.slice(-2000)}`); return JSON.parse(m[1]) }
let result
try {
  if (ssh) {
    const remote = 'D:\\managed\\starter-feel'
    const ps = (...a) => sh('ssh', [ssh, `powershell -NoProfile -ExecutionPolicy Bypass -File ${remote}\\godot-run.ps1 -Project ${remote}\\platformer ${a.join(' ')}`])
    sh('ssh', [ssh, `if exist ${remote} rmdir /s /q ${remote}`])
    sh('ssh', [ssh, `mkdir ${remote}`])
    sh('scp', ['-r', '-q', proj, join(here, 'godot-run.ps1'), `${ssh}:D:/managed/starter-feel/`])
    ps('-Mode', 'import')
    try { result = feelOf(ps('-Mode', 'feel')) } finally { sh('ssh', [ssh, `rmdir /s /q ${remote}`]) }
  } else {
    const g = process.env.SWARM_GODOT
    if (!g) throw new Error('set SWARM_GODOT or pass --ssh windows')
    sh(g, ['--headless', '--path', proj, '--import'])
    result = feelOf(sh(g, ['--headless', '--fixed-fps', '60', '--path', proj, '--', '--feel']))
  }
} finally { rmSync(dir, { recursive: true, force: true }) }
result = { at: new Date().toISOString(), ...result }
console.log(JSON.stringify(result, null, 1))
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1) + '\n') }
