// Shape it (docs/specs/22-guided-game-maker.md "First cut"; web/workshop.js, engine/workshop.mjs, server/workshops.mjs):
// the game walked one part at a time: Game, Story, World, Hero, Enemies, Levels, Sound. Each step shows at most four
// options as something to see or hear: a painted picture, the hero's sprite sheet moving, a level map, a music loop.
// Next writes the pick and moves on; with nothing picked the step is skipped and the spec keeps what it had. Build now
// skips the rest. The server paints in the background, so the walk looks again every 3 s while a picture is painting.
import { useCallback, useEffect, useRef, useState } from 'react'
import { painterOf } from '@studio/icons'
import { CrewCursor } from '../../../board/Board'
import type { ChatApi } from '../../../chat'
import { getJson, postJson } from '../../../chat/api'
import { Button, IconButton, PlainButton } from '../../../primitives/Button'
import { Dialog } from '../../../primitives/Dialog'
import { HEAD, POSES, STEPS, optionRows, pickOf, type Model, type Option, type Spec, type Workshop } from './model'
import { playLoop, type Loop } from './sound'
import './start.css'

const media = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : `${window.SWARM?.base || ''}${src}`)
const painting = (list: Option[]) => list.some(o => o.state === 'painting' || o.sprite?.state === 'painting')
const Spin = ({ label }: { label: string }) => <div role="img" aria-label={label} aria-busy="true" className="gs-spin" />

// a slot a crew member is painting: their cursor works over it until the picture lands
const Painting = ({ id, className }: { id: string, className: string }) => <div aria-busy="true" className={`ws-wait relative grid place-items-center rounded-[10px] bg-deep ${className}`}><CrewCursor name={painterOf(id)} className="top-[45%] left-[40%]" /></div>

// the hero's sprite sheet (3 × 2) stepping through its six poses; still for anyone who asks for less motion
function Sprite({ src, name, className }: { src: string, name: string, className: string }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let f = 0
    const show = () => { if (el.current) el.current.style.backgroundPosition = `${(f % 3) * 50}% ${Math.floor(f / 3) * 100}%` }
    show()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => { f = (f + 1) % 6; show() }, 450)
    return () => clearInterval(t)
  }, [src])
  return <div ref={el} role="img" aria-label={`${name} moving`} className={`ws-sprite rounded-[10px] ${className}`} style={{ backgroundImage: `url("${media(src)}")` }} />
}

// a level as its 32 × 16 map: walls, ledges, spikes, the start, the exit, the boss, enemies and coins
function LevelMap({ rows }: { rows: string[] }) {
  const el = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = el.current, g = c?.getContext('2d')
    if (!c || !g) return
    const css = getComputedStyle(c), v = (k: string, d: string) => css.getPropertyValue(k).trim() || d
    const fg = v('--text', '#f4f4f5'), line = v('--frame-hi', '#a1a1a6'), acc = v('--accent', fg)
    const s = Math.floor(Math.min(c.width / 32, c.height / 16))
    g.clearRect(0, 0, c.width, c.height)
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const X = x * s, Y = y * s
      if (ch === '#') { g.fillStyle = line; g.fillRect(X, Y, s, s) }
      else if (ch === '=') { g.fillStyle = line; g.fillRect(X, Y, s, Math.max(2, s / 3)) }
      else if (ch === '^') { g.fillStyle = fg; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X, Y + s); g.lineTo(X + s / 2, Y + 2); g.lineTo(X + s, Y + s); g.fill(); g.globalAlpha = 1 }
      else if ('SXBECD'.includes(ch)) {
        g.fillStyle = ch === 'S' || ch === 'X' ? acc : fg
        g.globalAlpha = ch === 'C' ? 0.6 : 1
        g.beginPath()
        g.arc(X + s / 2, Y + s / 2, ch === 'B' ? s * 0.9 : ch === 'C' ? s * 0.22 : s * 0.38, 0, Math.PI * 2)
        if (ch === 'D' || ch === 'X') g.fillRect(X + s * 0.15, Y, s * 0.7, s); else g.fill()
        g.globalAlpha = 1
      }
    }))
  }, [rows])
  return <canvas ref={el} width={320} height={160} role="img" aria-label="Level map" className="aspect-[2/1] h-auto w-full rounded-[10px] bg-deep [image-rendering:pixelated]" />
}

export function ShapeIt({ isOpen, spec, id, api, onClose, onBuilt }: {
  isOpen: boolean
  // the spec to walk (a new walk), or an unfinished walk's id (it opens where it was left)
  spec?: Spec | null
  id?: string | null
  api: ChatApi
  onClose: () => void
  // the build started from the walked spec
  onBuilt: (run: string, spec?: Spec) => void
}) {
  const [ws, setWs] = useState<Workshop | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [multi, setMulti] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState('Opening')
  const [err, setErr] = useState('')
  const [models, setModels] = useState<null | 'loading' | Model[]>(null)
  const [voice, setVoice] = useState('')
  const [ring, setRing] = useState(false)
  const [loop, setLoop] = useState<Loop | null>(null)
  const playing = useRef<Loop | null>(null)
  const at = useRef<Workshop | null>(null)
  at.current = ws

  const step = ws?.step || 'design'
  const opts = ws?.options?.[step] || []
  const i = Math.max(0, STEPS.findIndex(s => s[0] === step))
  const last = i === STEPS.length - 1
  const picked = !!(own || (step === 'enemies' ? multi.length : sel))
  const call = useCallback(<T,>(path: string, body: unknown) => postJson<T>(api, path, body), [api])
  const said = (e: unknown) => setErr((e as Error).message || String(e))

  const stopSound = useCallback(() => { playing.current?.stop(); playing.current = null; setLoop(null) }, [])
  const play = (o: Option) => { stopSound(); const l = playLoop(o as Parameters<typeof playLoop>[0]); playing.current = l; setLoop(l) }
  useEffect(() => () => { playing.current?.stop() }, [])

  // a step's options: the ones it has, or asked of the planner (again: new ones)
  const load = useCallback(async (w: Workshop, to: string, again = false) => {
    setSel(null); setMulti([]); setModels(null); setOwn(''); setErr('')
    if (!again && w.options?.[to]?.length) return setWs({ ...w, step: to })
    setWs({ ...w, step: to })
    setBusy('Thinking')
    let next = w
    try { next = await call<Workshop>(`/api/workshops/${w.id}/options`, { step: to }); setWs(next) } catch (e) { said(e) }
    setBusy('')
    const p = next.picks?.[to]
    if (p?.id) setSel(p.id)
    if (p?.ids) setMulti(p.ids)
  }, [call])

  // the walk opens: a new one from the spec, or the one left unfinished
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const w = id ? await getJson<Workshop>(api, `/api/workshops/${id}`) : await call<Workshop>('/api/workshops', { spec })
        if (!w?.id) throw new Error('The walk did not open.')
        if (!live) return
        setBusy('')
        await load(w, w.step || 'design')
      } catch (e) { if (live) { setBusy(''); said(e) } }
    })()
    return () => { live = false }
  }, [])

  // pictures land in the background: look again every 3 s while one is painting
  const wid = ws?.id, waits = painting(opts)
  useEffect(() => {
    if (!wid || !waits) return
    const t = window.setInterval(async () => {
      const w = await getJson<Workshop>(api, `/api/workshops/${wid}`)
      if (w && at.current?.id === wid) setWs({ ...w, step: at.current.step })
    }, 3000)
    return () => clearInterval(t)
  }, [wid, waits, api])

  async function build() {
    if (!ws) return
    stopSound()
    setBusy('Starting the build')
    try { const w = await call<Workshop>(`/api/workshops/${ws.id}/build`, {}); if (w.run) onBuilt(w.run, w.spec) } catch (e) { setBusy(''); said(e) }
  }
  async function next() {
    if (busy || !ws) return
    const pick = pickOf(step, sel, multi, own)
    setBusy('Saving')
    try {
      const w = pick ? await call<Workshop>(`/api/workshops/${ws.id}/choose`, { step, pick }) : ws
      setWs({ ...w, step })
      setBusy('')
      if (last) return void build()
      stopSound()
      await load(w, STEPS[i + 1][0])
    } catch (e) { setBusy(''); said(e) }
  }
  function back() {
    if (busy || !ws || i <= 0) return
    stopSound()
    void load(ws, STEPS[i - 1][0])
  }
  // ← and → go back and on, unless a field has the keyboard
  const keys = useRef({ next, back })
  keys.current = { next, back }
  useEffect(() => {
    if (!isOpen) return
    const on = (e: KeyboardEvent) => {
      if (document.activeElement?.matches('input, textarea, select')) return
      if (e.key === 'ArrowRight') void keys.current.next()
      else if (e.key === 'ArrowLeft') keys.current.back()
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [isOpen])

  const o = opts.find(x => x.id === sel)
  async function act(a: 'paint' | 'sprite' | 'say' | 'models') {
    if (!ws || !o) return
    try {
      if (a === 'paint') setWs({ ...(await call<Workshop>(`/api/workshops/${ws.id}/paint`, { step, id: o.id })), step })
      if (a === 'sprite') setWs({ ...(await call<Workshop>(`/api/workshops/${ws.id}/sprite`, { id: o.id })), step })
      if (a === 'say') {
        const w = await call<Workshop>(`/api/workshops/${ws.id}/voice`, { text: o.line, voice: voice || ws.voices?.[0]?.key })
        if (w.voiceSrc) void new Audio(media(w.voiceSrc)).play().catch(() => {})
      }
      if (a === 'models') {
        setModels('loading')
        const r = await call<{ models?: Model[] }>('/api/cast', { role: { look: o.look, name: o.role || o.name }, violent: true })
        setModels((r.models || []).filter(m => m.preview).slice(0, 4))
      }
    } catch (e) { said(e); setModels(m => (m === 'loading' ? null : m)) }
  }
  // a 3D model picked for the hero: it is the hero's cast, and the walk goes on to the enemies
  async function pickModel(m: Model) {
    if (!ws) return
    setBusy('Saving')
    try {
      const cast: Record<string, unknown> = { ...m, role: 'hero', label: ws.options?.heroes?.find(x => x.id === sel)?.name || m.name }
      delete cast.key; delete cast.preview
      const w = await call<Workshop>(`/api/workshops/${ws.id}/choose`, { step: 'heroes', pick: { cast } })
      setBusy('')
      await load(w, 'enemies')
    } catch (e) { setBusy(''); said(e) }
  }
  function press(x: Option) {
    setModels(null); setErr('')
    if (step === 'enemies') { setMulti(m => (m.includes(x.id) ? m.filter(k => k !== x.id) : [...m, x.id])); return setSel(x.id) }
    const on = sel === x.id ? null : x.id
    setSel(on)
    if (step === 'sound' && on) play(x)
  }

  const tall = step === 'heroes' || step === 'enemies'
  const shape = tall ? 'aspect-[3/4]' : 'aspect-[3/2]'
  const picture = (x: Option) => (x.state === 'painting' && !x.src ? <Painting id={x.id} className={shape} />
    : x.state === 'failed' && !x.src ? <div role="img" aria-label="The picture failed" className={`grid place-items-center rounded-[10px] bg-deep text-[22px] text-muted ${shape}`}>⚠</div>
      : x.src ? <div className={`grid place-items-center overflow-hidden rounded-[10px] bg-deep ${shape}`}><img src={media(x.src)} alt="" className={`block h-full w-full ${tall ? 'object-contain' : 'object-cover'}`} /></div> : null)
  const title = ws?.spec?.title || spec?.title || 'Game'
  const grid = opts.length === 3 ? 'grid-cols-3 max-[900px]:grid-cols-2' : opts.length === 4 ? 'grid-cols-4 max-[900px]:grid-cols-2' : 'grid-cols-[repeat(auto-fit,minmax(220px,1fr))]'

  return (
    <Dialog title="Shape the game" size="full" bare locked={!!busy} isOpen={isOpen} onOpenChange={on => { if (!on) { stopSound(); onClose() } }}>
      {close => (
        <div className="flex h-full flex-col bg-void">
          <header className="relative flex items-center justify-between gap-4 border-b border-line px-6 py-3.5">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-baseline gap-2 text-sm text-muted">
              <span className="max-w-[40vw] truncate max-[900px]:hidden">{title}</span><span className="max-[900px]:hidden">›</span><b className="font-semibold text-text">{STEPS[i][1]}</b>
            </nav>
            <div className="flex items-center gap-2.5">
              <PlainButton aria-label={`Step ${i + 1} of ${STEPS.length}`} aria-expanded={ring} onPress={() => setRing(r => !r)} className="ws-ring relative size-10 rounded-full">
                <svg viewBox="0 0 36 36" aria-hidden><circle cx="18" cy="18" r="15" className="t" /><circle cx="18" cy="18" r="15" className="f" style={{ strokeDasharray: `${((i + 1) / STEPS.length) * 94.2} 94.2` }} /></svg>
                <b className="absolute inset-0 grid place-items-center text-[10px]">{i + 1}/{STEPS.length}</b>
              </PlainButton>
              <Button role="ghost" aria-label="Back" isDisabled={i === 0} onPress={back} className="border !border-line !px-0">←</Button>
              {!last && <Button role="ghost" isDisabled={!!busy} onPress={() => void build()}>Build now</Button>}
              <Button role="primary" className="min-w-[140px]" isDisabled={!!busy} onPress={() => void next()}>{last ? 'Build the game' : picked ? 'Next' : 'Skip'}</Button>
              <IconButton icon="x" label="Close" isDisabled={!!busy} onPress={close} />
            </div>
            {ring && (
              <div role="group" aria-label="Steps" className="absolute top-16 right-[120px] z-[2] flex min-w-40 flex-col rounded-[12px] border border-line bg-deep p-1.5">
                {STEPS.map(([k, n]) => (
                  <button type="button" key={k} aria-current={k === step ? 'step' : undefined} onClick={() => { setRing(false); stopSound(); if (ws) void load(ws, k) }}
                    className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm hover:bg-panel-2 ${k === step ? 'bg-panel-2' : ''}`}>
                    <i aria-hidden className={`size-2 rounded-full border-[1.5px] ${(ws?.done || []).includes(k) ? 'border-accent bg-accent' : 'border-frame-hi'}`} />{n}{(ws?.done || []).includes(k) && <span className="sr-only">, done</span>}
                  </button>
                ))}
              </div>
            )}
          </header>
          <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
            {busy && !opts.length ? <div className="grid flex-1 place-items-center"><Spin label={busy} /></div> : (
              <div className="flex min-w-0 flex-1 flex-col items-center overflow-auto px-10 pt-8 pb-10 max-[900px]:px-4 max-[900px]:py-6">
                <h3 className="m-0 mb-6 text-center text-[32px] font-bold">{HEAD[step]}</h3>
                <div className={`grid w-full max-w-[1180px] gap-4 ${grid}`}>
                  {opts.map(x => {
                    const on = step === 'enemies' ? multi.includes(x.id) : sel === x.id
                    return (
                      <PlainButton key={x.id} aria-pressed={on} onPress={() => press(x)}
                        className={`flex min-w-0 flex-col gap-2.5 rounded-[14px] border bg-panel p-2.5 text-text transition-[border-color] duration-150 ${on ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line data-[hovered]:border-line-2'}`}>
                        {step === 'design' ? <div className="flex min-h-[150px] flex-col justify-between gap-3 rounded-[10px] bg-deep p-4"><b className="text-[17px] leading-[1.35] font-medium">{String(x.twist || x.loop || '')}</b><span className="text-xs tracking-[.06em] text-muted uppercase">{String(x.camera || '')}</span></div>
                          : step === 'levels' ? <LevelMap rows={x.map || []} />
                            : step === 'sound' ? <div className={`ws-wave flex h-[120px] items-center justify-center gap-1.5 rounded-[10px] bg-deep ${loop?.id === x.id ? 'on' : ''}`}>{Array.from({ length: 8 }, (_, k) => <i key={k} />)}</div>
                              : step === 'heroes' && x.sprite?.src && on ? <Sprite src={x.sprite.src} name={x.name} className={shape} />
                                : picture(x)}
                        <span className="flex justify-between gap-2 px-0.5 pb-0.5 text-[15px] font-semibold">{x.name}{step === 'enemies' && <em className="text-xs font-normal text-muted not-italic">{String(x.kind || '')}</em>}</span>
                      </PlainButton>
                    )
                  })}
                </div>
                <div className="mt-6 flex w-full max-w-[720px] gap-2.5">
                  <input aria-label="Your own words" placeholder="…or in your own words" value={own} onChange={e => { setOwn(e.target.value); setErr('') }} onKeyDown={e => { if (e.key === 'Enter') void next() }}
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-panel px-3.5 text-text outline-none focus:border-frame-hi" />
                  <Button role="ghost" isDisabled={!!busy} onPress={() => { if (ws) void load(ws, step, true) }}>New options</Button>
                </div>
                {busy && <p role="status" className="mt-3.5 text-sm text-muted">{busy}…</p>}
                {err && <p role="alert" className="mt-3.5 text-sm text-hot-text">{err}</p>}
              </div>
            )}
            {o && (
              <aside aria-label={o.name} className="w-[340px] flex-none overflow-auto border-l border-line bg-deep p-6 max-[900px]:w-auto max-[900px]:border-t max-[900px]:border-l-0">
                <h4 className="m-0 mb-3.5 text-xl font-bold">{o.name}</h4>
                <dl className="m-0 mb-4 grid">
                  {optionRows(step, o).map(([k, v]) => <div key={k}><dt className="mt-2 text-xs tracking-[.05em] text-muted uppercase">{k}</dt><dd className="m-0 text-sm leading-[1.45]">{v}</dd></div>)}
                </dl>
                {step === 'heroes' && o.sprite?.src && <div className="mb-4 grid grid-cols-3 gap-1 text-center text-[11px] text-muted">{POSES.map(p => <span key={p}>{p}</span>)}</div>}
                <div className="flex flex-wrap gap-2">
                  {['story', 'world', 'heroes', 'enemies'].includes(step) && o.state !== 'painting' && <Button role="ghost" onPress={() => void act('paint')}>Draw again</Button>}
                  {step === 'heroes' && o.src && <Button role={o.sprite?.src ? 'ghost' : 'primary'} isDisabled={o.sprite?.state === 'painting'} onPress={() => void act('sprite')}>{o.sprite?.src ? 'Sprites again' : 'Make sprites'}</Button>}
                  {step === 'heroes' && <Button role="ghost" onPress={() => void act('models')}>3D models</Button>}
                  {step === 'sound' && <Button role="primary" onPress={() => (loop?.id === o.id ? stopSound() : play(o))}>{loop?.id === o.id ? 'Stop' : 'Play'}</Button>}
                  {step === 'sound' && !!o.line && !!ws?.voices?.length && <>
                    <select aria-label="Voice" value={voice || ws.voices[0].key} onChange={e => setVoice(e.target.value)} className="h-10 rounded-[10px] border border-line bg-surface-2 px-2.5 text-text">
                      {ws.voices.map(v => <option key={v.key} value={v.key}>{v.about.split(':')[0]}</option>)}
                    </select>
                    <Button role="ghost" onPress={() => void act('say')}>Hear the line</Button>
                  </>}
                </div>
                {models && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {models === 'loading' ? <Spin label="Searching" /> : models.length ? models.map(m => (
                      <PlainButton key={`${m.source}:${m.id}`} onPress={() => void pickModel(m)} className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel p-1.5 text-xs text-text data-[hovered]:border-accent">
                        <img src={m.preview} alt="" referrerPolicy="no-referrer" className="aspect-square w-full rounded-[6px] object-cover" /><span>{m.name}</span>
                      </PlainButton>
                    )) : <span role="status">None found</span>}
                  </div>
                )}
              </aside>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
