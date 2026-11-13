// Play (web/canvas/player.js): the build's real pages over the deck, at true size, in a frame sandboxed with
// allow-scripts only. The player is the machine's (spec 34): it is open while `view.player` says so, its page is
// `view.page`, and Close, Esc, the page picker, Watch a visitor and Stop watching are moves sent to it. Back walks
// the pages this player opened.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { Menu, MenuItem } from '../../primitives/Menu'
import { Select } from '../../primitives/Select'
import { useNav } from '../../nav/NavProvider'
import { pageDoc } from './playdoc'
import { useTourList, useTourPlayer, type Tour } from './tours'
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
  const frame = useRef<HTMLIFrameElement>(null), stage = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null)
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

  // a page the tour opens: shown, then resolved once its frame has loaded
  const loaded = useRef<{ page: string, done: () => void } | null>(null)
  const pageNow = useRef(page)
  pageNow.current = page
  const show = useCallback((id: string) => new Promise<void>(resolve => {
    if (id === pageNow.current && frame.current?.contentDocument !== undefined && !loaded.current) return resolve()
    loaded.current = { page: id, done: resolve }
    go({ type: 'page', page: id })
    // a page the frame already shows never loads again
    setTimeout(() => { if (loaded.current?.page === id) { loaded.current = null; resolve() } }, 4000)
  }), [go])
  const onLoad = () => { const l = loaded.current; if (l && l.page === pageNow.current) { loaded.current = null; setTimeout(l.done, 120) } }

  const tours = useTourList(model)
  const tour = useTourPlayer(frame, box, show)
  const next = useRef(0)
  const watching = view.player === 'visitor'

  // one visitor after another: Watch starts the next one (written first if there are none yet); at the end of one,
  // or on Stop, the player is the prototype again
  const start = useCallback(async (index?: number) => {
    const list = tours.list ?? await tours.load()
    if (!list?.length) { go({ type: 'stop' }); return }
    const i = (index ?? next.current) % list.length
    next.current = i + 1
    tour.play(list[i], () => go({ type: 'stop' }))
  }, [tours, tour, go])
  const running = !!tour.view.tour && !tour.view.ended
  useEffect(() => {
    if (watching && !running) start()
    if (!watching && running) tour.stop()
  // only on Watch and Stop: a tour that ends by itself stops nothing
  }, [watching])

  // a data-goto link inside the page asks for another page (while a visitor walks it, they decide)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data as { type?: string, target?: string } | null
      if (m?.type === 'goto' && m.target && !running) open(m.target)
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  })

  // Esc closes the player first (before the frame's Esc, which goes up a level)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest('[role="listbox"], [role="menu"], [role="dialog"]')) return
      e.preventDefault()
      tour.stop()
      go({ type: 'close' })
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [go, tour])
  // a player that closes stops its visitor
  useEffect(() => () => tour.stop(), [])

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
  const v = tour.view, finished = model.state === 'done'

  return (
    <section aria-label="Play" className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col bg-void">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
        <Button role="ghost" aria-label="Close" onPress={() => { tour.stop(); go({ type: 'close' }) }}><Icon name="x" size={18} /></Button>
        <div className="w-64 max-w-[50vw]">
          <Select label="Page" selectedKey={page} isDisabled={running} onSelectionChange={k => { if (k != null) open(String(k)) }} options={model.pages.map(p => ({ id: p.id, name: `Page ${p.index + 1} · ${p.title}` }))} />
        </div>
        <Button role="ghost" aria-label="Back" isDisabled={!history.length || running} onPress={back}><Icon name="chl" size={18} /></Button>
        <Button role="ghost" aria-label="Restart" isDisabled={running} onPress={() => setRestart(n => n + 1)}><Icon name="restore" size={18} /></Button>
        <div className="flex items-center gap-1">
          <Button role="secondary" isDisabled={!finished && !watching} aria-busy={watching && tours.loading} onPress={() => go({ type: watching ? 'stop' : 'watch' })}>
            <Icon name={watching ? 'x' : 'users'} size={16} />{watching ? 'Stop watching' : 'Watch a visitor'}
          </Button>
          <Menu label={<Icon name="chd" size={16} />} name="Visitors" role="ghost" isDisabled={!finished}
            onAction={k => {
              if (k === 'again') { tours.load(true); return }
              const i = Number(String(k).slice(2))
              if (watching) start(i)
              else { next.current = i; go({ type: 'watch' }) }
            }}
            onOpenChange={(o: boolean) => { if (o) tours.load() }}>
            {tours.loading
              ? <MenuItem id="writing" isDisabled>Writing a few visitors for this site</MenuItem>
              : tours.error
                ? <MenuItem id="again">Couldn't write visitors: {tours.error}. Try again</MenuItem>
                : [
                    ...(tours.list ?? []).map((t: Tour, i) => <MenuItem key={i} id={`v-${i}`} textValue={t.name}>{t.emoji} {t.name}{t.who ? `, ${t.who}` : ''} · {t.goal}</MenuItem>),
                    ...(tours.list ? [<MenuItem key="again" id="again">↻ Write new visitors</MenuItem>] : [])
                  ]}
          </Menu>
        </div>
        {tours.error && !tours.loading && <span role="alert" className="font-monospace text-[13px] text-hot-text">Couldn't write visitors: {tours.error}</span>}
        <div role="group" aria-label="Device" className="ml-auto flex gap-1">
          {(['desktop', 'mobile'] as const).map(x => (
            <Button key={x} role="ghost" aria-pressed={device === x} isDisabled={running} onPress={() => pick(x)} className={device === x ? 'bg-panel-2!' : 'text-muted'}>
              {x === 'desktop' ? 'Desktop' : 'Mobile'}
            </Button>
          ))}
        </div>
      </div>
      <div ref={box} className="relative min-h-0 flex-1">
        <div ref={stage} className="absolute inset-0 overflow-x-hidden overflow-y-auto">
          {page && (
            <div className={`absolute top-5 ${mobile ? 'rounded-[36px] border-[12px] border-surface-2' : ''}`}
              style={{ width: d.w + border, height, zoom: scale, left: Math.max(0, (size.w / scale - d.w - border) / 2) }}>
              <iframe key={`${page}:${restart}:${device}`} ref={frame} title={title} srcDoc={doc} sandbox="allow-scripts" onLoad={onLoad} className={`block size-full border-0 bg-paper ${mobile ? 'rounded-[24px]' : ''}`} />
            </div>
          )}
        </div>
        {v.cursor && v.tour && (
          <div aria-hidden className="pointer-events-none absolute top-0 left-0 z-10" style={{ transform: `translate(${Math.round(v.cursor.x)}px, ${Math.round(v.cursor.y)}px)` }}>
            <svg key={v.press} viewBox="0 0 24 24" width="22" height="22" className="motion-safe:animate-[pulse_.4s_ease-out_1]"><path d="M4 2l15 9.5-6.6 1.2 3.9 7.6-3 1.5-3.9-7.7L4 18.6z" fill="#F2F2F2" stroke="#05051a" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            {v.thought && (
              <div className={`absolute top-6 w-max max-w-64 rounded-[12px] border border-edge bg-surface-2 px-3 py-1.5 font-monospace text-[13px] text-text ${v.cursor.x > size.w - 300 ? 'right-4' : 'left-4'}`}>
                {v.tour.emoji} {v.thought}
              </div>
            )}
          </div>
        )}
        {v.tour && (
          <div role="status" className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-3 rounded-[12px] border border-edge bg-deep px-3 py-2 font-monospace text-[13px]">
            <span aria-hidden>{v.tour.emoji}</span>
            <span className="min-w-0 flex-1 truncate"><b>{v.tour.name}</b> <span className="text-muted">{v.ended || v.at >= v.tour.steps.length ? v.tour.end || 'done' : v.tour.goal}</span></span>
            <span aria-label={`Step ${Math.min(v.at, v.tour.steps.length)} of ${v.tour.steps.length}`} className="flex gap-1">
              {v.tour.steps.map((_, i) => <i key={i} className={`size-1.5 rounded-full ${i < v.at ? 'bg-text' : 'bg-line-2'}`} />)}
            </span>
            {v.ended && tours.list?.length
              ? <Button role="secondary" onPress={() => { go({ type: 'watch' }) }}>Next: {tours.list[next.current % tours.list.length].emoji} {tours.list[next.current % tours.list.length].name} →</Button>
              : <Button role="secondary" onPress={() => go({ type: 'stop' })}>Stop</Button>}
          </div>
        )}
      </div>
    </section>
  )
}
