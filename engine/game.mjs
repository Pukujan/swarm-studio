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
  { id: 'world', q: 'Setting or hero you have in mind? (optional)', chips: ['Surprise me'], free: true },
  { id: 'scope', q: 'How big?', chips: ['Mini game', 'Big game'] }
]

const DEFAULTS = { type: 'Roguelike', goal: 'Clear rooms, beat a boss', controls: 'Keyboard + mouse', look: '3D neon', length: '5 minutes', world: 'Surprise me', scope: 'Mini game' }

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

// The big game's spec: the systems of a full action roguelike (a hub, a chain of
// rooms, weapons, choose-one blessings, a boss, people who talk), each named, so
// the build can go one system at a time and the art can be painted from it.
const BIG_SPEC_RULES = `You design a showcase browser action game: a full action roguelike with a home hub, runs through a chain of rooms, weapons, boons, a boss and people who talk. It is built in stages by a coding agent and its art (portraits, boon icons, room backdrops, a title picture) is painted from your spec, so be concrete.

Originality is required. If they name a game they like, take only its genre, pacing and feel. Invent a new world, hero, gods or patrons, enemies, weapons, places, names and story; never use the named game's characters, places, names, art or text. Say what is new in "original".

The game must have:
- a hub: a home place between runs where the hero talks to 2–3 people and picks a weapon;
- a run: a chain of 8–12 rooms with at least 3 room types (fight, elite fight, boon, treasure, rest, shop…), each room's exit doors show what the next room gives;
- 2–3 weapons that play differently (attack, special, one twist each);
- blessings: after a cleared room the player picks one of three boons from 3–4 patrons; 9–12 boons in all, each a clear number change or a new effect on attack, special, dash or cast;
- 5–7 enemy types with distinct attacks, and one boss with 2 phases at the end of the run;
- dialogue with portraits: 3–4 named people (hub folk, patrons, the boss), each with a look for their portrait and a few short lines for run start, death, boss and win;
- a run summary after a win or a death: rooms cleared, foes beaten, boons taken, weapon, time.
Every visual except the listed art is made in code.

Answer with JSON only:
{"title": "...", "pitch": "one sentence", "setting": "...", "hero": "...", "loop": "fight, pick a boon, choose a door", "progression": "...", "hub": {"name": "...", "what": "how it looks and what is there"}, "rooms": [{"type": "fight", "what": "how this kind of room looks and plays"}], "run": "how many rooms, in what order, where the boss is", "weapons": [{"name": "...", "attack": "...", "special": "...", "twist": "..."}], "patrons": [{"name": "...", "domain": "what their boons do", "look": "..."}], "blessings": [{"name": "...", "patron": "...", "effect": "..."}], "enemies": [{"name": "...", "attack": "...", "look": "..."}], "boss": {"name": "...", "look": "...", "phases": ["phase 1 ...", "phase 2 ..."]}, "characters": [{"name": "...", "role": "...", "look": "what their portrait shows", "lines": ["..."]}], "summary": "what the run summary shows", "controls": "...", "win": "...", "lose": "...", "look": "colours, shapes, lighting, mood", "sound": "...", "screens": ["title", "hub", "run", "boon choice", "dialogue", "pause", "summary"], "original": "what is new compared with the game they named"}`

// What a big spec is missing, as words for a retry (empty when it is whole).
export function bigGaps(spec) {
  const n = k => (Array.isArray(spec?.[k]) ? spec[k].length : 0)
  const gaps = []
  if (!spec?.hub?.name) gaps.push('a hub')
  if (n('rooms') < 3) gaps.push('3 room types')
  if (n('weapons') < 2) gaps.push('2 weapons')
  if (n('blessings') < 6) gaps.push('6 blessings')
  if (n('enemies') < 5) gaps.push('5 enemy types')
  if (!spec?.boss?.name) gaps.push('a boss')
  if (n('characters') < 2) gaps.push('2 speaking characters')
  if (!spec?.summary) gaps.push('a run summary')
  return gaps
}

function bigFallbackSpec(a, idea) {
  return {
    title: 'Ashfall Choir', pitch: idea || 'Climb a cathedral of cooling lava, room by room, with the blessings of three forgotten bells.',
    setting: 'A cathedral grown from cooled lava under a black sky, its bells long silent', hero: 'Senna, a bell-ringer\'s apprentice with a hammer of red glass',
    loop: 'fight a room, pick one of three boons, choose the next door', progression: 'boons stack across a run; each death returns you to the hub with a word from the people there',
    hub: { name: 'The Lantern Vestry', what: 'a warm stone room with a forge, a reading desk and a rack of weapons' },
    rooms: [{ type: 'fight', what: 'a cracked basalt nave, waves of foes' }, { type: 'elite', what: 'a narrow bell shaft, one hard foe and two helpers' }, { type: 'boon', what: 'a quiet chapel with a patron\'s shrine' }, { type: 'rest', what: 'a cool cistern that heals a third of your health' }],
    run: '10 rooms: fights and elites with a boon room every third, a rest room before the boss in room 10',
    weapons: [{ name: 'Glass Hammer', attack: 'slow wide swing', special: 'ground slam that knocks back', twist: 'third swing shatters for area damage' }, { name: 'Choir Bow', attack: 'quick arrows', special: 'charged shot that pierces', twist: 'arrows ring and slow foes' }, { name: 'Twin Clappers', attack: 'fast two-hit combo', special: 'spinning dash strike', twist: 'every hit builds a resonance meter' }],
    patrons: [{ name: 'Dulcet', domain: 'slows and freezes', look: 'a pale bell wrapped in frost' }, { name: 'Brazen', domain: 'burns and big hits', look: 'a bronze bell with a cracked lip of fire' }, { name: 'Hush', domain: 'dodges and crits', look: 'a muffled bell bound in grey cloth' }],
    blessings: [
      { name: 'Frost Peal', patron: 'Dulcet', effect: 'attacks slow foes by 30% for 2 s' }, { name: 'Still Air', patron: 'Dulcet', effect: 'dash leaves a freezing ring' }, { name: 'Cold Chord', patron: 'Dulcet', effect: 'special freezes for 1 s' },
      { name: 'Ember Toll', patron: 'Brazen', effect: 'attacks deal +40% damage' }, { name: 'Molten Lip', patron: 'Brazen', effect: 'special burns for 12 damage over 3 s' }, { name: 'Forge Heart', patron: 'Brazen', effect: '+25 max health' },
      { name: 'Muffle', patron: 'Hush', effect: 'dash has a 20% longer reach' }, { name: 'Quiet Edge', patron: 'Hush', effect: '15% chance to deal triple damage' }, { name: 'Between Rings', patron: 'Hush', effect: 'after a dash your next hit is a critical' }
    ],
    enemies: [{ name: 'cinder mite', attack: 'rushes in packs', look: 'small glowing beetle' }, { name: 'slag brute', attack: 'slow overhead slam', look: 'hulking rock body' }, { name: 'ash wisp', attack: 'fires slow orbs', look: 'floating smoke ring' }, { name: 'choir husk', attack: 'screams in a cone', look: 'hollow robed figure' }, { name: 'pumice spider', attack: 'leaps and spits', look: 'pale porous spider' }],
    boss: { name: 'The Cracked Tenor', look: 'a giant bell on legs of chain', phases: ['rings shockwaves in rings, summons mites', 'shatters, spins and fires molten shards'] },
    characters: [{ name: 'Senna', role: 'the hero', look: 'young woman, soot on her cheeks, red glass hammer on her shoulder', lines: ['Up again.', 'One more bell.'] }, { name: 'Old Abner', role: 'the vestry keeper', look: 'old man with a lantern and a scarred apron', lines: ['Back so soon?', 'The tenor will not ring itself out.'] }, { name: 'The Cracked Tenor', role: 'the boss', look: 'a vast bronze bell with a split face', lines: ['You ring false, child.'] }],
    summary: 'rooms cleared, foes beaten, boons taken (with icons), weapon used, time, damage dealt',
    controls: a.controls, win: 'silence the Cracked Tenor', lose: 'your health reaches zero; you wake in the hub', look: a.look, sound: 'bell tones, low choir drone, hard hits',
    screens: ['title', 'hub', 'run', 'boon choice', 'dialogue', 'pause', 'summary'], original: 'all new world, hero, patrons, enemies and boss'
  }
}

// Busy or failing models: the next one in the list (InferHub's other fast routes).
const SPEC_FALLBACKS = ['deepseek-v4.1-flash', 'claude-haiku-5.5', 'gemini-3.8-flash']

export async function writeSpec({ provider, model, idea, answers, brand, signal, big }) {
  const p = plan(big ? { ...answers, scope: 'Big game' } : answers)
  const promo = brand ? `\n\nThis is a promo game for ${brand.name}: ${brand.brief}\nSet it in the brand's own world: its place, its people, its products and its goal (for an event, getting there and enjoying it; for a shop, its products). Use its real names. The "look" uses the brand's colours and mood: ${brand.direction}\nThe win screen invites the player to the real thing (one short line, like the site's own call to action).\nThe site's copy:\n${brand.copy}` : ''
  const ask = `Idea: ${idea || '(none)'}\n${QUESTIONS.filter(q => q.id !== 'scope').map(q => `${q.q} ${p.answers[q.id] || '(no answer)'}`).join('\n')}\nEngine: ${p.engine}.${promo}`
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
${spec.brand ? `- **Promo for:** ${spec.brand.name}${spec.brand.url ? ` (${spec.brand.url})` : ''}\n` : ''}${spec.big ? bigMarkdown(spec) : ''}`
}

// The big game's systems, in the spec file the build follows
function bigMarkdown(spec) {
  const rows = (v, f) => (Array.isArray(v) ? v : []).map(x => `- ${typeof x === 'string' ? x : f(x)}`).join('\n')
  return `
## Hub
${spec.hub?.name || ''}: ${spec.hub?.what || ''}

## Run
${spec.run || ''}

Room types:
${rows(spec.rooms, r => `**${r.type}**: ${r.what || ''}`)}

## Weapons
${rows(spec.weapons, w => `**${w.name}**: attack ${w.attack || ''}; special ${w.special || ''}; ${w.twist || ''}`)}

## Patrons and blessings
${rows(spec.patrons, p => `**${p.name}**: ${p.domain || ''}`)}

Boons (pick one of three after a cleared room):
${rows(spec.blessings, b => `**${b.name}** (${b.patron || ''}): ${b.effect || ''}`)}

## Enemies
${rows(spec.enemies, e => `**${e.name}**: ${e.attack || ''}${e.look ? ` (${e.look})` : ''}`)}

## Boss
**${spec.boss?.name || ''}**: ${spec.boss?.look || ''}
${rows(spec.boss?.phases, p => String(p))}

## People and dialogue
${rows(spec.characters, c => `**${c.name}** (${c.role || ''}): ${(c.lines || []).map(l => `"${l}"`).join(' ')}`)}

## Run summary
${spec.summary || ''}
`
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
${spec.brand ? brandRules({ ...spec.brand, game: gameSlug(spec.title) }) : ''}
${assets.length ? `- 3D models already in public/models/ (load with GLTFLoader, animate with AnimationMixer):\n${assets.map(a => `  - ${a.file}: ${a.what}`).join('\n')}\n` : ''}
Finish with a working build: the typecheck and build must pass, and the game must start and be playable to a win and a loss.

Reference notes for this kind of game (use what helps, ignore the rest):

${skillText(spec.skills || [])}`
}

// ---------- the big game: its art and its stages

const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'x'

// The pictures a big game is painted with: a title picture, a portrait per
// speaking person, an icon per boon, a backdrop per room type (and the hub).
// Each is a file in the app's public/art/ that the game loads; `gen` is what the
// art director paints. Capped, so a long spec does not become a long bill.
export function artList(spec, { max = 20 } = {}) {
  const where = spec.setting || ''
  const items = [{ id: 'title', kind: 'title', aspect: 'landscape', what: 'title screen picture', gen: `Key art for a game called ${spec.title}: ${spec.hero}, in ${where}, ready to fight` }]
  for (const c of (spec.characters || []).slice(0, 5)) items.push({ id: `portrait-${slug(c.name)}`, kind: 'portrait', aspect: 'portrait', what: `portrait of ${c.name} (${c.role || 'character'}) for dialogue`, gen: `Chest-up character portrait of ${c.name}, ${c.role || ''}: ${c.look || ''}. Facing three-quarters, plain dark backdrop, from ${where}` })
  if (spec.boss?.name && !items.some(i => i.id === `portrait-${slug(spec.boss.name)}`)) items.push({ id: `portrait-${slug(spec.boss.name)}`, kind: 'portrait', aspect: 'portrait', what: `portrait of the boss ${spec.boss.name}`, gen: `Menacing portrait of ${spec.boss.name}: ${spec.boss.look || ''}, plain dark backdrop` })
  const patron = n => (spec.patrons || []).find(p => p.name === n)
  for (const b of (spec.blessings || []).slice(0, 9)) items.push({ id: `boon-${slug(b.name)}`, kind: 'icon', aspect: 'square', what: `icon for the boon ${b.name}`, gen: `A single emblem for "${b.name}": ${b.effect || ''}. ${patron(b.patron)?.look ? `In the colours of ${patron(b.patron).look}. ` : ''}One bold symbol centred on a plain dark circle, readable when small` })
  if (spec.hub?.name) items.push({ id: 'room-hub', kind: 'backdrop', aspect: 'landscape', what: `backdrop for the hub, ${spec.hub.name}`, gen: `Top-down three-quarter view of ${spec.hub.name}: ${spec.hub.what || ''}. An empty floor with walls around the edges, open space in the middle for characters` })
  for (const r of (spec.rooms || []).slice(0, 5)) items.push({ id: `room-${slug(r.type)}`, kind: 'backdrop', aspect: 'landscape', what: `backdrop for ${r.type} rooms`, gen: `Top-down three-quarter view of an arena floor in ${where}: ${r.what || r.type}. Empty of characters, walls and props at the edges, open floor in the middle` })
  if (spec.boss?.name) items.push({ id: 'room-boss', kind: 'backdrop', aspect: 'landscape', what: `backdrop for the boss arena of ${spec.boss.name}`, gen: `Top-down three-quarter view of a large round boss arena in ${where}, the lair of ${spec.boss.name}. Empty floor, ominous edges` })
  // the title, then one of each kind, then the rest: a cap keeps some of every kind
  const order = ['title', 'portrait', 'backdrop', 'icon']
  const byKind = order.map(k => items.filter(i => i.kind === k))
  const out = []
  for (let round = 0; out.length < Math.min(max, items.length); round++) for (const list of byKind) if (list[round] && out.length < max) out.push(list[round])
  return out
}

// How the game uses the painted art. `files` are the ones that were painted
// ({ file: 'art/x.png', what }); none painted means everything is drawn in code.
export function artBrief(files = []) {
  if (!files.length) return '- No painted art this time: draw every portrait, icon and backdrop in code (shapes, gradients, canvas textures).'
  return `- Painted art is in public/art/ (served at /art/…). Load these files and use them as named; keep a drawn-in-code stand-in if one fails to load, so the game never breaks:
${files.map(f => `  - ${f.file}: ${f.what}`).join('\n')}
  Load images with a relative path ("art/…", not "/art/…") and crossOrigin "anonymous". Room backdrops fill the arena floor under the action (darken them a little so the fighters read); portraits sit beside the dialogue box; boon icons sit on the boon cards and in the HUD and run summary; the title picture fills the title screen behind the menu.`
}

// The big game's build, one system group per stage. Each stage is its own
// engine call with its own turns, then the gates, a play test and a fix turn.
export const BIG_STAGES = [
  { id: 'core', name: 'the core fight', turns: 6, what: 'The engine, the scene and camera, the hero (move, dash with brief invulnerability, health), the first weapon (attack and special), two enemy types that chase and hurt, one fight room that ends when it is clear, the title screen with Play, the HUD (health bar, room number) and the game feel (hit-stop, shake, knockback, particles). The game must be playable from the title to a cleared room and to a death.' },
  { id: 'rooms', name: 'the run of rooms', turns: 5, what: 'The run: a chain of rooms as the spec says, with every room type in it and its painted backdrop; cleared rooms open exit doors that show what the next room gives; waves that grow with the room number; all the enemy types from the spec, each with its own attack and look; a death ends the run.' },
  { id: 'boons', name: 'weapons and boons', turns: 5, what: 'All the weapons from the spec, each playing differently (attack, special, twist), picked before a run; the boon choice: after a cleared fight room (and in boon rooms) a screen offers three boons from the patrons as cards with icon, name, patron and effect, the player picks one, and the effect really changes play and stacks over the run; the HUD shows the boons taken.' },
  { id: 'hub', name: 'the hub and the people', turns: 5, what: 'The hub between runs: its backdrop, the people standing in it, a weapon rack to pick the weapon, a door that starts a run; dialogue: walk up and press E (or click) to talk, a box at the bottom with the speaker\'s portrait, name and their lines, advancing with a key or click; lines when a run starts, after a death and before the boss. The title\'s Play leads to the hub, a death returns to the hub.' },
  { id: 'boss', name: 'the boss and the run summary', turns: 5, what: 'The boss room at the end of the run: the boss from the spec with its two phases (a phase change at half health with a short line of dialogue), a big boss health bar; the run summary after a win or a death (rooms cleared, foes beaten, boons taken with their icons, weapon, time) with buttons back to the hub and to the title; pause (Esc / P); synthesised music and sound for hits, boons, doors and the boss; a last pass on balance so a first run is fair and a full run takes 10–20 minutes.' }
]

// The engine's prompt for one stage. The first stage also carries how to build
// (the engine notes and the reference skills); later ones say what is done.
export function bigStagePrompt(spec, i, { art = [], failed = '' } = {}) {
  const st = BIG_STAGES[i]
  const done = BIG_STAGES.slice(0, i).map(s => s.name).join(', ')
  const head = `This is a big browser game, built in ${BIG_STAGES.length} stages; this is stage ${i + 1}: ${st.name}. GAME_SPEC.md in the project root is the whole spec; follow its names, numbers and content.`
  const stage = `${failed ? `First: ${failed}\n\n` : ''}${done ? `Already built: ${done}. Keep all of it working; change it only where this stage needs to.\n\n` : ''}Build this stage now: ${st.what}

Do only this stage; later stages add the rest, so leave clean places for them (a room type table, a boon list, a dialogue module) instead of building them now.
${artBrief(art)}
- Keep the code in src/game/ with one module per system; no file over about 400 lines.
- Original content only: the names, characters, world and art in the spec are new.

Finish with a working build: the typecheck and build must pass, and the game must start from the title and be playable.`
  if (i > 0) return `${head}\n\n${stage}`
  return `${gamePrompt(spec).replace(/^Build this browser game as the whole app\. GAME_SPEC\.md \(in the project root\) is the spec; follow it exactly\.\n/, `${head}\n`).replace(/\nFinish with a working build:[^\n]*\n/, '\n').replace('so no image files are needed', 'for everything that is not painted art in public/art/')}\n\n---\n\n${stage}`
}
