// Godot-first games: when a game's spec asks for Godot and Godot is on this
// machine, the big game is built as a Godot 4 project from the start (in
// ports/godot/, stage by stage), not as a web game ported after. Each stage is
// opened headless (errors get a fix turn), exported to Web, served and
// play-tested in the browser like any other game, so the Studio still shows a
// playable slice after every stage.

import { execFile } from './proc.mjs'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { stagesFor, viewOf, skillText, kitBrief } from './game.mjs'
import { portDir, godotBin, godotErrors } from './port.mjs'
import { probeBrief } from './playcheck.mjs'

export const GODOT_SKILLS = ['gamedev/godot-gdscript', 'gamedev/godot-nodes-scenes', 'gamedev/godot-2d-movement', 'gamedev/godot-signals-groups']

export const isGodotFirst = dir => existsSync(join(portDir(dir, 'godot'), '.godotfirst'))
export const webBuild = dir => join(portDir(dir, 'godot'), 'build', 'web')

// Godot-first when the spec (or the owner's answer) names Godot and a binary is found
export function godotFirst(spec, env = process.env) {
  const s = String(spec?.target ?? spec?.answers?.target ?? spec?.engine ?? '').toLowerCase()
  return s.includes('godot') && !!godotBin(env)
}

const PROJECT = name => `; Engine configuration file.
config_version=5

[application]
config/name="${String(name || 'Game').replace(/["\\\n]/g, '').slice(0, 60)}"
run/main_scene="res://scenes/main.tscn"

[display]
window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/canvas_textures/default_texture_filter=1
`

// no threads: the export then plays from any static host, no cross-origin isolation headers
export const WEB_PRESET = `[preset.0]

name="Web"
platform="Web"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter="*.json"
exclude_filter="build/*"
export_path="build/web/index.html"

[preset.0.options]

variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
`

// The project skeleton and the painted art: project.godot (only when missing),
// the Web preset (always ours), the app's public/art/ copied into assets/art/.
// → the art file names copied
export function seedGodot(dir, spec) {
  const root = portDir(dir, 'godot')
  for (const d of ['scenes', 'scripts', 'assets/art']) mkdirSync(join(root, d), { recursive: true })
  if (!existsSync(join(root, 'project.godot'))) writeFileSync(join(root, 'project.godot'), PROJECT(spec?.title || spec?.name))
  writeFileSync(join(root, 'export_presets.cfg'), WEB_PRESET)
  if (!existsSync(join(root, '.gitignore'))) writeFileSync(join(root, '.gitignore'), '.godot/\nbuild/\n')
  writeFileSync(join(root, '.godotfirst'), 'this game is built in Godot first\n')
  return syncGodotArt(dir)
}

// The app's public/art/ copied into the Godot project's assets/art/ (again after a mid-build
// ask is painted: Godot imports the new files on its next open). A file the crew changed in
// assets/art/ since the last copy (a face cut from the title art, say) is theirs and is kept:
// .synced.json holds what each copy wrote. → the file names copied
const sumOf = f => createHash('sha1').update(readFileSync(f)).digest('hex')
export function syncGodotArt(dir) {
  const root = portDir(dir, 'godot'), from = join(dir, 'public', 'art'), to = join(root, 'assets', 'art'), copied = []
  mkdirSync(to, { recursive: true })
  const log = join(to, '.synced.json')
  let synced = {}
  try { synced = JSON.parse(readFileSync(log, 'utf8')) || {} } catch {}
  if (existsSync(from)) for (const f of readdirSync(from)) {
    if (!/^[\w.-]{1,90}\.(png|webp|jpe?g|json)$/i.test(f)) continue
    try {
      const src = join(from, f), dst = join(to, f), sum = sumOf(src)
      if (existsSync(dst)) {
        const now = sumOf(dst)
        if (now === sum) { synced[f] = sum; continue }
        // changed in the project since the last copy (or, with no record, newer than the painting)
        const theirs = synced[f] ? now !== synced[f] : statSync(dst).mtimeMs > statSync(src).mtimeMs
        if (theirs) continue
      }
      copyFileSync(src, dst); synced[f] = sum; copied.push(f)
    } catch {}
  }
  try { writeFileSync(log, JSON.stringify(synced, null, 1)) } catch {}
  return copied
}

// How the art is used in Godot: the same files as the web brief, under res://assets/art/
export function godotArtBrief(files = [], view = 'side') {
  if (!files.length) return '- No painted art this time: draw every portrait, icon and backdrop with Godot nodes (ColorRect, Polygon2D, _draw()).'
  return `- Painted art is in res://assets/art/ (already imported). Load each with load("res://assets/art/<file>") and use it as named; if one fails to load, draw a stand-in so the game never breaks:
${files.map(f => f.kind === 'sheet' && f.cell
    ? `  - ${f.file.replace(/^art\//, '')}: ${f.what}${f.blend === 'add' ? ' (light on black: CanvasItemMaterial with blend_mode add)' : ''}, an animation strip of ${f.count} frames side by side, each ${f.cell[0]}×${f.cell[1]} px, played at ${f.fps} fps${f.loop ? ', looping' : ', once per move'}. The frames: ${f.frames}. Build its SpriteFrames in code: one AtlasTexture per frame (region = Rect2(n*${f.cell[0]}, 0, ${f.cell[0]}, ${f.cell[1]})), into an AnimatedSprite2D.`
    : `  - ${f.file.replace(/^art\//, '')}: ${f.what}`).join('\n')}
  Sprites (sprite-*.png, transparent) are the characters' own textures: sprite-hero is the hero, sprite-boss the boss, the others the enemies or hazards they are named for. The hero is big and easy to read: at least a sixth of the 720 px screen height (about 130–160 px tall); enemies sized to match as solid filled figures, never thin outlines; the boss about twice the hero. Give every actor a dark outline or rim light (a small outline shader on the sprite, or a dark copy behind it offset 3 px) so it stands off the painting.
  Backdrops (place-*, room-*) are scenery, not the play layer: ${view === 'side' ? 'a ParallaxBackground with two or more ParallaxLayers scrolling slower than the camera' : 'fill the screen behind the action'}, pushed back (modulate darker and cooler, lower contrast) so the actors and platforms read first. Platforms, ledges and obstacles are solid, opaque shapes with a bright top edge, clearly separate from the painting. Weather and particles (rain, sparks) go behind the actors (z_index below them), never over them. Portraits sit beside the dialogue box; item icons on the pickups, the HUD and the end screen; the title picture fills the title screen behind the menu.${kitBrief(files)}${files.some(f => /^art\/sheet-/.test(f.file)) ? `
  The hero's sheets (sheet-hero-*) are its animation: play the looping one while it moves and the move frames for each action (jump, fall, slide, hurt, land), scaled to the hero's size, and keep sprite-hero only for stills. Flip it (flip_h) to face left.` : ''}`
}

export const GODOT_RULES = `- Godot 4 (4.7) with GDScript 2: typed variables, @export, @onready, signals with .connect(), await get_tree().create_timer(t).timeout. No Godot 3 syntax (no yield, no export var, no KinematicBody2D: CharacterBody2D with velocity and move_and_slide()).
- The project is ports/godot/: project.godot (keep its display and rendering settings; add input actions there under [input] or create them in code with InputMap), the main scene res://scenes/main.tscn, scenes under scenes/, one script per system under scripts/. No file over about 400 lines.
- Write .tscn files by hand only when they stay small (format=3, ext_resource ids as strings); build most of the scene tree in code from the scripts, which is less error-prone.
- Inputs: keyboard (arrows and WASD, Space, the keys the spec names, Esc pause), the mouse, and touch (tap, hold, swipe) so it plays on a phone; Enter, Space or a click starts from the title, and from the title one press reaches play (no extra menus in between).
- Characters are upright figures seen from the side or front: never rotate a character to face where it aims or walks. Flip it (flip_h) and show the aim with the weapon or the attack. Give life with Tweens: a squash on a hit, a lean on a dash, a white modulate flash when hurt.
- Game feel: hit-stop (a short Engine.time_scale dip), screen shake on a Camera2D, knockback, GPUParticles2D or CPUParticles2D bursts.
- Sound: synthesise short sounds with AudioStreamGenerator or AudioStreamWAV built in code (no sound files).
- Saving: this game plays inside a sandboxed web frame where storage may fail; keep all state in memory (an autoload), do not depend on user:// files.
- Original content only: the names, characters, world and art in the spec are new.
- Never touch anything outside ports/godot/ (the web template in src/ stays as it is).`

const STEP_NOTE = 'Godot is run headless on the project after this turn (import, then the main scene for a few hundred frames); its script and parse errors come back as the next turn\'s first job, so keep the scripts parse-clean.'

// One stage of a Godot-first big game: the same stages as the web build, written in Godot
export function godotStagePrompt(spec, i, { art = [], failed = '', note = '' } = {}) {
  const stages = stagesFor(spec)
  const st = stages[i]
  const done = stages.slice(0, i).map(s => s.name).join(', ')
  const head = `This is a big 2D game made in Godot 4, built in ${stages.length} slices (the game playable after each); this is slice ${i + 1}: ${st.name}. GAME_SPEC.md in the project root is the whole spec; follow its names, numbers and content.`
  const said = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
  const body = `${said ? `The person played the last slice and said: "${said}". Do what they ask first (it may change what is already built), then build this slice in that spirit.\n\n` : ''}${failed ? `First: ${failed}\n\n` : ''}${done ? `Already built: ${done}. Keep all of it working; change it only where this stage needs to.\n\n` : ''}Build this stage now: ${st.what}

Do only this slice; later slices add the rest, so leave clean places for them (a data table, a dialogue autoload) instead of building them now.
${godotArtBrief(art, viewOf(spec))}
${GODOT_RULES}
${probeBrief(spec, { godot: true })}
- ${STEP_NOTE}

Finish with the project opening in Godot with no errors and the game playable from the title.`
  if (i > 0) return `${head}\n\n${body}`
  const facts = JSON.stringify({ ...spec, skills: undefined, answers: undefined, brand: undefined, model: undefined }, null, 1).slice(0, 9000)
  return `${head}\n\nThe game spec:\n${facts}\n\n---\n\n${body}\n\n${skillText(GODOT_SKILLS, 16000)}`
}

const run = (bin, args, ms) => new Promise(ok => execFile(bin, args, { timeout: ms, maxBuffer: 1 << 23, windowsHide: true }, (err, out, errOut) => ok({ code: err?.code ?? 0, text: `${out}\n${errOut}` })))

// Export the project to Web (build/web/index.html). → { ok, dir, error? }
export async function exportWeb(dir, bin = godotBin()) {
  if (!bin) return { ok: false, error: 'no Godot on this machine' }
  const root = portDir(dir, 'godot'), out = join(root, 'build', 'web')
  mkdirSync(out, { recursive: true })
  writeFileSync(join(root, 'export_presets.cfg'), WEB_PRESET)
  await run(bin, ['--headless', '--path', root, '--import'], 300000)
  const r = await run(bin, ['--headless', '--path', root, '--export-release', 'Web', 'build/web/index.html'], 300000)
  const ok = existsSync(join(out, 'index.html')) && existsSync(join(out, 'index.pck'))
  if (ok) unpersist(join(out, 'index.html'))
  return ok ? { ok, dir: out } : { ok, dir: out, error: godotErrors(r.text)[0] || r.text.trim().split('\n').slice(-3).join(' ').slice(0, 300) }
}

// The export keeps user:// in IndexedDB, which throws in a sandboxed frame (origin null):
// no persistent paths, so the engine never touches it
export function unpersist(file) {
  try {
    const html = readFileSync(file, 'utf8')
    const next = /"persistentPaths":/.test(html)
      ? html.replace(/"persistentPaths":\[[^\]]*\]/, '"persistentPaths":[]')
      : html.replace(/GODOT_CONFIG = \{/, 'GODOT_CONFIG = {"persistentPaths":[],')
    if (next !== html) writeFileSync(file, next)
  } catch {}
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' }

// A static server for the export, with CORS (the Studio shows games in a sandboxed frame,
// origin null, and the engine fetches its .pck and .wasm). → { url, close }
export function serveStatic(root, port) {
  const srv = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
    const file = join(root, path || 'index.html')
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404, { 'access-control-allow-origin': '*' }); return res.end('not found') }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    res.end(readFileSync(file))
  })
  return new Promise((ok, fail) => {
    srv.once('error', fail)
    srv.listen(port, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${port}/`, close: () => new Promise(r => srv.close(() => r())), srv }))
  })
}
