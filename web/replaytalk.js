// @ts-check
// Replay in words (☰ → Replay, web/canvas/replay.js). A replay is a recording of how a version was made: nothing
// is built while it plays. The owner (2026-11-14): "what does replay actually do? does it simulate and walk back
// how the app was made or does it actually build another version of the app?" So everything a replay shows says
// Replay, and the chat answers for it. Pure rules here, with tests (tests/replaytalk.test.mjs); the canvas
// (web/canvas/replay.js, rooms.js, panels.js, loop.js) only shows what these say.

/** The one word of the mark: the canvas strip and the App room's pill read it for the whole replay. */
export const REPLAY_WORD = 'Replay'

/** How far along the replay is, from 0 to 1, as the mark shows it ("42%").  @param {number} at */
export const replayPct = at => `${Math.round(Math.max(0, Math.min(1, Number(at) || 0)) * 100)}%`

/**
 * The canvas strip's words: a live build counts its agents ("3 agents building"); a replay never reads as work
 * going on, it reads Replay and how far the recording is.
 * @param {{ replay?: boolean, at?: number, state: string, working?: number, pages?: number, done?: number, total?: number }} o
 * @returns {{ text: string, num: string }}
 */
export function statusWords(o) {
  if (o.replay) return { text: REPLAY_WORD, num: replayPct(o.at || 0) }
  const n = o.working || 0
  const text = { idle: 'Ready', planning: 'Planning the pages', done: `${o.pages || 0} pages built`, working: `${n} agent${n === 1 ? '' : 's'} building`, paused: 'Stopped' }[o.state] || ''
  return { text, num: o.total ? `${o.done || 0}/${o.total}` : '' }
}

/**
 * The chat's progress line. Live: who is building and how far. In a replay: the same count, said as a record.
 * @param {{ replay?: boolean, plan?: string, working?: number, done?: number, total?: number, pages?: number }} o
 */
export function progressLine(o) {
  if (!o.total) return o.replay ? 'Replay: the pages being planned' : 'Planning the pages…'
  const far = `${o.done || 0}/${o.total} sections across ${o.pages || 0} pages`
  return o.replay ? `Replay: ${far}` : `${o.plan ? `${o.plan} ` : ''}${o.working || 0} agents building · ${far}`
}

/**
 * The App room's pill. Live: building, running, built… In a replay: Replay and how far, whatever the recording
 * is showing.
 * @param {{ replay?: boolean, at?: number, state?: string, url?: string | null, hasApp?: boolean }} o
 */
export function appPill(o) {
  if (o.replay) return `${REPLAY_WORD} ${replayPct(o.at || 0)}`
  const st = o.state
  return st === 'working' ? 'building' : st === 'done' ? (o.url ? 'running' : 'built') : st === 'failed' ? 'failed' : st === 'stopped' ? 'stopped' : st === 'paused' ? 'your turn' : o.hasApp ? 'built' : 'no app yet'
}

export const REPLAY_SAYS = {
  // asked while one plays: "is this building?", "what is this?"
  what: 'This is a replay of how this version was made. Nothing is being built. Say “stop” to end it.',
  // asked with none playing: "what does replay do?"
  about: 'A replay plays back how this version was made, from its saved record. Nothing is built. Say “replay” to watch it.',
  stopped: 'Stopped the replay. The finished version is back.',
  // something else was asked for while one played: it ends first, and the chat says so
  first: 'Stopped the replay first.',
  none: 'There is no finished version here to replay yet.',
  idle: 'No replay is playing.'
}

const RP_STOP = /^(?:please )?(?:stop|end|quit|exit|cancel|close|leave)(?: it| this| that| the replay| replay| replaying| the recording)?(?: please| now)?$/
const RP_START = /^(?:please )?(?:replay|replay (?:it|this|that|the build|this build|this version|the version)|(?:play|show|watch|see|start|run)(?: me)?(?: the| a)? replay|play (?:it|this|the build) (?:back|again)|watch (?:it|this|the build) (?:again|being (?:built|made)))(?: please| again)?$/
const RP_ASKS = /^(?:is|are|was|were|what|whats|what's|why|how|does|did|do|am|can|will|wait)\b/
const RP_ABOUT = /\b(?:replay\w*|record\w*|build\w*|built|rebuil\w*|live|real|really|simulat\w*|fake|happening|going on|doing|making|made|another version|new version|again)\b|\bwhat(?:'s| is|s) (?:this|that|it)\b|\bwhat am i\b/

/**
 * Where a typed message goes because of a replay, before any other route of the chat.
 * `on`: a replay is playing. While one plays: "stop" ends it, a question about what is on screen ("is this
 * building?", "what is this?") gets the one true line, "replay" is answered the same way, and anything else
 * ('first') ends the replay before the chat does what was asked. With none playing: "replay" starts one, a
 * question about replay is answered, "stop replay" says none is playing, and every other message is not a
 * replay's business (null).
 * @param {string} text  @param {boolean} on
 * @returns {'stop' | 'what' | 'start' | 'about' | 'idle' | 'first' | null}
 */
export function replayAsk(text, on) {
  const raw = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const t = raw.replace(/[.!?]+$/, '')
  if (!t) return null
  const asks = raw.endsWith('?') || RP_ASKS.test(t)
  if (on) {
    if (RP_STOP.test(t)) return 'stop'
    if (RP_START.test(t)) return 'what'
    if (asks && RP_ABOUT.test(t)) return 'what'
    return 'first'
  }
  if (RP_START.test(t)) return 'start'
  if (/\breplay\w*\b/.test(t) && RP_STOP.test(t)) return 'idle'
  if (asks && /\breplay\w*\b/.test(t)) return 'about'
  return null
}
