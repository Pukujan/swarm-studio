// The Plan board's sections (web/plan.js render()): the Plan's cards, its Starter and Systems, then Sketches, Build,
// Mocks, World and Close-ups. Each artboard is a name and one value at rest (RULES.md rule 30); everything else is
// in the inspector once it is selected.
import type { MouseEvent, ReactNode } from 'react'
import { painterOf, CREW } from '@studio/icons'
import { Artboard, Column, CrewCursor, Section } from '../../board/Board'
import { Icon } from '../../primitives/Icon'
import { cardValue, cellAt, sheetsOf, shotsOf } from './model'
import type { Pic, Plan, Sheet, StarterChoice } from './types'

export interface SectionsProps {
  plan: Plan
  sel: string | null
  cell: number | null
  // the crew writing the cards in, one after another (a new plan): how many are in; null when done
  writing: number | null
  onSelect: (key: string) => void
  onPick: (sheet: Sheet, cell: number) => void
}

const SIZE: Record<string, string> = {
  sheet: 'h-[228px] w-[342px]', mock: 'h-[148px] w-[222px]', 'bd equirect': 'h-[171px] w-[342px]', 'bd strip': 'h-[86px] w-[342px]',
  cutin: 'h-[125px] w-[222px]', portrait: 'h-[125px] w-[84px]', view: 'h-[125px] w-[84px]'
}

// the crew at work: a slow sheen over the empty frame, and the painter's cursor
function AtWork({ who }: { who: string }) {
  return <><div aria-busy="true" className="pl-work absolute inset-0 rounded-[3px] motion-safe:animate-[pl-sheen_2.4s_linear_infinite] [background:linear-gradient(105deg,transparent_30%,color-mix(in_srgb,var(--text)_12%,transparent)_50%,transparent_70%)_0_0/260%_100%]" /><CrewCursor name={who} /></>
}

// one picture slot: the picture when done, the crew at work while painting, an empty frame before; its name under it
function PictureSlot({ id, kind, name, pic, sel, onSelect, onPress, children }: {
  id: string, kind: string, name: string, pic?: Pic | null, sel: string | null, onSelect: (k: string) => void,
  onPress?: (e: MouseEvent<HTMLDivElement>) => boolean, children?: ReactNode
}) {
  return (
    <Artboard id={id} selected={sel === id} onSelect={onSelect} onPress={onPress} label={name || undefined}
      className={`overflow-visible ${SIZE[kind] ?? ''} ${pic?.state === 'failed' ? 'border-dashed' : ''}`}>
      {pic?.state === 'done' && pic.src && <img src={pic.src} alt="" draggable={false} loading="lazy" className="pointer-events-none block size-full rounded-[3px] object-cover" />}
      {pic?.state === 'painting' && <AtWork who={painterOf(id)} />}
      {children}
      {name && <em className="absolute top-[calc(100%+6px)] left-0 font-body text-xs whitespace-nowrap text-muted not-italic">{name}</em>}
    </Artboard>
  )
}

// a card: its name and one value
function PlanCard({ id, name, value, why, sel, onSelect, off, mine, wait, children }: {
  id: string, name: string, value: string, why?: string, sel: string | null, onSelect: (k: string) => void,
  off?: boolean, mine?: boolean, wait?: boolean, children?: ReactNode
}) {
  return (
    <Artboard id={id} selected={sel === id} onSelect={onSelect}
      className={`flex w-[210px] flex-col justify-between bg-deep px-4 py-3.5 transition-[opacity,transform] duration-300 ease-ease motion-reduce:transition-none ${why != null ? 'h-[132px]' : 'h-[118px]'} ${wait ? 'translate-y-1.5 opacity-0' : ''} ${mine ? 'border-line-2' : ''}`}>
      <b className="font-label text-[13px] font-semibold uppercase tracking-[.12em] text-muted">{name}</b>
      <span className={`line-clamp-2 font-display font-semibold leading-[1.15] text-text ${why != null ? 'line-clamp-1 text-lg' : 'text-[22px]'} ${off ? 'opacity-45' : ''}`}>{value}</span>
      {why != null && <i className={`line-clamp-2 font-body text-xs leading-[1.35] text-muted not-italic ${off ? 'opacity-45' : ''}`}>{why}</i>}
      {children}
    </Artboard>
  )
}

// the picked cells on a done sheet: a ring each, the one with the note open solid
function Rings({ sheet, on }: { sheet: Sheet, on: number | null }) {
  const [cols, rows] = sheet.grid ?? [5, 4]
  return <>{(sheet.picks ?? []).map(c => (
    <i key={c} aria-hidden className={`pointer-events-none absolute box-border rounded-[3px] border-2 border-accent ${c === on ? 'shadow-[0_0_0_2px_var(--void),0_0_0_4px_var(--accent)]' : ''}`}
      style={{ left: `${(c % cols) / cols * 100}%`, top: `${Math.floor(c / cols) / rows * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` }} />
  ))}</>
}

export function PlanSections({ plan: p, sel, cell, writing, onSelect, onPick }: SectionsProps) {
  const isWriting = writing != null
  const slot = (id: string, kind: string, name: string, pic?: Pic | null, extra?: ReactNode, onPress?: (e: MouseEvent<HTMLDivElement>) => boolean) =>
    <PictureSlot key={id} id={id} kind={kind} name={name} pic={pic} sel={sel} onSelect={onSelect} onPress={onPress}>{extra}</PictureSlot>

  const cast = (p.cards.find(c => c.id === 'cast')?.body.roster ?? []).filter(r => r?.name)
  const chars = new Map((p.build?.characters ?? []).map(c => [c.name, c]))
  const shown = !!p.gate?.locked || !!(p.build?.characters ?? []).length
  const flat = !!p.art?.sprites?.length
  const made = new Map((p.build?.sprites ?? []).map(x => [x.name, x]))

  // a sheet: once selected, a click on a cell picks it (or unpicks it)
  const sheetPress = (s: Sheet | undefined) => (e: MouseEvent<HTMLDivElement>) => {
    if (!s || s.state !== 'done') return false
    const r = e.currentTarget.getBoundingClientRect()
    onPick(s, cellAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height, s.grid))
    return true
  }

  const sv = p.starterView
  const st = (k: 'engine' | 'template' | 'assets', name: string, c: StarterChoice) =>
    <PlanCard key={k} id={`st:${k}`} name={name} value={c.name || 'None'} why={c.why || ''} mine={c.by === 'person'} sel={sel} onSelect={onSelect} />

  return (
    <>
      <Column>
        <Section name="cards" label="Plan">
          {p.cards.map((c, i) => (
            <PlanCard key={c.id} id={`card:${c.id}`} name={c.name} value={cardValue(c)} sel={sel} onSelect={onSelect} wait={isWriting && i >= writing}>
              {isWriting && i === writing - 1 && <CrewCursor name={CREW[i % CREW.length]} className="top-[62%] left-[70%]" />}
            </PlanCard>
          ))}
        </Section>
        {sv && !isWriting && <>
          <Section name="starter" label="Starter">{st('engine', 'Engine', sv.engine)}{st('template', 'Template', sv.template)}{st('assets', 'Assets', sv.assets)}</Section>
          {sv.systems.length > 0 && (
            <Section name="systems" label="Systems">
              {sv.systems.map(x => <PlanCard key={x.id} id={`sys:${x.id}`} name={x.on ? 'On' : 'Off'} value={x.name} why={x.why} off={!x.on} sel={sel} onSelect={onSelect} />)}
            </Section>
          )}
        </>}
        {!isWriting && (
          <Section name="sheets" label="Sketches" className="max-w-[700px] gap-x-4 gap-y-[30px]">
            {sheetsOf(p).map(([k, n]) => {
              const s = (p.sheets ?? []).find(x => x.kind === k)
              return slot(`sheet:${k}`, 'sheet', n, s, s?.state === 'done' ? <Rings sheet={s} on={sel === `sheet:${k}` ? cell : null} /> : null, sheetPress(s))
            })}
          </Section>
        )}
        {!isWriting && (flat ? (shown || made.size > 0) : shown) && (
          <Section name="build" label="Build" className="max-w-[760px] gap-x-[22px] gap-y-[30px]">
            {flat
              ? p.art!.sprites!.map(x => slot(`sp:${x.name}`, 'view', x.name, made.get(x.name)))
              : cast.map(r => {
                const c = chars.get(r.name)
                const m = c?.model
                const key = `md:${r.name}`
                return (
                  <div key={r.name} className="flex items-start gap-2">
                    {(['front', 'side', 'back'] as const).map((v, i) => slot(`vw:${r.name}:${v}`, 'view', i ? '' : r.name, c?.[v]))}
                    <Artboard id={key} selected={sel === key} onSelect={onSelect} label={`${r.name} model`} className={`h-[125px] w-[84px] overflow-visible ${m?.state === 'failed' ? 'border-dashed' : ''}`}>
                      {m?.state === 'done' && (m.thumb ? <img src={m.thumb} alt="" draggable={false} loading="lazy" className="pointer-events-none block size-full rounded-[3px] object-cover" /> : <div className="absolute inset-0 grid place-items-center text-dim"><Icon name="box" size={22} /></div>)}
                      {m?.state === 'making' && <AtWork who={painterOf(key)} />}
                    </Artboard>
                  </div>
                )
              })}
          </Section>
        )}
      </Column>
      {!isWriting && (
        <Column>
          <Section name="mocks" label="Mocks" className="max-w-[700px] gap-x-4 gap-y-[30px]">
            {shotsOf(p).map(([k, n]) => slot(`mock:${k}`, 'mock', n, (p.mocks ?? []).find(x => x.shot === k)))}
          </Section>
          {p.shape?.backdrops !== false && (
            <Section name="world" label="World" className="max-w-[700px] gap-x-4 gap-y-[30px]">
              {(p.backdrops ?? []).length
                ? [...p.backdrops!].sort((a, b) => a.stage - b.stage || a.n - b.n).map(b => slot(`bd:${b.id}`, `bd ${b.shape}`, b.n === 1 ? b.name : '', b))
                : slot('bd:new', 'bd equirect', 'Backdrops', null)}
            </Section>
          )}
          {shown && p.shape?.closeups !== false && (
            <Section name="close" label="Close-ups" className="max-w-[760px] gap-x-[22px] gap-y-[30px]">
              {cast.map(r => (
                <div key={r.name} className="flex items-start gap-2">
                  {slot(`cu:${r.name}:cutin`, 'cutin', r.name, chars.get(r.name)?.cutin)}
                  {slot(`cu:${r.name}:portrait`, 'portrait', '', chars.get(r.name)?.portrait)}
                </div>
              ))}
            </Section>
          )}
        </Column>
      )}
    </>
  )
}

// the board while the plan is on its way: the cards' shape (web/plan.js's skeleton)
export function PlanSkeleton() {
  return (
    <Column>
      <Section label="Plan">
        {[0, 1, 2].map(i => <div key={i} aria-busy="true" className="wait-in h-[118px] w-[210px] rounded-[4px] border border-line bg-[color-mix(in_srgb,var(--text)_5%,transparent)] motion-safe:animate-pulse" />)}
      </Section>
    </Column>
  )
}
