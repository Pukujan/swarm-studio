// Game mode: a few questions, one at a time, become a game spec; the spec plus
// the matching game-dev skill files become the app engine's prompt, and the
// game is built and played in the App tab like any other app.
//
// "Similar to X" only sets the genre and the feel. The world, characters,
// names, story and art are always new: the spec writer is told so, and the spec
// says what is original.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { streamChat } from './llm.mjs'

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'gameskills')

// The interview. One source for the canvas, /swarm game and the Hermes skill.
export const QUESTIONS = [
  { id: 'type', q: 'What kind of game?', chips: ['Roguelike', 'Platformer', 'Puzzle', 'Tower defense', 'Card game', 'Arcade shooter', 'Racing', 'Idle'] },
  { id: 'like', q: 'Similar to what? (only the feel; the world will be new)', chips: ['Hades', 'Celeste', 'Vampire Survivors', 'Slay the Spire', 'Tetris', 'Nothing in particular'], free: true },
  { id: 'goal', q: 'How do you win, and how do you lose?', chips: ['Clear rooms, beat a boss', 'Survive the waves', 'Reach the end', 'Beat the high score', 'Solve every level'] },
  { id: 'controls', q: 'Controls?', chips: ['Keyboard + mouse', 'Keyboard only', 'Mouse / touch', 'Gamepad too'] },
  { id: 'look', q: 'What should it look like?', chips: ['3D neon', '3D low-poly', '2D pixel art', '2D flat and bold', 'Hand-drawn'] },
  { id: 'length', q: 'How long is one run?', chips: ['2 minutes', '5 minutes', '15 minutes', 'Endless'] },
  { id: 'world', q: 'Setting or hero you have in mind? (optional)', chips: ['Surprise me'], free: true }
]

const DEFAULTS = { type: 'Roguelike', goal: 'Clear rooms, beat a boss', controls: 'Keyboard + mouse', look: '3D neon', length: '5 minutes', world: 'Surprise me' }

// Which engine and which skill files, from the answers.
export function plan(answers) {
  const a = { ...DEFAULTS, ...answers }
  const three = /3d/i.test(a.look)
  const engine = three ? 'three.js' : /hand|effect/i.test(a.look) ? 'PixiJS' : 'Phaser 3'
  const genre = { roguelike: 'roguelike', platformer: 'platformer', puzzle: 'puzzle', 'tower defense': 'tower-defense', 'card game': 'card-game' }[String(a.type).toLowerCase()]
  const skills = [
    ...(engine === 'three.js' ? ['gamedev/threejs-scene-setup', 'gamedev/threejs-materials-lighting'] : engine === 'PixiJS' ? ['gamedev/pixijs-rendering'] : ['gamedev/phaser-core', 'gamedev/phaser-arcade-physics']),
    ...(genre ? [`gamedev/${genre}`] : []),
    ...(/roguelike|endless|survive/i.test(`${a.type} ${a.goal} ${a.length}`) ? ['gamedev/procedural-gen'] : []),
    'gamedev/game-feel', 'gamedev/game-ui-ux', 'gamedev/input-systems'
  ]
  return { answers: a, engine, skills: [...new Set(skills)].slice(0, 6) }
}

// The skill files' text, trimmed to fit a prompt.
export function skillText(skills, cap = 26000) {
  const per = Math.floor(cap / Math.max(1, skills.length))
  return skills.map(s => {
    const f = join(skillsDir, s, 'SKILL.md')
    if (!existsSync(f)) return ''
    const body = readFileSync(f, 'utf8').replace(/^---[\s\S]*?---\s*/, '')
    return `### Skill: ${s.split('/').pop()}\n${body.length > per ? `${body.slice(0, per)}\n…` : body}`
  }).filter(Boolean).join('\n\n')
}

const SPEC_RULES = `You design small, finished browser games. From the player's answers, write one game spec as JSON.

Originality is required. If they name a game they like, take only its genre, pacing and feel. Invent a new world, hero, enemies, items, names and story; never use the named game's characters, places, names, art style specifics or text. Say what is new in "original".

Keep it buildable by one developer in an afternoon in the chosen engine: one core loop done well, 3–6 enemy or obstacle types, a title screen, a win, a loss, a restart. Every visual must be makeable in code (shapes, materials, lights, particles, canvas-drawn textures) unless assets are listed.

Answer with JSON only:
{"title": "...", "pitch": "one sentence", "setting": "...", "hero": "...", "enemies": ["...", "..."], "loop": "what you do over and over", "progression": "what changes as you go (rooms, waves, blessings, levels)", "controls": "...", "win": "...", "lose": "...", "look": "colours, shapes, lighting, mood", "sound": "...", "screens": ["title", "play", "pause", "win", "lose"], "original": "what is new compared with the game they named"}`

// Busy or failing models: the next one in the list (InferHub's other fast routes).
const SPEC_FALLBACKS = ['deepseek-v4.1-flash', 'claude-haiku-5.5', 'gemini-3.8-flash']

export async function writeSpec({ provider, model, idea, answers, brand, signal }) {
  const p = plan(answers)
  const promo = brand ? `\n\nThis is a promo game for ${brand.name}: ${brand.brief}\nSet it in the brand's own world: its place, its people, its products and its goal (for an event, getting there and enjoying it; for a shop, its products). Use its real names. The "look" uses the brand's colours and mood: ${brand.direction}\nThe win screen invites the player to the real thing (one short line, like the site's own call to action).\nThe site's copy:\n${brand.copy}` : ''
  const ask = `Idea: ${idea || '(none)'}\n${QUESTIONS.map(q => `${q.q} ${p.answers[q.id] || '(no answer)'}`).join('\n')}\nEngine: ${p.engine}.${promo}`
  const models = [model, ...(/inferhub/.test(provider?.baseUrl || '') ? SPEC_FALLBACKS.filter(m => m !== model) : [])].filter(Boolean)
  for (const m of models) {
    try {
      const res = await streamChat(provider, { trace: { kind: 'game-spec' }, model: m, maxTokens: 1400, temperature: 0.8, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal, messages: [{ role: 'system', content: SPEC_RULES }, { role: 'user', content: ask }] })
      const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
      const spec = JSON.parse(res.text.slice(s, e + 1))
      if (!spec.title || !spec.loop) throw new Error('incomplete spec')
      return { ...spec, engine: p.engine, skills: p.skills, answers: p.answers, model: m, ...(brand ? { brand: brandCard(brand) } : {}) }
    } catch (err) {
      if (signal?.aborted) break
      console.error(`game spec: ${m} failed: ${String(err.message || err).slice(0, 200)}`)
    }
  }
  return { ...fallbackSpec(p.answers, idea), engine: p.engine, skills: p.skills, answers: p.answers, ...(brand ? { brand: brandCard(brand) } : {}) }
}

// What the build needs from the brand (not its copy): colours, fonts, the link back.
const brandCard = b => ({ from: b.from, name: b.name, url: b.url, fonts: b.fonts, vars: Object.fromEntries(Object.entries(b.vars || {}).filter(([k]) => /^--(background|foreground|primary|primary-foreground|accent|muted|card|border|radius)$/.test(k))) })

function fallbackSpec(a, idea) {
  return {
    title: 'Lantern Run', pitch: idea || `A ${String(a.type).toLowerCase()} about a small light against the dark.`,
    setting: 'A city of floating paper lanterns above a black sea', hero: 'Wick, a living lantern flame',
    enemies: ['ink moths', 'rain wisps', 'the Drowned Bell (boss)'], loop: a.goal, progression: 'each room adds a new enemy and a pick of one of three upgrades',
    controls: a.controls, win: a.goal, lose: 'your flame goes out', look: a.look, sound: 'soft chimes, a low drone, sharp hits',
    screens: ['title', 'play', 'pause', 'win', 'lose'], original: 'all new world, hero and enemies'
  }
}

function brandRules(b) {
  const vars = Object.entries(b.vars || {}).map(([k, v]) => `${k}: ${v}`).join('; ')
  return `- This is a promo game for ${b.name}. Use its theme for the whole UI and the scene's key colours: ${vars || 'its brand colours'}${b.fonts?.heading ? `; headings in ${b.fonts.heading}, text in ${b.fonts.body || b.fonts.heading} (Google Fonts)` : ''}. The title screen says "A ${b.name} game". ${b.url ? `The win and lose screens have a button back to ${b.name} (${b.url}, opens in a new tab) with the site's call to action, next to Play again.` : `${b.name} is not online yet, so the game links nowhere: no button or link to the site, and the win screen's call to action is words only, next to Play again.`}
- Never write a web address that is not given here: no made-up domain for ${b.name} or anyone else (a guessed domain belongs to someone else).
`
}

export function specMarkdown(spec) {
  const list = v => (Array.isArray(v) ? v.join(', ') : v || '')
  return `# ${spec.title}

${spec.pitch}

- **Engine:** ${spec.engine}
- **Setting:** ${spec.setting}
- **Hero:** ${spec.hero}
- **Enemies / obstacles:** ${list(spec.enemies)}
- **Core loop:** ${spec.loop}
- **Progression:** ${spec.progression}
- **Controls:** ${spec.controls}
- **Win:** ${spec.win}
- **Lose:** ${spec.lose}
- **Look:** ${spec.look}
- **Sound:** ${spec.sound}
- **Screens:** ${list(spec.screens)}
- **Original:** ${spec.original}
${spec.brand ? `- **Promo for:** ${spec.brand.name}${spec.brand.url ? ` (${spec.brand.url})` : ''}\n` : ''}`
}

// The app engine's first prompt for a game.
export function gamePrompt(spec, assets = []) {
  const engineHow = spec.engine === 'three.js'
    ? 'Add three (and its types) with add_dependency. Build every model in code: group primitive geometries (boxes, spheres, cylinders, cones, tori, extruded shapes) into the hero, enemies and props; use MeshStandardMaterial with emissive colours, a few point lights, fog, and canvas-drawn textures. Keep draw calls low (instancing for repeated props). Fixed camera rig that follows the hero.'
    : spec.engine === 'PixiJS'
      ? 'Add pixi.js with add_dependency. Draw sprites with Graphics or canvas-generated textures, use filters for glow.'
      : 'Add phaser with add_dependency. Generate textures in code (this.make.graphics → generateTexture) so no image files are needed; Arcade physics.'
  return `Build this browser game as the whole app. GAME_SPEC.md (in the project root) is the spec; follow it exactly.

${specMarkdown(spec)}
How to build it:
- ${engineHow}
- The game lives in src/game/ (one module per system: scene setup, input, hero, enemies, spawning or rooms, combat, effects, audio, UI state). src/pages/Index.tsx mounts it full-screen in a React component and cleans up on unmount. Remove the starter page content.
- Title screen, pause (Esc / P), win and lose screens with restart, a HUD (health, score or room, timer) as React + shadcn/Tailwind over the canvas.
- Sound with the Web Audio API, synthesised in code (hits, pickups, a simple music loop); starts after the first click or key.
- Game feel: hit-stop, screen shake, knockback, particles, easing, juicy feedback on every action.
- Fixed timestep update loop; works at 60 fps on a laptop; resizes with the window; no console errors.
- Original content only: the names, characters, world and art in the spec are new. Never use names, characters or assets from existing games.
${spec.brand ? brandRules(spec.brand) : ''}
${assets.length ? `- 3D models already in public/models/ (load with GLTFLoader, animate with AnimationMixer):\n${assets.map(a => `  - ${a.file}: ${a.what}`).join('\n')}\n` : ''}
Finish with a working build: the typecheck and build must pass, and the game must start and be playable to a win and a loss.

Reference notes for this kind of game (use what helps, ignore the rest):

${skillText(spec.skills || [])}`
}
