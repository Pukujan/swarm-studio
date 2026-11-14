// Setup: the one-time sheet (docs/specs/06-onboarding.md), the React port of web/setup.js. A grouped list after
// iOS Settings (docs/ux/PATTERNS.md): each row is a name and one state, a tap opens it, and every row has a default
// already picked, so Start works at once. Closing it any way counts as seen: nothing here is required.
//
//   Account   Swarm Feed: sign in with Google, GitHub or Discord, then this install is linked to it
//   Models    the planner and builder models Hermes passed, tested with one tiny call each, and the media reader
//   Pictures  what builds use for pictures: Painted, Stock photos or Drawn
//   Parts     every part a build can use, grouped by what you make (web/setup-parts.js)
//
// Which row, group and part is open is the statechart's `#projects.setup` (layers.ts), run as setupMachine.
import { useMachine } from '@xstate/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Facts } from '@studio/setup-parts'
import { Busy } from '../../primitives/Busy'
import { Button } from '../../primitives/Button'
import { Dialog } from '../../primitives/Dialog'
import { AccountRow } from './AccountRow'
import { get, post } from './api'
import { setupMachine, type SetupRow } from './machines'
import { ModelsRow } from './ModelsRow'
import { PartsRow } from './PartsRow'
import { PicturesRow } from './PicturesRow'
import type { Account, ModelTest, Options, Pictures, SetupView, Slot } from './types'

// the facts each part's state is read from (web/setup-parts.js says which route gives what); each fills in when
// its own answer comes, some ask Hermes and take seconds, so the sheet never waits for them
const FACTS = { hermes: '/api/hermes', models: '/api/models', media: '/api/media', publish: '/api/publish', conn: '/api/connectors', gateway: '/api/gateway', local: '/api/setup/parts' } as const

export function SetupSheet({ row = '', group, part, onClose, onModels }: {
  // the row to open with (Settings › Setup opens it on Parts), and a group and part of Parts (a story)
  row?: SetupRow
  group?: string
  part?: string
  onClose: () => void
  // whether the models answered, for the avatar's warning dot
  onModels: (ok: boolean | undefined) => void
}) {
  const [view, setView] = useState<SetupView | null>(null)
  const [test, setTest] = useState<ModelTest | null | undefined>(undefined)
  const [opts, setOpts] = useState<Options | undefined>(undefined)
  const [facts, setFacts] = useState<Record<string, unknown>>({})
  const [missing, setMissing] = useState(false)
  const [state, send] = useMachine(setupMachine, { input: { row, group, part } })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const runTest = useCallback(async (again: boolean) => {
    setTest(null)
    const t = await post<ModelTest>('/api/setup/models', { again })
    if (!alive.current) return
    setTest(t ?? undefined)
    if (t) onModels(t.ok)
  }, [onModels])

  useEffect(() => {
    get<SetupView>('/api/setup').then(v => {
      if (!alive.current) return
      if (!v?.models) { setMissing(true); return }
      setView(v)
      setTest(v.test ?? undefined)
      // the server keeps the test for ten minutes, so opening the sheet again costs nothing
      runTest(false)
      if (v.account?.pending && !row) send({ type: 'row', k: 'account' })
    })
    get<Options>('/api/setup/models/options').then(o => { if (alive.current) setOpts(o ?? { ok: false, message: 'Hermes did not answer.', providers: [] }) })
    for (const [k, path] of Object.entries(FACTS)) get(path).then(v => { if (alive.current) setFacts(f => ({ ...f, [k]: v || {} })) })
    // once, on open
  }, [])

  // a model that does not answer opens its row: the marker first, the message one tap in (rule 10)
  const failed = test && !test.ok
  useEffect(() => {
    if (failed && state.matches('index') && !state.context.row) send({ type: 'row', k: 'models' })
    // only when the answer comes
  }, [failed])

  const close = () => {
    if (view && !view.seen) { setView({ ...view, seen: true }); post('/api/setup', { seen: true }) }
    onClose()
  }

  const setAccount = useCallback((a: Account) => setView(v => (v ? { ...v, account: a } : v)), [])
  const setConn = useCallback((f: (c: Record<string, Record<string, unknown>>) => Record<string, Record<string, unknown>>) =>
    setFacts(x => ({ ...x, conn: f((x.conn || {}) as Record<string, Record<string, unknown>>) })), [])
  const onPicked = (slots: Record<string, Slot> | undefined, t: ModelTest | undefined) => {
    if (opts?.ok && slots) setOpts({ ...opts, slots })
    setTest(t)
    onModels(t?.ok)
  }
  async function pickPictures(mode: Pictures['mode']) {
    const v = await post<SetupView>('/api/setup', { pictures: mode })
    if (v?.models && alive.current) setView(v)
  }

  // a part reads the sheet's own view and test too
  const F: Facts = { ...facts, view: view && { ...view, test } }
  const at = state.value as string, ctx = state.context
  const open = (k: SetupRow) => at === 'index' && ctx.row === k
  const toggle = (k: SetupRow) => () => send({ type: 'row', k })
  const goto = (k: SetupRow) => {
    send({ type: 'row', k })
    requestAnimationFrame(() => document.getElementById(`setup-${k}`)?.scrollIntoView({ block: 'start' }))
  }

  return (
    <Dialog title="Setup" isOpen onOpenChange={o => { if (!o) close() }}>
      {!view ? (
        missing ? <p className="m-0 font-body text-[12.5px] text-muted">Setup did not answer.</p> : <div aria-busy="true" className="flex min-h-[52px] items-center justify-center"><Busy label="Loading" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="divide-y divide-edge overflow-hidden rounded-[12px] border border-edge font-body">
            <section id="setup-account"><AccountRow account={view.account || {}} setAccount={setAccount} isExpanded={open('account')} onToggle={toggle('account')} /></section>
            <section id="setup-models"><ModelsRow view={view} test={test} opts={opts} setOpts={setOpts} isExpanded={open('models')} onToggle={toggle('models')} onTest={runTest} onPicked={onPicked} /></section>
            <section id="setup-pictures"><PicturesRow pictures={view.pictures} onPick={pickPictures} isExpanded={open('pictures')} onToggle={toggle('pictures')} /></section>
            <section id="setup-parts">
              <PartsRow facts={F} group={ctx.group} part={ctx.part} isExpanded={at !== 'index'} onToggle={() => send({ type: 'parts' })}
                onGroup={k => send({ type: 'group', k })} onPart={k => send({ type: 'part', k })} onGoto={goto} setConn={setConn} />
            </section>
          </div>
          <div className="flex justify-end">
            <Button role="primary" onPress={close} className="min-w-24">Start</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
