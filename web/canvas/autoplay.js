// @ts-check
// Autoplay in the Game room: an AI player plays the running game (server/autoplay.mjs, engine/aiplayer.mjs)
// and its screen shows over the game, with one line for what it just decided ("going for the crow").
// The switch sits in the App bar beside Crew · Art · Live (web/canvas/stage.js) and belongs to Live: it is
// there once a game runs, a press shows the game live and starts the player, and leaving Live (another view,
// the code, another build, another run) stops it. The same switch, typed: "play it for me", "stop playing".
// The player runs in a browser of its own, so the game underneath is left as the person had it.
// Pure rules first, with tests (tests/autoplayroom.test.mjs); the room (web/canvas/rooms.js) hands in what
// the part that draws needs. Imports nothing from the other areas.

/**
 * The room, as the switch sees it.
 * @typedef {object} AutoplayRoom
 * @property {string | null} [run] the run on screen
 * @property {string} [kind] game, or anything else for an app
 * @property {string | null} [url] the running game's address
 * @property {boolean} [live] the stage shows the live game, in Preview
 */

/**
 * The switch, typed in the chat. Only a message that is one of these, whole: "play it for me, but faster" is
 * a change for the builder, and a bare "stop" is the build's.
 * @param {string} text  @returns {'start' | 'stop' | null}
 */
export function autoplayAsk(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ').replace(/^please /, '').replace(/ please$/, '')
  if (/^(stop playing|stop (the )?autoplay|stop the (ai )?player|autoplay off|turn (the )?autoplay off|turn off (the )?autoplay|let me play|i('ll| will) play( it)?( myself)?)$/.test(t)) return 'stop'
  if (/^(play it for me|play (the game|it) (for me|yourself|by yourself)|autoplay|autoplay on|start (the )?autoplay|turn (the )?autoplay on|turn on (the )?autoplay|let the ai play( it)?|watch (it|the ai) play)$/.test(t)) return 'start'
  return null
}

/**
 * Whether the switch is there: for a game that is running, on a Studio whose server has a player.
 * @param {AutoplayRoom} room  @param {boolean} can
 */
export const autoplayOffered = (room, can) => !!can && room.kind === 'game' && !!room.run && !!room.url

/**
 * What the chat answers when it is asked to play and cannot (never sent to the builder).
 * @param {AutoplayRoom} room  @param {boolean} can
 */
export function autoplayNone(room, can) {
  if (room.kind !== 'game') return 'Only a game can be played for you.'
  if (!room.url) return 'The game is not running yet. Say “show the game”, then ask again.'
  return can ? 'The AI player cannot play this game.' : 'This Studio has no AI player.'
}

/**
 * The switch and the player's screen. `render(room)` after every change of the room; `event(e)` for each
 * `autoplay` event; `say(text)` for a chat message (true when it was one of the typed phrases).
 * @param {object} d
 * @param {HTMLButtonElement | null} d.btn the switch
 * @param {HTMLElement | null} d.cover what lies over the game while the player plays
 * @param {(path: string, opts?: RequestInit) => Promise<Response>} d.api
 * @param {(run: string) => string} d.stream the address of the player's screen
 * @param {(name: string) => string} d.ico
 * @param {string} d.cursor a crew cursor, shown at work until the first picture
 * @param {() => void} d.showLive pin the Live view, in Preview
 * @param {(text: string) => void} d.botMsg
 * @param {(text: string) => void} d.youSaid
 */
export function autoplayRoom(d) {
  const img = d.cover?.querySelector('img') || null, wait = /** @type {HTMLElement | null} */ (d.cover?.querySelector('.app-skel') || null), line = /** @type {HTMLElement | null} */ (d.cover?.querySelector('.app-auto-say') || null)
  const bot = wait?.querySelector('.as-bot')
  if (bot) bot.innerHTML = d.cursor
  // open: the server has a player for this run, so its stream can be asked for. stopping: a stop was sent, and
  // the decisions still on their way must not switch it back on.
  /** @type {{ run: string | null, can: boolean, asked: boolean, on: boolean, open: boolean, live: boolean, stopping: boolean, say: string }} */
  const st = { run: null, can: false, asked: false, on: false, open: false, live: false, stopping: false, say: '' }
  /** @type {AutoplayRoom} */
  let room = {}
  // the question to the server, while it is on its way: a typed "play it for me" waits for its answer
  /** @type {Promise<void> | null} */
  let asking = null
  const path = (/** @type {string} */ run) => `/api/runs/${encodeURIComponent(run)}/autoplay`
  const post = (/** @type {string} */ run, /** @type {object} */ body) => d.api(path(run), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const out = await r.json().catch(() => ({})); if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`); return out })
  // the first picture has arrived when the server says so, or when the stream's first frame is drawn
  if (img) img.onload = () => { if (st.on && !st.live) { st.live = true; draw() } }

  function draw() {
    const offered = autoplayOffered(room, st.can), on = st.on && offered
    if (d.btn) {
      d.btn.hidden = !offered
      d.btn.classList.toggle('on', on)
      d.btn.setAttribute('aria-pressed', String(on))
      // the icon swaps inside the button; its name and its width stay
      const want = on ? 'square-stop' : 'play'
      if (d.btn.dataset.ico !== want) { d.btn.dataset.ico = want; d.btn.innerHTML = `${d.ico(want)}Autoplay` }
    }
    if (!d.cover) return
    d.cover.hidden = !on
    if (img) {
      // the stream is asked for once the server has a player for this run (a 404 before that would end it)
      if (on && st.open && st.run && !img.getAttribute('src')) img.src = d.stream(st.run)
      if (!on && img.getAttribute('src')) img.removeAttribute('src')
      img.hidden = !st.live
    }
    if (wait) wait.hidden = st.live
    if (line) { line.hidden = !st.say; if (line.textContent !== st.say) line.textContent = st.say }
  }

  /** @param {string} run */
  function off(run) {
    const was = st.on
    Object.assign(st, { on: false, open: false, live: false, say: '', stopping: was || st.stopping })
    if (was) post(run, { stop: true }).catch(() => {})
  }

  async function start() {
    if (!autoplayOffered(room, st.can) || st.on) return
    const run = /** @type {string} */ (room.run)
    d.showLive()
    Object.assign(st, { on: true, open: false, live: false, stopping: false, say: 'starting' })
    draw()
    try {
      const v = await post(run, { start: true })
      // switched off, or another run shown, while it started: that stop came before there was a player
      if (room.run !== run || !st.on) return void post(run, { stop: true }).catch(() => {})
      Object.assign(st, { on: !!v.on, open: !!v.on, live: !!v.live, say: v.say || st.say })
    } catch (err) {
      if (room.run !== run) return
      Object.assign(st, { on: false, open: false, live: false, say: '' })
      d.botMsg(`The AI player could not start: ${String(/** @type {Error} */ (err).message || err).split('\n')[0].slice(0, 200)}`)
    }
    draw()
  }
  function stop() {
    if (room.run) off(room.run)
    draw()
  }
  if (d.btn) d.btn.onclick = () => (st.on ? stop() : start())

  return {
    /** @param {AutoplayRoom} now */
    render(now) {
      const before = room.run || null
      room = now
      const run = now.run || null
      if (before !== run) {
        // another run on screen: the player of the one before stops
        if (st.on && before) post(before, { stop: true }).catch(() => {})
        Object.assign(st, { run, can: false, asked: false, on: false, open: false, live: false, stopping: false, say: '' })
      }
      // asked once per run, when its game runs: whether this server has a player, and whether one plays already
      if (run && now.kind === 'game' && now.url && !st.asked) {
        st.asked = true
        asking = d.api(path(run)).then(r => (r.ok ? r.json() : null)).then(v => {
          if (!v || room.run !== run) return
          st.can = true
          if (v.on && room.live && !st.stopping) Object.assign(st, { on: true, open: true, live: !!v.live, say: v.say || '' })
          draw()
        }).catch(() => {})
      }
      // it belongs to Live: another view, the code or a game that stopped ends the play
      if (st.on && run && !(now.live && now.url)) off(run)
      draw()
    },
    /** @param {{ run?: string, on?: boolean, live?: boolean, say?: string, line?: string }} e */
    event(e) {
      if (!e.run || e.run !== room.run) return
      if (e.on === false) {
        const was = st.on
        Object.assign(st, { on: false, open: false, live: false, stopping: false, say: '' })
        // a play that ended by itself says what it did, once, in the chat
        if (was && e.line) d.botMsg(e.line)
      } else if (room.live && !st.stopping) Object.assign(st, { on: true, open: true, live: !!e.live || st.live, say: e.say || st.say })
      draw()
    },
    /** @param {string} text */
    say(text) {
      const want = room.run ? autoplayAsk(text) : null
      if (!want) return false
      d.youSaid(text)
      if (want === 'stop') { if (st.on) stop(); else d.botMsg('The AI player is not playing.') }
      else Promise.resolve(asking).then(() => { if (!autoplayOffered(room, st.can)) d.botMsg(autoplayNone(room, st.can)); else if (!st.on) start() })
      return true
    },
    /** the room is left (another view): the play ends */
    leave() { if (st.on) stop() },
    /** what the switch shows now, for tests and the room */
    now: () => ({ ...st, offered: autoplayOffered(room, st.can) }),
  }
}
