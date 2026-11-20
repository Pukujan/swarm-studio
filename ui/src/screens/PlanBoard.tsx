// The Plan board (docs/specs/21-plan-before-spend.md, 22, 27, 38; web/plan.js): a game's Plan before anything costly
// is made, on the shared board (src/board/). The plan is the one the machine names (view.plan); its cards, starter,
// systems and pictures are artboards; the inspector edits the selected one; the top bar carries the plan's name, ▾
// (Save as template) and the one primary button with the price, "Lock · 324 credits". Nothing expensive runs before
// that press, and the server checks the same number again.
//
// The board talks beside its chat (spec 27; web/studio.js talkGame, web/planchat.js). With no plan named it is a new
// game's talk: the Make box's words or a game chat picked on Projects (opened at the bare address, with no talk handed
// over, the board is empty until the first words in the chat start one); the plan as it stands takes shape on the
// board, read-only, and Lock (the chat's, or the top bar's, which presses the chat's) makes it. A plan opened any
// other way opens its own chat: the talk it was made in, or one the server makes for it. The crew write a new plan's
// cards in, one after another.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Chat, saidOf, talkOn, talkTaken, talkWaiting, type ChatApi, type ChatKind, type ChatTalk } from '../chat'
import { chatApi } from '../chat/api'
import { useNav } from '../nav/NavProvider'
import { Board, type BoardHandle } from '../board/Board'
import { Working } from '../pet/Pet'
import { Button } from '../primitives/Button'
import { Icon } from '../primitives/Icon'
import { Menu, MenuItem } from '../primitives/Menu'
import { useTopBar } from '../shell/Slots'
import { ApiError, artRef, getPlan, post, saveTemplate } from './plan/api'
import { useRefDrop } from '../shared/RefDrop'
import { LockGate } from './plan/LockGate'
import { firstKey, painting, priceOf, primaryLabel } from './plan/model'
import { inspectorFor, type InspectorActions } from './plan/PlanInspector'
import { PlanSections, PlanSkeleton } from './plan/PlanSections'
import type { Card, Plan, Sheet } from './plan/types'

// what the server keeps of a chat (engine/chats.mjs), as far as the board reads it
type Kept = { id?: string, kind?: ChatKind, plan?: string | null, turns?: { id?: string, who: string, text: string }[] }

// the chat's box while no talk is on (the board opened at its bare address): the first words start a game's talk
const BOX = { placeholder: 'Describe a game', empty: 'Say what game to make. Hermia asks what your idea leaves open, and the plan takes shape here.', action: 'Send' }

// `api`: the chat's server calls (src/chat/api.ts); a story answers from a fixture instead
export function PlanBoard({ api = chatApi }: { api?: ChatApi }) {
  const { view, go } = useNav()
  const id = view.plan
  // ---------- the chat: the talk handed over (the Make box's words, a game chat from Projects); a named plan opens
  // its own chat below; with neither, the first words typed start a new game's talk
  const [talk, setTalk] = useState<ChatTalk | null>(() => { const w = talkWaiting(); return w?.kind === 'game' ? w : null })
  useEffect(() => { talkTaken(talk) }, [])
  // the plan the chat's talk is about (it made it, or was opened for it): the board does not open another chat for it
  const mine = useRef<string | null>(talk && id ? id : null)
  // a new game's plan as the talk has it so far, read-only until the lock
  const [draft, setDraft] = useState<Plan | null>(null)
  // the plan the lock just made: the crew write its cards in (how many are in; null when done)
  const fresh = useRef<string | null>(null)
  const [writing, setWriting] = useState<number | null>(null)
  // the part of the plan the chat asked for (a start chip): in view and selected once the plan has loaded
  const at = useRef<{ plan: string, focus?: string, select?: string } | null>(null)
  // the top bar's Lock while the talk drafts: it presses the chat's
  const [press, setPress] = useState<{ id: string, pick: string, label: string } | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  // the plan on the board: the named one, else the one the talk is drafting
  const shown = id ? plan : draft
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

  // a plan opened any other way than from its talk: its own chat (web/planchat.js planChatOpen)
  useEffect(() => {
    if (!id || mine.current === id) return
    let live = true
    api(`/api/talk/plan/${encodeURIComponent(id)}`).then(r => (r.ok ? r.json() : null)).catch(() => null).then((j: { chat?: Kept } | null) => {
      // a game talk may have started on this plan while it was asked for
      if (!live || !j?.chat?.id || mine.current === id) return
      mine.current = id
      setTalk({ id: `plan:${id}:${Date.now()}`, kind: 'game', chat: j.chat.id, said: saidOf(j.chat), blank: true })
    })
    return () => { live = false }
  }, [id, api])

  // the crew write the cards in, one after another (a new plan only; web/plan.js writeIn)
  useEffect(() => {
    if (!plan || fresh.current !== plan.id) return
    fresh.current = null
    const n = plan.cards.length
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    let i = 0, t = 0
    setWriting(0)
    const step = () => { i += 1; if (i > n) return setWriting(null); setWriting(i); t = window.setTimeout(step, calm ? 0 : 320) }
    t = window.setTimeout(step, 200)
    return () => { clearTimeout(t); setWriting(null) }
  }, [plan?.id])

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
    // a draft has no id yet
    const key = shown ? shown.id || 'draft' : null
    if (!key || writing != null || framed.current === key) return
    // on the next frame too: the board may not have its size yet when the plan first draws
    const fit = () => { if (framed.current !== key && board.current?.frameAll(false)) framed.current = key }
    fit()
    const f = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(f)
  }, [shown, writing])

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
    artRef: (ref: string, what: 'look' | 'asis' | 'remove') => {
      if (!id) return
      artRef(id, ref, what).then(j => { setPlan(j.plan); if (what === 'remove') setSel(null); setRev(r => r + 1) }, err => say((err as Error).message))
    },
    note: (sheet: string, c: number, note: string) => {
      clearTimeout(noting.current)
      noting.current = setTimeout(() => { if (id) post(id, 'pick', { sheet, cell: c, note }).then(setPlan, err => say(err.message)) }, 450)
    }
  }), [id, plan, act, say])
  useEffect(() => () => { clearTimeout(saving.current); clearTimeout(noting.current) }, [])

  const select = useCallback((key: string | null) => { if (key !== sel) setCell(null); setSel(key); setRev(r => r + 1) }, [sel])
  // the chat asked for a part of the plan: selected and in view, once the plan is the one it meant
  useEffect(() => {
    const a = at.current
    if (!plan || !a || a.plan !== plan.id) return
    at.current = null
    if (a.select) select(a.select)
    const f = requestAnimationFrame(() => { if (a.focus) board.current?.focus(a.focus) })
    return () => cancelAnimationFrame(f)
  }, [plan])

  // ---------- what the chat tells the board (web/studio.js plan, planAt, planDraft)
  const onPlan = useCallback((pid: string) => { mine.current = pid; fresh.current = pid; setDraft(null); go({ type: 'plan', plan: pid }) }, [go])
  const onPlanAt = useCallback((pid: string, a: { focus?: string, select?: string }) => {
    mine.current = pid
    at.current = { plan: pid, ...a }
    // the same plan: read it again, the chat may just have changed it (a lock, a pick, a picture started)
    if (id === pid) void load(); else { setDraft(null); go({ type: 'plan', plan: pid }) }
  }, [id, load, go])
  // a loose chat picked in Chats: a game's opens here (on its plan when it has one); the others on a new project's deck
  const onOpenChat = useCallback(async (c: { id: string, kind: ChatKind }) => {
    const chat = await api(`/api/chats/${encodeURIComponent(c.id)}`).then(r => (r.ok ? r.json() as Promise<Kept> : null)).catch(() => null)
    if (!chat?.id) return
    const t: ChatTalk = { id: `chat:${chat.id}:${Date.now()}`, kind: chat.kind, chat: chat.id, said: saidOf(chat), blank: true }
    if (chat.kind !== 'game') { talkOn(t); return go({ type: 'draft' }) }
    mine.current = chat.plan || null
    setDraft(null)
    setTalk(t)
    go({ type: 'plan', plan: chat.plan || null })
  }, [api, go])
  // New chat in Chats starts a website's talk: a new project's deck is where that one builds
  const onTalk = useCallback((t: ChatTalk) => { if ((t.kind || 'site') !== 'game') { talkOn({ ...t, id: `chat:${Date.now()}` }); go({ type: 'draft' }) } }, [go])
  const clear = useCallback(() => select(null), [select])
  // a picture dropped anywhere on the board joins the game's art references (issue #543; the owner, 2026-11-15:
  // "Game's art references"), with the question every drop asks: like this, or use as is?
  const drop = useRefDrop({ at: id ? `/api/plans/${encodeURIComponent(id)}` : null, said: say,
    done: (_refs, added) => { void load().then(() => { if (added[0]) select(`ar:${added[0].id}`) }) }, asset: () => { void load() } })
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
  const label = id ? primaryLabel(plan) : 'Lock'
  const building = plan?.build?.state === 'building'
  const locked = !!plan?.gate?.locked
  const primary = useMemo(() => !shown ? null : (
    <Button role="primary" className="min-w-[168px] max-md:min-w-0 max-md:px-3.5" isDisabled={building} aria-label={label}
      onPress={() => (!id ? setPress({ id: `lock:${Date.now()}`, pick: 'lock', label: 'Lock' }) : locked ? act('build') : setGate(true))}>{label}</Button>
  ), [shown, id, building, label, locked, act])
  const title = plan?.title
  const menu = useMemo(() => !plan || !id ? null : (
    <Menu label={<Icon name="chd" size={14} />} name={`${title || 'Plan'} menu`} onAction={() => { if (id) saveTemplate(id, title).then(() => say('Saved as template'), err => say(err.message)) }}>
      <MenuItem id="tpl"><Icon name="remix" size={16} className="mr-2" />Save as template</MenuItem>
    </Menu>
  ), [plan, title, id, say])
  // with no plan named, the board is the new game the chat is talking through (spec 27)
  useTopBar({ build: shown ? shown.title || (id ? 'Plan' : 'New game') : id ? null : 'New game', menu, primary })

  // a draft is changed by saying so in the chat: no inspector until it is locked
  const insp = id && plan && inspectorFor(plan, sel, cell, actions)
  return (
    // beside and above the chat (chat/Dock.tsx)
    <div className="relative mb-[var(--chat-h,0px)] ml-[var(--chat-w,0px)] flex min-h-0 min-w-0 flex-1 flex-col" {...drop.zone}>
      <Board ref={board} label="Plan" selected={!!sel} onClear={clear} toast={toast}
        inspector={insp && <Fragment key={`${sel}:${rev}`}>{insp}</Fragment>}>
        {/* a plan being opened, or a new game's talk drafting one, shows the waiting cards until it comes */}
        <Working busy={id ? !plan : !!talk && !draft} label="Plan on its way" skeleton={<PlanSkeleton />}>
          {shown && <PlanSections plan={shown} sel={sel} cell={cell} writing={id ? writing : null} onSelect={select} onPick={pick} />}
        </Working>
      </Board>
      <Chat api={api} talk={talk} press={press} box={BOX} onSubmit={({ text }) => setTalk({ id: `game:${Date.now()}`, kind: 'game', text, blank: true })} onPlanDraft={d => { if (!id && d) setDraft(d as Plan) }} onPlan={onPlan} onPlanAt={onPlanAt} onOpenChat={c => void onOpenChat(c)} onTalk={onTalk} />
      {plan && <LockGate key={`${plan.id}:${gate}`} price={priceOf(plan)} isOpen={gate} onOpenChange={setGate} onLock={lock} />}
      {drop.layer}
    </div>
  )
}
