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
import { keyFor, keyGround } from './keycolor.mjs'
import { streamChat } from './llm.mjs'
import { castPrompt, cleanCast } from './cast.mjs'
import { workshopMarkdown } from './workshop.mjs'

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'gameskills')

// The interview. One source for the canvas, /swarm game and the Hermes skill.
export const QUESTIONS = [
  { id: 'type', q: 'What kind of game?', chips: ['Roguelike', 'Platformer', 'Puzzle', 'Tower defense', 'Card game', 'Arcade shooter', 'Racing', 'Idle'] },
  { id: 'like', q: 'Similar to what? (only the feel; the world will be new)', chips: ['Hades', 'Celeste', 'Vampire Survivors', 'Slay the Spire', 'Tetris', 'Nothing in particular'], free: true },
  { id: 'goal', q: 'How do you win, and how do you lose?', chips: ['Clear rooms, beat a boss', 'Survive the waves', 'Reach the end', 'Beat the high score', 'Solve every level'] },
  { id: 'controls', q: 'Controls?', chips: ['Keyboard + mouse', 'Keyboard only', 'Mouse / touch', 'Gamepad too'] },
  { id: 'look', q: 'What should it look like?', chips: ['3D neon', '3D low-poly', '2D pixel art', '2D flat and bold', 'Hand-drawn'] },
  { id: 'length', q: 'How long is one run?', chips: ['2 minutes', '5 minutes', '15 minutes', 'Endless'] },
  { id: 'world', q: 'Setting or hero you have in mind? (optional)', chips: ['Surprise me'], free: true },
  { id: 'scope', q: 'How big?', chips: ['Mini game', 'Big game'] },
  { id: 'target', q: 'Make it for?', chips: ['Web (plays here)', 'Godot', 'Unity', 'Unreal'] }
]

const DEFAULTS = { type: 'Roguelike', goal: 'Clear rooms, beat a boss', controls: 'Keyboard + mouse', look: '3D neon', length: '5 minutes', world: 'Surprise me', scope: 'Mini game', target: 'Web (plays here)' }

// A big game: a showcase built in stages with painted art, an hour's build instead
// of minutes. The interview's "How big?" answer, or big: true on the spec or the job.
export const isBig = x => x?.big === true || /\b(big|showcase|full)\b/i.test(String(x?.scope || x?.answers?.scope || ''))

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
  const big = isBig(a)
  // a big game reads more of the notes: levels and assets matter once there are rooms and art
  const more = big ? ['gamedev/level-design', 'gamedev/procedural-gen'] : []
  return { answers: a, engine, big, skills: [...new Set([...skills, ...more])].slice(0, big ? 8 : 6) }
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

// The big game's spec: no fixed template. It keeps the genre, goal and length the person
// picked (and their Shape it picks, which are written in later), names the parts that kind of
// game needs, and plans its own build slices, each one playable, so the person sees every
// slice and the bots play test it before the next one starts.
const BIG_SPEC_RULES = `You design a showcase browser game, bigger than a mini game: several stages or levels, real progression and an ending. A coding agent builds it in slices (one engine call each, the game playable after every slice) and its art (a title picture, backdrops, sprites, icons, portraits) is painted from your spec, so be concrete.

Follow the person's answers. The genre, goal, controls, look and length are theirs: never turn their game into another genre (a runner stays a runner, a puzzle game stays a puzzle game) and never add systems their answers do not call for (no hub, weapons, boons, rooms or boss unless the answers or the genre need them). Their idea is the story.

Originality is required. If they name a game they like, take only its genre, pacing and feel. Invent a new world, hero, enemies, items, places, names and story; never use the named game's characters, places, names, art or text. Say what is new in "original".

Plan the build as 3–6 slices in "stages", in order. Slice 1 is the core loop playable from the title (the hero moving, the main action, one obstacle or enemy, a way to fail, the HUD). Each later slice adds one group of the game's own parts (more stages or levels, power-ups or items, enemies, story and people, the ending) and leaves it playable. The last slice adds the ending, the win and lose screens, pause, sound and a balance pass. Each slice's "what" says exactly what to build, using your names.

"view" is how the camera sees the play: "side" for runners, platformers and side-scrollers, "top-down" for arenas and twin-stick games, "front" for card, puzzle and menu games. "places" are the backdrops to paint: the stages, levels or areas the game moves through, each as it looks from that view.

Answer with JSON only:
{"title": "...", "pitch": "one sentence", "genre": "the genre they picked", "view": "side | top-down | front", "setting": "...", "hero": "...", "loop": "what you do over and over", "progression": "what changes as you go", "goal": "what the player is working towards", "places": [{"name": "...", "what": "how it looks and plays"}], "enemies": [{"name": "...", "attack": "what it does", "look": "..."}], "items": [{"name": "...", "effect": "power-ups, pickups, upgrades or cards, if the game has them"}], "boss": {"name": "...", "look": "...", "phases": ["..."]}, "characters": [{"name": "...", "role": "...", "look": "what their portrait shows", "lines": ["..."]}], "stages": [{"name": "short name", "what": "what this slice builds"}], "controls": "...", "win": "...", "lose": "...", "look": "colours, shapes, lighting, mood", "sound": "...", "screens": ["title", "play", "pause", "win", "lose"], "original": "what is new compared with the game they named"}
Leave out "boss", "items" or "characters" when the game has none.`

// What a big spec is missing, as words for a retry (empty when it is whole).
export function bigGaps(spec) {
  const n = k => (Array.isArray(spec?.[k]) ? spec[k].length : 0)
  const gaps = []
  if (!spec?.title || !spec?.loop) gaps.push('a title and a loop')
  if (cleanStages(spec?.stages).length < 3) gaps.push('3 build slices in "stages"')
  if (n('places') < 1) gaps.push('a place to paint')
  if (!spec?.win) gaps.push('a win')
  return gaps
}

// The build slices a big spec plans for itself, cleaned; a spec without them gets
// genre-neutral slices that say "the game's own" parts, so nothing is invented.
const cut = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
function cleanStages(list) {
  return (Array.isArray(list) ? list : [])
    .map((s, i) => ({ id: `s${i + 1}`, name: cut(s?.name, 60), what: cut(s?.what, 1600), turns: Math.min(8, Math.max(3, Number(s?.turns) || 5)) }))
    .filter(s => s.name && s.what).slice(0, 6)
}
const PLAIN_STAGES = [
  { name: 'the core loop', turns: 6, what: 'The engine, the scene and camera, the hero and the main action of the loop in GAME_SPEC.md, the first obstacle or enemy, a way to fail, the title screen with Play, the HUD and the game feel. Playable from the title to a fail and a restart.' },
  { name: 'the stages', turns: 5, what: 'The places from GAME_SPEC.md as stages or levels with their painted backdrops, in order, each harder than the last; all the enemies or obstacles from the spec.' },
  { name: 'the extras', turns: 5, what: 'The items, power-ups and people from GAME_SPEC.md (whatever it lists), with their icons and portraits, so they really change play.' },
  { name: 'the ending', turns: 5, what: 'The goal and the ending from GAME_SPEC.md, the win and lose screens with restart, pause (Esc / P), synthesised music and sound, and a balance pass so a first try is fair.' }
]
export const stagesFor = spec => {
  const own = cleanStages(spec?.stages)
  return (own.length >= 3 ? own : PLAIN_STAGES.map((s, i) => ({ id: `s${i + 1}`, ...s })))
}

// No model answered: a plain spec from the answers alone (the stages are the plain ones).
function bigFallbackSpec(a, idea) {
  return {
    ...fallbackSpec(a, idea), genre: a.type, view: sideView({ pitch: `${a.type} ${a.like || ''} ${idea || ''}` }) ? 'side' : 'top-down',
    goal: a.goal, places: [{ name: 'the first stage', what: `the start of the world, ${a.look || ''}` }, { name: 'the last stage', what: 'the end of the journey' }],
    stages: PLAIN_STAGES
  }
}

// Busy or failing models: the next one in the list (InferHub's other fast routes).
const SPEC_FALLBACKS = ['deepseek-v4.1-flash', 'claude-haiku-5.5', 'gemini-3.8-flash']

export async function writeSpec({ provider, model, idea, answers, brand, signal, big }) {
  const p = plan(big ? { ...answers, scope: 'Big game' } : answers)
  const promo = brand ? `\n\nThis is a promo game for ${brand.name}: ${brand.brief}\nSet it in the brand's own world: its place, its people, its products and its goal (for an event, getting there and enjoying it; for a shop, its products). Use its real names. The "look" uses the brand's colours and mood: ${brand.direction}\nThe win screen invites the player to the real thing (one short line, like the site's own call to action).\nThe site's copy:\n${brand.copy}` : ''
  const ask = `Idea: ${idea || '(none)'}\n${QUESTIONS.filter(q => q.id !== 'scope' && q.id !== 'target').map(q => `${q.q} ${p.answers[q.id] || '(no answer)'}`).join('\n')}\nEngine: ${p.engine}.${promo}`
  const models = [model, ...(/inferhub/.test(provider?.baseUrl || '') ? SPEC_FALLBACKS.filter(m => m !== model) : [])].filter(Boolean)
  for (const m of models) {
    try {
      const res = await streamChat(provider, { trace: { kind: p.big ? 'game-spec-big' : 'game-spec' }, model: m, maxTokens: p.big ? 4000 : 1400, temperature: 0.8, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal, messages: [{ role: 'system', content: p.big ? BIG_SPEC_RULES : SPEC_RULES }, { role: 'user', content: ask }] })
      const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
      const spec = JSON.parse(res.text.slice(s, e + 1))
      if (!spec.title || !spec.loop) throw new Error('incomplete spec')
      const missing = p.big ? bigGaps(spec) : []
      if (missing.length) throw new Error(`the big spec lacks ${missing.join(', ')}`)
      return { ...spec, engine: p.engine, skills: p.skills, answers: p.answers, model: m, ...(p.big ? { big: true } : {}), ...(brand ? { brand: brandCard(brand) } : {}) }
    } catch (err) {
      if (signal?.aborted) break
      console.error(`game spec: ${m} failed: ${String(err.message || err).slice(0, 200)}`)
    }
  }
  return { ...(p.big ? bigFallbackSpec(p.answers, idea) : fallbackSpec(p.answers, idea)), engine: p.engine, skills: p.skills, answers: p.answers, ...(p.big ? { big: true } : {}), ...(brand ? { brand: brandCard(brand) } : {}) }
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

// A game's name as the site's rewards know it: ?game=<slug>
export const gameSlug = t => String(t || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'game'
// The link back from a promo game: the site, with the points to claim
export const rewardsLink = (url, slug = 'game') => `${String(url).replace(/[?#].*$/, '')}?game=${slug}&points=N (N is the score)`

function brandRules(b) {
  const vars = Object.entries(b.vars || {}).map(([k, v]) => `${k}: ${v}`).join('; ')
  return `- This is a promo game for ${b.name}. Use its theme for the whole UI and the scene's key colours: ${vars || 'its brand colours'}${b.fonts?.heading ? `; headings in ${b.fonts.heading}, text in ${b.fonts.body || b.fonts.heading} (Google Fonts)` : ''}. The title screen says "A ${b.name} game". ${b.url ? `The win and lose screens have a button back to ${b.name}, next to Play again, that opens ${rewardsLink(b.url, b.game)} in a new tab with the run's score as a whole number from 0 to 500 (the height, distance or points the HUD shows, scaled); it reads "Claim N points at ${b.name}" (the site turns them into rewards).` : `${b.name} is not online yet, so the game links nowhere: no button or link to the site, and the win screen's call to action is words only, next to Play again.`}
- Never write a web address that is not given here: no made-up domain for ${b.name} or anyone else (a guessed domain belongs to someone else).
`
}

export function specMarkdown(spec) {
  const list = v => (Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : x?.name || '')).join(', ') : v || '')
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
${spec.brand ? `- **Promo for:** ${spec.brand.name}${spec.brand.url ? ` (${spec.brand.url})` : ''}\n` : ''}${spec.big ? bigMarkdown(spec) : ''}${workshopMarkdown(spec)}`
}

// The big game's parts, in the spec file the build follows: only the parts it has.
function bigMarkdown(spec) {
  const rows = (v, f) => (Array.isArray(v) ? v : []).map(x => `- ${typeof x === 'string' ? x : f(x)}`).join('\n')
  const part = (head, body) => (body && body.trim() ? `\n## ${head}\n${body}\n` : '')
  return `${spec.genre ? `- **Genre:** ${spec.genre}\n` : ''}${spec.view ? `- **View:** ${spec.view}\n` : ''}${spec.goal ? `- **Goal:** ${spec.goal}\n` : ''}${part('Places', rows(spec.places, p => `**${p.name}**: ${p.what || ''}`))}${part('Enemies and obstacles', rows(spec.enemies, e => `**${e.name}**: ${e.attack || ''}${e.look ? ` (${e.look})` : ''}`))}${part('Items and power-ups', rows(spec.items, i => `**${i.name}**: ${i.effect || ''}`))}${spec.boss?.name ? part('Boss', `**${spec.boss.name}**: ${spec.boss.look || ''}\n${rows(spec.boss.phases, p => String(p))}`) : ''}${part('People and dialogue', rows(spec.characters, c => `**${c.name}** (${c.role || ''}): ${(c.lines || []).map(l => `"${l}"`).join(' ')}`))}${part('Build slices', stagesFor(spec).map((st, i) => `${i + 1}. **${st.name}**: ${st.what}`).join('\n'))}`
}

// 3D models a spec names ({ file, what }): files from the Studio's model library
// (<data>/models/), copied into the app's public/models/ when the build starts.
export const MODEL_FILE = /^[\w.-]{1,80}\.(glb|gltf)$/i
export const gameModels = spec => (Array.isArray(spec?.models) ? spec.models : [])
  .filter(m => m && MODEL_FILE.test(String(m.file || '')))
  .map(m => ({ file: String(m.file), what: String(m.what || '').slice(0, 400) }))
  .slice(0, 40)

// The app engine's first prompt for a game.
export function gamePrompt(spec, assets = gameModels(spec)) {
  const engineHow = spec.engine === 'three.js'
    ? (assets.length || cleanCast(spec.cast).length
        ? 'Add three (and its types) with add_dependency. The hero, the enemies and the set pieces are the 3D models listed below: load them with GLTFLoader (clone skinned ones with SkeletonUtils.clone), play their animations by name with an AnimationMixer, cross-fading between idle, run, attack, hit and death. Build only what the models do not cover (effects, pickups, floor) in code. Warm key light with soft shadows, a few point lights, light fog. Keep draw calls low (instancing for repeated props). Fixed three-quarter camera rig that follows the hero.'
        : 'Add three (and its types) with add_dependency. Build every model in code: group primitive geometries (boxes, spheres, cylinders, cones, tori, extruded shapes) into the hero, enemies and props; use MeshStandardMaterial with emissive colours, a few point lights, fog, and canvas-drawn textures. Keep draw calls low (instancing for repeated props). Fixed camera rig that follows the hero.')
    : spec.engine === 'PixiJS'
      ? 'Add pixi.js with add_dependency. Draw sprites with Graphics or canvas-generated textures, use filters for glow.'
      : 'Add phaser with add_dependency. Generate textures in code (this.make.graphics → generateTexture) so no image files are needed; Arcade physics.'
  return `Build this browser game as the whole app. GAME_SPEC.md (in the project root) is the spec; follow it exactly.

${specMarkdown(spec)}
How to build it:
- ${engineHow}
${spec.workshop?.art?.length ? `- The person painted the art in the studio: load the pictures listed under "Art" in GAME_SPEC.md from /art/ (they are in public/art/) and use them for those things; cut sprite sheets into frames by their grid and key out the flat background colour (magenta or green); draw in code only what has no picture.\n` : ''}${spec.levels?.length ? '- Build the first stage from the level map in GAME_SPEC.md, one cell per tile.\n' : ''}- The game lives in src/game/ (one module per system: scene setup, input, hero, enemies, spawning or rooms, combat, effects, audio, UI state). src/pages/Index.tsx mounts it full-screen in a React component and cleans up on unmount. Remove the starter page content.
- Title screen, pause (Esc / P), win and lose screens with restart, a HUD (health, score or room, timer) as React + shadcn/Tailwind over the canvas.
- Sound with the Web Audio API, synthesised in code (hits, pickups, a simple music loop); starts after the first click or key.
- Game feel: hit-stop, screen shake, knockback, particles, easing, juicy feedback on every action.
- Fixed timestep update loop; works at 60 fps on a laptop; resizes with the window; no console errors.
- Original content only: the names, characters, world and art in the spec are new. Never use names, characters or assets from existing games.
${spec.brand ? brandRules({ ...spec.brand, game: gameSlug(spec.title) }) : ''}
${castPrompt(cleanCast(spec.cast))}${assets.length ? `- 3D models already in public/models/ (load with GLTFLoader from /models/<file>, animate with AnimationMixer):\n${assets.map(a => `  - ${a.file}: ${a.what}`).join('\n')}\n` : ''}
Finish with a working build: the typecheck and build must pass, and the game must start and be playable to a win and a loss.

Reference notes for this kind of game (use what helps, ignore the rest):

${skillText(spec.skills || [])}`
}

// ---------- the big game: its art and its stages

const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'x'

// The pictures a big game is painted with: a title picture, a backdrop per place, the
// hero, enemies and boss as sprites, an icon per item, a portrait per speaking person,
// all seen the way the game's camera sees them. Each is a file in the app's public/art/
// that the game loads; `gen` is what the art director paints. Capped, so a long spec does
// not become a long bill.
const VIEW_SHOT = {
  side: (where, what) => `Side-on view, as a side-scrolling game sees it: ${what}, in ${where}. A wide horizontal stretch, the ground and the surfaces to run and jump on along the lower third, depth and skyline behind, clear open space in the middle for the characters`,
  'top-down': (where, what) => `Top-down three-quarter view of ${what}, in ${where}. Walls and props at the edges, open floor in the middle for the characters`,
  front: (where, what) => `A wide scene of ${what}, in ${where}, calm in the middle so cards, tiles or menus read over it`
}
export const viewOf = spec => (VIEW_SHOT[spec?.view] ? spec.view : sideView(spec) ? 'side' : 'top-down')
export function artList(spec, { max = 26 } = {}) {
  const where = spec.setting || ''
  const shot = VIEW_SHOT[viewOf(spec)]
  const items = [{ id: 'title', kind: 'title', aspect: 'landscape', what: 'title screen picture', gen: `Key art for a game called ${spec.title}: ${spec.hero}, in ${where}${spec.pitch ? `. ${spec.pitch}` : ''}` }]
  for (const c of (spec.characters || []).slice(0, 5)) if (c?.name) items.push({ id: `portrait-${slug(c.name)}`, kind: 'portrait', aspect: 'portrait', what: `portrait of ${c.name} (${c.role || 'character'}) for dialogue`, gen: `Chest-up character portrait of ${c.name}, ${c.role || ''}: ${c.look || ''}. Facing three-quarters, plain dark backdrop, from ${where}` })
  for (const it of (spec.items || []).slice(0, 9)) if (it?.name) items.push({ id: `item-${slug(it.name)}`, kind: 'icon', aspect: 'square', what: `icon for ${it.name}`, gen: `A single emblem for "${it.name}": ${it.effect || ''}. One bold symbol centred on a plain dark circle, readable when small` })
  for (const pl of (spec.places || []).slice(0, 6)) if (pl?.name) items.push({ id: `place-${slug(pl.name)}`, kind: 'backdrop', aspect: 'landscape', what: `backdrop for ${pl.name}`, gen: `${shot(where, `${pl.name}: ${pl.what || ''}`)}. ${NO_PEOPLE}` })
  // the hero, enemies and boss as sprites: one full figure each, cut out of a flat background after painting
  const sprite = (id, who, look) => items.push({ id: `sprite-${id}`, kind: 'sprite', aspect: 'square', cutout: true, what: `sprite of ${who}`, ...(look ? { look: String(look).slice(0, 300) } : {}), gen: `Game character sprite: the full body of ${who}${look ? `, ${look}` : ''}. ${viewOf(spec) === 'side' ? 'Side view facing right, mid-stride' : 'Standing, facing the viewer'}, head to feet in frame with space around, bold clean outline. ${keyGround(look || who)}` })
  if (spec.hero) sprite('hero', String(spec.hero).split(/[,—.;]/)[0].trim(), heroLook(spec))
  // a companion named in the hero line ("runs with her cat Kumo") is a sprite of its own,
  // painted after the hero with the hero's picture as its style reference
  const pal = companionOf(spec)
  if (pal) { sprite(pal.id, `${pal.name}, the hero's ${pal.kind}`, pal.look); Object.assign(items.at(-1), { ref: 'sprite-hero', companion: true }) }
  for (const e of (spec.enemies || []).slice(0, 5)) if (e?.name) sprite(slug(e.name), e.name, e.look)
  if (spec.boss?.name) {
    sprite('boss', spec.boss.name, spec.boss.look)
    if (!items.some(i => i.id === `portrait-${slug(spec.boss.name)}`)) items.push({ id: `portrait-${slug(spec.boss.name)}`, kind: 'portrait', aspect: 'portrait', what: `portrait of the boss ${spec.boss.name}`, gen: `Menacing portrait of ${spec.boss.name}: ${spec.boss.look || ''}, plain dark backdrop` })
  }
  // the title, then one of each kind, then the rest: a cap keeps some of every kind
  const order = ['title', 'sprite', 'backdrop', 'portrait', 'icon']
  const byKind = order.map(k => items.filter(i => i.kind === k))
  const out = []
  for (let round = 0; out.length < Math.min(max, items.length); round++) for (const list of byKind) if (list[round] && out.length < max) out.push(list[round])
  return out
}

// The hero's moves as painted 3×2 sheets (the contract engine/skins.mjs paints ARES's outfits
// with), from the hero's own painted sprite: each is cut into a strip of frames and checked.
// A side-view game (a runner, a platformer) gets side-view moves; the rest face the viewer.
export const SHEET_LAYOUT = 'Six frames in a 3 by 2 grid, read left to right, top to bottom. In every frame the character is large, about 75 percent of the grid cell height, centred, with a clear margin of empty background on every side, so hair, clothes and anything held stay fully inside its own cell and nothing touches a cell edge. Crisp, clean hair strands and clothes with solid ink outlines, no wispy loose hairs. Same character, same outfit, same size in every frame, feet on one shared baseline, the flat key colour background named below, no text, no borders, no grid lines, no extra people, no floor shadow'
export const sideView = spec => spec?.view === 'side' || /runner|platform|side.?scroll|parkour|\bjump|\bslide/i.test([spec?.pitch, spec?.loop, spec?.controls, spec?.genre, spec?.answers?.type, ...(spec?.skills || [])].join(' '))
// A move's six frames, by name: the side-view moves, the front-view ones, and a companion's
// (an animal runs on four legs, a drone or bird flies)
export const MOVES = {
  run: { fps: 12, loop: true, frames: 'a side-view run cycle facing right in six steps (contact, down, passing, up, contact on the other leg, passing), legs and arms clearly in a new place each frame' },
  jump: { fps: 10, frames: 'side view facing right: crouch before the jump, take-off pushing up, rising with knees tucked, top of the jump, falling with legs reaching down, landing crouch' },
  slide: { fps: 10, frames: 'side view facing right: starting to drop, leaning back into a slide, low feet-first slide with one hand on the ground, holding the slide, still sliding, getting back up' },
  climb: { fps: 10, loop: true, frames: 'climbing a wall seen from the side: reaching up with one hand, pulling up, the other hand reaching, pulling up, grabbing a ledge, hauling up over the top' },
  fix: { fps: 8, frames: 'side view facing right: kneeling at a repair, reaching with a tool, turning it, arm raised with effort, checking the work, standing up pleased' },
  hurt: { fps: 10, frames: 'side view facing right: hit and knocked back, stumbling backwards, arms flung out, half falling, catching balance, back on the feet' },
  idle: { fps: 6, loop: true, frames: 'side view facing right, standing: breathing in, breathing out, a small shift of weight, a glance, breathing in, breathing out' },
  walk: { fps: 10, loop: true, frames: 'facing the viewer: 1 and 2 standing and breathing, 3 to 6 a walk cycle' },
  action: { fps: 12, frames: 'facing the viewer: 1 wind-up, 2 attack, 3 follow-through, 4 dash, 5 hurt, 6 knocked down' }
}
const FOUR_LEGS = /\b(cat|kitten|dog|puppy|pup|fox|wolf|ferret|rabbit|bunny|otter|raccoon|tanuki|hamster|mouse|rat|tiger|lion|horse|pony|deer|boar|bear|panda|lizard|dragon|drake)\b/i
const FLIES = /\b(bird|crow|raven|owl|parrot|hawk|drone|bat|fairy|wisp|spirit)\b/i
export const companionRun = kind => FLIES.test(kind)
  ? { fps: 12, loop: true, frames: 'side view facing right, flying along: wings or rotors up, coming down, down, coming up, up, a small glide, each frame clearly different' }
  : FOUR_LEGS.test(kind)
    ? { fps: 12, loop: true, frames: 'a side-view four-legged run cycle facing right in six steps (gathered, front paws reaching, stretched out, front paws landing, back paws pushing, gathered again), paws clearly in a new place each frame' }
    : MOVES.run

// The hero's companion, when the hero line (or the spec) names one: "runs with her cat Kumo",
// "with Rust-8, a small robot", "a fox called Ember". → { id, name, kind, look, at } or null
const PAL = 'cat|kitten|dog|puppy|pup|fox|wolf|ferret|rabbit|bunny|otter|raccoon|tanuki|hamster|mouse|rat|bird|crow|raven|owl|parrot|hawk|bat|dragon|drake|lizard|robot|droid|drone|bot|mech|spirit|familiar|golem|monkey|fairy|wisp|companion|sidekick|partner|pet'
export function companionOf(spec) {
  const c = spec?.companion
  if (c?.name) { const name = String(c.name).slice(0, 40); return { id: slug(name), name, kind: String(c.kind || c.what || 'companion').slice(0, 40), look: String(c.look || c.what || name).slice(0, 240), at: -1 } }
  const s = String(spec?.hero || '')
  const clause = at => s.slice(at).split(/[;.]/)[0].slice(0, 240).trim()
  let m = s.match(new RegExp(`\\b(?:her|his|their|its)\\s+((?:(?!with\\b|and\\b|who\\b|that\\b)[a-z-]+\\s+){0,3}?)(${PAL})\\s+(?:named\\s+|called\\s+)?([A-Z][\\w-]*)`))
    || s.match(new RegExp(`\\b(?:a|an)\\s+((?:(?!with\\b|and\\b|who\\b|that\\b)[a-z-]+\\s+){0,3}?)(${PAL})\\s+(?:named|called)\\s+([A-Z][\\w-]*)`))
  if (m) return { id: slug(m[3]), name: m[3], kind: `${m[1]}${m[2]}`.trim(), look: clause(m.index), at: m.index }
  m = s.match(/\b(?:with|alongside|followed by|accompanied by)\s+([A-Z][\w-]*(?:\s[A-Z][\w-]*)?),\s+(?:a|an|her|his|their)\s+([^;.]{3,120})/)
  if (m) { const kind = (m[2].match(new RegExp(`\\b(${PAL})\\b`, 'i')) || [])[1] || 'companion'; return { id: slug(m[1]), name: m[1], kind, look: `${m[1]}, ${clause(m.index + m[0].indexOf(', ') + 2)}`, at: m.index } }
  return null
}
// The hero alone, without the companion in the same line: what the hero's sprite and sheets paint
export function heroLook(spec) {
  const s = String(spec?.hero || '')
  const pal = companionOf(spec)
  const cut = pal && pal.at > 0 ? s.slice(0, pal.at).replace(/[\s,;]*(?:\b(?:who|that)\s+\w+\s+)?\b(?:with|and|alongside|followed by|accompanied by)?\s*$/i, '') : s
  return cut.split(/[;,]\s*(?:with|and her|and his|followed by|accompanied by)\b/i)[0].replace(/[\s,;]+$/, '').slice(0, 320)
}

// One animated 3×2 sheet of a figure: who it is, the sprite it is painted over, and the move
export function sheetItem(spec, { owner = 'hero', who, look, move, after = `sprite-${owner}`, what }) {
  const key = keyFor(look)
  return {
    id: `sheet-${owner}-${move.name}`, kind: 'sheet', aspect: 'landscape', after, sheet: move.name, fps: move.fps, loop: !!move.loop, frames: move.frames,
    layout: `${SHEET_LAYOUT}. The background is ${key.name} (${key.hex}), flat chroma key, edge to edge, and no ${key.name} on the character`,
    what: what || `${move.name} sheet of ${who}`,
    look: String(look || who).slice(0, 320),
    gen: `${who} ${move.name} sheet`
  }
}

export function sheetList(spec) {
  if (!spec?.hero) return []
  const who = String(spec.hero).split(/[,—.]/)[0].trim()
  // a side-view game: one sheet per move, painted large (a figure painted small and scaled up
  // comes out with rough hair and edges); climbing and repairs get their own when the game has them
  const text = [spec.pitch, spec.loop, spec.controls, spec.genre, ...(spec.skills || []), ...(spec.stages || []).map(x => `${x?.name || ''} ${x?.goal || x?.what || ''}`)].join(' ')
  const side = sideView(spec)
  const names = side
    ? ['run', 'jump', 'slide', ...(/climb|ladder|vertical|scal(e|ing) (a |the )?wall|wall.?run|ledge/i.test(text) ? ['climb'] : []), ...(/repair|fix|relay|antenna|wrench|mend/i.test(text) ? ['fix'] : []), 'hurt']
    : ['walk', 'action']
  // the figure alone: a companion named in the hero line ("with Rust-8, …") is left out
  const look = heroLook(spec)
  const out = names.map(name => sheetItem(spec, { who, look, move: { name, ...MOVES[name] } }))
  // the companion keeps up with the hero: its own run (or walk) sheet, over its own sprite
  const pal = companionOf(spec)
  if (pal) out.push(sheetItem(spec, { owner: pal.id, who: pal.name, look: pal.look, move: side ? { name: 'run', ...companionRun(pal.kind) } : { name: 'walk', ...MOVES.walk }, what: `${side ? 'run' : 'walk'} sheet of ${pal.name}, the hero's ${pal.kind}` }))
  return out
}

// The fighters stand on the backdrops, so a backdrop holds no figures of its own.
export const NO_PEOPLE = 'No people, creatures, figures, statues or faces anywhere in the picture: an empty place waiting for its characters'

// Sprites are painted on one flat colour and cut out (scripts/cutout.py).
export const SPRITE_GROUND = keyGround('')

// How figures move on screen, for every game: the art is drawn upright, facing the viewer.
export const FIGURE_RULES = `- Characters (hero, enemies, boss) are upright figures seen from the front: never rotate a character to face where it aims or walks, so it never looks fallen over. Flip it left or right (flipX) to face its way, and show the aim with the weapon, a reticle or the attack itself. Give them life with tweens: a bob while walking, a squash on a hit, a lean on a dash, a white tint flash when hurt.
- Before pausing a scene for dialogue or a menu, clear camera effects (cameras.main.resetFX()), or a flash or fade freezes over the screen until the scene resumes.`

// How the game uses the painted art. `files` are the ones that were painted
// ({ file: 'art/x.png', what }); none painted means everything is drawn in code.
export function artBrief(files = []) {
  if (!files.length) return '- No painted art this time: draw every portrait, icon and backdrop in code (shapes, gradients, canvas textures).'
  return `- Painted art is in public/art/ (served at /art/…). Load these files and use them as named; keep a drawn-in-code stand-in if one fails to load, so the game never breaks:
${files.map(f => f.kind === 'sheet' && f.cell
    ? `  - ${f.file}: ${f.what}, an animation strip of ${f.count} frames side by side, each ${f.cell[0]}×${f.cell[1]} px (frame n starts at x = n×${f.cell[0]}, from 0), played at ${f.fps} fps${f.loop ? ', looping' : ', one frame per move'}. The frames: ${f.frames}`
    : `  - ${f.file}: ${f.what}`).join('\n')}
  Load images with a relative path ("art/…", not "/art/…") and crossOrigin "anonymous". Sprites (sprite-*.png, transparent) are the characters' own textures: sprite-hero is the hero, sprite-boss the boss, the others are the enemies they are named for. Keep the hero big and easy to read: about a sixth of the screen height in a top-down or front view and about a third in a side-view game (never under 96 px), enemies sized to match, the boss about twice the hero; drawn shapes only for projectiles, effects and stand-ins. Backdrops (place-*.png) are the stages or areas they are named for, behind the action (a side-view game scrolls them with the camera, with a slower layer for depth; darken them a little so the characters read); portraits sit beside the dialogue box; item icons sit on the pickups, the HUD and the end screen; the title picture fills the title screen behind the menu.${files.some(f => f.kind === 'sheet') ? `
  The hero's sheets (sheet-hero-*.webp) are its animation: cut each strip into frames (Phaser: load.spritesheet with that frame size; Pixi: Texture frames from the strip), play the looping one while it moves and the move frames for each action, scaled so the figure is as tall as sprite-hero would be, and keep sprite-hero only for stills. These frames replace the bob and lean tweens for the hero; flip it to face left.` : ''}${files.some(f => f.companion || /^art\/sheet-(?!hero-)/.test(f.file)) ? `
  The hero's companion has its own sprite and run sheet (named for it above): it follows the hero a little behind, at about half the hero's height, playing its sheet while it moves.` : ''}`
}

// The engine's prompt for one stage. The first stage also carries how to build
// (the engine notes and the reference skills); later ones say what is done.
export function bigStagePrompt(spec, i, { art = [], failed = '', note = '' } = {}) {
  const all = stagesFor(spec), st = all[i]
  const done = all.slice(0, i).map(s => s.name).join(', ')
  const head = `This is a big browser game, built in ${all.length} slices; this is slice ${i + 1}: ${st.name}. GAME_SPEC.md in the project root is the whole spec; follow its genre, names, numbers and content, and never turn it into another kind of game.`
  const said = cut(note, 1200)
  const stage = `${said ? `The person played the last slice and said: "${said}". Do what they ask first (it may change what is already built), then build this slice in that spirit.\n\n` : ''}${failed ? `First: ${failed}\n\n` : ''}${done ? `Already built: ${done}. Keep all of it working; change it only where this stage needs to.\n\n` : ''}Build this slice now: ${st.what}

Do only this slice; later slices add the rest (see "Build slices" in GAME_SPEC.md), so leave clean places for them instead of building them now.
${artBrief(art)}
${FIGURE_RULES}
- Keep the code in src/game/ with one module per system; no file over about 400 lines.
- Original content only: the names, characters, world and art in the spec are new.

Finish with a working build: the typecheck and build must pass, and the game must start from the title and be playable.`
  if (i > 0) return `${head}\n\n${stage}`
  return `${gamePrompt(spec).replace(/^Build this browser game as the whole app\. GAME_SPEC\.md \(in the project root\) is the spec; follow it exactly\.\n/, `${head}\n`).replace(/\nFinish with a working build:[^\n]*\n/, '\n').replace('so no image files are needed', 'for everything that is not painted art in public/art/')}\n\n---\n\n${stage}`
}

// After a slice the build stops and asks, in the left chat, before the next one: what was
// built, what comes next, and a few things the person might want, in their game's own words.
export function sliceAsk(spec, i) {
  const all = stagesFor(spec), st = all[i], next = all[i + 1]
  const hero = String(spec?.hero || 'the hero').split(/[,—.;]/)[0].trim()
  const ask = `Slice ${i + 1} of ${all.length}, ${st.name}, is built and the bots have played it. Watch their run here, or play it yourself in the App window: anything to change before ${next ? next.name : 'the end'}?`
  const ideas = [
    next ? `Looks good, go on to ${next.name}` : 'Looks good, finish it',
    `Make ${hero} bigger and easier to read`,
    viewOf(spec) === 'side' ? 'Faster, with longer jumps' : 'Faster, with harder hits',
    'Easier start, harder later'
  ]
  return { ask, ideas, next: next?.name || '' }
}
