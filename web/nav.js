// Where the person is (docs/specs/34-navigation-state.md): one slice, changed only by the actions
// below. step(state, action) is pure: it returns { state } (the next state) or { refused } (why not),
// and a refused action changes nothing, so a mixed screen (one project's name over another's pages,
// a player over Projects) is never drawn. The stream never picks the build: it can only say that a
// build the person started has begun (streamed).
import { stateSlice } from './store.js'

export const ROOMS = ['home', 'overview', 'deck', 'app', 'game', 'video', 'plan', 'brand']
// the rooms that show a build
const BUILD_ROOMS = new Set(['overview', 'deck', 'app', 'video'])
// where the player can open over the build
const PLAY_ROOMS = new Set(['overview', 'deck', 'app'])
const PLAYER = new Set(['prototype', 'visitor'])

export const START = Object.freeze({ room: 'home', project: null, version: null, run: null, plan: null, player: 'closed', page: null, replay: false, pending: null, from: null })

const closed = { player: 'closed', page: null }
const no = why => ({ refused: why })
const ok = (s, patch) => ({ state: { ...s, ...patch } })
// a run or project id as the address or a caller gives it: a short plain string, or nothing
const id = v => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : null)

export function step(s, a = {}) {
  switch (a.type) {
    case 'home':
      return ok(s, { room: 'home', ...closed, replay: false, from: null })

    case 'openProject': {
      const version = id(a.version), project = id(a.project)
      if (!version && !project) return no('no project or version named')
      return ok(s, { room: 'overview', project, version, run: version, plan: null, ...closed, replay: false, from: null })
    }

    case 'openVersion': {
      const version = id(a.version)
      if (!version) return no('no version named')
      if (!s.project && !s.version) return no('no project is open')
      const room = BUILD_ROOMS.has(s.room) ? s.room : 'overview'
      return ok(s, { room, version, run: version, ...closed, replay: false, from: null })
    }

    case 'started': {
      const run = id(a.run), room = a.room || 'deck'
      if (!run) return no('a started build needs its run')
      if (!BUILD_ROOMS.has(room)) return no(`a build cannot start in ${room}`)
      return ok(s, { room, project: a.project === undefined ? s.project : id(a.project), version: run, run, plan: null, pending: run, ...closed, replay: false, from: null })
    }

    case 'enterRoom': {
      const room = a.room
      if (room === 'game') {
        const game = id(a.run)
        if (!game) return no('the game room needs the game run')
        if (!s.version) return no('no version is open')
        return ok(s, { room, run: game, ...closed, replay: false, from: null })
      }
      if (!BUILD_ROOMS.has(room)) return no(`${room} is not a room of a build`)
      if (!s.version) return no(`no build is open for ${room}`)
      // the other rooms show the version itself, not its game
      return ok(s, { room, run: s.version, ...closed, replay: room === 'deck' && s.room === 'deck' ? s.replay : false, from: null })
    }

    case 'openPlan': {
      const plan = id(a.plan)
      if (!plan) return no('no plan named')
      return ok(s, { room: 'plan', plan, ...closed, replay: false, from: null })
    }

    case 'openBrand':
      return ok(s, { room: 'brand', ...closed, replay: false, from: s.room === 'brand' ? s.from : s.room })

    case 'leaveBrand': {
      if (s.room !== 'brand') return no('no brand sheet is open')
      const back = s.from && (s.from === 'home' || s.from === 'plan' || s.version) ? s.from : 'home'
      return ok(s, { room: back, from: null })
    }

    case 'play': {
      const mode = a.mode || 'prototype'
      if (!PLAYER.has(mode)) return no(`no player mode ${mode}`)
      if (!PLAY_ROOMS.has(s.room)) return no(`the player does not open in ${s.room}`)
      if (!s.run) return no('no build to play')
      if (a.pages === 0) return no('the build has no pages yet')
      return ok(s, { player: mode, page: id(a.page) || s.page })
    }

    case 'playPage':
      if (s.player === 'closed') return no('the player is closed')
      return ok(s, { page: id(a.page) })

    case 'stopVisitor':
      if (s.player !== 'visitor') return no('no visitor is walking')
      return ok(s, { player: 'prototype' })

    case 'closePlayer':
      return ok(s, closed)

    case 'replay':
      if (a.on && s.room !== 'deck') return no('a replay plays in the Design deck')
      return ok(s, { replay: !!a.on })

    case 'streamed':
      // news from the stream: a build the person started has begun. Nothing else here changes
      return ok(s, s.pending && a.run === s.pending ? { pending: null } : {})

    case 'fromAddress':
      return fromAddress(a.search)

    default:
      return no(`no action ${a.type}`)
  }
}

// The address names the same state and nothing else (spec 34):
//   ?project=<id>&version=<run>&room=<room>&run=<game run>&plan=<id>&play=<prototype|visitor>&page=<id>
// ?run=<id> alone (the old form) opens that build's Overview; ?replay=<id> replays it in the deck.
export function toAddress(s) {
  const q = new URLSearchParams()
  const room = s.room === 'brand' ? s.from || 'home' : s.room
  if (room === 'plan' && s.plan) { q.set('room', 'plan'); q.set('plan', s.plan) }
  else if (room !== 'home' && s.version) {
    if (s.project) q.set('project', s.project)
    q.set('version', s.version)
    if (room !== 'overview') q.set('room', room)
    if (room === 'game' && s.run) q.set('run', s.run)
    if (s.player !== 'closed') { q.set('play', s.player); if (s.page) q.set('page', s.page) }
  }
  const t = q.toString()
  return t ? `?${t}` : ''
}

// What an address asks for, checked by the same rules: anything that does not fit is dropped and
// the rest stands (a play= on Projects opens Projects, a room for no build opens nothing).
export function fromAddress(search = '') {
  const q = new URLSearchParams(search)
  const get = k => id(q.get(k))
  let s = { ...START }
  const apply = a => { const r = step(s, a); if (r.state) s = r.state; return !!r.state }
  if (q.get('replay') && get('replay')) {
    apply({ type: 'openProject', version: get('replay') })
    apply({ type: 'enterRoom', room: 'deck' })
    apply({ type: 'replay', on: true })
    return { state: s }
  }
  if (q.get('room') === 'plan') { apply({ type: 'openPlan', plan: get('plan') }); return { state: s } }
  const version = get('version') || get('run')
  if (!version && !get('project')) return { state: s }
  apply({ type: 'openProject', project: get('project'), version: version })
  const room = q.get('room')
  if (room === 'game') apply({ type: 'enterRoom', room, run: get('version') ? get('run') : null })
  else if (room && room !== 'overview') apply({ type: 'enterRoom', room })
  if (q.get('play')) apply({ type: 'play', mode: q.get('play'), page: get('page') })
  return { state: s }
}

// The slice and its one door. dispatch(action) → the new state, or null when it was refused
// (logged, so an impossible transition shows in the console instead of on screen).
export function makeNav({ log = (...m) => console.warn(...m) } = {}) {
  const slice = stateSlice('nav', { ...START })
  const dispatch = a => {
    const r = step({ ...slice.state }, a)
    if (r.refused) { log(`nav: refused ${a?.type}: ${r.refused}`); return null }
    const changed = Object.keys(r.state).some(k => r.state[k] !== slice.state[k])
    if (changed) slice.set(r.state)
    return slice.state
  }
  return { get state() { return slice.state }, dispatch, on: slice.on, address: () => toAddress(slice.state) }
}
