// What the server answers while a game is started, for the stories (GameStart, Cast, ShapeIt): the questions
// (engine/game.mjs QUESTIONS), a spec the planner would write, a cast shortlist, Meshy's state and a walk.
import type { ChatApi } from '../../../chat'
import type { Model, Option, Question, Spec, Workshop } from './model'

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
// a server that answers each path from the table; a path not in it waits forever (a slow answer)
export function serve(answers: Record<string, unknown | ((init?: RequestInit) => Response)>): ChatApi {
  return async (path, init) => {
    const at = path.split('?')[0]
    if (!(at in answers)) return new Promise<Response>(() => {})
    const a = answers[at]
    return typeof a === 'function' ? (a as (init?: RequestInit) => Response)(init) : json(a)
  }
}

// a picture as the crew would paint it: a plain frame in the Studio's own greys
export const pic = (label: string, w = 300, h = 400) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#2a2a2d"/><circle cx="${w / 2}" cy="${h * 0.3}" r="${w * 0.14}" fill="#52525b"/><rect x="${w * 0.3}" y="${h * 0.45}" width="${w * 0.4}" height="${h * 0.4}" rx="12" fill="#52525b"/><text x="${w / 2}" y="${h - 14}" fill="#a1a1aa" font-family="sans-serif" font-size="18" text-anchor="middle">${label}</text></svg>`)}`

// a hero's sprite sheet as the crew paints it: 3 × 2 equal cells, one pose in each
export const sheet = () => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="800" viewBox="0 0 900 800"><rect width="900" height="800" fill="#2a2a2d"/>${['idle', 'run', 'jump', 'attack', 'hurt', 'win'].map((p, i) => { const x = (i % 3) * 300, y = Math.floor(i / 3) * 400; return `<circle cx="${x + 150 + (i - 2) * 8}" cy="${y + 120 - (i === 2 ? 40 : 0)}" r="42" fill="#71717a"/><rect x="${x + 90 + (i - 2) * 8}" y="${y + 180 - (i === 2 ? 40 : 0)}" width="120" height="160" rx="12" fill="#52525b"/><text x="${x + 150}" y="${y + 384}" fill="#a1a1aa" font-family="sans-serif" font-size="20" text-anchor="middle">${p}</text>` }).join('')}</svg>`)}`

export const QUESTIONS: Question[] = [
  { id: 'type', q: 'What kind of game?', chips: ['Roguelike', 'Platformer', 'Puzzle', 'Tower defense', 'Card game', 'Arcade shooter', 'Racing', 'Idle'] },
  { id: 'like', q: 'Similar to what? (only the feel; the world will be new)', chips: ['Nothing in particular'] },
  { id: 'look', q: 'What should it look like?', chips: ['3D neon', '3D low-poly', '2D pixel art', '2D flat and bold', 'Hand-drawn'] },
  { id: 'target', q: 'Make it for?', chips: ['Web (plays here)', 'Godot', 'Unity', 'Unreal'] }
]

export const SPEC: Spec = {
  title: 'Lantern Run', pitch: 'Carry the last flame through a city that has forgotten the dark.', engine: 'three.js (plays here)',
  setting: 'A canal city at night, strung with dead lanterns', hero: 'Wick, a lamplighter with one flame left', enemies: ['Soot crows', 'Moth swarms', 'The Snuffer'],
  loop: 'Dash between lanterns, light them, keep the flame fed', progression: 'Each lit district opens a new route', controls: 'Keyboard + mouse',
  win: 'Light the great lantern on the clock tower', lose: 'The flame goes out', look: '3D low-poly, warm light on blue stone', sound: 'Music box and rain',
  answers: { type: 'Roguelike', look: '3D low-poly' }
}
export const ROLES = [{ id: 'hero', label: 'Hero', name: 'Wick, the lamplighter', look: 'a small lamplighter in a long coat' }, { id: 'rival', label: 'Rival', name: 'The Snuffer' }]

export const MODELS: Model[] = ['Lamplighter', 'Night watch', 'Courier', 'Street kid'].map((name, i) => ({
  source: i % 2 ? 'vroid' : 'sketchfab', id: `m${i}`, n: i + 1, name, preview: pic(name), creator: ['ada_k', 'studio-moss', 'pip', 'northlight'][i],
  url: 'https://sketchfab.com/', triangles: 18000 + i * 9000, licence: { credit: 'CC BY 4.0', restyle: i !== 1 }
}))
export const ART = ['Wick', 'Snuffer', 'Crow'].map(n => ({ src: pic(n) }))

const opt = (id: string, name: string, more: Partial<Option> = {}): Option => ({ id, name, ...more })
export const WALK: Workshop = {
  id: 'w-lantern01', step: 'heroes', spec: SPEC, done: ['design', 'story', 'world'],
  voices: [{ key: 'calm', about: 'Calm: a low, even voice' }, { key: 'bright', about: 'Bright: quick and warm' }],
  options: {
    design: [
      opt('d1', 'Flame run', { loop: 'Dash, light, feed the flame', goal: 'Light every district', twist: 'The flame shrinks while you stand still', camera: 'Third person' }),
      opt('d2', 'Shadow tag', { loop: 'Hide in light, strike from it', goal: 'Outlast the night', twist: 'Enemies only move in the dark', camera: 'Top down' }),
      opt('d3', 'Relay', { loop: 'Pass the flame between lamplighters', goal: 'Reach the tower', twist: 'You are whoever holds the flame', camera: 'Side on' })
    ],
    heroes: [
      opt('h1', 'Wick', { role: 'Lamplighter', look: 'Long coat, brass pole', personality: 'Stubborn and kind', state: 'done', src: pic('Wick'), sprite: { state: 'done', src: sheet() } }),
      opt('h2', 'Ember', { role: 'Runaway apprentice', look: 'Patched cloak, a jar of sparks', personality: 'Quick, reckless', state: 'done', src: pic('Ember') }),
      opt('h3', 'Old Tallow', { role: 'The last watchman', look: 'Heavy lantern on a chain', personality: 'Slow, certain', state: 'painting' }),
      opt('h4', 'Flint', { role: 'Chimney thief', look: 'Soot mask', personality: 'Dry', state: 'failed' })
    ],
    levels: [
      opt('l1', 'The canal', { idea: 'Ledges over water, crows from the right', map: ['################################', '#S.......C....=====.....E......#', '#....====.........^^^.....=====#', '#...........C..............E..X#', '################################'] }),
      opt('l2', 'Rooftops', { idea: 'A climb with a boss at the top', map: ['#..............................#', '#.............B...............X#', '#....======.......=====.....===#', '#S..........^^^^...............#', '################################'] })
    ],
    sound: [
      opt('m1', 'Embers', { feel: 'Warm and patient', bpm: 96, scale: 'dorian', wave: 'triangle', drums: 'soft', line: 'One more light before dawn.' }),
      opt('m2', 'Night market', { feel: 'Busy and bright', bpm: 128, scale: 'pentatonic', wave: 'square', drums: 'breakbeat', line: 'Keep moving.' }),
      opt('m3', 'Rain', { feel: 'Quiet, a little sad', bpm: 80, scale: 'minor', wave: 'sine', drums: 'none' })
    ]
  }
}
