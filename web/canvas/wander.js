// @ts-check
// A crew cursor that works on a tile moves over it. On the build wall the cursors of the art and play-test tiles
// were pinned to one point, so the crew looked still while it worked (the owner, 2026-11-13: "the cursors arent
// moving around like they are supposed to… they are static while they are working"). A working cursor now
// sweeps slowly across its tile and back, with a small rise and fall, each one out of step with the others.
// With reduced motion it stays on its pin.

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A triangle wave, 0 to 1 to 0, with period 1.  @param {number} t */
export const sweep = t => { const f = t - Math.floor(t); return f < 0.5 ? f * 2 : 2 - f * 2 }

/**
 * Where cursor i is on its tile at time now (ms): inside the tile, away from its edges.
 * @param {{ left: number, top: number, width: number, height: number }} tile
 * @param {number} i  @param {number} now
 * @returns {{ x: number, y: number }}
 */
export function wanderOn(tile, i, now) {
  const t = now / 1000
  const x = tile.left + tile.width * (0.14 + 0.66 * sweep(t / (9 + (i % 3) * 2.5) + i * 0.31))
  const y = tile.top + tile.height * (0.5 + 0.2 * Math.sin(t * (0.55 + (i % 4) * 0.13) + i * 1.9))
  return { x, y }
}

/**
 * A pinned cursor's place: on its pin when still, over its tile when working.
 * @param {{ x: number, y: number }} pin  @param {Element | null | undefined} tileEl  @param {number} i
 * @param {boolean} working  @param {number} [now]
 */
export function workSpot(pin, tileEl, i, working, now = performance.now()) {
  if (!working || !tileEl || still()) return pin
  const r = tileEl.getBoundingClientRect()
  return r.width > 80 && r.height > 60 ? wanderOn(r, i, now) : pin
}

/**
 * What the room says to a message when there is nothing built to change yet. It names the thing (game or app)
 * and, when a build was stopped partway, says so and what continues it. (It used to answer every message with
 * "Build the app first", on a game, with a stopped build on screen.)
 * @param {{ kind?: string, state?: string, message?: string, steps?: unknown[] }} app
 */
export function noAppYet(app) {
  const what = app.kind === 'game' ? 'game' : 'app'
  const partway = (app.steps || []).length > 0
  if (partway && (app.state === 'stopped' || app.message === 'stopped')) return `The ${what} build is stopped partway; what is painted and written is kept. Press Go on to continue it. Once it is building again I can answer questions and take changes.`
  if (partway && app.state === 'failed') return `The ${what} build did not finish. Try again from its card; once it is building I can answer questions and take changes.`
  return what === 'game' ? 'There is no game here yet. Start it from this view, then ask or change it by chatting.' : 'Build the app first (the button in this view), then change it by chatting.'
}

/**
 * "go on", "continue", "resume it", "keep going", "try again": the person asks in the chat for a build that
 * stopped or failed partway to be picked up again (the chat works for everything a button does).
 * @param {string} text  @param {{ state?: string, message?: string, steps?: unknown[] }} app
 */
export function goOnAsk(text, app) {
  const partway = (app.steps || []).length > 0 && (app.state === 'stopped' || app.state === 'failed' || app.message === 'stopped')
  return partway && /^\s*(please\s+)?(go on|continue|resume|keep going|carry on|pick (it )?up|try again|retry|start (it )?again|build( it)?( again)?)\b[\w ,.!]{0,24}$/i.test(String(text || ''))
}

// ---------- a big game waiting after a slice whose play test failed
// (the owner, 2026-11-14: a white clip shown as the play test, "can u fix" that fixed nothing, "not sure what its answering")

const PLAY_NO_START = /^(play test failed|still wrong after [^:]*): (No game canvas appeared|The game's screen is blank|The Godot web export did not start|The game did not start)/
/**
 * A play test's step, or a slice: the game never drew, so its film is of an empty page (an older Studio's steps
 * say so only in their words).
 * @param {{ started?: boolean, ok?: boolean, text?: string } | null | undefined} x
 */
export const neverDrew = x => !!x && (x.started === false || (x.ok === false && PLAY_NO_START.test(String(x.text || ''))))

/**
 * What a message typed at a waiting slice asks for: 'fix' sends the crew at the play test's error now, 'go'
 * starts the next slice as planned, 'note' starts it with the words as its note.
 * @param {string} text  @returns {'fix' | 'go' | 'note'}
 */
export function sliceSay(text) {
  const t = String(text || '').trim().replace(/[.!?]+$/, '')
  if (/^(please\s+)?((can|could|will|would)\s+(u|you)\s+)?(just\s+)?(fix|repair|debug|sort)(\s+(it|this|that|them|the\s+(game|error|errors|bug|bugs|crash|issue|issues|problem|problems|play ?test)))?(\s+(now|first|please|then))*$/i.test(t)) return 'fix'
  if (/^(try|fix)\s+(it\s+)?again$/i.test(t)) return 'fix'
  if (/^(looks good\b.*|(please\s+)?(go on|go ahead|continue|carry on|keep going|next( slice)?|go on to .{1,60}|finish it)(\s+anyway)?)$/i.test(t)) return 'go'
  return 'note'
}

/**
 * How a waiting slice reads in the chat: whether its play test failed, whether the game never started, the
 * failure in one line, the question and the answers offered. A slice an older Studio saved has only
 * `play: false` and the build's result, so the words are made here; a newer one brings its own.
 * @param {{ i: number, n: number, name?: string, play?: boolean, started?: boolean, line?: string, skipped?: string, failed?: boolean, ask?: string, ideas?: string[], next?: string, clip?: string }} s
 * @param {{ stages?: { playtest?: { ok?: boolean, problem?: string, skipped?: string, started?: boolean } }[] } | null} [result]
 * @param {{ kind?: string, ok?: boolean, text?: string, clip?: string, started?: boolean }[]} [steps] the build's steps (an older slice's clip may be the film of a test that never drew)
 * noClip: the slice's clip is such a film, so it is not shown
 */
export function sliceWords(s, result = null, steps = []) {
  const pt = result?.stages?.at(-1)?.playtest || null
  const skipped = !!(s.skipped || pt?.skipped)
  const failed = s.play === false && !skipped
  if (!failed) return { failed: false, noStart: false, noClip: false, line: '', ask: s.ask || `Slice ${s.i + 1} is built. Anything to change?`, ideas: s.ideas || [] }
  const lastTest = steps.findLast(x => x.kind === 'test' && x.ok === false && /^(play test failed|still wrong after)/.test(String(x.text || '')))
  const problem = String(pt?.problem || String(lastTest?.text || '').replace(/^[^:]*: /, ''))
  const noStart = s.started === false || pt?.started === false || /No game canvas appeared|The game's screen is blank|web export did not start/.test(problem.split('\n')[0])
  const noClip = noStart || (!!s.clip && steps.some(x => x.clip === s.clip && neverDrew(x)))
  const line = String(s.line || problem.replace(/^A play test of this game failed\. /, '').split(/\. |\n/)[0] || 'the play test failed').slice(0, 200)
  if (s.failed) return { failed, noStart, noClip, line, ask: s.ask || '', ideas: s.ideas || [] }
  const next = s.next ? `start ${s.next} with this as its first job` : 'go on with this as the first job'
  return {
    failed, noStart, noClip, line,
    ask: `Slice ${s.i + 1} of ${s.n}${s.name ? `, ${s.name},` : ''} is built, but ${noStart ? 'the game did not start' : 'its play test failed'}: ${line}. Type "fix it" and the crew goes at this error now, or "go on" to ${next}.`,
    ideas: ['Fix it', s.next ? `Go on to ${s.next}` : 'Go on']
  }
}
