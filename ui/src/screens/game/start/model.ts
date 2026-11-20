// Starting a game (web/canvas/rooms.js "game mode", "cast from real models", "the bench"; web/workshop.js): what the
// questions, the spec card, the Cast step and Shape it keep, and the rules they follow. The same rules as the classic
// files, so both apps start a game the same way. No React here: ui/test/gamestart.test.mjs runs it as it is.

// ---------- the questions and the spec (engine/game.mjs QUESTIONS, writeSpec)
export interface Question { id: string, q: string, chips: string[] }
export type Answers = Record<string, string>
// the spec the planner writes: its lines are edited on the card; the rest passes through to the build
export interface Spec {
  title: string
  pitch?: string
  engine?: string
  original?: string
  enemies?: (string | { name?: string })[] | string
  answers?: Answers
  brand?: { name: string, url?: string, from?: string } | null
  cast?: unknown[]
  [line: string]: unknown
}

// names of a spec's list (a big spec's entries are objects with a name)
export const gameList = (v: unknown): string => (Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : (x as { name?: string })?.name || '')).join(', ') : String(v || ''))

// the card's lines, in order; Engine is the planner's and is not edited
export const SPEC_ROWS = ['Setting', 'Hero', 'Enemies', 'Loop', 'Progression', 'Controls', 'Win', 'Lose', 'Look', 'Sound', 'Engine'] as const
export const specLine = (s: Spec, row: string): string => (row === 'Enemies' ? gameList(s.enemies) : String(s[row.toLowerCase()] ?? ''))

// one edited line goes into the spec (rooms.js readSpecEdits): an emptied line keeps what it had; a big spec's
// enemies stay objects unless that line changed
export function specEdit(s: Spec, key: string, text: string): Spec {
  const v = text.trim()
  if (key === 'enemies') return v !== gameList(s.enemies) ? { ...s, enemies: v.split(/\s*,\s*/).filter(Boolean) } : s
  return v ? { ...s, [key]: v } : s
}

// the walk's steps, for an unfinished one offered again ("Continue … 3/7")
export const WALK = ['design', 'story', 'world', 'heroes', 'enemies', 'levels', 'sound'] as const
export const walkAt = (step?: string) => Math.max(1, WALK.indexOf(step as typeof WALK[number]) + 1)

// ---------- the Cast step (specs 19 and 20; docs/engines/meshy.md "Cast step")
export interface Role { id: string, label: string, name?: string, look?: string }
// a licence-checked model from VRoid Hub or Sketchfab (engine/cast.mjs searchCast)
export interface Model {
  source: string, id: string, n: number, name: string, preview?: string, creator?: string, url?: string, triangles?: number
  licence?: { credit?: string, restyle?: boolean }
  [more: string]: unknown
}
// a Meshy job (engine/meshy.mjs meshyJobs): stage is queued, model, rig, download; pick is the cast entry once made
export interface Job {
  id?: string, role?: string, state: 'running' | 'done' | 'failed', stage?: string, progress?: number, worker?: string, error?: string
  pick?: { thumbSrc?: string, [more: string]: unknown }
  // when this stage began and when the job ended, as this page saw them (the tile's motion keeps its place)
  stageAt?: number, endedAt?: number
}
export interface Own { art: string, job: Job | null }
export type Picked = { key: string, [more: string]: unknown }
export interface Cast {
  roles: Role[]
  violent?: boolean
  // the role shown, each role's shortlist, each role's pick, and the open card ('own' or `${source}:${id}`)
  role: number
  lists: Record<string, { busy?: boolean, models: Model[], error?: string }>
  picks: Record<string, Picked>
  sel: string | null
  // the project's own art per role, and what Meshy can do here (null until asked)
  own: Record<string, Own>
  meshy: { ready: boolean, cost: number, art: string[] } | null
  // /cast on a build: no shortlist and no build, only the characters
  only?: boolean
  adding: number
  done: boolean
}
export const newCast = (o: Partial<Cast> = {}): Cast => ({ roles: [], role: 0, lists: {}, picks: {}, sel: null, own: {}, meshy: null, adding: 0, done: false, ...o })

// a picture the person adds becomes a role, named from its file ("00a-messenger.png" -> Messenger)
export const roleLabel = (name: string) => String(name).replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[a-z]?[-_ ]+/i, '').replace(/[-_]+/g, ' ').trim().replace(/^./, ch => ch.toUpperCase()) || 'Character'
// a role id nobody has yet
export function freeRole(roles: Role[], id: string): string {
  let out = id, n = 2
  while (roles.some(r => r.id === out)) out = `${id}-${n++}`
  return out
}

// the bench: every Meshy job of this cast
export const castJobs = (c: Cast) => c.roles.map((r, i) => ({ r, i, o: c.own[r.id] })).filter((x): x is { r: Role, i: number, o: Own & { job: Job } } => !!x.o?.job)
export const makingJobs = (c: Cast) => castJobs(c).filter(x => x.o.job.state === 'running')
// the roles "Make all" would make: a picture, nothing made or being made
export const makeable = (c: Cast): Role[] => (c.meshy?.ready ? c.roles.filter(r => c.own[r.id]?.art && !['running', 'done'].includes(c.own[r.id].job?.state || '')) : [])
// the server names a batch's jobs by the role id it cleaned (engine/meshy.mjs)
export const jobRole = (id: string) => id.replace(/[^\w-]/g, '').slice(0, 40)
// a poll's answer takes the old job's place: when its stage began is kept while the stage is the same
export function jobNext(was: Job, j: Job, now: number): Job {
  return { ...j, ...(j.state !== 'running' ? { endedAt: now } : {}), stageAt: j.stage !== was.stage ? now : was.stageAt }
}
export const STAGE_WORD: Record<string, string> = { queued: 'waiting', model: 'sculpting', rig: 'rigging', download: 'carrying' }
export const stageOf = (j: Job) => (j.state === 'failed' ? 'failed' : j.stage || 'queued')
// joints in the tile's 60 × 100 box (head, neck, shoulders, elbows, hands, hips, knees, feet) and the bones between
export const JOINTS: [number, number][] = [[30, 14], [30, 27], [19, 31], [41, 31], [14, 46], [46, 46], [12, 60], [48, 60], [30, 52], [24, 56], [36, 56], [23, 74], [37, 74], [22, 92], [38, 92]]
export const BONES: [number, number][] = [[0, 1], [1, 8], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [8, 9], [8, 10], [9, 11], [10, 12], [11, 13], [12, 14]]

// the picked cast as the build takes it: one model per role, without what only the page drew with
export const castForBuild = (c: Cast) => Object.values(c.picks).map(({ key: _k, n: _n, preview: _p, thumbSrc: _t, ...m }) => m)
// a role's pick when the project's own art stands in as a 2.5D sprite (no Meshy key: free, picked at once)
export const spritePick = (r: Role, art: string): Picked => ({ key: 'own', role: r.id, label: r.label, source: 'art', format: 'sprite', art, name: `${r.label} (sprite)`, creator: 'this project' })

// ---------- Shape it (web/workshop.js, engine/workshop.mjs)
export const STEPS: [string, string][] = [['design', 'Game'], ['story', 'Story'], ['world', 'World'], ['heroes', 'Hero'], ['enemies', 'Enemies'], ['levels', 'Levels'], ['sound', 'Sound']]
export const HEAD: Record<string, string> = { design: 'How does it play?', story: 'What is the story?', world: 'Where is it set?', heroes: 'Who do you play?', enemies: 'Who stands in the way?', levels: 'The first stage', sound: 'How does it sound?' }
export const POSES = ['idle', 'run', 'jump', 'attack', 'hurt', 'win']
// one of a step's options: a painted picture, the hero's sprite sheet, a level map, a music loop
export interface Option {
  id: string, name: string
  state?: 'painting' | 'done' | 'failed', src?: string
  sprite?: { state?: string, src?: string }
  map?: string[]
  [line: string]: unknown
}
export interface Workshop {
  id: string, step?: string, run?: string
  spec?: Spec
  options?: Record<string, Option[]>
  picks?: Record<string, { id?: string, ids?: string[] }>
  done?: string[]
  voices?: { key: string, about: string }[]
  voiceSrc?: string
}
// the pick Next writes; nothing picked skips the step and the spec keeps what it had
export function pickOf(step: string, sel: string | null, multi: string[], own: string): { ids: string[], own: string } | { own: string } | { id: string } | null {
  if (step === 'enemies') return multi.length || own ? { ids: multi, own } : null
  return own ? { own } : sel ? { id: sel } : null
}
// the inspector's lines for an option
export function optionRows(step: string, o: Option): [string, string][] {
  const s = (k: string) => String(o[k] ?? '')
  const rows: [string, string][] =
    step === 'design' ? [['Loop', s('loop')], ['Goal', s('goal')], ['Twist', s('twist')], ['Camera', s('camera')]]
      : step === 'story' ? [['Story', s('logline')], ['Hero', s('hero')], ...((o.acts as string[] | undefined) || []).map((a, i): [string, string] => [`Act ${i + 1}`, a])]
        : step === 'world' ? [['Place', s('setting')], ['Palette', s('palette')]]
          : step === 'heroes' ? [['Role', s('role')], ['Look', s('look')], ['Personality', s('personality')]]
            : step === 'enemies' ? [['Kind', s('kind')], ['Moves', s('behaviour')], ['Look', s('look')]]
              : step === 'levels' ? [['Idea', s('idea')]]
                : [['Feel', s('feel')], ['Tempo', `${s('bpm')} bpm, ${s('scale')}`], ['Line', o.line ? `“${s('line')}”` : '']]
  return rows.filter(([, v]) => v)
}

// the music loop: sixteen steps of melody from the option's scale, seeded by its id so it is the same each time
export const SCALES: Record<string, number[]> = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 3, 5, 7, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] }
export function melodyOf(id: string, scaleName: string): { scale: number[], melody: (number | null)[], bass: number[] } {
  const scale = SCALES[scaleName] || SCALES.minor
  let seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const melody = Array.from({ length: 16 }, () => (rnd() < 0.2 ? null : scale[Math.floor(rnd() * scale.length)] + (rnd() < 0.25 ? 12 : 0)))
  return { scale, melody, bass: [0, 0, scale[3] ?? 5, scale[4] ?? 7] }
}
