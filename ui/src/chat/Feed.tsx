// The Chat tab's lines (web/canvas/panels.js feed, botMsg, chatAgent) and what Hermia's latest turn offers
// (web/canvas/talk.js talkActs, gameActs, talkBrief). The brief stays in its turn, editable, with its buttons: they
// act on its words. The rest (Build after a reply, a question's options, Lock, where to start) is not a row of reply
// buttons in the feed (decision 0015): it is the Suggestions drawer beside the message box (Suggested, below). The
// Log tab draws its lines the same way.
import { useLayoutEffect, useRef, type MouseEvent } from 'react'
import { TextArea } from 'react-aria-components'
import { Button } from '../primitives/Button'
import type { Turn } from './useTalk'
import type { BuildRoute, ChatLine, ChatOption } from './types'

// beside New project or Start over, the build that stays in this project is Add here
const ROUTE: Record<BuildRoute, string> = { add: 'Build', new: 'New project', redo: 'Start over' }
const routeLabel = (r: BuildRoute, alone: boolean) => (r === 'add' && !alone ? 'Add here' : ROUTE[r])

export interface FeedActs {
  build: () => void
  pick: (id: string, o: ChatOption) => void
  briefText: (id: string, text: string) => void
  briefGo: (t: Turn, route: BuildRoute) => void
  brandSheet: (id: string, text: string) => void
  keepTalking: (id: string) => void
  busy: boolean
}

const chip = 'min-h-10 rounded-full px-4 normal-case! tracking-normal! font-monospace! text-xs!'

// what a turn offers, in the Suggestions drawer; done(): the drawer closes after a pick
export function Suggested({ t, a, done }: { t: Turn, a: FeedActs, done: () => void }) {
  const acts = t.acts
  if (!acts || acts.type === 'brief') return null
  const pick = (o: ChatOption) => { a.pick(t.id, o); if (!o.id.startsWith('start:')) done() }
  if (acts.type === 'build') {
    return <div className="flex flex-wrap gap-2"><Button role="primary" className={chip} isDisabled={a.busy} onPress={() => { a.build(); done() }}>Build</Button></div>
  }
  // under the spec: Lock (first) and Keep talking; else the open question's options, each with what it gets
  if (acts.spec || acts.options.every(o => o.id.startsWith('start:'))) {
    return (
      <div className="flex flex-wrap gap-2">
        {acts.options.map((o, i) => (
          <Button key={o.id} role={(acts.spec && !i) || acts.on === o.id ? 'primary' : 'secondary'} className={chip} isDisabled={a.busy}
            aria-pressed={o.id.startsWith('start:') ? acts.on === o.id : undefined} onPress={() => pick(o)}>{o.label}</Button>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {acts.options.map(o => (
        <Button key={o.id} role="secondary" isDisabled={a.busy} onPress={() => pick(o)}
          className="h-auto w-full flex-col items-start! justify-start! gap-0.5! whitespace-normal! rounded-[10px] border-line-2 px-3 py-2 text-left font-monospace! text-sm! normal-case! tracking-normal!">
          <span>{o.label}</span>
          {o.why && <small className="font-monospace text-xs text-muted">{o.why}</small>}
        </Button>
      ))}
    </div>
  )
}

// the brief, in its turn: read it, edit it, then Build (or New project / Start over), the brand sheet first, or keep
// talking
function Brief({ t, a }: { t: Turn, a: FeedActs }) {
  const acts = t.acts
  if (acts?.type !== 'brief') return null
  return (
    <div className="mt-2 flex flex-col gap-2">
      <TextArea aria-label="The brief" rows={6} maxLength={4000} value={acts.text} disabled={acts.done} autoFocus={acts.open && !acts.done}
        onChange={e => a.briefText(t.id, e.target.value)}
        className="w-full resize-y rounded-[10px] border border-line-2 bg-void p-3 font-monospace text-sm text-text outline-none data-[focused]:border-frame-hi disabled:opacity-60" />
      {acts.open && !acts.done && (
        <div className="flex flex-wrap gap-2">
          {acts.routes.map((r, i) => <Button key={r} role={i ? 'secondary' : 'primary'} className={chip} onPress={() => a.briefGo(t, r)}>{routeLabel(r, acts.routes.length === 1)}</Button>)}
          {acts.sheet && <Button role="secondary" className={chip} onPress={() => a.brandSheet(t.id, acts.text)}>{acts.sheetLabel}</Button>}
          <Button role="ghost" className={chip} onPress={() => a.keepTalking(t.id)}>Keep talking</Button>
        </div>
      )}
    </div>
  )
}

function Line({ t, acts, onHover }: { t: Turn, acts?: FeedActs, onHover?: (el: HTMLElement | null) => void }) {
  const layers = t.layers?.length ? t.layers.join(' ') : undefined
  const hover = layers && onHover ? { onMouseEnter: (e: MouseEvent<HTMLElement>) => onHover(e.currentTarget), onMouseLeave: () => onHover(null) } : {}
  const where = t.where && <span className="mt-1 block font-monospace text-xs text-muted">{t.where}</span>
  if (t.who === 'you') {
    return (
      <div className="item you ml-8 self-end rounded-[12px] bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap" data-layers={layers} {...hover}>
        <span className="txt">{t.text}</span>{where}
      </div>
    )
  }
  if (t.who === 'hermia') {
    return (
      <div className={`item bot text-sm ${t.working ? 'working' : ''}`} aria-busy={t.working || undefined}>
        <b className="flex items-baseline gap-2 font-label text-xs font-semibold uppercase tracking-[.07em] text-text">Hermia<small className="font-monospace text-[11px] normal-case tracking-normal text-muted">planner</small></b>
        <span className={`txt mt-1 block whitespace-pre-wrap ${t.working ? 'text-muted motion-safe:animate-pulse' : ''}`}>{t.text}</span>
        {acts && <Brief t={t} a={acts} />}
      </div>
    )
  }
  if (t.who === 'crew') {
    return (
      <div className="item reply border-l-2 pl-3 text-sm" style={{ borderColor: t.color || 'var(--accent)' }} data-layers={layers} {...hover}>
        <b className="font-label text-xs font-semibold uppercase tracking-[.07em]" style={{ color: t.color }}>{t.name || 'Swarm'}</b>
        <span className="txt mt-1 block whitespace-pre-wrap">{t.text}</span>{where}
      </div>
    )
  }
  return (
    <div className={`item ${t.who} font-monospace text-xs ${t.who === 'err' ? 'text-hot-text' : 'text-muted'}`}>
      {t.name && <b className="mr-1" style={{ color: t.color }}>{t.name}</b>}
      <span className="txt whitespace-pre-wrap">{t.text}</span>{where}
    </div>
  )
}

// newest at the bottom; it follows the newest line while the person is at the bottom already
export function Feed({ lines, acts, label, empty, onHover }: { lines: (Turn | ChatLine)[], acts?: FeedActs, label: string, empty?: string, onHover?: (el: HTMLElement | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useLayoutEffect(() => { const b = box.current; if (b && stick.current) b.scrollTop = b.scrollHeight }, [lines])
  return (
    <div ref={box} role="log" aria-label={label} tabIndex={0} className="feed outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-frame-hi flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      onScroll={e => { const b = e.currentTarget; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 60 }}>
      {!lines.length && empty && <p className="empty-chat m-auto max-w-56 text-center font-monospace text-xs text-muted">{empty}</p>}
      {lines.map(t => <Line key={t.id} t={t} acts={acts && 'acts' in t ? acts : undefined} onHover={onHover} />)}
    </div>
  )
}
