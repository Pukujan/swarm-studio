// Setup › Parts: every part a build can use, grouped by what the person makes (web/setup-parts.js, the same
// table the current Studio draws). A group opens its parts; a part opens what it is for, what powers it, whether
// it is needed, what stops without it, where its data goes, and its one fix. A failed part shows only ⚠ at rest;
// the reason is there once it is open (RULES.md rule 10).
//
// The fixes keep credentials in Hermes (catalog rule 11): a key is a `hermes config set NAME <your key>` command
// the person runs, the MCP allowlist is a command too (the studio never writes it), and a connector is added only
// after the person says yes to the exact command Hermes will run.
import { useState } from 'react'
import { Button, LinkButton } from '../../primitives/Button'
import { Command } from '../../primitives/Command'
import { Disclosure } from '../../primitives/Disclosure'
import { GROUPS, statesOf, tally, type Facts, type Part, type PartFix, type PartState } from '@studio/setup-parts'
import { get, post } from './api'
import { Acts, Dot, Mark, Note, Val, Why } from './bits'
import type { SetupRow } from './machines'

type Conn = Record<string, Record<string, unknown>>

export function partsTally(F: Facts) {
  return tally(GROUPS.flatMap(g => statesOf(F, g)))
}

export function PartsRow({ facts: F, group, part, isExpanded, onToggle, onGroup, onPart, onGoto, setConn }: {
  facts: Facts
  group: string
  part: string
  isExpanded: boolean
  onToggle: () => void
  onGroup: (k: string) => void
  onPart: (k: string) => void
  onGoto: (row: SetupRow) => void
  setConn: (f: (c: Conn) => Conn) => void
}) {
  const all = partsTally(F)
  return (
    <Disclosure name="Parts" state={<><Val>{all.ok} of {all.all}</Val>{all.bad && <Mark ok={false} label="Something is not working" />}</>} isExpanded={isExpanded} onToggle={onToggle}>
      <div className="flex flex-col divide-y divide-edge overflow-hidden rounded-[8px] border border-edge">
        {GROUPS.map(g => {
          const rows = statesOf(F, g), t = tally(rows)
          return (
            <Disclosure key={g.k} size="item" name={<b className="font-semibold">{g.name}</b>} state={<><Val>{t.ok} of {t.all}</Val>{t.bad && <Mark ok={false} label="Something is not working" />}</>} isExpanded={group === g.k} onToggle={() => onGroup(g.k)}>
              <div className="-mx-2.5 -mb-3 flex flex-col pl-2.5">
                {rows.map(({ p, s }) => (
                  <PartRow key={p.k} F={F} p={p} s={s} isExpanded={part === p.k} onToggle={() => onPart(p.k)} onGoto={onGoto} setConn={setConn} />
                ))}
              </div>
            </Disclosure>
          )
        })}
      </div>
    </Disclosure>
  )
}

function PartRow({ F, p, s, isExpanded, onToggle, onGoto, setConn }: {
  F: Facts, p: Part, s: PartState, isExpanded: boolean, onToggle: () => void, onGoto: (row: SetupRow) => void, setConn: (f: (c: Conn) => Conn) => void
}) {
  const dl = ([['For', p.for], ['Uses', p.by], ['Needed', p.need ? 'Required' : 'Optional'], ['Without it', p.without], ['Sends', p.goes]] as const).filter(x => x[1])
  return (
    <Disclosure size="item" name={<span className="flex items-center gap-2.5"><Dot st={s.st} />{p.name}</span>} state={<Val>{s.st === 'fail' ? '' : s.why}</Val>} isExpanded={isExpanded} onToggle={onToggle}>
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-body text-[12.5px] leading-[1.4] max-[480px]:grid-cols-1 max-[480px]:gap-y-0">
        {dl.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 [overflow-wrap:anywhere] text-text max-[480px]:mb-1">{v}</dd>
          </div>
        ))}
      </dl>
      {s.st === 'fail' && <Why>{s.why}</Why>}
      {s.st === 'ok' || s.st === 'later' ? null : <Fix f={p.fix(F)} onGoto={onGoto} setConn={setConn} />}
    </Disclosure>
  )
}

function Fix({ f, onGoto, setConn }: { f: PartFix | null, onGoto: (row: SetupRow) => void, setConn: (f: (c: Conn) => Conn) => void }) {
  // the exact command Hermes will run, once it has been asked for; the person says yes to that
  const [ask, setAsk] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!f) return null

  async function connect(name: string, confirm: boolean) {
    setError('')
    const r = await post<{ error?: string, confirm?: string } & Record<string, unknown>>('/api/connectors/connect', { name, confirm }) ?? { error: 'Hermes did not answer.' }
    if (r.error) setError(String(r.error))
    else if (r.confirm) setAsk(r.confirm)
    else {
      setAsk(null)
      setConn(c => ({ ...c, [name]: { ...(c[name] || {}), ...r } }))
      // Hermes installs it in the background: ask again in a few seconds
      setTimeout(() => { get<Conn>('/api/connectors').then(v => { if (v) setConn(() => v) }) }, 4000)
    }
  }

  const acts = [
    f.row && <Button key="row" role="secondary" onPress={() => onGoto(f.row!)}>{f.label}</Button>,
    f.link && <LinkButton key="link" role="secondary" href={f.link} target="_blank" rel="noopener">{f.label}</LinkButton>,
    f.connect && !ask && <Button key="connect" role="secondary" onPress={() => connect(f.connect!, false)}>{f.label}</Button>
  ].filter(Boolean)
  return (
    <>
      {f.cmd && <Command cmd={f.cmd} />}
      {acts.length > 0 && <Acts>{acts}</Acts>}
      {f.connect && ask && (
        <>
          <Note>{ask}</Note>
          <Acts>
            <Button role="secondary" onPress={() => connect(f.connect!, true)}>Add it</Button>
            <Button role="ghost" onPress={() => setAsk(null)}>Cancel</Button>
          </Acts>
        </>
      )}
      {f.note && <Note>{f.note}</Note>}
      {f.connect && error && <Why>{error}</Why>}
    </>
  )
}
