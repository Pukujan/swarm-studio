// The Studio first (docs/specs/37-studio-first.md, 42-ways-to-make.md; the current Studio's web/scaffold.js): a
// project before anything is built. The board holds the kind's steps as sections (Brand, References, Assets, Plan,
// Lock), each with a dot for its state; the step path across the top opens a step, skips, removes or brings one
// back; Layers on the left lists every section and what is in it; the inspector edits what is selected. Steps go in
// any order, and Build is the person's press.
//
// Name: "Studio first" is proposed in docs/ux/OBJECTS.md and provisional, pending the owner's review (2026-11-13).
// Not here yet: the planner's talk on the left (web/canvas/talk.js) has not moved, so the left panel offers it in
// the current Studio at the same address, and Build is pressed there too (it starts the build in the Design deck).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LinkButton, Button } from '../primitives/Button'
import { Layers, StepDot, type LayerGroup } from '../shared/Layers'
import { startPet, type KitCard as KitCardDef } from '../legacy'
import { search } from '../nav/address'
import { useNav, useNavMachine } from '../nav/NavProvider'
import { useTrail } from '../shell/Trail'
import { KitCard } from './studio/KitCard'
import { StepPath } from './studio/StepPath'
import { StudioBoard } from './studio/StudioBoard'
import { StudioInspector } from './studio/StudioInspector'
import { STEP_NAME, TAKES, lookOf, useStudio, type Pack } from './studio/useStudio'

const FILE_ICON: Record<string, string> = { link: '🔗', video: '🎞', audio: '♪', font: 'Aa' }

export function StudioFirst() {
  const { view, go } = useNav()
  const nav = useNavMachine()
  const pid = view.room === 'studio' ? view.project : null
  const S = useStudio(pid)
  const { d, error, takes, sel, select, kit, ctx, stateOf, steps, gone, planSections, cards, board, actions, tick } = S
  const root = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const pickTo = useRef<'ref' | 'asset'>('ref')
  const [sheet, setSheet] = useState(false)
  const here = search(view, typeof location === 'undefined' ? '' : location.search)

  // Hermia's cursor (web/pet.js), started as it is with this machine and this screen
  useEffect(() => { startPet(nav, root.current) }, [nav])

  // Esc shuts the Layers sheet, then clears the selection, as the board does in the current Studio; with neither,
  // it goes back a step and then to Projects (App's Esc, through the machine)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [role="menu"], [role="dialog"]')) return
      if (sheet) { e.preventDefault(); setSheet(false); return }
      if (sel) { e.preventDefault(); select(null) }
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [sel, select, sheet])
  // a click outside the Layers sheet shuts it
  useEffect(() => {
    if (!sheet) return
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.pj-side, .sc-layers-btn')) setSheet(false) }
    addEventListener('pointerdown', onDown, true)
    return () => removeEventListener('pointerdown', onDown, true)
  }, [sheet])
  // the step the address names comes into view when it changes from outside (Back, Esc), not under a selection
  useEffect(() => {
    if (view.step && !sel && framed.current === pid) board.current?.focus(view.step)
  }, [view.step]) // only a change of step moves the board

  // the top bar: Projects › the project's name, and Build (pressed in the current Studio, where the build runs)
  const build = useMemo(() => (kit.build ? <LinkButton role="primary" href={`/${here}`}>Build<span className="max-[760px]:sr-only"> in the Studio</span></LinkButton> : undefined), [kit.build, here])
  useTrail(d?.project.title || d?.project.name, build)

  // the step named in the address is in view (the planner's start when none is named), once the board is drawn
  const framed = useRef<string | null>(null)
  useEffect(() => {
    if (!d || framed.current === d.project.id) return
    framed.current = d.project.id
    requestAnimationFrame(() => {
      board.current?.frameAll(false)
      if (d.studio.mode === 'takes' && takes) { board.current?.focus('takes', false); return }
      const first = view.step || kit.suggest?.(ctx()) || d.studio.start || kit.starts[0]?.id
      if (!first) return
      if (!view.step) go({ type: 'studio.step', step: first })
      board.current?.focus(first, false)
    })
  }, [d, takes, view.step, kit, ctx, go, board])

  const press = useCallback((key: string) => {
    const x = cards.get(key)
    if (x?.press) return x.press(ctx())
    if (key === 'brand:open') return void go({ type: 'brand' })
    if (key === 'ref:add' || key === 'asset:add') { pickTo.current = key === 'ref:add' ? 'ref' : 'asset'; return picker.current?.click() }
    select(key)
  }, [cards, ctx, go, select])

  const fly = (key: string) => { const el = root.current?.querySelector<HTMLElement>(`.ab[data-key="${CSS.escape(key)}"]`); if (el) { board.current?.focus(el); el.focus({ preventScroll: true }) } }
  const selectable = (key: string) => cards.has(key) || /^(ref|asset|lock|take):/.test(key)

  if (!pid) return null
  if (error && !d) return (
    <section className="grid min-h-[60dvh] place-content-center justify-items-center gap-4 p-6 text-center">
      <p className="font-monospace text-sm text-hot-text">{error}</p>
      <Button onPress={() => void S.reload()}>Try again</Button>
    </section>
  )

  // ---------- the board's sections
  const head = (step: string) => <span className="al"><StepDot state={stateOf(step)} />{STEP_NAME[step]}</span>
  const card = (key: string, name: string, cls: string, inner: React.ReactNode, def?: KitCardDef) =>
    <KitCard key={key} id={key} name={name} cls={cls} selected={sel === key} onPress={() => press(key)} draw={def?.render} ctx={ctx} version={tick + (d ? 0 : 1)}>{inner}</KitCard>
  const thumb = (kind: 'ref' | 'asset', x: { id: string, name: string, kind?: string, src?: string, role?: string }) => card(`${kind}:${x.id}`, x.name, 'sc-thumb', <>
    {x.kind === 'image' && x.src ? <img src={x.src} alt="" draggable={false} loading="lazy" /> : <div className="sc-file"><span aria-hidden>{FILE_ICON[x.kind || ''] || '▤'}</span></div>}
    <em>{x.role || x.name}</em></>)
  const add = (key: string, name: string) => card(key, name, 'sc-add', <><span aria-hidden className="text-lg">+</span><span>{name}</span></>)
  const brandCard = () => {
    const b = d?.brand, L = lookOf(b ?? null)
    if (!b || !L) return card('brand:open', 'Brand sheet', 'pcard sc-brand-new', <><b>Brand sheet</b><span aria-hidden>⚙</span></>)
    return card('brand:open', 'Brand sheet', 'sc-brand', <>
      <div className="br-sw">{(['bg', 'text', 'accent', 'link'] as const).map(k => <i key={k} style={{ background: L[k] }} />)}</div>
      <div className="sc-type" style={{ background: L.bg, color: L.text }}><b style={{ fontFamily: `'${L.heading}'` }}>Aa</b><span style={{ fontFamily: `'${L.body}'` }}>{L.heading} · {L.body}</span></div>
      <em>{b.lockedAt ? 'Locked' : 'Open'}</em></>)
  }
  const takeCard = (p: Pack) => card(`take:${p.slug}`, p.name, 'sc-take', <>
    <div className="sc-take-page" style={{ background: p.palette.bg, color: p.palette.text }}>
      {p.pictures?.photos?.[0]?.url && <img src={p.pictures.photos[0].url} alt="" draggable={false} loading="lazy" />}
      <b style={{ fontFamily: `'${p.type.heading}'` }}>{String(d?.studio.idea || p.name).split(/\s+/).slice(0, 6).join(' ')}</b>
      <span style={{ fontFamily: `'${p.type.body}'` }}>{p.voice?.lines?.[0] || p.for}</span><i style={{ background: p.palette.accent }} />
    </div>
    <div className="br-sw">{(['bg', 'text', 'accent', 'link'] as const).map(k => <i key={k} style={{ background: p.palette[k] }} />)}</div><em>{p.name}</em></>)
  const kitLook = (x: KitCardDef) => `${x.cls || (x.add ? 'sc-add' : 'pcard')}${x.wide ? ' sc-wide' : ''}`
  const sec = (step: string, inner: React.ReactNode, cls = '') => <section key={step} className={`pj-sec sc-step ${cls}`} data-sec={step}>{head(step)}<div className="abs">{inner}</div></section>

  const sections = !d ? (
    <section className="pj-sec"><span className="al">Studio</span><div className="abs"><div className="ab pcard wait-in" aria-busy="true"><b>Brand</b><span /></div></div></section>
  ) : <>
    {d.studio.mode === 'takes' && takes && <section className="pj-sec sc-step sc-takes" data-sec="takes"><span className="al">Three takes</span><div className="abs">
      {takes.packs.length ? takes.packs.map(takeCard) : Array.from({ length: TAKES }, (_, i) => <div key={i} className="ab sc-take wait-in" aria-busy="true" />)}
    </div></section>}
    {steps.map(step => {
      if (step === 'brand') return sec('brand', brandCard())
      if (step === 'references') return sec('references', <>{d.refs.map(r => thumb('ref', r))}{add('ref:add', 'Add reference')}</>)
      if (step === 'assets') return sec('assets', <>{d.assets.map(a => thumb('asset', a))}{add('asset:add', 'Add asset')}</>)
      if (step === 'plan' && kit.plan) return sec('plan', planSections.flatMap(s => s.cards).map(x => card(x.key, x.name, kitLook(x), x.render ? null : <b>{x.name}</b>, x)), `sc-plan-${kit.kind}`)
      return null
    })}
    {sec('proposal', card('lock:idea', 'Idea', 'pcard sc-idea', <><b>Idea</b><span>{d.studio.idea}</span></>))}
  </>

  // ---------- Layers: a group per section on the board, its cards as rows ("Add" cards are not layers)
  const groups: LayerGroup[] = []
  if (d) {
    if (d.studio.mode === 'takes' && takes?.packs.length) groups.push({ id: 'takes', title: 'Three takes', rows: takes.packs.map(p => ({ key: `take:${p.slug}`, name: p.name })) })
    for (const step of steps) {
      if (step === 'brand') groups.push({ id: 'brand', title: STEP_NAME.brand, state: stateOf('brand'), rows: [{ key: 'brand:open', name: 'Brand sheet' }] })
      if (step === 'references') groups.push({ id: 'references', title: STEP_NAME.references, state: stateOf('references'), rows: d.refs.map(r => ({ key: `ref:${r.id}`, name: r.name })) })
      if (step === 'assets') groups.push({ id: 'assets', title: STEP_NAME.assets, state: stateOf('assets'), rows: d.assets.map(a => ({ key: `asset:${a.id}`, name: a.name })) })
      if (step === 'plan' && kit.plan) {
        const secs = planSections.map(s => ({ ...s, cards: s.cards.filter(x => !x.add && x.cls !== 'sc-add') }))
        // a kit still drafting its plan (it has none yet) is the planner at work: a dot on the step
        const drafting = !secs.length && !!kit.prepare && !!d.studio.idea
        const rows = (cs: KitCardDef[]) => cs.map(x => ({ key: x.key, name: x.name, busy: x.busy }))
        if (secs.length <= 1) groups.push({ id: 'plan', title: STEP_NAME.plan, state: stateOf('plan'), busy: drafting || !!secs[0]?.cards.some(x => x.busy), rows: rows(secs[0]?.cards || []) })
        else for (const s of secs) groups.push({ id: `plan:${s.sec}`, title: s.sec || STEP_NAME.plan, state: stateOf('plan'), busy: s.cards.some(x => x.busy), rows: rows(s.cards) })
      }
    }
    groups.push({ id: 'proposal', title: STEP_NAME.proposal, state: stateOf('proposal'), rows: [{ key: 'lock:idea', name: 'Idea' }] })
  }

  const x = sel ? cards.get(sel) : undefined
  const pack = sel?.startsWith('take:') ? takes?.packs.find(p => `take:${p.slug}` === sel) : undefined
  const fail = S.fail
  const insp = !!(d && sel && (x || pack || /^(step|ref|asset|lock):/.test(sel)))

  return (
    <div ref={root} className={`project plan scaffold min-h-0 flex-1${insp ? ' insp-on' : ''}${sheet ? ' files-on' : ''}`} style={{ minHeight: 'calc(100dvh - 3.5rem)' }}>
      <aside className="pj-side" aria-label="Layers" onKeyDown={e => { if (e.key === 'Escape' && sheet) { e.stopPropagation(); setSheet(false) } }}>
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2"><span className="rounded-[8px] bg-surface-2 px-2.5 py-1.5 font-label text-[13px] font-semibold uppercase tracking-[.1em] text-text">Layers</span><Button role="ghost" aria-label="Close Layers" onPress={() => setSheet(false)} className="ml-auto hidden min-h-9 min-w-9 px-0 max-[760px]:inline-flex">×</Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {d && <Layers groups={groups} selected={sel}
            onSelect={k => { setSheet(false); if (selectable(k) && sel !== k) select(k); fly(k) }}
            onOpen={press}
            onGroup={id => { setSheet(false); board.current?.focus(id.split(':')[0]) }}
            canRename={k => !!cards.get(k)?.rename}
            onRename={(k, name) => { cards.get(k)?.rename?.(name) }}
            canRemove={k => /^(ref|asset):/.test(k) || !!cards.get(k)?.remove}
            onRemove={k => {
              const c = cards.get(k), id = k.slice(k.indexOf(':') + 1)
              if (c?.remove) return void c.remove()
              const done = () => { if (sel === k) select(null) }
              if (k.startsWith('ref:')) actions.removeRef(id).then(done).catch(fail)
              if (k.startsWith('asset:')) actions.removeAsset(id).then(done).catch(fail)
            }} />}
        </div>
        <div className="border-t border-line p-3"><LinkButton role="secondary" href={`/${here}`} className="w-full">Chat in the Studio</LinkButton></div>
      </aside>

      <StudioBoard ref={board} inspector={insp} onEmptyClick={() => { if (sel) select(null) }} onDropFiles={(to, files) => void actions.upload(to, files)}>
        <div className="col">{sections}</div>
      </StudioBoard>

      {d && <StepPath steps={steps} gone={gone} current={sel?.startsWith('step:') ? sel.slice(5) : null} stateOf={stateOf}
        onStep={s => { if (s !== 'proposal') select(`step:${s}`); board.current?.focus(s) }}
        onAdd={s => { actions.setStep(s, 'empty').then(() => requestAnimationFrame(() => board.current?.focus(s))).catch(fail) }} />}

      {insp && d && sel && <StudioInspector sel={sel} d={d} card={x} pack={pack} ctx={ctx} version={tick} onClose={() => select(null)} act={{
        skip: (step, skipped) => { actions.setStep(step, skipped ? 'empty' : 'skipped').catch(fail) },
        removeStep: step => { actions.setStep(step, 'removed').then(() => select(null)).catch(fail) },
        refGiven: id => { actions.refAsAsset(id).then(a => select(`asset:${a.id}`)).catch(fail) },
        removeRef: id => { actions.removeRef(id).then(() => select(null)).catch(fail) },
        assetRole: (id, role) => { actions.assetRole(id, role).catch(fail) },
        assetRef: id => { actions.assetAsRef(id).then(r => select(`ref:${r.id}`)).catch(fail) },
        removeAsset: id => { actions.removeAsset(id).then(() => select(null)).catch(fail) },
        useTake: slug => { actions.useTake(slug).then(() => { select(null); board.current?.focus('brand') }).catch(fail) },
        mix: () => go({ type: 'brand' })
      }} />}

      <button type="button" className="ib pj-files-btn sc-layers-btn" aria-label="Layers" aria-expanded={sheet} onClick={() => setSheet(v => !v)}><svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></svg></button>
      <input ref={picker} type="file" multiple hidden onChange={e => { const f = [...(e.currentTarget.files || [])]; e.currentTarget.value = ''; void actions.upload(pickTo.current, f) }} />
      {S.toast && <div className="hm-toast" role="status">{S.toast}</div>}
    </div>
  )
}
