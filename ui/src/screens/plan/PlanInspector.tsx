// The Plan board's inspector (web/plan.js renderInsp, starterInsp, picInsp): the selected card's lines as fields,
// saved as they change; a starter choice's options with why; a system's switch; a picture's picks, note and the one
// action that paints it; the first picture's check of direction.
import { useEffect, useRef, useState } from 'react'
import { Input, Label, TextField as AriaTextField } from 'react-aria-components'
import { InspectorHead } from '../../board/Board'
import { Button, LinkButton } from '../../primitives/Button'
import { Checkbox } from '../../primitives/Checkbox'
import { Icon } from '../../primitives/Icon'
import { fieldLabel, fieldsOf, sheetsOf, shotsOf } from './model'
import type { Card, Pic, Plan, RosterEntry } from './types'

export interface InspectorActions {
  close: () => void
  // a card's new body; `now` saves at once (a switch, a removed row), else after a pause in typing
  saveCard: (card: string, body: Card['body'], now?: boolean) => void
  addHero: () => void
  act: (sub: string, body?: unknown) => void
  pickCell: (cell: number) => void
  note: (sheet: string, cell: number, text: string) => void
}

const fieldClass = 'h-8 min-w-0 rounded-[8px] border border-line bg-deep px-2.5 font-body text-[13px] text-text outline-none data-[focused]:border-text'

// one labelled line of a card: a label over an input (a long value still fits: 400 characters)
function Field({ label, value, onChange, maxLength = 400, placeholder }: { label: string, value: string, onChange: (v: string) => void, maxLength?: number, placeholder?: string }) {
  return (
    <AriaTextField value={value} onChange={onChange} maxLength={maxLength} className="flex flex-col gap-1">
      <Label className="font-monospace text-xs text-muted">{label}</Label>
      <Input placeholder={placeholder} className={fieldClass} />
    </AriaTextField>
  )
}
function Bare({ label, value, onChange, maxLength, placeholder, wide }: { label: string, value: string, onChange: (v: string) => void, maxLength: number, placeholder?: string, wide?: boolean }) {
  return <AriaTextField aria-label={label} value={value} onChange={onChange} maxLength={maxLength} className={wide ? 'col-span-full' : 'min-w-0'}><Input placeholder={placeholder} className={`${fieldClass} w-full`} /></AriaTextField>
}

// a card's fields, kept here while the person types and saved through saveCard
function CardInspector({ card, plan, a }: { card: Card, plan: Plan, a: InspectorActions }) {
  const [body, setBody] = useState(card.body)
  // a new card selected (not a save of this one coming back)
  const shown = useRef(card.id)
  useEffect(() => { if (shown.current !== card.id) { shown.current = card.id; setBody(card.body) } }, [card])
  const change = (next: Card['body'], now = false) => { setBody(next); a.saveCard(card.id, next, now) }
  const roster = body.roster ?? []
  const row = (i: number, k: keyof RosterEntry, v: string) => change({ ...body, roster: roster.map((r, j) => j === i ? { ...r, [k]: v } : r) })
  return (
    <>
      <InspectorHead name={card.name} onClose={a.close} />
      {card.id === 'systems'
        ? Object.entries(body).filter(([k]) => k !== 'roster').map(([k, v]) => <Checkbox key={k} isSelected={v === 'on'} onChange={on => change({ ...body, [k]: on ? 'on' : 'off' }, true)}>{k}</Checkbox>)
        : fieldsOf({ ...card, body }).map(([k, v]) => <Field key={k} label={fieldLabel(k)} value={Array.isArray(v) ? v.join(', ') : String(v ?? '')} onChange={x => change({ ...body, [k]: x })} />)}
      {card.id === 'look' && <StyleSwitch plan={plan} a={a} />}
      {card.id === 'cast' && <>
        <div role="list" aria-label="Cast" className="flex flex-col gap-2.5">
          {roster.map((r, i) => (
            <div key={i} role="listitem" className="grid grid-cols-[1fr_1fr_40px] items-center gap-1.5">
              <Bare label="Name" value={r.name} maxLength={40} onChange={v => row(i, 'name', v)} />
              <Bare label="Weapon" value={r.weapon ?? ''} maxLength={60} onChange={v => row(i, 'weapon', v)} />
              <Button role="ghost" aria-label={`Remove ${r.name}`} onPress={() => change({ ...body, roster: roster.filter((_, j) => j !== i) }, true)}><Icon name="x" size={14} /></Button>
              <Bare label="Look" value={r.look ?? ''} maxLength={300} placeholder="Look" wide onChange={v => row(i, 'look', v)} />
            </div>
          ))}
        </div>
        <Button role="ghost" onPress={a.addHero}><Icon name="plus" size={15} />Add</Button>
      </>}
    </>
  )
}

const StyleSwitch = ({ plan, a }: { plan: Plan, a: InspectorActions }) =>
  <Checkbox isSelected={!!plan.style?.locked} onChange={on => a.act('style', { locked: on })}>Lock style</Checkbox>

const Sum = ({ children }: { children: string }) => <p className="m-0 font-body text-[13px] leading-[1.45] text-text">{children}</p>

// the one action that paints a picture: Draw / Paint, then again
function Again({ what, pic, label = 'Draw', a }: { what: string, pic?: Pic | null, label?: string, a: InspectorActions }) {
  const [kind, ...rest] = what.split(':')
  const id = rest.join(':')
  const go = () => {
    if (kind === 'sheet') return a.act('sheet', { kind: id })
    if (kind === 'mocks') return a.act('mocks')
    if (kind === 'mock') return a.act('mocks', { shots: [id] })
    if (kind === 'bd') return a.act('backdrops', id === '' ? {} : { stage: Number(id) })
    if (kind === 'cu') return a.act('closeups', { name: id })
    if (kind === 'vw') return a.act('view', { name: rest.slice(0, -1).join(':'), view: rest.at(-1) })
  }
  const again = pic?.state === 'done' || pic?.state === 'failed'
  return <Button role={pic?.state === 'done' ? 'ghost' : 'primary'} isDisabled={pic?.state === 'painting'} onPress={go}>{again ? `${label} again` : label}</Button>
}

// the first picture: the plan in plain words, and one step back
function Check({ plan, name, a }: { plan: Plan, name: string, a: InspectorActions }) {
  const [note, setNote] = useState('')
  if (plan.first?.name !== name) return null
  return <>
    {plan.summary && <Sum>{plan.summary}</Sum>}
    <Field label="What should it be?" value={note} maxLength={300} onChange={setNote} />
    <Button role="ghost" onPress={() => a.act('replan', { note })}>Not what I asked for</Button>
  </>
}

function StarterInspector({ plan, k, a }: { plan: Plan, k: string, a: InspectorActions }) {
  const sv = plan.starterView
  if (!sv) return null
  const [kind, id] = k.split(':')
  if (kind === 'sys') {
    const x = sv.systems.find(y => y.id === id)
    if (!x) return null
    return <>
      <InspectorHead name={x.name} onClose={a.close} />
      <Sum>{x.why}</Sum>
      <Checkbox isSelected={x.on} isDisabled={x.required} onChange={on => a.act('starter', { system: x.id, on })}>{x.required ? 'Part of this template' : 'On'}</Checkbox>
    </>
  }
  const key = id as 'engine' | 'template' | 'assets'
  const c = sv[key]
  if (!c) return null
  const opts = key === 'template' ? [...c.options, { id: '', name: 'None', why: 'an empty project; the crew writes every system', fits: true }] : c.options
  return <>
    <InspectorHead name={{ engine: 'Engine', template: 'Template', assets: 'Assets' }[key]} onClose={a.close} />
    <div role="radiogroup" aria-label={key} className="flex flex-col gap-1.5">
      {opts.map(o => {
        const on = (c.value ?? '') === o.id
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} disabled={o.fits === false}
            onClick={() => { if (!on) a.act('starter', { key, value: o.id || null }) }}
            className={`block w-full cursor-pointer rounded-[10px] border bg-deep px-2.5 py-2 text-left font-body text-[13px] font-semibold leading-[1.3] text-text outline-none hover:border-accent focus-visible:border-accent disabled:cursor-default disabled:opacity-45 ${on ? 'border-accent' : 'border-line'}`}>
            {o.name}
            <small className="mt-0.5 block font-normal leading-[1.35] text-muted">{o.fits === false ? `Made for ${sv.engine.value === 'godot' ? 'the browser' : 'Godot 4'}` : o.why}</small>
          </button>
        )
      })}
    </div>
    {key === 'template' && sv.addons.length > 0 && <p className="mt-3 font-body text-xs text-muted">{sv.addons.map(x => `${x.name} ${x.version} · ${x.licence}`).join(' · ')}</p>}
  </>
}

function PictureInspector({ plan: p, k, cell, a }: { plan: Plan, k: string, cell: number | null, a: InspectorActions }) {
  const [kind, ...rest] = k.split(':')
  const id = rest.join(':')
  const head = (name: string) => <InspectorHead name={name} onClose={a.close} />
  if (kind === 'sheet') {
    const s = (p.sheets ?? []).find(x => x.kind === id)
    const picks = s?.picks ?? []
    const on = cell != null && picks.includes(cell) ? cell : null
    return <>
      {head(sheetsOf(p).find(x => x[0] === id)?.[1] ?? id)}
      {picks.length > 0 && <div className="flex flex-wrap gap-1.5">{picks.map(c => (
        <button key={c} type="button" aria-pressed={c === on} onClick={() => a.pickCell(c)}
          className={`h-10 min-w-10 cursor-pointer rounded-[8px] border bg-deep font-monospace text-xs font-semibold ${c === on ? 'border-accent text-accent' : 'border-line text-text'}`}>{c + 1}</button>
      ))}</div>}
      {on != null && s && <NoteField key={`${s.id}:${on}`} initial={s.notes?.[on] ?? ''} onChange={t => a.note(s.id, on, t)} />}
      <Again what={`sheet:${id}`} pic={s} a={a} />
    </>
  }
  if (kind === 'mock') {
    const m = (p.mocks ?? []).find(x => x.shot === id)
    return <>{head(shotsOf(p).find(x => x[0] === id)?.[1] ?? id)}{(p.mocks ?? []).length ? <Again what={`mock:${id}`} pic={m} a={a} /> : <Again what="mocks" label="Draw all" a={a} />}</>
  }
  if (kind === 'bd') {
    const b = (p.backdrops ?? []).find(x => x.id === id)
    return <>{head(b?.name ?? 'Backdrops')}{!p.style?.locked && <StyleSwitch plan={p} a={a} />}{p.style?.locked && (b ? <Again what={`bd:${b.stage}`} pic={b} label="Paint" a={a} /> : <Again what="bd:" label="Paint" a={a} />)}</>
  }
  if (kind === 'vw') {
    const name = rest.slice(0, -1).join(':'), v = rest.at(-1) as 'front' | 'side' | 'back'
    const c = (p.build?.characters ?? []).find(x => x.name === name)
    return <>{head(name)}<Check plan={p} name={name} a={a} />{p.gate?.locked && p.build?.state !== 'building' && <Again what={`vw:${name}:${v}`} pic={c?.[v]} a={a} />}</>
  }
  if (kind === 'sp') return <>{head(id)}<Check plan={p} name={id} a={a} /></>
  if (kind === 'md') {
    const m = (p.build?.characters ?? []).find(x => x.name === id)?.model
    return <>{head(id)}{m?.state === 'done' && m.src ? <LinkButton role="ghost" href={m.src} download>Download</LinkButton> : m?.error ? <p className="m-0 font-body text-[13px] text-muted">{m.error}</p> : null}</>
  }
  if (kind === 'cu') {
    const name = rest.slice(0, -1).join(':'), which = rest.at(-1) as 'cutin' | 'portrait'
    const c = (p.build?.characters ?? []).find(x => x.name === name)
    return <>{head(name)}<Again what={`cu:${name}`} pic={c?.[which]} label="Paint" a={a} /></>
  }
  return null
}

function NoteField({ initial, onChange }: { initial: string, onChange: (t: string) => void }) {
  const [v, setV] = useState(initial)
  return <Field label="Note" value={v} maxLength={120} onChange={t => { setV(t); onChange(t) }} />
}

// what the inspector shows for the selection, or null when there is nothing to show (it stays closed)
export function inspectorFor(plan: Plan, sel: string | null, cell: number | null, a: InspectorActions) {
  if (!sel) return null
  const card = sel.startsWith('card:') ? plan.cards.find(x => `card:${x.id}` === sel) : null
  if (card) return <CardInspector card={card} plan={plan} a={a} />
  if (/^(st|sys):/.test(sel)) return plan.starterView ? <StarterInspector plan={plan} k={sel} a={a} /> : null
  return /^(sheet|mock|bd|vw|sp|md|cu):/.test(sel) ? <PictureInspector plan={plan} k={sel} cell={cell} a={a} /> : null
}
