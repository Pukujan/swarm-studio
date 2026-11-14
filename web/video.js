// @ts-check
// Every video on a board, the chat and the rooms goes through here (image-first boards §3.6). A player costs a
// decoder and its buffers; a picture costs a JPEG. So:
// - a video shows its poster frame (engine/poster.mjs, <clip>.poster.jpg) and holds no player until it is played,
//   hovered, focused, or (an autoplaying clip) on screen;
// - it loads with preload="metadata";
// - it is torn down when it leaves the screen, its page is hidden, it is taken out of the page, or (a clip
//   that was only hovered) it loses focus: pause(), removeAttribute('src'), load(). Taking the element out
//   alone keeps the player;
// - at most 2 play at once (1 on a low-memory machine): a third pauses and tears down the oldest, a clip that
//   plays by itself before one someone pressed play on.
// No frames are decoded here (posters come from the server), so there is no VideoFrame to close.
//
// The canvas and the studio scripts each inline this file (server/page.mjs joins a page's modules into one
// scope, so the names here are prefixed), and both run in one page: the state is one object on globalThis, so
// the budget is the page's. The next Studio uses the same file (`@studio/video`, ui/src/primitives/BoardVideo.tsx).

/** @typedef {{ src: string, poster: string, auto: boolean, at: number, armed: boolean }} VideoClip */
/** @typedef {{ clips: Map<HTMLVideoElement, VideoClip>, playing: HTMLVideoElement[], budget: number, sweeping: any, io: IntersectionObserver | null }} VideoState */

/** @type {VideoState} */
const VIDEOS = /** @type {any} */ (globalThis).__swarmVideos ||= videoState()

function videoState() {
  /** @type {VideoState} */
  const s = { clips: new Map(), playing: [], budget: /** @type {any} */ (globalThis.navigator)?.deviceMemory <= 4 ? 1 : 2, sweeping: 0, io: null }
  if (typeof IntersectionObserver === 'function') s.io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = /** @type {HTMLVideoElement} */ (e.target), c = s.clips.get(v)
      if (!c) continue
      if (e.isIntersecting) { if (c.auto) videoArm(v, true).catch(() => {}) } else videoRelease(v)
    }
  }, { rootMargin: '120px' })
  // the page hidden (another tab, the app minimised): every player goes
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) for (const v of s.clips.keys()) videoRelease(v) })
  return s
}

// '/img/r/playtest-3.webm?v=1' → '/img/r/playtest-3.poster.jpg?v=1'
/** @param {string} src */
export const posterFor = src => {
  const [path, query] = String(src || '').split(/(?=\?)/)
  return /\.(mp4|webm|mov)$/i.test(path) ? path.replace(/\.(mp4|webm|mov)$/i, '.poster.jpg') + (query || '') : ''
}

/** The most that may play at once (1 on a low-memory machine, else 2); `n` sets it. @param {number} [n] */
export function videoBudget(n) {
  if (n !== undefined) { VIDEOS.budget = Math.max(1, n | 0); while (VIDEOS.playing.length > VIDEOS.budget) videoRelease(VIDEOS.playing[0]) }
  return VIDEOS.budget
}

/** What the page holds right now: players with a source, and the ones playing (for tests and the gauge). */
export const videoStats = () => ({
  held: [...VIDEOS.clips.keys()].filter(v => v.hasAttribute('src') || v.networkState !== v.NETWORK_EMPTY).length,
  playing: VIDEOS.playing.length,
  clips: VIDEOS.clips.size
})

/** @param {HTMLVideoElement} v @param {boolean} [play] @returns {Promise<void>} */
function videoArm(v, play = false) {
  const c = VIDEOS.clips.get(v)
  if (!c || !c.src) return Promise.resolve()
  if (!c.armed) {
    c.armed = true
    v.preload = 'metadata'
    v.src = c.src
    if (c.at > 0) v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(c.at, v.duration || c.at) } catch {} }, { once: true })
    videoSweep()
  }
  return play ? v.play() : Promise.resolve()
}

/** Pause it and free its player; its poster shows again. Where it was is kept for next time. @param {HTMLVideoElement} v */
function videoRelease(v) {
  const c = VIDEOS.clips.get(v), i = VIDEOS.playing.indexOf(v)
  if (i >= 0) VIDEOS.playing.splice(i, 1)
  if (!c || !c.armed) return
  c.armed = false
  c.at = v.currentTime || 0
  v.pause()
  v.removeAttribute('src')
  v.load()
}

function videoOnPlaying(/** @type {Event} */ e) {
  const v = /** @type {HTMLVideoElement} */ (e.currentTarget), P = VIDEOS.playing, i = P.indexOf(v)
  if (i >= 0) P.splice(i, 1)
  P.push(v)
  while (P.length > VIDEOS.budget) videoRelease(P.find(x => x !== v && VIDEOS.clips.get(x)?.auto) || P[0])
}
function videoOnPause(/** @type {Event} */ e) {
  const P = VIDEOS.playing, i = P.indexOf(/** @type {HTMLVideoElement} */ (e.currentTarget))
  if (i >= 0) P.splice(i, 1)
}
// hovered or focused: ready to play at a click (native controls need a source); left without playing: freed
function videoOnEnter(/** @type {Event} */ e) { videoArm(/** @type {HTMLVideoElement} */ (e.currentTarget)).catch(() => {}) }
function videoOnLeave(/** @type {Event} */ e) {
  const v = /** @type {HTMLVideoElement} */ (e.currentTarget), c = VIDEOS.clips.get(v)
  if (c && !c.auto && v.paused) videoRelease(v)
}
// a press on a video with no player yet: give it one and play
function videoOnPress(/** @type {Event} */ e) {
  const v = /** @type {HTMLVideoElement} */ (e.currentTarget), c = VIDEOS.clips.get(v)
  if (c && !c.armed) videoArm(v, true).catch(() => {})
}

// a video taken out of the page still holds its player: checked every 2 s while any is held
function videoSweep() {
  if (VIDEOS.sweeping || typeof setInterval !== 'function') return
  VIDEOS.sweeping = setInterval(() => {
    for (const v of [...VIDEOS.clips.keys()]) if (!v.isConnected) dropVideo(v)
    if (![...VIDEOS.clips.values()].some(c => c.armed)) { clearInterval(VIDEOS.sweeping); VIDEOS.sweeping = 0 }
  }, 2000)
}

/**
 * Hand a <video> to the manager. `auto`: it plays (muted, looping as set) while on screen; otherwise it waits
 * for a hover, focus or press. Called again with another src, the same element moves to that clip.
 * @param {HTMLVideoElement} v
 * @param {{ src: string, poster?: string, auto?: boolean, at?: number }} o  at: where to start, in seconds
 * @returns {HTMLVideoElement}
 */
export function boardVideo(v, { src, poster, auto = false, at = 0 }) {
  const was = VIDEOS.clips.get(v)
  if (was && was.src === src) return v
  if (was) videoRelease(v)
  VIDEOS.clips.set(v, { src, poster: poster ?? posterFor(src), auto, at, armed: false })
  v.removeAttribute('autoplay') // the manager starts it, within the budget
  v.preload = 'metadata'
  const p = poster ?? posterFor(src)
  if (p) v.poster = p
  if (v.hasAttribute('src')) { v.removeAttribute('src'); v.load() }
  if (!was) {
    v.addEventListener('playing', videoOnPlaying)
    v.addEventListener('pause', videoOnPause)
    v.addEventListener('pointerenter', videoOnEnter)
    v.addEventListener('focus', videoOnEnter)
    v.addEventListener('pointerleave', videoOnLeave)
    v.addEventListener('blur', videoOnLeave)
    v.addEventListener('pointerdown', videoOnPress)
    VIDEOS.io?.observe(v)
  } else if (auto && v.isConnected) {
    // already on screen: the observer will not say so again
    const r = v.getBoundingClientRect()
    if (r.width && r.bottom > 0 && r.top < innerHeight) videoArm(v, true).catch(() => {})
  }
  return v
}

/** Every `<video data-src>` under `root` (HTML written as a string), handed to the manager. @param {ParentNode} root */
export function adoptVideos(root) {
  for (const v of /** @type {NodeListOf<HTMLVideoElement>} */ (root.querySelectorAll('video[data-src]'))) {
    boardVideo(v, { src: v.dataset.src || '', poster: v.dataset.poster, auto: v.hasAttribute('data-auto') })
  }
}

/** What setVideoHtml last wrote into each element. @type {WeakMap<Element, string>} */
const VIDEO_HTML = new WeakMap()

/**
 * Replace `el`'s HTML: its videos are freed first, and the new `<video data-src>` ones adopted. With `keep`, the
 * same HTML again is not written while one of its videos holds a player: a panel redrawn on every poll (the
 * Overview's inspector) would take the film out of the page while someone watches it.
 * @param {Element} el @param {string} html @param {boolean} [keep]
 */
export function setVideoHtml(el, html, keep = false) {
  if (keep && VIDEO_HTML.get(el) === html && [...el.querySelectorAll('video')].some(v => VIDEOS.clips.get(v)?.armed)) return
  for (const v of /** @type {NodeListOf<HTMLVideoElement>} */ (el.querySelectorAll('video'))) dropVideo(v)
  el.innerHTML = html
  VIDEO_HTML.set(el, html)
  adoptVideos(el)
}

/** Play it now (a press elsewhere, Big screen): it gets its player, within the budget. @param {HTMLVideoElement} v */
export const playVideo = v => videoArm(v, true)

/** Free a video now (a view closed, a card replaced) and stop watching it. @param {HTMLVideoElement} v */
export function dropVideo(v) { videoRelease(v); VIDEOS.io?.unobserve(v); VIDEOS.clips.delete(v) }
