// One page of the build on the Design deck: the current Studio's page frame (web/frame.html), sandboxed with
// allow-scripts only, so a generated page can never reach the Studio. It speaks the frame's own messages
// (web/canvas/deck.js addFrame, syncSlots): on `ready` it gets the theme and one slot per section, then each
// section's status and cleaned HTML as the crew writes it; it reports where each section is (`geo`), which places
// the crew's cursors.
import { useEffect, useRef, useState } from 'react'
import frameHtml from '../../../../web/frame.html?raw'
import { clean } from '@studio/clean'
import { useBoardHost } from '../../board/host'
import type { IframeHost } from '../../board/iframeHost'
import { crew } from './crew'
import type { DeckAgent, DeckLayer, DeckPage, DeckTheme, LayerStatus } from './model'

export const FRAME_W = 1280
export const GAP = 260
export const frameX = (p: DeckPage) => p.index * (FRAME_W + GAP)

export interface SlotGeo { box: [number, number, number, number], last: [number, number] | null }
export interface FrameGeo { height: number, slots: Record<string, SlotGeo> }

const CLS: Record<LayerStatus, string> = { planned: 'wire planned', assigned: 'wire', streaming: 'streaming', done: '', failed: 'wire failed' }
// a section being written is sent at most this often; a finished one at once
const STREAM_MS = 90

type Sent = { ver: number, status: LayerStatus | null, t: number }

export function PageFrame({ page, layers, agents, theme, onGeo }: {
  page: DeckPage, layers: DeckLayer[], agents: DeckAgent[], theme: DeckTheme | null,
  onGeo: (page: string, geo: FrameGeo) => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const sent = useRef(new Map<string, Sent>())
  // bumped on each `ready` (a frame that loads again starts empty)
  const [ready, setReady] = useState(0)
  const [height, setHeight] = useState(700)
  // bumped to send what the throttle held back
  const [later, setLater] = useState(0)

  // the board's host carries this page's messages (src/board/host.ts); slice 1's host is every page a live frame
  const host = useBoardHost()
  // this page is a live frame: the host hears and reaches it (a host that draws photos attaches its own frames)
  useEffect(() => {
    if (!host || !ref.current || !('attach' in host)) return
    return (host as IframeHost).attach(page.id, ref.current)
  }, [host, page.id])
  useEffect(() => {
    if (!host) return
    return host.onMessage(page.id, msg => {
      const m = msg as { type?: string, height?: number, slots?: FrameGeo['slots'] }
      if (m.type === 'ready') {
        sent.current.clear()
        setReady(n => n + 1)
      } else if (m?.type === 'geo') {
        // a cap as well, in case a page still finds a way to grow itself (40 screens)
        setHeight(Math.min(36000, Math.max(700, m.height || 0)))
        onGeo(page.id, { height: m.height || 0, slots: m.slots || {} })
      }
    })
  }, [host, page.id, onGeo])

  const post = (msg: { type: string, [k: string]: unknown }) => host?.post(page.id, msg)

  useEffect(() => {
    if (ready && theme) post({ type: 'theme', theme: { vars: theme.vars, fonts: theme.fonts, radius: theme.radius } })
  }, [ready, theme])

  useEffect(() => {
    if (!ready) return
    const now = performance.now()
    let held = false
    for (const l of layers) {
      let s = sent.current.get(l.key)
      if (!s) {
        const where = l.page === '*' && l.id === 'nav' ? 'start' : l.page === '*' && l.id === 'footer' ? 'end' : 'before-footer'
        post({ type: 'slot', key: l.key, where })
        s = { ver: -1, status: null, t: 0 }
        sent.current.set(l.key, s)
      }
      const msg: { type: string, [k: string]: unknown } = { type: 'slot', key: l.key }
      if (s.status !== l.status) {
        const before = s.status
        s.status = l.status
        const a = agents.find(x => x.id === l.agent)
        msg.cls = CLS[l.status]
        if (l.status === 'assigned') msg.anim = 'drawing'
        if (l.status === 'done' && before) msg.anim = 'flash'
        msg.h = l.height
        if (a) msg.color = crew().color(a.name)
        msg.label = `${l.role} · ${a ? a.name : 'queued'}`
      }
      if (s.ver !== l.ver) {
        if (l.status === 'done' || now - s.t > STREAM_MS) {
          msg.html = clean(l.text)
          s.ver = l.ver
          s.t = now
        } else held = true
      }
      if (Object.keys(msg).length > 2) post(msg)
    }
    if (!held) return
    const t = setTimeout(() => setLater(n => n + 1), STREAM_MS)
    return () => clearTimeout(t)
  }, [ready, layers, agents, later])

  return (
    <iframe ref={ref} title={page.title} srcDoc={frameHtml} sandbox="allow-scripts"
      className="pointer-events-none block border-0 bg-paper" style={{ width: FRAME_W, height }} />
  )
}
