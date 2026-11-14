// Setup › Models: the planner and builder models Hermes passed, each tested with one tiny call (a spinner while
// it runs), the picker, and the media reader's model with what it can take (spec 32). When the test fails: one
// plain line and the one fix that fits it (engine/setup.mjs modelProblem), the provider's own message behind
// Details (RULES.md rule 10).
import { useState } from 'react'
import { Busy } from '../../primitives/Busy'
import { Button } from '../../primitives/Button'
import { Command } from '../../primitives/Command'
import { Disclosure } from '../../primitives/Disclosure'
import { post } from './api'
import { Acts, Line, Mark, Note, Val, Why, short } from './bits'
import { ModelPicker } from './ModelPicker'
import type { ModelTest, Options, SetupView, Slot } from './types'

// the model a role runs on: its Hermes slot, or Hermes's main model while the slot is empty
export function using(view: SetupView, opts: Options | undefined, role: 'planner' | 'worker'): Slot {
  const s = opts?.slots?.[role]
  if (s?.model) return { provider: s.provider, model: s.model }
  if (opts?.main?.model) return opts.main
  const m = view.models[role]?.model
  return { provider: '', model: m && m !== role ? m : '' }
}

export function ModelsRow({ view, test, opts, setOpts, isExpanded, onToggle, onTest, onPicked }: {
  view: SetupView
  // null while it runs, undefined before the first
  test: ModelTest | null | undefined
  opts: Options | undefined
  setOpts: (o: Options) => void
  isExpanded: boolean
  onToggle: () => void
  onTest: (again: boolean) => void
  onPicked: (slots: Record<string, Slot> | undefined, test: ModelTest | undefined) => void
}) {
  const [details, setDetails] = useState(false)
  const [hermes, setHermes] = useState<{ ok: boolean, command?: string } | null>(null)
  const t = test
  const mark = (ok: boolean) => <Mark ok={ok} label={ok ? 'Working' : 'Not working'} />
  const state = t === null ? <Busy label="Testing" /> : t ? mark(t.ok) : null
  const line = (name: string, role: 'planner' | 'worker') => (
    <Line>
      <span>{name}</span>
      <b className="min-w-0 truncate font-medium text-text">{short(using(view, opts, role).model) || 'None'}</b>
      {t === null ? <Busy label="Testing" /> : t ? mark(t[role].ok) : null}
    </Line>
  )
  const p = t && !t.ok ? (t.problem || { line: 'The model didn\'t work.', fix: 'hermes' }) : null
  const raw = p && t ? String((t.planner.ok ? t.worker.error : t.planner.error) || '') : ''

  async function letHermes() {
    const r = await post<{ ok: boolean, command?: string }>('/api/setup/hermes', {}) ?? { ok: false, command: 'hermes model' }
    setHermes(r)
    // a terminal opened: test again when the person comes back to this window (spec 6)
    if (r.ok) addEventListener('focus', () => onTest(true), { once: true })
  }

  const md = view.models.media
  return (
    <Disclosure name="Models" state={<><Val>{short(using(view, opts, 'worker').model)}</Val>{state}</>} isExpanded={isExpanded} onToggle={onToggle}>
      {line('Planner', 'planner')}
      {line('Builders', 'worker')}
      {p && (
        <>
          <Why>{p.line}</Why>
          <Acts>
            {p.fix === 'hermes' && <Button role="secondary" onPress={letHermes}>Let Hermes set this up</Button>}
            <Button role={p.fix !== 'hermes' ? 'secondary' : 'ghost'} onPress={() => onTest(true)}>Test again</Button>
            {raw && <Button role="ghost" aria-expanded={details} onPress={() => setDetails(!details)}>Details</Button>}
          </Acts>
          {details && raw && <p className="m-0 rounded-[8px] bg-panel-2 px-2.5 py-2 font-monospace text-[11.5px] leading-[1.45] [overflow-wrap:anywhere] text-muted">{raw}</p>}
          {hermes && !hermes.ok && <Command cmd={hermes.command || 'hermes model'} />}
        </>
      )}
      <ModelPicker opts={opts} setOpts={setOpts} now={using(view, opts, 'worker')} onPicked={onPicked} />
      {md && (
        <>
          <Line><span>Media</span><b className="min-w-0 truncate font-medium text-text">{md.off ? 'Off' : short(md.model) || 'None'}</b></Line>
          <Note>{md.off ? 'Clips and sounds are kept, not read.' : md.model ? (/^nothing/.test(md.takes || '') ? 'It is not known to hear or watch: clips and sounds are kept, not read.' : `It ${md.takes}.`) : 'No model here hears or watches: clips are kept, not read.'}</Note>
        </>
      )}
    </Disclosure>
  )
}
