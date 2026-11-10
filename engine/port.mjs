// Engine ports: after a game is built and played on the web, the crew can also
// write it as a project for Godot, Unity or Unreal, from the same spec and with
// the engine's own skill files (gameskills/gamedev, from
// gamedev-skills/awesome-gamedev-agent-skills). The web build stays the one that
// plays in the Studio; the port is source to open in that engine, checked for
// the files the engine needs to open it, not compiled here.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { skillText } from './game.mjs'

export const TARGETS = {
  godot: {
    label: 'Godot',
    skills: ['gamedev/godot-gdscript', 'gamedev/godot-nodes-scenes', 'gamedev/godot-2d-movement', 'gamedev/godot-3d-essentials', 'gamedev/godot-signals-groups', 'gamedev/godot-export'],
    layout: 'a Godot 4 project: project.godot at the root (config_version=5, a main scene set), scenes as .tscn files under scenes/, GDScript under scripts/ (typed, one script per system), the art copied to assets/, and an export_presets.cfg with a Web preset',
    needs: [['project.godot'], ['.tscn'], ['.gd']]
  },
  unity: {
    label: 'Unity',
    skills: ['gamedev/unity-csharp-scripting', 'gamedev/unity-input-system', 'gamedev/unity-physics', 'gamedev/unity-scriptableobjects', 'gamedev/unity-build-pipeline'],
    layout: 'a Unity 6 project: Assets/Scripts with C# MonoBehaviours (one per system) and ScriptableObjects for weapons, enemies and blessings under Assets/Data, Assets/Art for the pictures, Packages/manifest.json listing com.unity.inputsystem, and ProjectSettings/ProjectVersion.txt',
    needs: [['Packages/manifest.json'], ['ProjectSettings/ProjectVersion.txt'], ['.cs']]
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

export function portPrompt(spec, target) {
  const t = TARGETS[target]
  const facts = JSON.stringify({ ...spec, skills: undefined, answers: undefined, brand: undefined, model: undefined }, null, 1).slice(0, 9000)
  return `Port this browser game to ${t.label}. The web version in src/game/ is built and plays; read it and keep its rules, numbers, enemies, rooms, blessings and story.

Write ${t.layout}. Put every file under ports/${target}/ and nowhere else: do not touch src/, the web build must stay as it is.
- Copy the meaning, not the code: use ${t.label}'s own scene, input and physics systems.
- Reuse the pictures in public/ (copy the paths you need into the project's art folder by listing them in a README if you cannot copy binaries).
- Add ports/${target}/README.md: how to open it in ${t.label}, what is done, and what still needs an editor pass (materials, animation, tuning).
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
