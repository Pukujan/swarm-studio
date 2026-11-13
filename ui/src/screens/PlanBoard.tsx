// The Plan board (docs/specs/21-plan-before-spend.md, 22, 27, 38; web/plan.js): a game's Plan before anything costly
// is made, on the shared board (src/board/). The plan is the one the machine names (view.plan); its cards, starter,
// systems and pictures are artboards; the inspector edits the selected one; the top bar carries the plan's name, ▾
// (Save as template) and the one primary button with the price, "Lock · 324 credits". Nothing expensive runs before
// that press, and the server checks the same number again.
//
// Not here yet: a plan still being talked through in the chat (spec 27, the board read-only beside the talk) and the
// crew writing a new plan's cards in. Both need the chat, which has not moved; they stay in the current Studio.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../nav/NavProvider'
import { Board, type BoardHandle } from '../board/Board'
import { Working } from '../pet/Pet'
import { Button } from '../primitives/Button'
import { Icon } from '../primitives/Icon'
import { Menu, MenuItem } from '../primitives/Menu'
import { useTopBar } from '../shell/Slots'
import { ApiError, getPlan, post, saveTemplate } from './plan/api'
import { LockGate } from './plan/LockGate'
import { firstKey, painting, priceOf, primaryLabel } from './plan/model'
import { inspectorFor, type InspectorActions } from './plan/PlanInspector'
import { PlanSections, PlanSkeleton } from './plan/PlanSections'
import type { Card, Plan, Sheet } from './plan/types'

export function PlanBoard() {
  const { view } = useNav()
  const id = view.plan
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [cell, setCell] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [gate, setGate] = useState(false)
  // the inspector is drawn afresh after the server answers an action (a save while typing keeps it as it is)
  const [rev, setRev] = useState(0)
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(x => (x === t ? null : x)), 3000) }, [])

  // ---------- the plan: loaded when the machine names one, and again every few seconds while the crew paint
  const load = useCallback(async () => {
    if (!id) return
    try { setPlan(await getPlan(id)) } catch (err) { say((err as Error).message) }
  }, [id, say])
  useEffect(() => { setPlan(null); setSel(null); setCell(null); load() }, [load])
  useEffect(() => {
    if (!plan || !painting(plan)) return
    const t = setTimeout(load, 3000)
    return () => clearTimeout(t)
  }, [plan, load])

  // the first picture is selected once, so its check of direction is in view
  const checked = useRef('')
  useEffect(() => {
    const k = plan && firstKey(plan)
    if (!plan || !k || sel || checked.current === `${plan.id}:${plan.first?.src}`) return
    checked.current = `${plan.id}:${plan.first?.src}`
    setSel(k)
  }, [plan, sel])

  // the whole board in view once it has drawn
  const board = useRef<BoardHandle>(null)
  const framed = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!plan || framed.current === plan.id) return
    // on the next frame too: the board may not have its size yet when the plan first draws
    const fit = () => { if (framed.current !== plan.id && board.current?.frameAll(false)) framed.current = plan.id }
    fit()
    const f = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(f)
  }, [plan])

  // ---------- what the person does
  const act = useCallback(async (sub: string, body?: unknown) => {
    if (!id) return
    if (sub === 'replan') setSel(null)
    try { setPlan(await post(id, sub, body)) } catch (err) { say((err as Error).message) }
    setRev(r => r + 1)
  }, [id, say])
  const saving = useRef<ReturnType<typeof setTimeout>>(undefined)
  const noting = useRef<ReturnType<typeof setTimeout>>(undefined)
  const actions: InspectorActions = useMemo(() => ({
    close: () => setSel(null),
    saveCard: (card: string, body: Card['body'], now = false) => {
      clearTimeout(saving.current)
      const go = () => { if (id) post(id, 'card', { card, body }).then(setPlan, err => say(err.message)) }
      if (now) go(); else saving.current = setTimeout(go, 450)
    },
    addHero: () => {
      const c = plan?.cards.find(x => x.id === 'cast')
      const roster = c?.body.roster ?? []
      act('card', { card: 'cast', body: { roster: [...roster, { name: `Hero ${roster.length + 1}`, role: '', look: '', weapon: '' }] } })
    },
    act,
    pickCell: (c: number) => setCell(c),
    note: (sheet: string, c: number, note: string) => {
      clearTimeout(noting.current)
      noting.current = setTimeout(() => { if (id) post(id, 'pick', { sheet, cell: c, note }).then(setPlan, err => say(err.message)) }, 450)
    }
  }), [id, plan, act, say])
  useEffect(() => () => { clearTimeout(saving.current); clearTimeout(noting.current) }, [])

  const select = useCallback((key: string | null) => { if (key !== sel) setCell(null); setSel(key); setRev(r => r + 1) }, [sel])
  const clear = useCallback(() => select(null), [select])
  // a sheet's cell, picked or unpicked
  const pick = useCallback((s: Sheet, c: number) => {
    const on = !(s.picks ?? []).includes(c)
    setCell(on ? c : null)
    act('pick', { sheet: s.id, cell: c, on })
  }, [act])

  // ---------- the top bar: the name, ▾, and the one primary button
  const lock = useCallback(async ({ credits, testFirst }: { credits: number, testFirst: boolean }) => {
    if (!id) return
    try {
      setPlan(await post(id, 'lock', { credits, testFirst }))
      setGate(false)
      say('Locked')
    } catch (err) {
      // the price moved: show the new one, nothing was locked
      if (err instanceof ApiError && err.status === 402) { setGate(false); await load(); setGate(true) } else say((err as Error).message)
    }
  }, [id, load, say])
  const label = primaryLabel(plan)
  const building = plan?.build?.state === 'building'
  const locked = !!plan?.gate?.locked
  const primary = useMemo(() => !plan ? null : (
    <Button role="primary" className="min-w-[168px] max-md:min-w-0 max-md:px-3.5" isDisabled={building} aria-label={label}
      onPress={() => (locked ? act('build') : setGate(true))}>{label}</Button>
  ), [plan, building, label, locked, act])
  const title = plan?.title
  const menu = useMemo(() => !plan ? null : (
    <Menu label={<Icon name="chd" size={14} />} name={`${title || 'Plan'} menu`} onAction={() => { if (id) saveTemplate(id, title).then(() => say('Saved as template'), err => say(err.message)) }}>
      <MenuItem id="tpl"><Icon name="remix" size={16} className="mr-2" />Save as template</MenuItem>
    </Menu>
  ), [plan, title, id, say])
  // with no plan named, the board is the new game the chat is talking through (spec 27), in the current Studio
  useTopBar({ build: plan ? plan.title || 'Plan' : id ? null : 'New game', menu, primary })

  const insp = plan && inspectorFor(plan, sel, cell, actions)
  return (
    <>
      <Board ref={board} label="Plan" selected={!!sel} onClear={clear} toast={toast}
        inspector={insp && <Fragment key={`${sel}:${rev}`}>{insp}</Fragment>}>
        <Working busy={!!id && !plan} label="Plan on its way" skeleton={<PlanSkeleton />}>
          {plan && <PlanSections plan={plan} sel={sel} cell={cell} writing={null} onSelect={select} onPick={pick} />}
        </Working>
      </Board>
      {plan && <LockGate key={`${plan.id}:${gate}`} price={priceOf(plan)} isOpen={gate} onOpenChange={setGate} onLock={lock} />}
    </>
  )
}
