// Engine ports: after a game is built and played on the web, the crew can also
// write it as a project for Godot, Unity or Unreal, from the same spec and with
// the engine's own skill files (gameskills/gamedev, from
// gamedev-skills/awesome-gamedev-agent-skills). The web build stays the one that
// plays in the Studio; the port is source to open in that engine, checked for
// the files the engine needs to open it, not compiled here.

import { execFile } from './proc.mjs'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { delimiter, join, relative } from 'node:path'
import { skillText } from './game.mjs'
import { castPrompt, cleanCast } from './cast.mjs'

export const TARGETS = {
  godot: {
    label: 'Godot',
    skills: ['gamedev/godot-gdscript', 'gamedev/godot-nodes-scenes', 'gamedev/godot-2d-movement', 'gamedev/godot-3d-essentials', 'gamedev/godot-signals-groups', 'gamedev/godot-export'],
    layout: 'a Godot 4 project: project.godot at the root (config_version=5, a main scene set), scenes as .tscn files under scenes/, GDScript under scripts/ (typed, one script per system), the art copied to assets/, and an export_presets.cfg with a Web preset',
    needs: [['project.godot'], ['.tscn'], ['.gd']],
    models: 'assets/models',
    useModel: f => `load("res://assets/models/${f}").instantiate() (the AnimationPlayer inside holds its animations)`
  },
  unity: {
    label: 'Unity',
    skills: ['gamedev/unity-csharp-scripting', 'gamedev/unity-input-system', 'gamedev/unity-physics', 'gamedev/unity-scriptableobjects', 'gamedev/unity-build-pipeline'],
    layout: 'a Unity 6 project: Assets/Scripts with C# MonoBehaviours (one per system) and ScriptableObjects for weapons, enemies and blessings under Assets/Data, Assets/Art for the pictures, Packages/manifest.json listing com.unity.inputsystem, and ProjectSettings/ProjectVersion.txt',
    needs: [['Packages/manifest.json'], ['ProjectSettings/ProjectVersion.txt'], ['.cs']],
    models: 'Assets/Models',
    useModel: f => `the prefab Unity imports from Assets/Models/${f} (Animator with its clips)`
  },
  unreal: {
    label: 'Unreal',
    skills: ['gamedev/unreal-cpp-gameplay', 'gamedev/unreal-enhanced-input', 'gamedev/unreal-blueprints', 'gamedev/unreal-behavior-trees', 'gamedev/unreal-packaging'],
    layout: 'an Unreal Engine 5 C++ project: <Name>.uproject at the root, Source/<Name>/ with <Name>.Build.cs, the game module, and C++ classes for the hero character, enemies, weapons, rooms and the game mode (UCLASS/UPROPERTY so designers can extend them in Blueprints), Config/DefaultEngine.ini and DefaultInput.ini with Enhanced Input mappings',
    needs: [['.uproject'], ['.Build.cs'], ['.cpp'], ['.h']]
  }
}

// "Godot" / "Unity (port)" / "web" → a target key, or null for the web only
export function portTarget(x) {
  const s = String(x?.target ?? x?.answers?.target ?? x ?? '').toLowerCase()
  return Object.keys(TARGETS).find(k => s.includes(k)) || null
}

export const portDir = (dir, target) => join(dir, 'ports', target)

// The app's 3D models (public/models/) copied into the port, where the engine
// imports them; the engine call cannot copy binaries itself. → the file names.
export function copyPortModels(dir, target) {
  const t = TARGETS[target], from = join(dir, 'public', 'models')
  if (!t.models || !existsSync(from)) return []
  const to = join(portDir(dir, target), t.models)
  const files = readdirSync(from).filter(f => /^[\w.-]{1,80}\.(glb|gltf)$/i.test(f))
  for (const f of files) { try { mkdirSync(to, { recursive: true }); copyFileSync(join(from, f), join(to, f)) } catch {} }
  return files
}

export function portPrompt(spec, target, models = []) {
  const t = TARGETS[target]
  const facts = JSON.stringify({ ...spec, skills: undefined, answers: undefined, brand: undefined, model: undefined }, null, 1).slice(0, 9000)
  return `Port this browser game to ${t.label}. The web version in src/game/ is built and plays; read it and keep its rules, numbers, enemies, rooms, blessings and story.

Write ${t.layout}. Put every file under ports/${target}/ and nowhere else: do not touch src/, the web build must stay as it is.
- Copy the meaning, not the code: use ${t.label}'s own scene, input and physics systems.
- Reuse the pictures in public/ (copy the paths you need into the project's art folder by listing them in a README if you cannot copy binaries).
${models.length ? `- The web game's 3D models are already copied to ports/${target}/${t.models}/ (${models.join(', ')}). Use the same model for each hero, enemy and prop as the web version: ${t.useModel('<file>')}, and play the same animation names.\n` : ''}
${castPrompt(cleanCast(spec.cast))}- Add ports/${target}/README.md: how to open it in ${t.label}, what is done, and what still needs an editor pass (materials, animation, tuning).
- Keep files small and complete; no placeholders like "TODO: implement".

The game spec:
${facts}

${skillText(t.skills, 18000)}`
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    try { statSync(p).isDirectory() ? walk(p, out) : out.push(p) } catch {}
  }
  return out
}

// { ok, files, missing } — the engine needs these to open the project at all
export function checkPort(dir, target) {
  const root = portDir(dir, target)
  if (!existsSync(root)) return { ok: false, files: 0, missing: ['the ports folder'] }
  const files = walk(root).map(p => relative(root, p).split('\\').join('/'))
  const missing = TARGETS[target].needs.filter(alts => !alts.some(n => files.some(f => f === n || f.endsWith(n)))).map(a => a[0])
  return { ok: missing.length === 0, files: files.length, missing }
}

// A Godot binary to check ports with: SWARM_GODOT or GODOT, else godot / godot4 on PATH.
export function godotBin(env = process.env) {
  for (const k of ['SWARM_GODOT', 'GODOT']) if (env[k] && existsSync(env[k])) return env[k]
  const exe = process.platform === 'win32' ? ['godot.exe', 'godot4.exe', 'godot_console.exe'] : ['godot', 'godot4']
  for (const d of String(env.PATH || env.Path || '').split(delimiter).filter(Boolean)) for (const n of exe) if (existsSync(join(d, n))) return join(d, n)
  return null
}

// Godot's own errors from output lines: script and parse errors, failed loads
export function godotErrors(text) {
  const lines = String(text).split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^(SCRIPT ERROR|ERROR|Parse Error)\b|Failed to load|Parser Error/i.test(l.trim())) out.push([l.trim(), (lines[i + 1] || '').trim()].filter(Boolean).join(' '))
  }
  return [...new Set(out)].slice(0, 30)
}

const runGodot = (bin, args, ms) => new Promise(ok => execFile(bin, args, { timeout: ms, maxBuffer: 1 << 23, windowsHide: true }, (err, out, errOut) => ok(`${out}\n${errOut}`)))

// Open the port in Godot headless: import its assets, then run the main scene for a
// few hundred frames. → { ok, errors }
export async function checkGodot(dir, bin = godotBin()) {
  if (!bin) return null
  const root = portDir(dir, 'godot')
  const imp = await runGodot(bin, ['--headless', '--path', root, '--import'], 300000)
  const run = await runGodot(bin, ['--headless', '--path', root, '--quit-after', '300'], 90000)
  const errors = godotErrors(`${imp}\n${run}`)
  return { ok: errors.length === 0, errors }
}
