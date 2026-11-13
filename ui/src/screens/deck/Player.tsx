// Play (web/canvas/player.js): the build's real pages over the deck, at true size, in a frame sandboxed with
// allow-scripts only. The player is the machine's (spec 34): it is open while `view.player` says so, its page is
// `view.page`, and Close, Esc and the page picker are moves sent to it. Back walks the pages this player opened.
// Watching a visitor comes with the next slice; until then that address shows the prototype and says where to go.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, LinkButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { Select } from '../../primitives/Select'
import { search } from '../../nav/address'
import { useNav } from '../../nav/NavProvider'
import { pageDoc } from './playdoc'
import type { DeckModel } from './model'

type Device = 'desktop' | 'mobile'
const DEVICES: Record<Device, { w: number, h: number }> = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 844 } }

// the device is this viewer's own preference (the current deck keeps it the same way)
const KEY = 'swarm-device'
const saved = (): Device => { try { return localStorage.getItem(KEY) === 'mobile' ? 'mobile' : 'desktop' } catch { return 'desktop' } }

export function Player({ model }: { model: DeckModel }) {
  const { view, go } = useNav()
  const page = model.pages.find(p => p.id === view.page)?.id ?? model.pages[0]?.id ?? null
  const [device, setDevice] = useState<Device>(saved)
  const [history, setHistory] = useState<string[]>([])
  const [restart, setRestart] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null), stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const open = (id: string) => {
    if (!model.pages.some(p => p.id === id) || id === page) return
    if (page) setHistory(h => [...h, page])
    go({ type: 'page', page: id })
  }
  const back = () => {
    const to = history.at(-1)
    if (!to) return
    setHistory(h => h.slice(0, -1))
    go({ type: 'page', page: to })
  }
  const pick = (d: Device) => { setDevice(d); try { localStorage.setItem(KEY, d) } catch { /* this page only */ } }

  // a data-goto link inside the page asks for another page
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data as { type?: string, target?: string } | null
      if (m?.type === 'goto' && m.target) open(m.target)
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  })

  // Esc closes the player first (before the frame's Esc, which goes up a level)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest('[role="listbox"], [role="dialog"]')) return
      e.preventDefault()
      go({ type: 'close' })
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [go])

  useEffect(() => {
    const s = stage.current
    if (!s) return
    const o = new ResizeObserver(() => setSize({ w: s.clientWidth, h: s.clientHeight }))
    o.observe(s)
    return () => o.disconnect()
  }, [])

  // the page as it is when it opens (or restarts): a section the crew finishes meanwhile shows on Restart, so the
  // page never reloads under the person
  const doc = useMemo(() => (page ? pageDoc(model, page) : ''), [page, restart, device])
  const d = DEVICES[device], mobile = device === 'mobile', border = mobile ? 24 : 0
  const scale = size.w ? Math.min(1, (size.w - 40) / (d.w + border), mobile ? (size.h - 56) / (d.h + border) : 1) : 1
  const height = (mobile ? d.h : Math.max(400, (size.h - 56) / scale)) + border
  const title = model.pages.find(p => p.id === page)?.title ?? 'Page'

  return (
    <section aria-label="Play" className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col bg-void">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
        <Button role="ghost" aria-label="Close" onPress={() => go({ type: 'close' })}><Icon name="x" size={18} /></Button>
        <div className="w-64 max-w-[50vw]">
          <Select label="Page" selectedKey={page} onSelectionChange={k => { if (k != null) open(String(k)) }} options={model.pages.map(p => ({ id: p.id, name: `Page ${p.index + 1} · ${p.title}` }))} />
        </div>
        <Button role="ghost" aria-label="Back" isDisabled={!history.length} onPress={back}><Icon name="chl" size={18} /></Button>
        <Button role="ghost" aria-label="Restart" onPress={() => setRestart(n => n + 1)}><Icon name="restore" size={18} /></Button>
        {view.player === 'visitor' && (
          <span className="flex items-center gap-2 font-monospace text-[13px] text-muted max-md:hidden">
            Watching a visitor is in the Studio for now.
            <LinkButton role="secondary" href={`/${search(view, location.search)}`}>Open in the Studio</LinkButton>
          </span>
        )}
        <div role="group" aria-label="Device" className="ml-auto flex gap-1">
          {(['desktop', 'mobile'] as const).map(x => (
            <Button key={x} role="ghost" aria-pressed={device === x} onPress={() => pick(x)} className={device === x ? 'bg-panel-2!' : 'text-muted'}>
              {x === 'desktop' ? 'Desktop' : 'Mobile'}
            </Button>
          ))}
        </div>
      </div>
      <div ref={stage} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {page && (
          <div className={`absolute top-5 ${mobile ? 'rounded-[36px] border-[12px] border-surface-2' : ''}`}
            style={{ width: d.w + border, height, zoom: scale, left: Math.max(0, (size.w / scale - d.w - border) / 2) }}>
            <iframe key={`${page}:${restart}:${device}`} ref={frame} title={title} srcDoc={doc} sandbox="allow-scripts" className={`block size-full border-0 bg-paper ${mobile ? 'rounded-[24px]' : ''}`} />
          </div>
        )}
      </div>
    </section>
  )
}
