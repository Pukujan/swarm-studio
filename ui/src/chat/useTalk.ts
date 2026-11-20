// The talk before a build (web/canvas/talk.js, docs/specs/27-plan-conversation.md, 29-chats-references-marks.md),
// as a hook: Hermia answers in the chat and nothing is built until the person says build. A website, app or video
// talks through /api/discuss and ends in a brief (editable, with Build and Keep talking); a game talks through
// /api/talk, one open question at a time with its options, and ends in Lock. The turns are kept in a chat on the
// server (spec 29): the first turn makes it and answers with its id.
//
// One open question at a time: the chips (a reply's Build, a question's options, a brief's buttons) live only on
// the latest of Hermia's turns. Every send, and the end of the talk, takes them all away (talk.js `.talk-acts`). Only
// the start chips after a lock stay, so another part of the plan is one click away.
import { useCallback, useReducer, useRef, useState } from 'react'
import { base, chatApi, getJson, postJson } from './api'
import type { BuildRoute, ChatApi, ChatChip, ChatGo, ChatKind, ChatLine, ChatOption, ChatProps, ChatTalk, SheetPick, ChatCard } from './types'

// the chips under one of Hermia's turns
export type Acts =
  | { type: 'build' }
  | { type: 'options', spec: boolean, options: ChatOption[], on?: string }
  | { type: 'brief', text: string, routes: BuildRoute[], sheet: boolean, sheetLabel: string, open: boolean, done: boolean, go?: string }

export interface Turn extends ChatLine { acts?: Acts }

// a game chat's next step, from the plan file (engine/gamestep.mjs nextStep): its options run on the server; wait is
// true while something paints; sheet is the sketch sheet that waits on picks, drawn in the turn to click
export type Step = { text: string, options: ChatOption[], wait?: boolean, sheet?: SheetPick, install?: { pct: number | null } }

type Said = { who: 'you' | 'hermia', text: string, cards?: ChatCard[], turn?: string }
type Turnish = { id?: string, text: string, options?: ChatOption[], go?: Omit<ChatGo, 'chat'>, step?: boolean, wait?: boolean, sheet?: SheetPick, cards?: ChatCard[], install?: { pct: number | null } }
// what the talk keeps of a tool's cards for the next turn: their titles and sources (engine/helpers.mjs cardsLine)
const shown = (cards?: ChatCard[]) => (cards?.length ? `
[Shown: ${cards.map((c, i) => `${i + 1}. ${c.title} (${c.source})`).join('; ')}]` : '')
type Events = Pick<ChatProps, 'onBuild' | 'onBrandSheet' | 'onPlanDraft' | 'onPlan' | 'onPlanAt' | 'onOpenChat' | 'onHeard' | 'onTalk' | 'onGo'>

let seq = 0
const nid = () => `c${Date.now().toString(36)}${(++seq).toString(36)}`
const enc = encodeURIComponent

// Hermia's cursor never says a line the chat holds (spec 41): she is told each one (web/pet.js pet.hear)
export const hear = (text: string) => (window as unknown as { swarmPet?: { hear?: (t: string) => void } }).swarmPet?.hear?.(text)

// a chat from the store, as the talk keeps it: the person is 'you', the planner 'hermia' (talk.js saidOf)
export const saidOf = (chat: { turns?: { id?: string, who: string, text: string, cards?: ChatCard[] }[] } | null): Said[] =>
  (chat?.turns || []).filter(t => t.who !== 'crew').map(t => ({ who: t.who === 'planner' ? 'hermia' : 'you', text: t.text, ...(t.cards?.length ? { cards: t.cards, turn: t.id } : {}) }))

// a game turn's chips: Lock and Keep talking under the spec, else the open question's options
const gameActs = (turn?: Turnish | null): Acts | undefined => {
  const options = turn?.options || []
  return options.length ? { type: 'options', spec: options.some(o => o.id === 'lock' || o.id.startsWith('do:')), options } : undefined
}
// a step's turn: its buttons in the turn itself, and the sheet to pick on (owner, 2026-11-14: everything in the chat)
const stepOf = (turn?: Turnish | null): Partial<Turn> => turn?.step || turn?.sheet || turn?.wait ? { step: true, sheet: turn.sheet, waiting: !!turn.wait } : {}
// the question before a website's build (decision 0020): its answers have go: ids
const isAsk = (turn?: Turnish | null) => !!turn?.options?.some(o => o.id.startsWith('go:'))

export function useTalk({ api = chatApi, from = null, project = null, events, addChip }: { api?: ChatApi, from?: string | null, project?: string | null, events: Events, addChip: (c: ChatChip) => void }) {
  const ev = useRef(events)
  ev.current = events
  const ctx = useRef({ from, project })
  ctx.current = { from, project }
  // the talk itself (talk.js `talk`): mutable, read after every await; gen changes with each new talk, so an
  // answer that comes back for an old one is dropped
  // ask: a website chat's question before the build is open; words and picks answer it (talk.js talk.ask)
  const T = useRef({ on: false, busy: false, said: [] as Said[], kind: 'site' as ChatKind, chat: null as string | null, from: null as string | null, plan: null as string | null, gen: 0, started: '', ask: false })
  const [turns, setTurns] = useState<Turn[]>([])
  const [, redraw] = useReducer((x: number) => x + 1, 0)

  const add = useCallback((t: Omit<Turn, 'id' | 'at'>) => {
    const turn: Turn = { id: nid(), at: Date.now(), ...t }
    setTurns(ts => [...ts, turn].slice(-200))
    if (!t.working && t.who !== 'sys') hear(t.text)
    return turn.id
  }, [])
  const drop = (id: string) => setTurns(ts => ts.filter(t => t.id !== id))
  const patch = (id: string, p: Partial<Turn>) => setTurns(ts => ts.map(t => (t.id === id ? { ...t, ...p } : t)))
  const patchActs = (id: string, p: Partial<Extract<Acts, { type: 'brief' }>> | Partial<Extract<Acts, { type: 'options' }>>) =>
    setTurns(ts => ts.map(t => (t.id === id && t.acts ? { ...t, acts: { ...t.acts, ...p } as Acts } : t)))
  // every chip goes; a brief keeps its words, without its buttons
  const clearActs = () => setTurns(ts => ts.map(t => (!t.acts ? t : t.acts.type === 'brief' ? { ...t, acts: { ...t.acts, open: false } } : { ...t, acts: undefined })))
  const setBusy = (b: boolean, g: number) => { if (g === T.current.gen) { T.current.busy = b; redraw() } }
  const alive = (g: number) => g === T.current.gen && T.current.on

  // ---------- a website, app or video talk
  async function say(text: string, chips: ChatChip[], brief = false) {
    const s = T.current
    if (s.kind === 'game') return gameSay({ said: text })
    if (s.ask && !brief) return goSay({ said: text })
    const refs = brief ? [] : chips.filter(c => c.kind === 'ref')
    // layers dragged in: the planner is told what the turn is about
    const about = brief ? [] : chips.filter(c => c.kind === 'layer')
    if (!brief) {
      s.said.push({ who: 'you', text: about.length ? `${text}\n(About: ${about.map(c => c.name).join(', ')})` : text })
      add({ who: 'you', text, where: [...about, ...refs].map(m => m.name).join(', ') || undefined, layers: about.length ? about.map(c => c.key) : undefined })
      ev.current.onHeard?.(text)
    }
    clearActs()
    const g = s.gen
    const wait = add({ who: 'hermia', text: brief ? 'Writing the brief…' : '…', working: true })
    setBusy(true, g)
    let ok = false, j: { chat?: string, error?: string, brief?: string, route?: string, reply?: string, cards?: ChatCard[], turn?: string, heard?: string, brandUpdated?: boolean } = {}
    try {
      const r = await api('/api/discuss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ said: s.said, kind: s.kind, brief, ...(refs.length ? { refs: refs.map(m => m.key) } : {}), ...(ctx.current.project ? { project: ctx.current.project } : {}), ...(s.chat ? { chat: s.chat } : s.from ? { from: s.from } : {}) }) })
      ok = r.ok
      j = await r.json().catch(() => ({}))
    } catch { /* no answer: said below */ }
    if (j.chat && alive(g)) s.chat = j.chat
    if (j.brandUpdated) window.dispatchEvent(new CustomEvent('swarm:brand'))
    setBusy(false, g)
    drop(wait)
    if (!alive(g)) return
    if (!ok) return void add({ who: 'hermia', text: j.error || 'Hermia did not answer. Say it again.', acts: { type: 'build' } })
    if (j.brief) return showBrief(j.brief, j.route || '')
    s.said.push({ who: 'hermia', text: j.heard || j.reply || '' })
    add({ who: 'hermia', text: j.reply || '', acts: { type: 'build' }, ...(j.cards?.length ? { cards: j.cards, cardsTurn: j.turn } : {}) })
  }

  // the brief: inside a project the planner says which way it goes (engine/talkplan.mjs routeFor)
  function showBrief(text: string, route: string, what = '', sheet = false, go?: string) {
    const s = T.current
    const inProject = !!s.from
    const routes: BuildRoute[] = inProject && route === 'new' ? ['new', 'add'] : inProject && route === 'redo' ? ['redo', 'add'] : ['add']
    // a website or app can settle its story, palette and type first (spec 31); Build works without it
    const id = add({ who: 'hermia', text: what || 'The brief', acts: { type: 'brief', text, routes, sheet: s.kind === 'site' || s.kind === 'app', sheetLabel: 'Brand sheet', open: true, done: false, ...(go ? { go } : {}) } })
    if (sheet) void brandSheet(id, text)
  }

  // ---------- the question before a website's build (docs/decisions/0020-ask-before-build.md, server/talk.mjs): a
  // pick or typed words answer it, offline; the answer tells the screen to build now or open the Studio walk
  async function goSay({ said = '', pick = '', label = '' }: { said?: string, pick?: string, label?: string }) {
    const s = T.current
    if (s.busy || !s.chat) return
    const text = said || label
    if (text) { s.said.push({ who: 'you', text }); add({ who: 'you', text }) }
    clearActs()
    const g = s.gen
    const wait = add({ who: 'hermia', text: '…', working: true })
    setBusy(true, g)
    try {
      const j = await postJson<{ chat: { id: string }, turn: Turnish }>(api, `/api/talk/${enc(s.chat)}`, { said, pick })
      if (!alive(g)) return
      s.said.push({ who: 'hermia', text: j.turn.text })
      s.ask = isAsk(j.turn)
      add({ who: 'hermia', text: j.turn.text, acts: s.ask ? gameActs(j.turn) : undefined })
      if (j.turn.go) { const chat = j.chat?.id || s.chat; end(); ev.current.onGo?.({ ...j.turn.go, chat }) }
    } catch (err) {
      if (alive(g)) add({ who: 'hermia', text: (err as Error).message || 'Hermia did not answer. Say it again.' })
    } finally { setBusy(false, g); drop(wait) }
  }
  // a helper card pressed (decision 0025 e): the server runs the action kept on the saved turn, once; Hermia says
  // what was done as her next message
  async function pickCard(line: string, turn: string | undefined, card: ChatCard) {
    const s = T.current
    if (s.busy || !s.chat || !turn) return
    const g = s.gen
    setBusy(true, g)
    try {
      const j = await postJson<{ text: string }>(api, '/api/helper/pick', { chat: s.chat, turn, card: card.id })
      if (!alive(g)) return
      setTurns(ts => ts.map(t => (t.id === line ? { ...t, cards: (t.cards || []).map(c => (c.id === card.id ? { ...c, picked: Date.now() } : c)) } : t)))
      s.said.push({ who: 'hermia', text: j.text })
      add({ who: 'hermia', text: j.text })
      // what was kept shows where it went: the boards that show References reload them
      window.dispatchEvent(new CustomEvent('swarm:refs'))
    } catch (err) {
      if (alive(g)) add({ who: 'hermia', text: `That did not work: ${(err as Error).message}.` })
    } finally { setBusy(false, g) }
  }
  // a website chat reopened with its question open: the answers come back in Suggestions, not Build
  async function siteResume(last: string) {
    const s = T.current, g = s.gen
    const j = await getJson<{ chat: { go?: unknown, turns: (Turnish & { who: string })[] } }>(api, `/api/talk/${enc(s.chat || '')}`)
    if (!alive(g)) return
    const turn = j?.chat?.turns?.at(-1)
    if (!j?.chat?.go && turn?.who === 'planner' && isAsk(turn)) { s.ask = true; patch(last, { acts: gameActs(turn) }) }
    else patch(last, { acts: { type: 'build' } })
  }

  // ---------- a game talk (server/talk.mjs)
  async function gameSay({ said = '', pick = '', label = '' }: { said?: string, pick?: string, label?: string }) {
    const s = T.current
    if (s.busy) return
    const text = said || label
    if (text) { s.said.push({ who: 'you', text }); add({ who: 'you', text }) }
    clearActs()
    const g = s.gen
    const wait = add({ who: 'hermia', text: '…', working: true })
    setBusy(true, g)
    try {
      type Ans = { chat: { id: string }, turn: Turnish, draft?: unknown, plan?: { id: string }, failed?: { message?: string, action?: string } }
      const j = s.chat ? await postJson<Ans>(api, `/api/talk/${enc(s.chat)}`, { said, pick }) : await postJson<Ans>(api, '/api/talk', { kind: 'game', said })
      if (!alive(g)) return
      s.chat = j.chat.id
      s.said.push({ who: 'hermia', text: j.turn.text + shown(j.turn.cards) })
      // an install has no place on the board: its line in the chat is Hermia at work on it, with how far it is
      const line = j.turn.install ? add({ who: 'hermia', text: j.turn.text, working: true })
        : add({ who: 'hermia', text: j.turn.text, acts: gameActs(j.turn), ...stepOf(j.turn), ...(j.turn.cards?.length ? { cards: j.turn.cards, cardsTurn: j.turn.id } : {}) })
      // an action changed the plan: the board shows it (the lock made it, a sheet is painting, a pick landed)
      if (j.plan?.id) { const fresh = s.plan !== j.plan.id; s.plan = j.plan.id; if (fresh) ev.current.onPlan?.(j.plan.id); else ev.current.onPlanAt?.(j.plan.id, {}) }
      else if (j.draft) ev.current.onPlanDraft?.(j.draft)
      if (j.turn.wait) watch(g, j.turn.text, j.turn.install ? line : null)
      // the planner's model did not answer this turn (server/talk.mjs `failed`): the step above is the plan's own;
      // the reason is said beside it
      if (j.failed) add({ who: 'err', text: [j.failed.message, j.failed.action].filter(Boolean).join(' ') || 'Hermia did not answer. Say it again.' })
    } catch (err) {
      if (alive(g)) add({ who: 'hermia', text: (err as Error).message || 'Hermia did not answer. Say it again.' })
    } finally { setBusy(false, g); drop(wait) }
  }
  // the plan's Lock, from the board's button while the chat talks: the same lock as the chat's (talk.js gameLock)
  function press(pick: string, label: string) {
    const s = T.current
    if (s.busy || !s.chat || s.kind !== 'game') return
    void gameSay({ pick, label })
  }

  async function gameResume(last: string | null) {
    const s = T.current, g = s.gen
    type Ans = { chat: { turns: { who: string, text: string, options?: ChatOption[] }[], plan?: string, state?: string }, draft?: unknown, step?: Step }
    const j = await getJson<Ans>(api, `/api/talk/${enc(s.chat || '')}`)
    if (!j?.chat || !alive(g)) return
    const turn = j.chat.turns.at(-1)
    s.plan = j.chat.plan || null
    // a chat with its plan: the real next step from the plan file, said again if her last words were not it
    if (j.step?.install) watch(g, j.step.text, add({ who: 'hermia', text: j.step.text, working: true }))
    else if (j.step) {
      if (last && turn?.who === 'planner' && turn.text === j.step.text) patch(last, { acts: gameActs(j.step), ...stepOf({ ...j.step, step: true }) })
      else add({ who: 'hermia', text: j.step.text, acts: gameActs(j.step), ...stepOf({ ...j.step, step: true }) })
      if (j.step.wait) watch(g, j.step.text)
    } else if (last && turn?.who === 'planner') patch(last, { acts: gameActs(turn) })
    if (j.draft && !j.chat.plan) ev.current.onPlanDraft?.(j.draft)
  }

  // While something paints, the chat asks the server for the next step every few seconds; when it has moved on
  // (the picture landed, or failed), Hermia says the new step with its buttons.
  // line: the working line of an install, kept at the step's own words while it runs and taken away when it ends.
  function watch(g: number, was: string, line: string | null = null) {
    const tick = async () => {
      if (!alive(g)) return
      const s = T.current
      const j = s.chat ? await getJson<{ step?: Step }>(api, `/api/talk/${enc(s.chat)}`).catch(() => null) : null
      if (!alive(g)) return
      // a look that failed (the computer slept, the server was busy) is tried again while an install's line is up
      if (!j?.step) { if (line) setTimeout(tick, 3000); return }
      if (j.step.wait) { if (line && j.step.install) patch(line, { text: j.step.text }); setTimeout(tick, 3000); return }
      if (line) drop(line)
      if (j.step.text === was) return
      clearActs()
      s.said.push({ who: 'hermia', text: j.step.text })
      add({ who: 'hermia', text: j.step.text, acts: gameActs(j.step), ...stepOf({ ...j.step, step: true }) })
      if (s.plan) ev.current.onPlanAt?.(s.plan, {})
    }
    setTimeout(tick, 3000)
  }

  // ---------- starting and ending
  function start(t: ChatTalk) {
    const s = T.current
    s.gen++
    Object.assign(s, { on: true, busy: false, said: [], kind: t.kind || 'site', chat: t.chat || null, from: t.blank ? null : ctx.current.from, plan: null, started: t.id, ask: false })
    clearActs()
    let last: string | null = null
    for (const m of t.said || []) { s.said.push({ who: m.who, text: m.text + shown(m.cards) }); last = add({ who: m.who, text: m.text, ...(m.cards?.length ? { cards: m.cards, cardsTurn: m.turn } : {}) }) }
    redraw()
    if (t.brief) { s.said.push({ who: 'you', text: t.brief }); return showBrief(t.brief, '', t.what || '', !!t.sheet, t.go) }
    if (t.text) return void say(t.text, [])
    // a game chat reopened: its open question's chips come back under the planner's last words
    if (s.kind === 'game' && s.chat) return void gameResume(last)
    // a website chat with its question before the build open (decision 0020)
    if (s.kind === 'site' && s.chat && last && t.said?.at(-1)?.who === 'hermia') return void siteResume(last)
    // an old chat reopened: its words are back, and the box goes on from them
    if (last && t.said?.at(-1)?.who === 'hermia') patch(last, { acts: { type: 'build' } })
    // a new project's chat is never blank: Hermia's first line, from the server (talk.js stepNow, engine/chatstep.mjs)
    else if (t.blank && !last && s.kind !== 'game') void first()
  }
  async function first() {
    const s = T.current, g = s.gen
    const j = await postJson<{ first?: string }>(api, '/api/discuss/step', { kind: s.kind, talked: false }).catch(() => null)
    // nothing was said since: the line still belongs at the top of an empty chat
    if (j?.first && alive(g) && !s.said.length && !s.busy) add({ who: 'hermia', text: j.first })
  }
  function end() {
    const s = T.current
    s.gen++
    s.on = false
    s.busy = false
    clearActs()
    redraw()
  }

  // ---------- the chips under a turn
  const build = () => { if (!T.current.busy) void say('', [], true) }
  function pick(id: string, o: ChatOption) {
    const s = T.current
    if (s.busy) return
    if (o.id.startsWith('go:')) return void goSay({ pick: o.id, label: o.label })
    // Lock and every action run on the server, as the plan board's buttons do (server/talk.mjs)
    // where to start (after the lock): the pick opens that part of the Plan board; the chips stay
    if (o.id.startsWith('start:')) {
      if (!s.plan) return
      patchActs(id, { on: o.id })
      return ev.current.onPlanAt?.(s.plan, { focus: o.focus, select: o.select })
    }
    void gameSay({ pick: o.id, label: o.label })
  }
  const briefText = (id: string, text: string) => patchActs(id, { text })
  function briefGo(turn: Turn, route: BuildRoute) {
    const s = T.current
    const text = turn.acts?.type === 'brief' ? turn.acts.text.trim() : ''
    if (!text) return
    const chat = s.chat, kind = s.kind
    end()
    patchActs(turn.id, { done: true })
    ev.current.onBuild?.({ brief: text, chat, route, kind })
  }
  async function brandSheet(id: string, text: string) {
    const s = T.current
    const brief = text.trim()
    if (!brief || !ev.current.onBrandSheet) return
    const r = await ev.current.onBrandSheet({ chat: s.chat, brief, kind: s.kind })
    if (!r) return
    if (r.chat) s.chat = r.chat
    patchActs(id, { sheetLabel: r.locked ? 'Brand sheet · Locked' : 'Brand sheet' })
  }
  const keepTalking = (id: string) => patchActs(id, { open: false })

  // ---------- Chats: one reopened here where it left off, or a new empty talk
  async function openChat(id: string) {
    const chat = await getJson<{ id: string, kind: ChatKind, project?: string | null, turns?: { who: string, text: string }[] }>(api, `/api/chats/${enc(id)}`)
    if (!chat?.id) return
    // a loose chat that is not a website opens from Projects, which knows how each kind builds
    if (!chat.project && chat.kind !== 'site' && ev.current.onOpenChat) return ev.current.onOpenChat({ id: chat.id, kind: chat.kind })
    const t: ChatTalk = { id: nid(), kind: chat.kind, chat: chat.id, said: saidOf(chat), blank: !chat.project }
    start(t)
    ev.current.onTalk?.(t)
  }
  function newChat() {
    const t: ChatTalk = { id: nid(), blank: !ctx.current.project }
    start(t)
    ev.current.onTalk?.(t)
  }

  // ---------- media (spec 29, server/chatmedia.mjs): in a talk, a picture goes to the chat and the vision model
  // reads it now; in a project, it joins the project's References. Either way it is a chip until sent.
  async function files(list: File[]) {
    const s = T.current
    const talking = s.on && s.kind !== 'game'
    const pid = !s.on ? ctx.current.project : null
    if (!talking && !pid) return void add({ who: 'err', text: s.on ? 'Pictures in a game talk come later.' : 'Open a project or start a talk first.' })
    for (const f of list.slice(0, 6)) {
      const name = enc(f.name || 'picture.png')
      const wait = talking && /^image\//.test(f.type) ? add({ who: 'hermia', text: 'Looking at it…', working: true }) : null
      const path = talking ? `/api/chats/${s.chat || 'new'}/media?name=${name}&kind=${s.kind}${s.from ? `&from=${enc(s.from)}` : ''}` : `/api/projects/${enc(pid || '')}/refs?name=${name}&source=chat`
      const r = await api(path, { method: 'POST', body: f }).catch(() => null)
      const j: { error?: string, chat?: string, ref?: { id: string, name: string, kind: string, src: string } } = r ? await r.json().catch(() => ({})) : {}
      if (wait) drop(wait)
      if (!r?.ok || !j.ref) { add({ who: 'err', text: j.error || `${f.name} did not come through.` }); continue }
      if (talking && j.chat) s.chat = j.chat
      addChip({ kind: 'ref', key: j.ref.id, name: j.ref.name, thumb: j.ref.kind === 'image' ? `${base()}${j.ref.src}` : undefined })
    }
  }

  const s = T.current
  return {
    on: s.on, busy: s.busy, kind: s.kind, chat: s.chat, started: s.started, turns,
    start, end, say, note: add, build, pick, briefText, briefGo, brandSheet, keepTalking, openChat, newChat, files, pickCard, press
  }
}
