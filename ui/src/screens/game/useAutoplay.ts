// Autoplay in the Game room (web/canvas/autoplay.js autoplayRoom, as a hook): an AI player plays the running game
// (server/autoplay.mjs, engine/aiplayer.mjs) and its screen shows over the game, with one line for what it just
// decided. The switch belongs to Live: it is there once a game runs on a Studio whose server has a player, a press
// shows the game live and starts the player, and leaving Live (another view, the code, another run, the room) stops
// it. The player runs in a browser of its own, so the game underneath is left as the person had it.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { autoplayNone, autoplayOffered } from '@studio/autoplay'
import type { GameSource } from './source'

export interface Autoplay {
  // the switch is there
  offered: boolean
  on: boolean
  // the player's first picture has arrived (until then: the skeleton)
  live: boolean
  say: string
  // the <img> the player's screen is drawn in
  screen: RefObject<HTMLImageElement | null>
  toggle: () => void
  // the switch, typed ("play it for me", "stop playing"); what the chat answers goes to `say`
  ask: (want: 'start' | 'stop') => void
  // an `autoplay` event from the stream
  event: (e: { run?: string, on?: boolean, live?: boolean, say?: string, line?: string }) => void
}

interface St { can: boolean, on: boolean, open: boolean, live: boolean, stopping: boolean, say: string }
const OFF: St = { can: false, on: false, open: false, live: false, stopping: false, say: '' }

export function useAutoplay({ run, kind, url, live, source, showLive, say }: {
  run: string | null
  kind?: string
  url?: string | null
  // the stage shows the live game, in Preview
  live: boolean
  source: GameSource
  // pin the Live view, in Preview
  showLive: () => void
  // a line from Hermia in the chat
  say: (text: string) => void
}): Autoplay {
  const [st, setSt] = useState<St>(OFF)
  const now = useRef(st)
  now.current = st
  const room = useRef({ run, kind, url, live })
  room.current = { run, kind, url, live }
  const screen = useRef<HTMLImageElement | null>(null)
  // the question to the server, while it is on its way: a typed "play it for me" waits for its answer
  const asking = useRef<Promise<void> | null>(null)
  const set = useCallback((p: Partial<St>) => setSt(s => ({ ...s, ...p })), [])
  const api = source.autoplay

  // another run on screen: the player of the one before stops, and nothing of it stays
  useEffect(() => {
    setSt(OFF)
    asking.current = null
    return () => { if (run && now.current.on) api?.set(run, { stop: true }).catch(() => {}) }
  }, [run, api])

  // asked once per run, when its game runs: whether this server has a player, and whether one plays already
  const running = kind === 'game' && !!run && !!url
  useEffect(() => {
    if (!running || !run || !api || asking.current) return
    asking.current = api.get(run).then(v => {
      if (!v || room.current.run !== run) return
      setSt(s => ({ ...s, can: true, ...(v.on && room.current.live && !s.stopping ? { on: true, open: true, live: !!v.live, say: v.say || '' } : {}) }))
    }).catch(() => {})
  }, [running, run, api])

  const off = useCallback(() => {
    const r = room.current.run, was = now.current.on
    setSt(s => ({ ...s, on: false, open: false, live: false, say: '', stopping: was || s.stopping }))
    if (was && r) api?.set(r, { stop: true }).catch(() => {})
  }, [api])

  // it belongs to Live: another view, the code or a game that stopped ends the play
  useEffect(() => { if (st.on && !(live && url)) off() }, [st.on, live, url, off])

  const start = useCallback(() => {
    const r = room.current
    if (!api || !r.run || !autoplayOffered(r, now.current.can) || now.current.on) return
    const id = r.run
    showLive()
    set({ on: true, open: false, live: false, stopping: false, say: 'starting' })
    api.set(id, { start: true }).then(v => {
      // switched off, or another run shown, while it started: that stop came before there was a player
      if (room.current.run !== id || !now.current.on) return void api.set(id, { stop: true }).catch(() => {})
      set({ on: !!v.on, open: !!v.on, live: !!v.live, say: v.say || now.current.say })
    }).catch(err => {
      if (room.current.run !== id) return
      set({ on: false, open: false, live: false, say: '' })
      say(`The AI player could not start: ${String((err as Error).message || err).split('\n')[0].slice(0, 200)}`)
    })
  }, [api, set, say, showLive])

  // the player's screen, read with the token in its header: each picture shown in the <img> as a blob URL. It is
  // asked for once the server has a player for this run (a 404 before that would end it)
  const streaming = st.on && st.open && !!run
  useEffect(() => {
    if (!streaming || !run || !api) return
    const img = screen.current
    let last = ''
    const s = api.frames(run, b => {
      if (!img) return
      const next = URL.createObjectURL(b)
      img.src = next
      if (last) URL.revokeObjectURL(last)
      last = next
      if (!now.current.live) set({ live: true })
    }, () => {})
    return () => { s.close(); if (last) URL.revokeObjectURL(last); img?.removeAttribute('src') }
  }, [streaming, run, api, set])

  const offered = autoplayOffered({ run, kind, url }, st.can)
  return {
    offered, on: st.on && offered, live: st.live, say: st.say, screen,
    toggle: () => (now.current.on ? off() : start()),
    ask: want => {
      if (want === 'stop') return now.current.on ? off() : say('The AI player is not playing.')
      void Promise.resolve(asking.current).then(() => {
        if (!autoplayOffered(room.current, now.current.can)) say(autoplayNone(room.current, now.current.can))
        else if (!now.current.on) start()
      })
    },
    event: e => {
      if (!e.run || e.run !== room.current.run) return
      if (e.on === false) {
        const was = now.current.on
        set({ on: false, open: false, live: false, stopping: false, say: '' })
        // a play that ended by itself says what it did, once, in the chat
        if (was && e.line) say(e.line)
      } else if (room.current.live && !now.current.stopping) setSt(s => ({ ...s, on: true, open: true, live: !!e.live || s.live, say: e.say || s.say }))
    }
  }
}
