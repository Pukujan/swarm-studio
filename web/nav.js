// Where the person is (docs/specs/34-navigation-state.md): an XState v5 machine. A move it has no
// transition for does not happen, so a mixed screen (one project's name over another's pages, a
// player over Projects) is never drawn. The stream never picks the build: `streamed` only clears
// the wait for a build the person started.
//
//   nav
//   ├─ home                      Projects
//   ├─ draft                     a new project talked through on the Design deck, nothing built yet
//   ├─ plan                      a game plan (or the one a game talk is drafting)
//   ├─ brand                     the brand sheet (context.from: where it was opened from)
//   ├─ studio                    a project's scaffold before its first build (spec 37): context.project, context.step
//   │  └─ brand · references · assets · plan · proposal
//   └─ build                     a version is open
//      ├─ video
//      ├─ game                   context.run is the version's game run
//      └─ playable               parallel: room (overview · deck live|replay · app) and player (closed · prototype · visitor)
import { setup, createActor, assign } from './vendor/xstate/xstate.mjs'

export const ROOMS = ['home', 'draft', 'overview', 'deck', 'app', 'game', 'video', 'plan', 'brand', 'studio']
// the Studio's steps, in order (spec 37); Esc goes up one, and from the first to Projects
export const STEPS = ['brand', 'references', 'assets', 'plan', 'proposal']
const BUILD_ROOMS = ['overview', 'deck', 'app', 'video']
const PLAYABLE = ['overview', 'deck', 'app']
// a run or project id as the address or a caller gives it: a short plain string, or nothing
const id = v => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : null)

const START_CONTEXT = { project: null, version: null, run: null, plan: null, page: null, pending: null, from: null, step: null }
const stepOf = v => (STEPS.includes(v) ? v : null)
const target = room => (room === 'video' || room === 'game' ? `#nav.build.${room}` : `#nav.build.playable.room.${room}`)

// The screen a snapshot shows, as one plain record every consumer and the address read
export function view(snap) {
  const m = s => snap.matches(s)
  const room = m('home') ? 'home' : m('draft') ? 'draft' : m('plan') ? 'plan' : m('brand') ? 'brand' : m('studio') ? 'studio' : m({ build: 'video' }) ? 'video' : m({ build: 'game' }) ? 'game'
    : m({ build: { playable: { room: 'deck' } } }) ? 'deck' : m({ build: { playable: { room: 'app' } } }) ? 'app' : 'overview'
  const player = m({ build: { playable: { player: 'visitor' } } }) ? 'visitor' : m({ build: { playable: { player: 'prototype' } } }) ? 'prototype' : 'closed'
  const replay = m({ build: { playable: { room: { deck: 'replay' } } } })
  return { room, player, replay, ...snap.context, page: player === 'closed' ? null : snap.context.page, step: room === 'studio' || (room === 'brand' && snap.context.from === 'studio') ? snap.context.step : null }
}

// Every room move: to a room of the open version, or to its game
const toRoom = [
  ...BUILD_ROOMS.map(room => ({ guard: ({ event }) => event.room === room, target: target(room), reenter: true, actions: assign({ run: ({ context }) => context.version, page: null }) })),
  { guard: ({ event }) => event.room === 'game' && !!id(event.run), target: target('game'), actions: assign({ run: ({ event }) => id(event.run), page: null }) }
]
// another version of the open project (its project may come with it, when the project list knew it first)
const opened = room => ({ target: target(room), reenter: true, actions: assign({ project: ({ context, event }) => (event.project === undefined ? context.project : id(event.project)), version: ({ event }) => id(event.version), run: ({ event }) => id(event.version), page: null }) })
const playerMoves = {
  close: { target: 'closed' },
  page: { actions: assign({ page: ({ event }) => id(event.page) }) }
}
const playGuard = ({ event }) => event.pages !== 0
const pageOf = ({ context, event }) => id(event.page) || context.page

export const navMachine = setup({}).createMachine({
  id: 'nav',
  context: { ...START_CONTEXT },
  initial: 'home',
  on: {
    home: { target: '.home' },
    'open.project': {
      guard: ({ event }) => !!(id(event.version) || id(event.project)),
      target: '.build.playable',
      reenter: true,
      actions: assign({ project: ({ event }) => id(event.project), version: ({ event }) => id(event.version), run: ({ event }) => id(event.version), plan: null, page: null })
    },
    // a project's Studio, on the step asked for (else its first)
    studio: {
      guard: ({ event }) => !!id(event.project),
      target: '.studio',
      reenter: true,
      actions: assign({ project: ({ event }) => id(event.project), step: ({ event }) => stepOf(event.step) || STEPS[0], version: null, run: null, plan: null, page: null, pending: null })
    },
    started: [
      ...['overview', 'deck', 'app', 'video'].map(room => ({
        guard: ({ event }) => !!id(event.run) && (event.room || 'deck') === room,
        target: target(room),
        reenter: true,
        actions: assign({
          project: ({ context, event }) => (event.project === undefined ? context.project : id(event.project)),
          version: ({ event }) => event.run, run: ({ event }) => event.run, pending: ({ event }) => event.run, plan: null, page: null
        })
      }))
    ],
    // a new project's talk: the deck with nothing on it, no project or build yet
    draft: { target: '.draft', actions: assign({ project: null, version: null, run: null, plan: null, page: null }) },
    // a plan by id, or none yet while a game talk drafts one
    plan: { target: '.plan', actions: assign({ plan: ({ event }) => id(event.plan), page: null }) },
    brand: { target: '.brand', actions: assign({ from: ({ self }) => view(self.getSnapshot()).room }) },
    streamed: { actions: assign({ pending: ({ context, event }) => (context.pending && event.run === context.pending ? null : context.pending) }) }
  },
  states: {
    home: {},
    draft: {},
    studio: {
      on: {
        'studio.step': { guard: ({ event }) => !!stepOf(event.step), actions: assign({ step: ({ event }) => stepOf(event.step) }) },
        back: [
          { guard: ({ context }) => STEPS.indexOf(context.step) > 0, actions: assign({ step: ({ context }) => STEPS[STEPS.indexOf(context.step) - 1] }) },
          { target: 'home' }
        ],
        // the person's Build: the build opens as any started one does (on the deck unless a room is named)
        'studio.built': BUILD_ROOMS.map(room => ({
          guard: ({ event }) => !!id(event.run) && (event.room || 'deck') === room,
          target: target(room),
          actions: assign({ version: ({ event }) => event.run, run: ({ event }) => event.run, pending: ({ event }) => event.run, page: null })
        }))
      }
      // the step stays in the context while the brand sheet is open from here, so Back lands on it
    },
    plan: {},
    brand: {
      // the sheet is open already: a second brand is not a move, and it keeps where it came from
      on: {
        brand: {},
        back: [
          { guard: ({ context }) => context.from === 'plan', target: 'plan' },
          { guard: ({ context }) => context.from === 'draft', target: 'draft' },
          { guard: ({ context }) => context.from === 'studio' && !!context.project, target: 'studio' },
          { guard: ({ context }) => context.from === 'game' && !!context.version && !!context.run, target: target('game') },
          ...BUILD_ROOMS.map(room => ({ guard: ({ context }) => context.from === room && !!context.version, target: target(room) })),
          { target: 'home' }
        ]
      },
      exit: assign({ from: null })
    },
    build: {
      initial: 'playable',
      on: { room: toRoom },
      states: {
        video: { on: { 'open.version': { guard: ({ event }) => !!id(event.version), ...opened('video') } } },
        game: { on: { 'open.version': { guard: ({ event }) => !!id(event.version), ...opened('overview') } } },
        playable: {
          type: 'parallel',
          states: {
            room: {
              initial: 'overview',
              states: {
                overview: { on: { 'open.version': { guard: ({ event }) => !!id(event.version), ...opened('overview') } } },
                deck: {
                  initial: 'live',
                  on: { 'open.version': { guard: ({ event }) => !!id(event.version), ...opened('deck') } },
                  states: {
                    live: { on: { replay: { guard: ({ event }) => !!event.on, target: 'replay' } } },
                    replay: { on: { replay: { guard: ({ event }) => !event.on, target: 'live' } } }
                  }
                },
                app: { on: { 'open.version': { guard: ({ event }) => !!id(event.version), ...opened('app') } } }
              }
            },
            player: {
              initial: 'closed',
              // another version of the build closes the player (the room region keeps the room)
              on: { 'open.version': { guard: ({ event }) => !!id(event.version), target: '.closed' } },
              states: {
                closed: {
                  on: {
                    play: { guard: playGuard, target: 'prototype', actions: assign({ page: pageOf }) },
                    watch: { guard: playGuard, target: 'visitor', actions: assign({ page: pageOf }) }
                  }
                },
                prototype: { on: { ...playerMoves, watch: { target: 'visitor', actions: assign({ page: pageOf }) }, play: { actions: assign({ page: pageOf }) } } },
                visitor: { on: { ...playerMoves, stop: { target: 'prototype' }, play: { target: 'prototype', actions: assign({ page: pageOf }) } } }
              }
            }
          }
        }
      }
    }
  }
})

// The address names the same state and nothing else (spec 34):
//   ?project=<id>&version=<run>&room=<room>&run=<game run>&plan=<id>&play=<prototype|visitor>&page=<id>
// ?run=<id> alone (the old form) opens that build's Overview; ?replay=<id> replays it in the deck.
export function toAddress(v) {
  const q = new URLSearchParams()
  const room = v.room === 'brand' ? v.from || 'home' : v.room
  if (room === 'plan' && v.plan) { q.set('room', 'plan'); q.set('plan', v.plan) }
  else if (room === 'studio' && v.project) { q.set('room', 'studio'); q.set('project', v.project); if (v.step) q.set('step', v.step) }
  else if (room !== 'home' && room !== 'plan' && v.version) {
    if (v.project) q.set('project', v.project)
    q.set('version', v.version)
    if (room !== 'overview') q.set('room', room)
    if (room === 'game' && v.run) q.set('run', v.run)
    if (v.player !== 'closed') { q.set('play', v.player); if (v.page) q.set('page', v.page) }
  }
  const t = q.toString()
  return t ? `?${t}` : ''
}

// The events that rebuild what an address names. They go to the machine like any other, so
// whatever it does not take is dropped and the rest stands (a play= on Projects opens Projects).
export function fromAddress(search = '') {
  const q = new URLSearchParams(search)
  const get = k => id(q.get(k))
  const replay = get('replay')
  if (replay) return [{ type: 'home' }, { type: 'open.project', version: replay }, { type: 'room', room: 'deck' }, { type: 'replay', on: true }]
  if (q.get('room') === 'plan') return [{ type: 'home' }, { type: 'plan', plan: get('plan') }]
  if (q.get('room') === 'studio') return [{ type: 'home' }, { type: 'studio', project: get('project'), step: q.get('step') }]
  const version = get('version') || get('run')
  if (!version && !get('project')) return [{ type: 'home' }]
  const events = [{ type: 'home' }, { type: 'open.project', project: get('project'), version }]
  const room = q.get('room')
  if (room === 'game') events.push({ type: 'room', room, run: get('version') ? get('run') : null })
  else if (room && room !== 'overview') events.push({ type: 'room', room })
  const play = q.get('play')
  if (play === 'prototype') events.push({ type: 'play', page: get('page') })
  if (play === 'visitor') events.push({ type: 'watch', page: get('page') })
  return events
}

const same = (a, b) => Object.keys(a).every(k => a[k] === b[k])

// The running machine and its one door. go(event) → the new view, or null when the machine has no
// such move from here (logged, so an impossible move shows in the console instead of on screen).
// Listeners run only when the view changed.
export function makeNav({ log = (...m) => console.warn(...m), search = '' } = {}) {
  const actor = createActor(navMachine).start()
  for (const e of fromAddress(search)) actor.send(e)
  let last = view(actor.getSnapshot())
  const subs = new Set()
  actor.subscribe(snap => {
    const next = view(snap)
    if (same(next, last)) return
    last = next
    for (const f of subs) { try { f(next) } catch (err) { console.error('nav:', err) } }
  })
  const go = e => {
    if (!actor.getSnapshot().can(e)) { log(`nav: no ${e?.type} from ${last.room}`); return null }
    actor.send(e)
    return last
  }
  return {
    actor,
    get view() { return last },
    go,
    // Back, Forward and a reload: the address's events, from Projects
    restore: s => { for (const e of fromAddress(s)) actor.send(e); return last },
    subscribe(f) { subs.add(f); return () => subs.delete(f) },
    address: () => toAddress(last)
  }
}
