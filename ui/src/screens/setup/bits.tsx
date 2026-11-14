// The small marks both sheets draw (web/setup.css's .su-mark, .su-dot, .su-val, .su-note, .su-why): a state is a
// mark a screen reader reads by its label, and an error is a marker first, its reason one tap in (RULES.md rule 10).
import type { ReactNode } from 'react'
import { Busy } from '../../primitives/Busy'
import type { PartState } from '@studio/setup-parts'

// web/icons.js's check and alert
const PATHS = { check: <path d="M20 6 9 17l-5-5" />, alert: <><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" /></> }

export function Mark({ ok, label }: { ok: boolean, label: string }) {
  return (
    <span role="img" aria-label={label} className={`inline-flex flex-none ${ok ? 'text-text' : 'text-hot-text'}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">{PATHS[ok ? 'check' : 'alert']}</svg>
    </span>
  )
}

const DOT: Record<PartState['st'], string> = { ok: 'Working', later: 'Installs on first use', off: 'Not set up', fail: 'Not working', wait: 'Checking' }

// a part's state: a dot (filled working, dashed installs on first use, a ring not set up), ⚠ or the spinner
export function Dot({ st }: { st: PartState['st'] }) {
  if (st === 'fail') return <Mark ok={false} label={DOT.fail} />
  if (st === 'wait') return <Busy />
  const look = st === 'ok' ? 'border-text bg-text' : st === 'later' ? 'border-dashed border-muted' : 'border-muted'
  return <i role="img" aria-label={DOT[st]} className={`inline-block size-2 flex-none rounded-full border-[1.5px] ${look}`} />
}

// a row's state on the right: one short value, cut with … when it does not fit
export const Val = ({ children }: { children: ReactNode }) =>
  <span className="min-w-0 flex-1 truncate text-right font-body text-[13px] font-normal normal-case tracking-normal text-muted">{children}</span>

export const Note = ({ children }: { children: ReactNode }) => <p className="m-0 font-body text-[12.5px] leading-[1.4] text-muted">{children}</p>
export const Why = ({ children }: { children: ReactNode }) => <p className="m-0 font-body text-[12.5px] leading-[1.4] [overflow-wrap:anywhere] text-hot-text">{children}</p>

// one line of a row: a name on the left, a value and a mark on the right
export const Line = ({ children }: { children: ReactNode }) =>
  <div className="flex min-h-7 items-center gap-2.5 font-body text-[13px] text-muted [&>:first-child]:mr-auto">{children}</div>

export const Acts = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-2">{children}</div>

// the model's name without its provider ("openai/gpt-5" reads gpt-5)
export const short = (m?: string) => String(m || '').replace(/^[a-z]+\//, '')
