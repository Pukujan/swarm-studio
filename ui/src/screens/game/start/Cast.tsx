// The Cast step (web/canvas/rooms.js renderCast; specs 19 and 20): one role at a time. A numbered picture shortlist
// from VRoid Hub and Sketchfab, licence checked by the server; at rest a card is its picture and name, the open card
// shows the creator and the licence. The project's own art is one more card, first in the grid: made with Meshy when a
// key is set (docs/engines/meshy.md: it spends credits, so the price is on the button and the server checks it), else
// the art itself as a free 2.5D sprite. Pictures the person adds (picked or dropped) each become a role. One pick per
// role, then the build. The bench shows every Meshy job of this cast.
//
// The cast is kept as the classic step keeps it: one object the step changes in place and draws again, so a poll
// that lands after a click writes into the same cast.
import { useEffect, useReducer, useRef, type DragEvent } from 'react'
import type { ChatApi } from '../../../chat'
import { getJson, postJson } from '../../../chat/api'
import { Button, LinkButton, PlainButton } from '../../../primitives/Button'
import { Icon } from '../../../primitives/Icon'
import { useSmall } from '../../../shared/small'
import { crew } from '../../deck/crew'
import { BONES, JOINTS, STAGE_WORD, castJobs, freeRole, jobNext, jobRole, makeable, makingJobs, roleLabel, spritePick, stageOf, type Cast, type Job, type Model, type Own, type Role } from './model'
import './start.css'

const media = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : `${window.SWARM?.base || ''}${src}`)
// a small copy of one of the project's pictures (never the full-size art); nothing until the copy is ready
function Small({ src, max = 256, className }: { src: string, max?: number, className?: string }) {
  const url = useSmall(src ? media(src) : '', max)
  return url ? <img src={url} alt="" loading="lazy" decoding="async" className={className} /> : <i aria-hidden className={className} />
}
const LINK = '!min-h-10 !px-1.5 text-muted data-[hovered]:!bg-transparent data-[hovered]:text-text'
const Spin = ({ label }: { label: string }) => <div role="img" aria-label={label} aria-busy="true" className="gs-spin" />

// ---------- the bench: every Meshy job of this cast, each on its own tile; the made ones on the library's shelf
function Bench({ cast: c, onOpen }: { cast: Cast, onOpen: (role: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  // offscreen, the bench rests: its animations pause until it scrolls back into view
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const seen = new IntersectionObserver(es => { for (const e of es) e.target.classList.toggle('rest', !e.isIntersecting) })
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  const jobs = castJobs(c)
  if (!jobs.length) return null
  const work = jobs.filter(x => x.o.job.state !== 'done'), made = jobs.filter(x => x.o.job.state === 'done')
  const fresh = made.some(x => Date.now() - (x.o.job.endedAt || 0) < 1600)
  return (
    <div ref={box} className="cforge">
      <div className="fg-row" role="list" aria-label="Making">
        {work.map(({ r, o }) => {
          const j = o.job, stage = stageOf(j), p = Math.max(0, Math.min(100, Number(j.progress) || 0)) / 100
          const ago = ((Date.now() - (j.stageAt || Date.now())) / 1000).toFixed(1)
          return (
            <div role="listitem" key={r.id}>
              <PlainButton className={`fg st-${stage}`} aria-label={`${r.label}, ${STAGE_WORD[stage] || 'failed'}`} onPress={() => onOpen(r.id)}
                style={{ '--p': stage === 'model' ? p : 1, '--ago': `-${ago}s` } as React.CSSProperties}>
                <span className="fg-stage">
                  <svg className="fg-wire" viewBox="0 0 60 100" aria-hidden><g className="fg-lat"><ellipse cx="30" cy="16" rx="11" ry="3" /><ellipse cx="30" cy="36" rx="16" ry="4" /><ellipse cx="30" cy="56" rx="14" ry="4" /><ellipse cx="30" cy="78" rx="12" ry="3.5" /></g><g className="fg-mer"><ellipse cx="30" cy="16" rx="11" ry="11" /><ellipse cx="30" cy="57" rx="16" ry="38" /></g><g className="fg-mer b"><ellipse cx="30" cy="16" rx="11" ry="11" /><ellipse cx="30" cy="57" rx="16" ry="38" /></g></svg>
                  <span className="fg-fill"><span><Small src={o.art} className="fg-clay" /></span></span>
                  <svg className="fg-bones" viewBox="0 0 60 100" aria-hidden>
                    {BONES.map(([a, b], i) => <line key={`b${i}`} style={{ '--i': i } as React.CSSProperties} x1={JOINTS[a][0]} y1={JOINTS[a][1]} x2={JOINTS[b][0]} y2={JOINTS[b][1]} />)}
                    {JOINTS.map(([x, y], i) => <circle key={`j${i}`} style={{ '--i': i } as React.CSSProperties} cx={x} cy={y} r="1.8" />)}
                  </svg>
                  <Small src={o.art} className="fg-made" />
                  {stage === 'failed' && <span className="fg-warn" aria-hidden>⚠</span>}
                  {/* in line: its worker's mark on the tile */}
                  {stage === 'queued' && j.worker && <span className="fg-who" aria-hidden dangerouslySetInnerHTML={{ __html: crew().avatar(j.worker, 20) }} />}
                </span>
                <b>{r.label}</b>
              </PlainButton>
            </div>
          )
        })}
      </div>
      <div className={`fg-lib ${fresh ? 'got' : ''}`} role="group" aria-label={`Model library, ${made.length}`}>
        <span className="fg-shelf"><Icon name="box" size={18} /><span>{made.length}</span></span>
        {made.slice(-3).map(({ r, o }) => <button type="button" key={r.id} aria-label={r.label} onClick={() => onOpen(r.id)}><Small src={o.job.pick?.thumbSrc || o.art} max={64} /></button>)}
      </div>
    </div>
  )
}

export function CastStep({ cast: c, from, api, onBack, onBuild, onSay }: {
  cast: Cast
  // the build whose pictures the cast is made from (a promo game's site, or the build /cast was asked on)
  from: string
  api: ChatApi
  // back to the spec, and the build with the picks (Skip builds too); neither is offered for /cast on a build
  onBack: () => void
  onBuild: () => void
  // something that failed, said where the person reads it
  onSay: (text: string) => void
}) {
  const [, redraw] = useReducer((x: number) => x + 1, 0)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const draw = () => { if (live.current) redraw() }
  const files = useRef<HTMLInputElement>(null)
  const polling = useRef(false)

  // ---------- the shortlist of the role shown (POST /api/cast), asked once per role
  async function search() {
    const r = c.roles[c.role]
    if (!r || c.lists[r.id] || c.only) return
    c.lists[r.id] = { busy: true, models: [] }
    draw()
    try {
      const out = await postJson<{ models?: Model[], error?: string, errors?: string[] }>(api, '/api/cast', { role: r, violent: c.violent })
      c.lists[r.id] = { models: out.models || [], error: out.error || (out.models?.length ? '' : (out.errors || []).join(' · ')) }
    } catch (err) { c.lists[r.id] = { models: [], error: (err as Error).message } }
    draw()
  }
  // ---------- the project's own art (GET /api/meshy: whether a key is set, never the key; the price; the pictures)
  async function ownArt() {
    if (c.meshy) return
    c.meshy = { ready: false, cost: 0, art: [] }
    const out = await getJson<{ ready?: boolean, cost?: { credits?: number }, art?: { src: string }[] }>(api, `/api/meshy?from=${encodeURIComponent(from)}`) || {}
    c.meshy = { ready: !!out.ready, cost: out.cost?.credits || 0, art: [...new Set([...(out.art || []).map(a => a.src), ...Object.values(c.own).map(o => o.art)])] }
    // each role starts on its own picture (people first), not all on the first one
    const art = c.meshy.art
    c.roles.forEach((r, i) => { if (art.length) c.own[r.id] ||= { art: art[i % art.length], job: null } })
    draw()
  }
  useEffect(() => { void search(); void ownArt(); if (makingJobs(c).length) void poll() }, [c])

  // pictures the person adds: each one becomes a role, with that picture as its art (POST /api/meshy/art, free)
  async function add(list: FileList | File[] | null) {
    const pics = [...(list || [])].filter(f => /^image\/(png|jpeg|webp)$/.test(f.type)).slice(0, 16)
    if (!pics.length || !from) return
    c.adding = pics.length
    draw()
    for (const f of pics) {
      const data = await new Promise<string>(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result || '')); fr.onerror = () => ok(''); fr.readAsDataURL(f) })
      const out = data ? await postJson<{ src?: string, role?: string }>(api, '/api/meshy/art', { from, name: f.name, data }).catch(err => ({ error: (err as Error).message } as { src?: string, role?: string, error?: string })) : {}
      c.adding--
      if (!out.src) { onSay(`Cast: ${f.name}: ${(out as { error?: string }).error || 'not added'}`); draw(); continue }
      const id = freeRole(c.roles, out.role || 'character')
      c.roles.push({ id, label: roleLabel(f.name), name: roleLabel(f.name) })
      c.own[id] = { art: out.src, job: null }
      if (c.meshy && !c.meshy.art.includes(out.src)) c.meshy.art.push(out.src)
      if (c.roles.length === 1) c.role = 0
      draw()
    }
    c.adding = 0
    draw()
  }

  // ---------- Meshy: Make one, or Make all at one price; the server starts nothing unless `credits` is that price
  async function make(r: Role) {
    const o = c.own[r.id]
    if (!o || !c.meshy) return
    o.job = { state: 'running', stage: 'queued', progress: 0, worker: 'Pebble' }
    draw()
    const job = await postJson<Job>(api, '/api/meshy', { role: r.id, label: r.label, art: o.art, credits: c.meshy.cost }).catch(err => ({ error: (err as Error).message } as Job))
    o.job = job.id ? job : { state: 'failed', error: job.error || 'Meshy did not start' }
    void poll()
  }
  async function makeAll() {
    const roles = makeable(c)
    if (roles.length < 2 || !c.meshy) return
    for (const r of roles) c.own[r.id].job = { state: 'running', stage: 'queued', progress: 0, worker: '' }
    draw()
    const out = await postJson<{ jobs?: Job[] }>(api, '/api/meshy/batch', { items: roles.map(r => ({ role: r.id, label: r.label, art: c.own[r.id].art })), credits: roles.length * c.meshy.cost }).catch(err => ({ error: (err as Error).message } as { jobs?: Job[], error?: string }))
    for (const r of roles) c.own[r.id].job = out.jobs?.find(j => j.role === jobRole(r.id)) || { state: 'failed', error: (out as { error?: string }).error || 'Meshy did not start' }
    void poll()
  }
  // one poll for every job, every 2.5 s while one runs; a failed look is tried again on the next round
  async function poll() {
    if (polling.current) return
    polling.current = true
    draw()
    while (live.current && makingJobs(c).length) {
      await new Promise(res => setTimeout(res, 2500))
      await Promise.all(makingJobs(c).map(async ({ o }) => {
        if (!o.job.id) return
        const j = await getJson<Job>(api, `/api/meshy/job?id=${o.job.id}`)
        if (j) o.job = jobNext(o.job, j, Date.now())
      }))
      draw()
    }
    polling.current = false
  }

  const r = c.roles[c.role]
  const m = c.meshy
  const pickFiles = <input ref={files} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void add(e.target.files); e.target.value = '' }} />
  const drop = {
    onDragOver: (e: DragEvent) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault() },
    onDrop: (e: DragEvent) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); void add(e.dataTransfer.files) } }
  }
  const foot = c.only
    ? <div className="mt-2 flex items-center justify-end gap-2.5">{c.adding > 0 && <Spin label="Adding" />}</div>
    : (
      <div className="mt-2 flex items-center justify-between gap-2.5">
        <Button role="ghost" className={LINK} onPress={() => { c.sel = null; onBack() }}>← Spec</Button>
        <span className="flex items-center gap-2.5"><Button role="ghost" className={LINK} onPress={() => { c.done = true; onBuild() }}>Skip</Button><Button role="primary" onPress={() => { c.done = true; onBuild() }}>Build the game</Button></span>
      </div>
    )
  const H3 = ({ children }: { children: string }) => <h3 className="mt-1.5 mb-5 font-display text-[clamp(36px,5.4vw,64px)] leading-[.95] font-extrabold uppercase">{children}</h3>

  // no roles yet (/cast on a build): the pictures the person adds become the cast
  if (!r) return (
    <div {...drop}>
      <H3>Cast</H3>
      <div className="flex flex-col items-center gap-3 px-2.5 py-8 text-center text-muted">
        {c.adding > 0 ? <Spin label="Adding" /> : <Button role="primary" className="min-h-11" onPress={() => files.current?.click()}><Icon name="image" />Add pictures</Button>}
        {pickFiles}
      </div>
      {foot}
    </div>
  )

  const list = c.only ? { models: [] as Model[], busy: false, error: '' } : c.lists[r.id] || { busy: true, models: [], error: '' }
  const pick = c.picks[r.id]
  const sel = list.models.find(x => `${x.source}:${x.id}` === c.sel)
  // the project's own art: one more card, first in the grid
  const o: Own | null = m?.art.length ? (c.own[r.id] ||= { art: m.art[c.role % m.art.length], job: null }) : null
  const j = o?.job
  const all = makeable(c)
  const allBtn = m && all.length > 1 ? <Button role="ghost" className={LINK} onPress={() => void makeAll()}>Make all {all.length} · {all.length * m.cost} credits</Button> : null
  const arts = o && m && m.art.length > 1 ? (
    <div className="my-2 flex gap-2 overflow-x-auto p-0.5">
      {m.art.map(a => (
        <button type="button" key={a} aria-label="Picture" aria-pressed={a === o.art} onClick={() => { o.art = a; if (!m.ready && c.picks[r.id]?.key === 'own') c.picks[r.id].art = a; draw() }}
          className={`h-[72px] flex-[0_0_56px] cursor-pointer overflow-hidden rounded-[8px] border bg-bg p-0 ${a === o.art ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : 'border-line'}`}>
          <Small src={a} max={128} className="block h-full w-full object-cover" />
        </button>
      ))}
    </div>
  ) : null
  const INFO = 'mb-2 rounded-[12px] border border-line bg-panel-2 px-3.5 py-3'
  const card = (on: boolean, open: boolean) => `relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border bg-panel-2 p-0 text-left text-text transition-[border-color,transform] duration-150 motion-reduce:transition-none motion-safe:data-[hovered]:-translate-y-0.5 ${on ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : open ? 'border-line-2' : 'border-line'}`
  const num = (on: boolean) => `absolute top-2 left-2 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold ${on ? 'bg-accent text-accent-ink' : 'bg-[color-mix(in_srgb,var(--bg)_80%,transparent)]'}`
  const PIC = 'block aspect-[3/4] w-full bg-bg object-cover'

  return (
    <div {...drop}>
      <H3>{r.name || r.label}</H3>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Roles">
        {c.roles.map((x, i) => (
          <Button key={x.id} role="ghost" {...{ 'aria-selected': i === c.role }} className={`!rounded-full border !px-4 ${i === c.role ? '!border-accent text-accent' : '!border-[rgb(var(--glass-rgb)/.3)] bg-[rgb(var(--glass-rgb)/.05)]'}`}
            onPress={() => { c.role = i; c.sel = null; draw(); void search() }}>
            {c.picks[x.id] && <Icon name="check" size={14} />}{x.label}
          </Button>
        ))}
        <Button role="ghost" className={`${LINK} !rounded-full`} onPress={() => files.current?.click()}><Icon name="plus" size={14} />Pictures</Button>
        {pickFiles}
      </div>
      <Bench cast={c} onOpen={id => { const i = c.roles.findIndex(x => x.id === id); if (i >= 0) { c.role = i; c.sel = 'own'; draw() } }} />
      {(o || list.models.length > 0) && (
        <div className="mt-1 mb-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {o && m && (
            <PlainButton aria-label={m.ready ? 'Meshy' : 'Sprite'} className={card(pick?.key === 'own', c.sel === 'own')}
              onPress={() => {
                c.sel = 'own'
                // without a key the art is the pick at once (free); a Meshy model waits for Accept
                if (!m.ready) c.picks[r.id] = spritePick(r, o.art)
                draw()
              }}>
              <span className={num(pick?.key === 'own')}><Icon name={m.ready ? 'box' : 'image'} size={14} /></span>
              <Small src={j?.pick?.thumbSrc || o.art} className={PIC} />
              <b className="truncate px-2.5 py-2 text-[13px] font-semibold">{m.ready ? 'Meshy' : 'Sprite'}</b>
            </PlainButton>
          )}
          {!list.busy && list.models.map(x => {
            const k = `${x.source}:${x.id}`
            return (
              <PlainButton key={k} aria-label={`${x.n}. ${x.name}`} className={card(pick?.key === k, c.sel === k)}
                onPress={() => { c.sel = k; c.picks[r.id] = { key: k, role: r.id, label: r.label, ...x }; draw() }}>
                <span className={num(pick?.key === k)}>{x.n}</span>
                {x.preview ? <img src={x.preview} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={PIC} /> : <i className={PIC} />}
                <b className="truncate px-2.5 py-2 text-[13px] font-semibold">{x.name}</b>
              </PlainButton>
            )
          })}
        </div>
      )}
      {list.busy && <div className="flex flex-col items-center gap-3 px-2.5 py-8"><Spin label="Searching" /></div>}
      {!list.busy && !list.models.length && !c.only && (
        <div role="status" className="flex flex-col items-center gap-3 px-2.5 py-8 text-center text-muted"><span aria-hidden>⚠</span><span>{list.error ? 'No answer' : 'Nothing fits'}</span></div>
      )}
      {c.sel === 'own' && o && m && (
        !m.ready ? <div className={INFO}><b>Sprite</b>{arts}</div>
          : j?.state === 'running' ? (allBtn && <div className={INFO}><b>Meshy</b><span className="flex items-center gap-3">{allBtn}</span></div>)
            : j?.state === 'done' ? (
              <div className={INFO}><b>Meshy</b>
                <div className="my-2 aspect-[3/4] w-40 overflow-hidden rounded-[12px] bg-bg">{j.pick?.thumbSrc && <Small src={j.pick.thumbSrc} className="block h-full w-full object-cover" />}</div>
                <span className="flex flex-wrap items-center gap-3">
                  <Button role="ghost" className={LINK} onPress={() => void make(r)}><Icon name="refresh-cw" size={14} />Redo · {m.cost} credits</Button>
                  <Button role="ghost" className={LINK} onPress={() => { c.picks[r.id] = { key: 'own', ...j.pick }; draw() }}>{pick?.key === 'own' && <Icon name="check" size={14} />}Accept</Button>
                  {allBtn}
                </span>
              </div>
            ) : (
              <div className={INFO}><b>Meshy</b>{arts}
                {j?.state === 'failed' && <p role="alert" className="my-2 text-[13px] text-muted"><span aria-hidden>⚠</span> {j.error || ''}</p>}
                <span className="flex flex-wrap items-center gap-3"><Button role="ghost" className={LINK} onPress={() => void make(r)}>Make · {m.cost} credits</Button>{allBtn}</span>
              </div>
            )
      )}
      {sel && (
        <div className={INFO}><b>{sel.name}</b>
          <dl className="my-2 grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
            <dt className="pt-0.5 text-xs text-muted">By</dt><dd className="m-0">{sel.creator}</dd>
            <dt className="pt-0.5 text-xs text-muted">Licence</dt><dd className="m-0">{sel.licence?.credit}{sel.licence?.restyle ? '' : ' · own look kept'}</dd>
            <dt className="pt-0.5 text-xs text-muted">Triangles</dt><dd className="m-0">{Number(sel.triangles || 0).toLocaleString()}</dd>
          </dl>
          {sel.url && <LinkButton role="ghost" className={LINK} href={sel.url} target="_blank" rel="noopener"><Icon name="external-link" size={14} />{sel.source === 'vroid' ? 'VRoid Hub' : 'Sketchfab'}</LinkButton>}
        </div>
      )}
      {foot}
    </div>
  )
}
