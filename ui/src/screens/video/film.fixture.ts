// A film's saved events and answers, for the Film studio's stories and tests: a short film for a tea shop, from its
// start to the critic's line, in the shapes the server sends (server/server.mjs makeVideo).
import type { RunEvent } from '../app/model'
import type { Cut, FilmPart, FilmStatus, Media } from './model'

export const RUN = 'r-river'
const T0 = Date.UTC(2026, 10, 19, 10, 0)
const frame = (fill: string, ink: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="${fill}"/><rect x="1.5" y="5.5" width="7" height="1.4" fill="${ink}"/></svg>`)}`

export const scenes = [
  { kind: 'hero', layer: 'story', seconds: 3.2, camera: 'push-in', cue: 'drop', headline: 'River Hours', image: frame('#22302b', '#e9e2d0') },
  { kind: 'type', layer: 'type', seconds: 1.8, headline: 'Tea, timed by the tide' },
  { kind: 'photo', layer: 'proof', seconds: 2.6, camera: 'pan-left', headline: 'Picked this morning', image: frame('#3b4a3f', '#f3c98b') },
  { kind: 'black', layer: 'type', seconds: 0.6, headline: '' },
  { kind: 'quote', layer: 'proof', seconds: 2.4, headline: '“The only cup I slow down for.”' },
  { kind: 'cta', layer: 'story', seconds: 2.8, camera: 'pull-out', speed: 2, headline: 'Open from six', image: frame('#1b2420', '#c4623a') }
]
const notes = {
  from: [{ what: 'moodboard.png' }], palette: ['#22302b', '#e9e2d0', '#c4623a', '#f3c98b'], type: 'A tall serif over a small mono', pacing: 'Slow, then three quick cuts',
  cutRhythm: { text: 'On the bar, twice on the half' }, camera: 'Slow pushes', mood: 'Early, quiet', music: { tempo: 84, instruments: ['piano', 'brushes'], structure: 'A build with one drop' }
}

const start: RunEvent = { type: 'run:start', run: RUN, t: T0, title: 'River Hours', brief: 'A tea shop by the river', kind: 'film' }
const asked: RunEvent = { type: 'video:start', run: RUN, t: T0 + 1000, model: 'the planner', prompt: 'Slow, end on the open sign', style: 'calm' }
const story: RunEvent = { type: 'video:story', run: RUN, t: T0 + 9000, title: 'River Hours', pace: 'calm', music: { bpm: 84 }, notes, scenes, cast: { narrator: 'Heart' } }
const done: RunEvent = {
  type: 'video:done', run: RUN, t: T0 + 95000, src: `/video/${RUN}/promo.mp4?v=3`, tall: `/video/${RUN}/promo-tall.mp4?v=3`, square: `/video/${RUN}/promo-square.mp4?v=3`,
  file: '/Users/sam/Swarm Studio/River Hours/video/river-hours-promo-v3.mp4', seconds: 13.4, ms: 94000, voice: true, music: true
}
const review: RunEvent = { type: 'video:review', run: RUN, t: T0 + 99000, state: 'done', ok: true, says: 'every cut lands on the beat; the voice is clear over the music' }

export type FilmCut = 'none' | 'storyboard' | 'rendering' | 'done' | 'failed' | 'no-hermes'
export const filmEvents = (cut: FilmCut): RunEvent[] => ({
  none: [start],
  storyboard: [start, asked],
  rendering: [start, asked, story, { type: 'video:progress', run: RUN, t: T0 + 30000, pct: 42, stage: 'rendering' }],
  done: [start, asked, story, done, review],
  failed: [start, asked, story, { type: 'video:failed', run: RUN, t: T0 + 40000, message: 'The render stopped: Chrome closed before the last frame.' }],
  'no-hermes': [start, asked, { type: 'video:failed', run: RUN, t: T0 + 3000, message: 'Hermes is not running.' }]
} satisfies Record<FilmCut, RunEvent[]>)[cut]

export const filmStatus = (cut: FilmCut): FilmStatus => ({
  none: { state: 'none' as const },
  storyboard: { state: 'working' as const, pct: 0, stage: 'storyboard' },
  rendering: { state: 'working' as const, pct: 42, stage: 'rendering' },
  done: { state: 'done' as const, pct: 100, src: str(done.src), tall: str(done.tall), file: str(done.file) },
  failed: { state: 'none' as const },
  'no-hermes': { state: 'none' as const }
})[cut]
function str(v: unknown) { return typeof v === 'string' ? v : '' }

export const filmPart = (cut: FilmCut): FilmPart | null => ({
  none: null,
  storyboard: { state: 'making' as const, pct: 0, stage: 'storyboard' },
  rendering: { state: 'making' as const, pct: 42, stage: 'rendering' },
  done: { state: 'done' as const, pct: 100 },
  failed: { state: 'failed' as const, reason: { code: 'film', message: 'The render stopped: Chrome closed before the last frame.', action: '' } },
  'no-hermes': { state: 'failed' as const, reason: { code: 'hermes', message: 'Hermes is not running, so nobody can write the storyboard.', action: 'Start it with `hermes gateway`, then try again.' } }
})[cut]

const dir = '/Users/sam/Swarm Studio/River Hours/video'
export const savedCuts: Cut[] = [1, 2, 3].map(n => ({ name: `river-hours-promo-v${n}.mp4`, file: `${dir}/river-hours-promo-v${n}.mp4` }))

export const media: Media = {
  music: { label: 'Music', by: 'the studio’s own score', on: false, key: 'elevenlabs', keyLabel: 'ElevenLabs', keyUrl: 'https://elevenlabs.io/app/settings/api-keys', grant: true, allow: 'hermes mcp allow swarm-studio elevenlabs' },
  clips: { label: 'Clips', by: 'Veo, through Hermes', on: true, via: 'hermes' },
  pictures: { label: 'Pictures', by: 'camera moves on stills', on: false, hint: 'Sign in to a picture model in Hermes to paint new frames.' }
}
