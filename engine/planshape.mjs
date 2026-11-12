// The plan's shape follows the game's genre family (owner, 2026-11-11: "i just asked for rts game but
// i think the agents made something else"). The family, the size word, the title and the engine come
// from the idea and the answers; the planner model may read the idea better than these tables
// (askShape), but an explicit answer always wins and nothing that contradicts an answer is kept.
//
// Pure, except askShape (one planner call). engine/plan.mjs builds the cards from familyCards.
import { streamChat } from './llm.mjs'

const has = (s, re) => re.test(String(s || ''))
const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
const list = xs => xs.filter(Boolean).join('; ')

// ---------- the families: what kind of game, and what that kind of game is made of
export const FAMILIES = {
  action: { label: 'action game', words: /action|\brpg\b|brawler|hack.?and.?slash|boss rush|souls|beat.?em|fighting game|roguelike|roguelite|arena|musou|shooter|hero shooter/i, view: 'Third person, over the shoulder', art: '3d', humanoid: true, closeups: true, backdrops: true, cast: 'Cast' },
  rts: { label: 'real-time strategy (RTS) game', words: /\brts\b|real.?time strategy|strategy|base.?building|army.?building|tower defen[cs]e|\b4x\b|skirmish|command and conquer|starcraft.?like/i, view: 'Top-down, a slight isometric tilt', art: '2d', humanoid: false, closeups: false, backdrops: false, cast: 'Units' },
  platformer: { label: 'platformer', words: /platform|runner|metroidvania|side.?scroll|jump.?(?:and|n).?run|endless run/i, view: 'Side view, the camera following the hero', art: '2d', humanoid: null, closeups: false, backdrops: true, cast: 'Characters' },
  puzzle: { label: 'puzzle game', words: /puzzle|match.?3|match.?three|sokoban|tetris|falling blocks|logic game|brain.?teaser|riddle|tile.?match|merge game/i, view: 'A flat board, seen from above', art: '2d', humanoid: false, closeups: false, backdrops: false, cast: null },
  sim: { label: 'sim and management game', words: /\bsim\b|simulat|management|tycoon|farming|\bfarm\b|city.?build|cooking|run a (?:shop|bakery|cafe|restaurant|zoo|hotel)|bakery|life sim|idle game|clicker/i, view: 'Top-down, a slight isometric tilt', art: '2d', humanoid: null, closeups: false, backdrops: false, cast: 'Characters' },
  card: { label: 'card game', words: /\bcards?\b|deck|\btcg\b|\bccg\b|solitaire|poker|board game|tabletop/i, view: 'A table seen from above', art: '2d', humanoid: false, closeups: false, backdrops: false, cast: null },
  racing: { label: 'racing game', words: /racing|\brace\b|\bkart|driving|drift|rally/i, view: 'Behind the car (a chase camera)', art: '3d', humanoid: false, closeups: false, backdrops: true, cast: 'Vehicles' },
  narrative: { label: 'story game', words: /visual novel|narrative|story.?driven|dating sim|interactive fiction|text adventure|walking sim|mystery|detective/i, view: 'Painted scenes with the characters in front', art: '2d', humanoid: true, closeups: true, backdrops: true, cast: 'Characters' }
}
export const FAMILY_IDS = Object.keys(FAMILIES)

// the family a piece of text names: the one whose word comes first; '' when none does
export function familyOf(text) {
  const t = String(text || '')
  let best = '', at = Infinity
  for (const [id, f] of Object.entries(FAMILIES)) {
    const m = t.match(f.words)
    if (m && m.index < at) { best = id; at = m.index }
  }
  return best
}

// ---------- size words: "tiny" is the small shape, a small art list and a small price
export const SIZES = ['tiny', 'small', 'normal', 'big']
export const SCALE = {
  tiny: { cast: 4, stages: 1, items: 3, mocks: 3, perStage: 2 },
  small: { cast: 4, stages: 2, items: 4, mocks: 4, perStage: 2 },
  normal: { cast: 6, stages: 3, items: 5, mocks: 5, perStage: 3 },
  big: { cast: 8, stages: 5, items: 6, mocks: 5, perStage: 3 }
}
export function sizeOf(text) {
  const t = String(text || '')
  if (/\b(tiny|micro|mini|minimal|one.?screen|teeny|wee)\b/i.test(t)) return 'tiny'
  if (/\b(small|short|jam|simple|quick|prototype)\b/i.test(t)) return 'small'
  if (/\b(big|huge|epic|massive|large|open.?world|sprawling)\b/i.test(t)) return 'big'
  return 'normal'
}

// ---------- the title from the idea: "a tiny game called army of ants" -> "Army of Ants"
const SMALL = new Set(['of', 'the', 'a', 'an', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'or', 'by'])
export const titleCase = s => clean(s, 60).split(' ').map((w, i) => (i && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : (w === w.toLowerCase() ? cap(w) : w)).join(' ')
export function titleFrom(idea) {
  const t = clean(idea, 400)
  const quoted = t.match(/["“]([^"”]{2,40})["”]/)
  if (quoted) return titleCase(quoted[1])
  const named = t.match(/\b(?:called|named|titled)\s+(.{2,40}?)(?=\s*(?:[,.;:!?(—–]|\s-\s|$)|\s+(?:is|about|where|in|with|for|that|which|set)\b)/i)
  if (named) return titleCase(named[1])
  const lead = t.match(/^([A-Z][\w'’ -]{1,30}?)(?:[,:.—–]|\s+-\s|\s+is\b)/)
  if (lead && !/^(a|an|make|build|create|i|we|my|please)\b/i.test(lead[1])) return lead[1].trim()
  return ''
}

// ---------- the engine asked for: "in Godot" is a Godot 4 target, said in the plan
const ENGINES = { godot: 'Godot 4', unity: 'Unity', unreal: 'Unreal', web: 'the browser' }
export function engineFrom(text) {
  const t = String(text || '')
  const target = /godot/i.test(t) ? 'godot' : /\bunity\b/i.test(t) ? 'unity' : /\bunreal\b/i.test(t) ? 'unreal' : 'web'
  return { target, label: ENGINES[target], asked: target !== 'web' }
}

// ---------- what the answers forbid
export const GUNS = /\b(twin pistols?|pistols?|rifles?|shotguns?|railguns?|smgs?|guns?|cannons?|launchers?|bows?|grenades?|blasters?)\b/i
export const noShooting = a => has(a?.combat, /\bno\s+(shoot|gun|ranged|firearm)|without (shoot|gun)|melee only|\bno guns?\b/i)
export const noFights = a => has(a?.enemies, /no fight|no enem|peaceful|no combat/i) || has(a?.combat, /\bno (fight|combat|violence)/i)
const shooting = a => !noShooting(a) && has(a?.combat, /shoot|gun|ranged/i)

// What a plan says that an answer forbids, or that is the action RPG's shape in another family.
export function conflicts(plan) {
  const a = plan.answers || {}
  const out = []
  const text = plan.cards.map(c => [c.name, Object.entries(c.body || {}).map(([k, v]) => k === 'roster' ? (v || []).map(r => `${r.name} ${r.role} ${r.look} ${r.weapon}`).join(' ') : [].concat(v).join(' ')).join(' ')]).map(x => x.join(' '))
  if (noShooting(a)) text.forEach((t, i) => { if (GUNS.test(t)) out.push(`${plan.cards[i].name} has a gun, but the answer was "${a.combat}"`) })
  const family = plan.shape?.family
  if (family && family !== 'action') {
    text.forEach((t, i) => { if (/\bults?\b|cut-ins?|aura and wings|pet companion|over the shoulder/i.test(t)) out.push(`${plan.cards[i].name} has the action RPG's ${t.match(/\bults?\b|cut-ins?|aura and wings|pet companion|over the shoulder/i)[0]} in a ${FAMILIES[family].label}`) })
  }
  return out
}

// ---------- the subject the idea is about: "army of ants" -> "ant", "a fox who jumps" -> "fox"
const single = w => { const s = String(w || '').toLowerCase(); return s === 'mice' ? 'mouse' : s === 'elves' ? 'elf' : s.endsWith('ies') ? `${s.slice(0, -3)}y` : (s.endsWith('s') && !s.endsWith('ss')) ? s.slice(0, -1) : s }
const BEASTS = /\b(ants?|bees?|wasps?|termites?|beetles?|spiders?|robots?|mechs?|orcs?|elves|goblins?|knights?|aliens?|zombies?|slimes?|cats?|dogs?|foxes|fox|frogs?|mice|rats?|penguins?|wizards?|witches|pirates?|ninjas?|samurai|vikings?|dragons?|dinosaurs?|bunnies|rabbits?|ducks?|birds?|crabs?|moles?|snails?)\b/i
export function subjectFrom(idea) {
  const t = String(idea || '')
  const group = t.match(/\b(?:army|colony|swarm|kingdom|empire|clan|tribe|legion|horde|hive|nest|band|fleet|pack|gang)\s+of\s+([a-z]+)/i)
  if (group) return single(group[1])
  const who = t.match(/\b(?:a|an|the)\s+(?:little\s+|young\s+|brave\s+|tiny\s+|lone\s+)?([a-z]+)\s+(?:who|that|runs|jumps|climbs|dashes|flies|must|tries|races|sneaks)\b/i)
  if (who && !/game|platformer|runner|story|world|place|city/i.test(who[1])) return single(who[1])
  const beast = t.match(BEASTS)
  return beast ? single(beast[1]) : ''
}
const HIVE = /^(ant|bee|wasp|termite)$/
const hive = s => HIVE.test(s)

// where it happens: "across city rooftops at dusk" -> "city rooftops at dusk"
export function settingFrom(idea) {
  for (const m of String(idea || '').matchAll(/\b(?:across|between|through|over|on|in|inside|under|beneath|among)\s+((?:the\s+)?[a-z][a-z' -]{3,60}?)(?=[.,;!?]|\s+(?:dodging|while|where|with|and then|to|who|avoiding)\b|$)/gi)) {
    const s = clean(m[1], 80)
    if (!/godot|unity|unreal|browser|game|the web|3d|2d|pixel|style|anime/i.test(s)) return s
  }
  return ''
}
// what you dodge or fight: "dodging crows and a stray cat" -> ['crows', 'a stray cat']
export function foesFrom(idea) {
  const m = String(idea || '').match(/\b(?:dodging|avoiding|fighting|against|chased by|escaping|beating|battling|defeating)\s+([^.;!?]{3,120})/i)
  if (!m) return []
  return m[1].split(/\s*(?:,|\band\b|\bor\b)\s*/).map(x => clean(x, 40)).filter(x => x && !/^(the )?(rooftops?|city|levels?)$/i.test(x)).slice(0, 6)
}

// ---------- the shape: family, size, title, engine, subject, setting (the model's hint first)
// force: what a planner conversation decided (engine/talkplan.mjs): { family, size, art, engine } win over the words
export function shapeOf({ idea = '', given = {}, answers = {}, title = '', note = '', force = {} } = {}, env = {}, hint = null) {
  const text = [idea, note].filter(Boolean).join('. ')
  const fromAnswer = familyOf(given.genre)
  const family = (FAMILY_IDS.includes(force.family) ? force.family : '') || fromAnswer || (FAMILY_IDS.includes(hint?.family) ? hint.family : '') || familyOf(text) || familyOf(answers.genre) || 'action'
  const f = FAMILIES[family]
  const size = SIZES.includes(force.size) ? force.size : sizeOf(text) !== 'normal' ? sizeOf(text) : (SIZES.includes(hint?.size) ? hint.size : 'normal')
  const engine = ENGINES[force.engine] ? engineFrom(force.engine) : engineFrom(`${text} ${given.engine || ''} ${given.target || ''}`)
  if (engine.target === 'godot') engine.installed = env.godot === undefined ? null : !!env.godot
  const said3d = has(`${text} ${given.look || ''}`, /\b3d\b|three.?d|low.?poly|toon.?shaded 3d/i)
  const said2d = has(`${text} ${given.look || ''}`, /\b2d\b|pixel|flat|sprite|hand.?drawn|paper/i)
  // Meshy (3D models, rigs, clips, weapons) only when the person said 3D: every game is painted 2D otherwise
  const art = ['2d', '3d'].includes(force.art) ? force.art : said3d && !said2d ? '3d' : '2d'
  const subject = clean(hint?.subject, 30).toLowerCase() || subjectFrom(text)
  return {
    family, label: f.label, size, art, engine,
    view: clean(hint?.view, 120) || (family === 'action' && art === '2d' ? 'Side view' : f.view),
    subject,
    setting: clean(hint?.setting, 160) || settingFrom(text),
    title: clean(title, 80) || titleFrom(idea) || clean(hint?.title, 60) || '',
    humanoid: f.humanoid ?? (!subject || /hero|girl|boy|man|woman|knight|courier|wizard|witch|pirate|ninja|samurai|viking|kid|people/i.test(subject)),
    closeups: f.closeups, backdrops: f.backdrops,
    scale: SCALE[size]
  }
}

// ---------- the cards of each family (the action RPG's are in engine/plan.mjs, unchanged)
// ctx: { a: answers with defaults, given, idea, shape, hint, n }
const pick = (hint, key, fallback, n) => {
  const xs = Array.isArray(hint?.lists?.[key]) ? hint.lists[key].map(x => clean(x, 80)).filter(Boolean) : []
  return (xs.length ? xs : fallback).slice(0, n)
}
const moneyCard = (a, f) => {
  const cosmetics = has(a.money, /cosmetic/i)
  return { model: a.money, shop: cosmetics ? `Cosmetic skins only (${f}), nothing that changes play` : '', gacha: has(a.money, /gacha/i) ? 'Cosmetics only, published rates, a pity counter' : '', subscription: has(a.money, /subscri/i) ? 'Monthly, test mode' : '' }
}
const lookCard = a => ({ style: a.look, palette: '', locked: 'no' })
const castOf = (hint, fallback, n) => {
  const hc = Array.isArray(hint?.cast) ? hint.cast.filter(r => clean(r?.name)) : []
  return (hc.length ? hc.map(r => ({ name: clean(r.name, 40), role: clean(r.role, 40), look: clean(r.look, 200), weapon: '' })) : fallback).slice(0, n)
}

export function familyCards(ctx) {
  const { a, shape, hint } = ctx
  const s = shape.scale
  const subj = shape.subject
  const fights = !noFights(a)
  const melee = noShooting(a) || !shooting(a)
  const B = {
    rts() {
      const kind = subj || 'soldier'
      const lead = hive(subj) ? 'Queen' : 'Commander'
      const roles = [['Worker', 'gathers food and builds'], ['Soldier', melee ? (hive(subj) ? 'bites and charges in melee' : 'fights up close') : 'attacks from range'], ['Scout', 'fast, sees far, uncovers the fog'], [lead, hive(subj) ? 'lays eggs that hatch new units at the nest' : 'makes new units at the base'], ['Guard', 'slow and tough, holds a choke point'], ['Healer', 'mends nearby units'], ['Flyer', 'crosses walls and water'], ['Siege', 'breaks buildings']]
      const n = Math.max(1, Math.min(s.cast, parseInt(a.size, 10) || s.cast))
      const roster = castOf(hint, roles.map(([r, does]) => ({ name: subj ? `${cap(kind)} ${r.toLowerCase()}` : r, role: r, look: does, weapon: '' })), n)
      const buildings = pick(hint, 'buildings', hive(subj) ? ['Nest (the base, where new units hatch)', 'Food store', 'Soldier chamber', 'Watch mound', 'Fungus garden', 'Tunnel'] : ['Base (makes workers)', 'Store', 'Barracks', 'Watchtower', 'Workshop', 'Wall'], s.items)
      const resources = pick(hint, 'resources', hive(subj) ? ['Food (crumbs and seeds)', 'Leaves', 'Honeydew'] : ['Food', 'Wood', 'Stone', 'Gold'], Math.max(2, s.items - 1))
      const tiles = pick(hint, 'tiles', hive(subj) ? ['soil', 'grass', 'pebbles', 'puddle edge', 'path'] : ['grass', 'dirt', 'stone', 'water edge', 'road'], s.items + 1)
      const waves = has(a.enemies, /wave|endless|horde/i)
      return {
        cards: [
          ['cast', 'Units', { count: String(roster.length), rule: a.cast, roster }],
          ['buildings', 'Buildings', { list: list(buildings), base: buildings[0], rule: 'Workers build; each building costs resources' }],
          ['resources', 'Resources', { list: list(resources), gather: `${roster[0]?.name ? `${roster[0].name}s` : 'Workers'} carry it back to the ${clean(buildings[0]).split(' (')[0].toLowerCase()}` }],
          ['world', 'Map', { setting: shape.setting || (hive(subj) ? 'A backyard seen from ant height: soil, grass blades, pebbles and a puddle' : 'A small valley with two bases and a river between them'), maps: String(s.stages), size: shape.size === 'tiny' ? 'One small map, about 32 × 32 tiles' : 'Maps of about 64 × 64 tiles', tiles: list(tiles), camera: shape.view }],
          ['controls', 'Camera and orders', { camera: `${shape.view}; pan at the screen edges or with WASD, zoom with the wheel`, fog: 'Fog of war: ground no unit can see stays dark', selection: 'Click a unit to select it; drag a box to select many; Shift adds to the selection', orders: 'Right-click to move, attack, gather or build; A then click to attack-move', groups: shape.size === 'tiny' ? '' : 'Ctrl+1–9 makes control groups' }],
          ['enemies', 'Enemy faction', fights
            ? { faction: hive(subj) ? 'A rival colony of red fire ants' : 'A rival army', waves: waves ? 'Endless waves from the map edge, each a little bigger, with a short pause between them' : 'Skirmish: one enemy base that builds and attacks like you', rules: waves ? 'You lose when your base falls; your score is the wave you reach' : 'Destroy the enemy base to win; lose yours and you lose' }
            : { faction: 'None', waves: 'No enemy: a building puzzle against the clock', rules: '' }],
          ['progression', 'Upgrades', { upgrades: has(a.progression, /gear|upgrade/i) || !ctx.given.progression ? `Upgrades bought at the base with resources: ${hive(subj) ? 'sharper mandibles, harder shells, faster workers' : 'better weapons, armour, faster workers'}` : a.progression, tech: shape.size === 'tiny' ? '' : 'A short tech tree that opens new units' }],
          ['hud', 'HUD', { top: `Resources and ${waves ? 'the wave number' : 'the game clock'}`, bottom: 'The selected units with their health, and their orders as buttons', minimap: 'A small minimap in a corner', alerts: 'An alert when the base is under attack' }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'colony colours')]
        ],
        systems: { enemyAI: fights, leaderboard: fights && waves },
        sheets: ['units', 'buildings', 'terrain', 'icons'],
        shots: [['battle', 'a wave of enemies attacking the base, a group of units selected with a drag box, the HUD with resources and the wave number'], ['base', 'the base growing: workers carrying resources home, a building going up'], ['fog', 'the map half under fog of war, a scout uncovering it'], ['upgrades', 'the upgrades panel over the dimmed map'], ['over', 'game over: the wave reached, the best wave']],
        sprites: [
          ...roster.map(r => ({ kind: 'unit', name: r.name, what: `${r.name}, ${r.look}` })),
          ...buildings.map(b => ({ kind: 'building', name: clean(b).split(' (')[0], what: clean(b) })),
          ...resources.map(r => ({ kind: 'resource', name: clean(r).split(' (')[0], what: `an icon for ${clean(r)}` })),
          { kind: 'tile', name: 'Terrain tiles', what: `a tileset of ${list(tiles).replace(/; /g, ', ')}` },
          { kind: 'hud', name: 'HUD', what: 'the HUD pieces: a resource bar, a unit panel, order buttons, a minimap frame' }
        ]
      }
    },
    platformer() {
      const hero = subj || 'hero'
      const n = Math.max(1, Math.min(3, parseInt(ctx.given.size, 10) || 1))
      const roster = castOf(hint, [{ name: cap(hero), role: 'Hero', look: '', weapon: '' }, { name: 'Friend', role: 'Second player', look: '', weapon: '' }, { name: 'Rival', role: 'Third', look: '', weapon: '' }], n)
      const said = re => has(`${ctx.idea} ${ctx.note || ''}`, re)
      const runner = said(/runner|endless run/i)
      const foes = pick(hint, 'enemies', foesFrom(`${ctx.idea}. ${ctx.note || ''}`), 6)
      return {
        cards: [
          ['cast', 'Characters', { count: String(roster.length), rule: a.cast, roster }],
          ['moves', 'Moves', {
            run: runner ? 'Runs on its own, faster over time' : 'Run left and right, with a little acceleration',
            jump: 'Jump, higher while held, with coyote time and a jump buffer',
            crouch: 'Crouch: hold Down to duck under low things, standing still or moving',
            slide: said(/slid/i) || runner ? 'Slide: Down while running, under low gaps, at any running speed' : '',
            more: list([said(/double.?jump/i) && 'Double jump', said(/wall/i) && 'Wall jump', said(/dash/i) && 'Dash', said(/climb/i) && 'Climb'])
          }],
          ['enemies', 'Hazards and enemies', fights
            ? { list: list(foes.length ? foes : ['walkers that patrol a ledge', 'flyers that swoop', 'spikes and pits']), behaviour: 'Each one moves in its own pattern (patrol, swoop, pounce), is animated, and shows a tell before it strikes' }
            : { list: 'Hazards only: pits, spikes, moving platforms', behaviour: '' }],
          ['world', 'Levels', { setting: shape.setting || 'Bright hills and caves', levels: String(shape.size === 'tiny' ? 1 : shape.size === 'small' ? 3 : 5), camera: shape.view, checkpoints: shape.size === 'tiny' ? '' : 'A checkpoint mid-level', tiles: 'Ground, platform, hazard and background tiles' }],
          ['progression', 'Progression', { unlock: ctx.given.progression || 'Finish a level to open the next; collectibles for a better score' }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'outfits')]
        ],
        systems: { enemyAI: fights, leaderboard: runner },
        sheets: ['cast', 'enemies', 'tiles'],
        shots: [['run', 'the hero mid-jump over a gap, the level scrolling, a simple HUD'], ['danger', 'the hero ducking or sliding under an enemy'], ['level', 'a whole level seen wide, platforms and hazards'], ['goal', 'the level end, a score card'], ['title', 'the title screen']],
        sprites: [
          ...roster.map(r => ({ kind: 'character', name: r.name, what: `${r.name}, the ${r.role.toLowerCase()}: a side-view sprite` })),
          ...(foes.length ? foes : ['a walker enemy', 'a flying enemy']).slice(0, s.items).map(x => ({ kind: 'enemy', name: titleCase(x.replace(/^(a|an|the)\s+/i, '')), what: `${x}, side view` })),
          { kind: 'tile', name: 'Level tiles', what: `ground, platform and edge tiles for ${shape.setting || 'the levels'}` },
          { kind: 'pickup', name: 'Pickups', what: 'a collectible and a checkpoint flag' }
        ]
      }
    },
    puzzle() {
      const match3 = has(`${ctx.idea} ${a.genre}`, /match.?3|match.?three/i)
      const pieces = pick(hint, 'pieces', (ctx.idea.match(/\bwith\s+([a-z ]{3,40}?)(?:[.,;]|$)/i)?.[1] ? [ctx.idea.match(/\bwith\s+([a-z ]{3,40}?)(?:[.,;]|$)/i)[1]] : []).concat(['Five kinds of coloured tiles', 'A blocker tile', 'A special tile that clears a row']), s.items)
      return {
        cards: [
          ['pieces', 'Pieces', { list: list(pieces), kinds: shape.size === 'tiny' ? '4 kinds' : '5 kinds' }],
          ['rules', 'Rules', match3
            ? { goal: 'Swap two neighbours to line up 3 or more of a kind; they clear and new ones fall in', moves: 'A move limit per level', win: 'Reach the level goal before the moves run out' }
            : { goal: 'Move the pieces until the board is solved', moves: 'Undo is free', win: 'Solve it in as few moves as you can' }],
          ['world', 'Levels', { setting: shape.setting || '', levels: shape.size === 'tiny' ? '10 levels, easy to hard' : '30 levels, easy to hard', camera: shape.view }],
          ['progression', 'Progression', { unlock: ctx.given.progression || 'Up to three stars a level; stars open the next levels' }],
          ['hud', 'HUD', { top: 'Moves left and the goal', bottom: 'Restart and hint buttons' }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'board themes')]
        ],
        systems: { enemyAI: false, leaderboard: false },
        sheets: ['pieces', 'board'],
        shots: [['board', 'a level in play: the board, a match clearing'], ['win', 'level clear with stars'], ['map', 'the level map']],
        sprites: [...pieces.map(p => ({ kind: 'piece', name: titleCase(clean(p, 40)), what: `game pieces: ${p}` })), { kind: 'tile', name: 'Board', what: 'the board background and cell frame' }, { kind: 'hud', name: 'HUD', what: 'buttons and the goal panel' }]
      }
    },
    card() {
      const foes = subj ? `Rival ${subj}s, each with its own deck` : 'Rivals, each with its own deck'
      return {
        cards: [
          ['deck', 'Cards', { deck: shape.size === 'tiny' ? 'A starting deck of 10, about 20 cards in all' : 'A starting deck of 10, about 40 cards in all', kinds: 'Attack, block, spell, and a few rare ones', build: has(`${ctx.idea} ${a.genre}`, /deck.?build/i) ? 'Win a duel, then add one of three cards to your deck' : 'A fixed deck you can tune between duels' }],
          ['rules', 'Rules', { turn: 'Draw 5, spend energy to play cards, discard the rest', win: 'Bring the opponent to 0 health' }],
          ['opponents', 'Opponents', { list: foes, count: String(shape.size === 'tiny' ? 3 : shape.size === 'small' ? 5 : 8) }],
          ['world', 'Board', { setting: shape.setting || '', camera: shape.view, layout: 'Your hand at the bottom, the opponent across the table' }],
          ['progression', 'Runs', { unlock: ctx.given.progression || 'Each run unlocks new cards' }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'card backs')]
        ],
        systems: { enemyAI: true, leaderboard: false },
        sheets: ['cards', 'opponents'],
        shots: [['duel', 'a duel: your hand fanned at the bottom, the opponent across the table'], ['reward', 'pick one of three cards'], ['map', 'the run map']],
        sprites: [{ kind: 'card', name: 'Card frame', what: 'the card frame, one per card kind' }, { kind: 'opponent', name: 'Opponents', what: foes }, { kind: 'tile', name: 'Table', what: 'the table top' }]
      }
    },
    sim() {
      const things = pick(hint, 'things', [shape.setting ? `The ${shape.setting}` : 'Your place', 'Customers', 'Stock'], s.items)
      const roster = castOf(hint, [{ name: subj ? cap(subj) : 'Owner', role: 'You', look: '', weapon: '' }], 1)
      return {
        cards: [
          ['cast', 'Characters', { count: String(roster.length), rule: a.cast, roster }],
          ['economy', 'Economy', { earn: 'Sell what you make', spend: 'Buy upgrades and new stock', things: list(things) }],
          ['world', 'Place', { setting: shape.setting || '', camera: shape.view, days: 'Days with a morning, a rush and a closing tally' }],
          ['progression', 'Progression', { unlock: ctx.given.progression || 'Grow the place: new rooms, new recipes' }],
          ['hud', 'HUD', { top: 'Money and the day clock', bottom: 'Build and stock buttons' }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'decorations')]
        ],
        systems: { enemyAI: false, leaderboard: false },
        sheets: ['cast', 'places', 'items'],
        shots: [['day', 'a busy moment, the place full'], ['build', 'placing a new upgrade'], ['tally', 'the end-of-day tally']],
        sprites: [...roster.map(r => ({ kind: 'character', name: r.name, what: r.name })), ...things.map(t => ({ kind: 'item', name: titleCase(clean(t, 40)), what: t })), { kind: 'tile', name: 'Floor tiles', what: 'floor and wall tiles' }]
      }
    },
    racing() {
      const n = Math.max(1, Math.min(s.cast, parseInt(ctx.given.size, 10) || Math.min(4, s.cast)))
      const roster = castOf(hint, ['Lead', 'Rival', 'Heavy', 'Light', 'Drifter', 'Rocket', 'Veteran', 'Rookie'].map(r => ({ name: `${r} car`, role: r, look: '', weapon: '' })), n)
      return {
        cards: [
          ['cast', 'Vehicles', { count: String(roster.length), rule: a.cast, roster }],
          ['tracks', 'Tracks', { count: String(s.stages), setting: shape.setting || '' }],
          ['rules', 'Race rules', { laps: '3 laps', items: has(ctx.idea, /kart/i) ? 'Item boxes on the track' : '', win: 'First over the line' }],
          ['world', 'World', { camera: shape.view, setting: shape.setting || '' }],
          ['progression', 'Progression', { unlock: ctx.given.progression || 'Win cups to open new tracks' }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'paint jobs')]
        ],
        systems: { enemyAI: true, leaderboard: true },
        sheets: ['vehicles', 'tracks'],
        shots: [['race', 'mid-race, the pack in a corner, lap and place on the HUD'], ['start', 'the starting grid'], ['podium', 'the podium']],
        sprites: roster.map(r => ({ kind: 'vehicle', name: r.name, what: r.name }))
      }
    },
    narrative() {
      const roster = castOf(hint, [{ name: subj ? cap(subj) : 'You', role: 'Lead', look: '', weapon: '' }, { name: 'Friend', role: 'Friend', look: '', weapon: '' }, { name: 'Stranger', role: 'Mystery', look: '', weapon: '' }], Math.min(3, s.cast))
      return {
        cards: [
          ['cast', 'Characters', { count: String(roster.length), rule: a.cast, roster }],
          ['story', 'Story', { premise: clean(ctx.idea, 400), acts: shape.size === 'tiny' ? '1' : '3', ending: 'Two endings, from your choices' }],
          ['choices', 'Choices', { how: 'A few choices per scene; some change who trusts you', save: 'Saves at each scene' }],
          ['world', 'Scenes', { setting: shape.setting || '', camera: shape.view, scenes: String(s.stages * 2) }],
          ['look', 'Look', lookCard(a)],
          ['money', 'Money', moneyCard(a, 'outfits')]
        ],
        systems: { enemyAI: false, leaderboard: false },
        sheets: ['cast', 'scenes'],
        shots: [['talk', 'a dialogue scene, a portrait and a text box'], ['choice', 'a choice with two options'], ['title', 'the title screen']],
        sprites: roster.map(r => ({ kind: 'portrait', name: r.name, what: `${r.name}, waist-up portrait` }))
      }
    }
  }
  return B[shape.family]?.() || null
}

// ---------- the plan in plain words, shown with the first picture
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export function planSummary(plan) {
  const s = plan.shape || {}
  const f = FAMILIES[s.family] || FAMILIES.action
  const c = id => plan.cards.find(x => x.id === id)?.body || {}
  const items = id => String(c(id).list || '').split(';').map(x => clean(x)).filter(Boolean)
  const cast = (c('cast').roster || []).filter(r => r?.name)
  const engine = plan.engine?.target && plan.engine.target !== 'web' ? `for ${plan.engine.label}` : 'for the browser'
  const what = `${s.size && s.size !== 'normal' ? `${s.size} ` : ''}${f.label}`
  const lines = [`${plan.title || 'This game'}: ${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what} ${engine}.`]
  if (cast.length) lines.push(`${count(cast.length, (f.cast || 'Cast').toLowerCase().replace(/s$/, ''))}: ${cast.map(r => r.name).join(', ')}.`)
  if (s.family === 'rts') lines.push(`${count(items('buildings').length, 'building')}, ${count(items('resources').length, 'resource')}, ${count(Number(c('world').maps) || 1, 'map')} with fog of war, seen ${String(s.view || '').toLowerCase()}.`, `Enemy: ${String(c('enemies').faction || 'none').toLowerCase()}${c('enemies').waves ? `; ${String(c('enemies').waves).split(',')[0].toLowerCase()}` : ''}.`)
  else if (s.family === 'platformer') lines.push(`Moves: ${['run', 'jump', 'crouch', 'slide'].filter(k => c('moves')[k]).join(', ')}${c('moves').more ? `, ${String(c('moves').more).toLowerCase()}` : ''}. Seen from the side.`, `Dangers: ${String(c('enemies').list || 'none')}.`)
  else if (s.family === 'puzzle') lines.push(`${c('rules').goal || ''}. ${c('world').levels || ''}.`)
  else if (s.family === 'card') lines.push(`${c('deck').deck || ''}. ${c('opponents').list || ''}.`)
  else if (s.family === 'action') lines.push(`${c('combat').style || ''}. Seen ${String(c('world').camera || '').toLowerCase()}.`)
  const sprites = s.art === '2d' ? `2D sprites on a ${plan.key?.name || 'magenta'} key, no 3D models` : '3D models from painted turnarounds'
  lines.push(`Art: ${sprites}.`)
  if (plan.engine?.target === 'godot' && plan.engine.installed === false) lines.push('Godot is not installed on this machine, so the build cannot be a Godot 4 project yet: install Godot 4, or say the browser is fine.')
  return lines.filter(l => clean(l).length > 2).join(' ')
}

// ---------- one planner call: the shape the model reads from the idea (validated, never trusted)
const SHAPE_ASK = `You read a game idea and the creator's answers and say what kind of game it is, as JSON only:
{"family": one of ${JSON.stringify(FAMILY_IDS)}, "title": the game's name if the idea gives one, else a short fitting one,
 "size": one of ${JSON.stringify(SIZES)}, "subject": what the player's side is (one word, singular, e.g. "ant"),
 "setting": where it happens in a few words, "view": the camera in a few words,
 "cast": [{"name","role","look"}] the playable side (units for a strategy game, characters otherwise; none for puzzle or card games),
 "lists": {"buildings":[], "resources":[], "tiles":[], "enemies":[], "pieces":[], "things":[]} only those that fit the family}
Honour every answer: "no shooting" means no guns anywhere; "tiny" means a few of everything. Never add what the idea does not need.`
export async function askShape({ provider, model, idea, answers, signal }) {
  if (!provider || !model) return null
  const res = await streamChat(provider, { trace: { kind: 'plan-shape' }, model, maxTokens: 900, temperature: 0.3, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal, messages: [{ role: 'system', content: SHAPE_ASK }, { role: 'user', content: `Idea: ${clean(idea, 600)}\nAnswers: ${JSON.stringify(answers || {})}` }] })
  return readShape(res?.text)
}
export function readShape(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let j
  try { j = JSON.parse(m[0]) } catch { return null }
  const arr = (v, n = 8) => Array.isArray(v) ? v.map(x => clean(typeof x === 'string' ? x : x?.name, 80)).filter(Boolean).slice(0, n) : []
  return {
    family: FAMILY_IDS.includes(j.family) ? j.family : '',
    title: clean(j.title, 60), size: SIZES.includes(j.size) ? j.size : '',
    subject: clean(j.subject, 30).toLowerCase().replace(/[^a-z -]/g, ''), setting: clean(j.setting, 160), view: clean(j.view, 120),
    cast: Array.isArray(j.cast) ? j.cast.slice(0, 8).map(r => ({ name: clean(r?.name, 40), role: clean(r?.role, 40), look: clean(r?.look, 200) })).filter(r => r.name) : [],
    lists: Object.fromEntries(['buildings', 'resources', 'tiles', 'enemies', 'pieces', 'things'].map(k => [k, arr(j.lists?.[k])]).filter(([, v]) => v.length))
  }
}
