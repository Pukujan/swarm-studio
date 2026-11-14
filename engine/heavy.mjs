// Heavy jobs (ffmpeg, RIFE) on the machine that can take them. With a heavy host set
// (SWARM_HEAVY_HOST, an SSH alias such as "mac-pro", or <data>/heavy.json { host, rife, interp, python })
// the scripts and inputs are copied to a job folder there, run, and the outputs copied back; without
// one they run here. Nothing secret goes over: only the files named.
import { execFile } from './proc.mjs'
import { existsSync, mkdtempSync, copyFileSync, readFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

export function heavyConfig(dataDir, env = process.env) {
  let file = {}
  try { file = JSON.parse(readFileSync(join(dataDir, 'heavy.json'), 'utf8')) } catch {}
  const host = String(env.SWARM_HEAVY_HOST ?? file.host ?? '').trim()
  return {
    host: /^[\w.@-]{1,80}$/.test(host) ? host : '',
    rife: String(env.SWARM_RIFE ?? file.rife ?? '').trim(),
    // another frame in-betweener instead of RIFE: a command there with {a} {b} {out} {t} in it
    // (the two frames, the frame to write, the time between them), and the name the chat shows
    interp: String(env.SWARM_INTERP ?? file.interp?.cmd ?? file.interp ?? '').trim(),
    interpName: String(env.SWARM_INTERP_NAME ?? file.interp?.name ?? '').trim().slice(0, 40),
    // unset: the first Python there with numpy, scipy and Pillow (a Mac's own python3 has none)
    python: String(env.SWARM_HEAVY_PY ?? file.python ?? '').trim(),
  }
}

// the in-betweener the idle uses: the one set up, else RIFE, else none (→ args for idle_sheet.py)
export const interpOf = config => (config.interp
  ? { name: config.interpName || 'the in-betweener', args: ['--interp', config.interp] }
  : config.rife ? { name: 'RIFE', args: ['--rife', config.rife] } : null)

const run = (cmd, args, opts) => new Promise(ok => execFile(cmd, args, { maxBuffer: 1 << 22, ...opts }, (err, out, errOut) => ok({ ok: !err, out: String(out || ''), err: String(errOut || err?.message || '') })))
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`

// files: [local paths] copied in by their base names; args: the script's arguments (input files by
// base name); outputs: base names to bring back into outDir. → { ok, out, err, files: {name: path} }
export async function runHeavy({ config, script, files = [], args = [], outputs = [], outDir, timeout = 600000 }) {
  const names = [script, ...files]
  if (!config.host) {
    const dir = mkdtempSync(join(tmpdir(), 'swarm-heavy-'))
    try {
      for (const f of names) copyFileSync(f, join(dir, basename(f)))
      const r = await run(config.python || 'python3', [basename(script), ...args], { cwd: dir, timeout })
      const got = {}
      for (const o of outputs) if (existsSync(join(dir, o))) { copyFileSync(join(dir, o), join(outDir, o)); got[o] = join(outDir, o) }
      return { ...r, files: got, where: 'here' }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
  const ssh = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']
  const job = `swarm-heavy/${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const mk = await run('ssh', [...ssh, config.host, `mkdir -p ${q(job)}`], { timeout: 30000 })
  if (!mk.ok) return { ok: false, out: '', err: `could not reach ${config.host}: ${mk.err.split('\n')[0]}`, files: {} }
  try {
    const up = await run('scp', [...ssh, '-q', ...names, `${config.host}:${job}/`], { timeout: 300000 })
    if (!up.ok) return { ok: false, out: '', err: `could not copy to ${config.host}: ${up.err.split('\n')[0]}`, files: {} }
    // a login shell, so Homebrew's ffmpeg is on the PATH
    const py = config.python ? q(config.python) : '"$(for p in python3.14 python3.13 python3.12 python3; do $p -c "import numpy, scipy, PIL" 2>/dev/null && { echo $p; break; }; done)"'
    const r = await run('ssh', [...ssh, config.host, `bash -lc ${q(`cd ${q(job)} && ${py} ${q(basename(script))} ${args.map(q).join(' ')}`)}`], { timeout })
    const got = {}
    if (outputs.length) {
      await run('scp', [...ssh, '-q', ...outputs.map(o => `${config.host}:${job}/${o}`), outDir], { timeout: 300000 })
      for (const o of outputs) if (existsSync(join(outDir, o))) got[o] = join(outDir, o)
    }
    return { ...r, files: got, where: config.host }
  } finally {
    run('ssh', [...ssh, config.host, `rm -rf ${q(job)}`], { timeout: 30000 })
  }
}
