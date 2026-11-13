// The one input on Projects: pick what to make, say it, then Make (docs/specs/42-ways-to-make.md). Make offers the
// kind's ways in one small menu (Just build, Guided, Three takes, Scaffold, Studio, as the kind offers them); a kind
// with one way goes straight there, and the way picked last for the kind is pre-selected. Under the box, one panel
// at a time: the Examples, the guided questions, or the brief before Build. Nothing builds without Build.
import { useRef, useState } from 'react'
import { Button, IconButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { MenuAt, MenuRow } from '../../primitives/Menu'
import { Panel } from '../../primitives/Popover'
import { useToast } from '../../primitives/Toast'
import { useNav } from '../../nav/NavProvider'
import { ApiError, api, post, said, store, useStored } from './api'
import { makeModeOf, makeStudioStep, makeWays, type MakeWay } from '@studio/makeways'
import { EXAMPLES, KIT_STEPS, MAKES, guideBrief, guideKind, guidePending, guideSets, makeOf, pickWay, runOf, type Kind, type Question } from './make'

interface Intake { starters?: Record<string, string[]>, guides?: Record<string, Question[]> }
let intakeP: Promise<Intake> | null = null
// what the box asks the server for once, when first needed: the examples and the guided questions (engine/intake.mjs)
const intake = () => (intakeP ||= api<Intake>('/api/intake').catch(() => { intakeP = null; return {} as Intake }))

type Pop = null | { k: 'examples', list: string[] } | { k: 'ask', text: string, qs: Question[], i: number, answers: Record<string, string> }
  | { k: 'brief', text: string, back: null | { text: string, qs: Question[], answers: Record<string, string> } }
  | { k: 'go', brief: string, chat: string, text: string, options: GoOption[] }
interface GoOption { id: string, label: string, why?: string }
type Sets = { pictures?: string, chat?: string }

export function MakeBox({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { go } = useNav()
  const toast = useToast()
  const [kindKey, setKind] = useStored<Kind>('home.make', 'site')
  const make = makeOf(kindKey)
  const [text, setText] = useState('')
  const [pop, setPop] = useState<Pop>(null)
  const [menu, setMenu] = useState<null | 'kind' | { ways: MakeWay[], pick: string, text: string }>(null)
  const form = useRef<HTMLFormElement>(null), kindBtn = useRef<HTMLButtonElement>(null), makeBtn = useRef<HTMLButtonElement>(null)

  // a website builds live (/api/run); App, Game and Video run their steps (/api/auto). Either opens the new
  // build on the Design deck, the one room where the crew can be watched at work
  async function build(brief: string, sets: Sets = {}) {
    const run = runOf(make)
    try {
      const j = run
        ? await post<{ run?: string }>('/api/auto', { prompt: brief, ...run })
        : await post<{ run?: string }>('/api/run', { brief, agents: 8, ...sets })
      setPop(null); setText('')
      if (j.run) go({ type: 'started', run: j.run, room: 'deck' })
    } catch (err) {
      const e = err as ApiError
      // a new website asks first (docs/decisions/0020-ask-before-build.md): the question, here under the box
      const b = e.body as { error?: string, ask?: string, chat?: string | null, text?: string, options?: GoOption[] } | undefined
      if (e.status === 409 && b?.error === 'ask') return setPop(b.ask === 'talk' || !b.chat ? { k: 'brief', text: brief, back: null } : { k: 'go', brief, chat: b.chat, text: b.text || '', options: b.options || [] })
      if (e.status === 409) toast('A build is running. Yours can start when it ends.', e.body?.run ? { action: 'Watch it', onAction: () => go({ type: 'started', run: e.body.run, room: 'deck' }) } : {})
      else toast(said(err))
    }
  }

  async function begin(way: MakeWay, words: string) {
    // no Hermes to answer the model: one calm line and what to do, before anything starts (the words stay)
    const h = await api<{ needed?: boolean, health?: { ok?: boolean, message?: string, action?: string } }>('/api/hermes?ready=1').catch(() => null)
    if (h?.needed && h.health && !h.health.ok) return toast(`${h.health.message} ${String(h.health.action || '').replace(/`/g, '')}`, { action: 'Check again', onAction: () => begin(way, words) })
    store.set(`home.mode.${make.k}`, way.k)
    if (way.k === 'now') return setPop({ k: 'brief', text: words, back: null })
    // a game's questions are its Plan board's talk (spec 27)
    if (way.k === 'guided' && make.k === 'game') return go({ type: 'plan' })
    if (way.k === 'guided') {
      const qs = guidePending((await intake()).guides?.[guideKind(make.k)] || [], words)
      return setPop(qs.length ? { k: 'ask', text: words, qs, i: 0, answers: {} } : { k: 'brief', text: words, back: null })
    }
    // Three takes, Scaffold or Studio: a Studio project made in that way, opened on the way's step
    try {
      const j = await post<{ project: { id: string } }>('/api/studio', { kind: make.k, idea: words, mode: way.k, depth: store.get<string>('home.depth', 'light') === 'thorough' ? 'thorough' : 'light', steps: way.steps || KIT_STEPS[make.k] })
      setText('')
      go({ type: 'studio', project: j.project.id, step: way.step || makeStudioStep(make.k) })
    } catch (err) { toast(said(err)) }
  }

  function submit() {
    const words = text.trim()
    setPop(null)
    const ways = makeWays(make.k, !!words)
    if (ways.length === 1) return void begin(ways[0], words)
    setMenu({ ways, pick: pickWay(make.k, ways, words, makeModeOf(store.get(`home.mode.${make.k}`, null))), text: words })
  }

  async function examples() {
    if (pop?.k === 'examples') return setPop(null)
    const key = EXAMPLES[make.k]
    const list = key ? ((await intake()).starters?.[key] || []).slice(0, 4) : []
    if (!list.length) return inputRef.current?.focus()
    setPop({ k: 'examples', list })
  }
  const close = () => setPop(null)
  // the answer: all builds from the chat (answered now); the rest open the Studio walk with those steps skipped
  async function answered(g: { path: string, skip: string[], brief: string, chat: string }) {
    if (g.path === 'all') return build(g.brief, { chat: g.chat })
    const start = g.skip.includes('brand') ? 'plan' : 'brand'
    try {
      const j = await post<{ project?: { id: string } }>('/api/studio', { kind: 'site', idea: g.brief, chat: g.chat, skip: g.skip, start })
      setPop(null); setText('')
      if (j.project?.id) go({ type: 'studio', project: j.project.id, step: start })
    } catch (err) { toast(said(err)) }
  }

  return (
    <>
      <form ref={form} autoComplete="off" onSubmit={e => { e.preventDefault(); submit() }}
        className="mx-auto mt-1.5 mb-7 flex w-full max-w-[760px] items-center gap-2 rounded-[16px] border border-line bg-deep py-2 pr-2 pl-2 focus-within:border-line-2">
        <Button ref={kindBtn} role="ghost" aria-label={`What to make: ${make.label}`} aria-haspopup="menu" onPress={() => setMenu('kind')} className="!px-2.5 text-muted">
          <Icon name={make.icon} size={16} /><span className="max-md:sr-only">{make.label}</span><Icon name="chd" size={14} />
        </Button>
        <input ref={inputRef} name="q" value={text} onChange={e => setText(e.target.value)} maxLength={4000}
          placeholder="What should the crew build?" aria-label="What should the crew build?"
          className="min-w-0 flex-1 border-0 bg-transparent py-2 font-monospace text-sm text-text outline-none placeholder:text-muted" />
        {EXAMPLES[make.k] && <IconButton icon="idea" label="Examples" aria-haspopup="dialog" on={pop?.k === 'examples'} onPress={examples} />}
        <Button ref={makeBtn} role="primary" type="submit" aria-haspopup="menu"><Icon name="up" size={16} />Make</Button>
      </form>

      <MenuAt name="What to make" triggerRef={kindBtn} isOpen={menu === 'kind'} onClose={() => setMenu(null)} placement="bottom start"
        onAction={k => { setKind(makeOf(k).k); setPop(null); inputRef.current?.focus() }}>
        {MAKES.map(m => <MenuRow key={m.k} id={m.k} icon={m.icon} label={m.label} on={m.k === make.k} />)}
      </MenuAt>
      {menu && menu !== 'kind' && (
        <MenuAt name="How to make it" triggerRef={makeBtn} isOpen onClose={() => setMenu(null)} selectionMode="single" selectedKeys={[menu.pick]}
          onAction={k => { const w = menu.ways.find(x => x.k === k); if (w) void begin(w, menu.text) }}>
          {menu.ways.map(w => <MenuRow key={w.k} id={w.k} icon={w.icon} label={w.label} on={w.k === menu.pick} />)}
        </MenuAt>
      )}

      <Panel name={pop?.k === 'examples' ? 'Examples' : pop?.k === 'brief' ? 'The brief' : pop?.k === 'go' ? 'Before the build' : 'Questions'} triggerRef={form} isOpen={!!pop} onClose={close}>
        {pop?.k === 'examples' && (
          <>
            <h3 className="m-0 mb-3 font-label text-sm font-semibold tracking-[.12em] text-muted uppercase">Examples</h3>
            <div role="list" aria-label="Examples" className="flex flex-col gap-1">
              {pop.list.map(x => (
                <div role="listitem" key={x}>
                  <Button role="ghost" autoFocus={x === pop.list[0]} className="!h-auto w-full !justify-start !py-2 !font-monospace !text-sm !normal-case !tracking-normal"
                    onPress={() => { setText(x); close(); setTimeout(() => inputRef.current?.focus(), 0) }}>
                    <Icon name="idea" size={18} /><span className="flex-1 text-left whitespace-normal">{x}</span><Icon name="chr" size={15} />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        {pop?.k === 'ask' && <Ask pop={pop} setPop={setPop} build={build} />}
        {pop?.k === 'brief' && <Brief pop={pop} setPop={setPop} build={build} />}
        {pop?.k === 'go' && <Go pop={pop} setPop={setPop} answered={answered} />}
      </Panel>
    </>
  )
}

const Dots = ({ n, at, label }: { n: number, at: number, label: string }) => (
  <div aria-label={label} className="mb-3 flex gap-1.5">
    {Array.from({ length: n }, (_, i) => <i key={i} className={`h-1.5 w-6 rounded-full ${i < at ? 'bg-muted' : i === at ? 'bg-text' : 'bg-surface-2'}`} />)}
  </div>
)
const CHIP = '!h-9 !min-h-9 !px-3 !font-monospace !text-[13px] !normal-case !tracking-normal border !border-line'

// the guided prompt (docs/specs/06-onboarding.md): the questions the words left open, one at a time (chips or your
// own words), then the brief. Just build skips the rest: the unanswered questions take their defaults.
function Ask({ pop, setPop, build }: { pop: Extract<Pop, { k: 'ask' }>, setPop: (p: Pop) => void, build: (t: string, s?: Sets) => void }) {
  const q = pop.qs[pop.i], val = pop.answers[q.id] || ''
  const [free, setFree] = useState(q.chips.includes(val) ? '' : val)
  const take = (v: string) => { const answers = { ...pop.answers }; if (v) answers[q.id] = v; else delete answers[q.id]; return answers }
  const next = (v: string) => {
    const answers = take(v)
    if (pop.i < pop.qs.length - 1) { setFree(''); setPop({ ...pop, i: pop.i + 1, answers }) }
    else setPop({ k: 'brief', text: guideBrief(pop.text, answers, pop.qs), back: { text: pop.text, qs: pop.qs, answers } })
  }
  return (
    <div key={q.id}>
      <Dots n={pop.qs.length} at={pop.i} label={`Question ${pop.i + 1} of ${pop.qs.length}`} />
      <h3 className="m-0 mb-3 pr-10 font-display text-xl font-extrabold uppercase">{q.q}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {q.chips.map(c => <Button key={c} role={val === c ? 'secondary' : 'ghost'} className={CHIP} onPress={() => next(c)}>{c}</Button>)}
      </div>
      <input aria-label="Your own words" placeholder="Or in your own words" maxLength={300} value={free} autoFocus onChange={e => setFree(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(free.trim() || val) } }}
        className="min-h-10 w-full rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none placeholder:text-dim focus:border-frame-hi" />
      <div className="mt-4 flex items-center justify-between gap-2">
        {pop.i ? <Button role="ghost" onPress={() => setPop({ ...pop, i: pop.i - 1, answers: take(free.trim() || val) })}><Icon name="chl" size={14} />Back</Button> : <span />}
        <span className="flex gap-2">
          <Button role="ghost" onPress={() => { const a = take(free.trim() || val); build(guideBrief(pop.text, a, pop.qs), guideSets(a, pop.qs)) }}>Just build</Button>
          <Button role="primary" onPress={() => next(free.trim() || val)}>Next</Button>
        </span>
      </div>
    </div>
  )
}

// the brief before the build: one short paragraph, editable; Build (or ⌘/Ctrl+Enter) starts it
function Brief({ pop, setPop, build }: { pop: Extract<Pop, { k: 'brief' }>, setPop: (p: Pop) => void, build: (t: string, s?: Sets) => void }) {
  const [text, setText] = useState(pop.text)
  const sets = pop.back ? guideSets(pop.back.answers, pop.back.qs) : {}
  const go = () => { const t = text.trim(); if (t) build(t, sets) }
  return (
    <div>
      {pop.back && <Dots n={pop.back.qs.length + 1} at={pop.back.qs.length} label="The brief" />}
      <h3 className="m-0 mb-3 font-display text-xl font-extrabold uppercase">The brief</h3>
      <textarea aria-label="The brief" maxLength={4000} rows={4} value={text} autoFocus onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go() } }}
        className="w-full resize-y rounded-[10px] border border-line-2 bg-void p-3 font-monospace text-sm text-text outline-none focus:border-frame-hi" />
      <div className="mt-4 flex items-center justify-between gap-2">
        {pop.back ? <Button role="ghost" onPress={() => { const b = pop.back!; setPop({ k: 'ask', text: b.text, qs: b.qs, i: b.qs.length - 1, answers: b.answers }) }}><Icon name="chl" size={14} />Back</Button> : <span />}
        <Button role="primary" onPress={go} isDisabled={!text.trim()}><Icon name="up" size={16} />Build</Button>
      </div>
    </div>
  )
}

// the question before a new website (docs/decisions/0020-ask-before-build.md): the planner's answers, the
// recommended one first with its reason; a pick goes to the chat (/api/talk), which answers or asks which to skip
function Go({ pop, setPop, answered }: { pop: Extract<Pop, { k: 'go' }>, setPop: (p: Pop) => void, answered: (g: { path: string, skip: string[], brief: string, chat: string }) => void }) {
  const toast = useToast()
  const pick = async (id: string) => {
    try {
      const j = await post<{ turn?: { text?: string, options?: GoOption[], go?: { path: string, skip: string[], brief: string } } }>(`/api/talk/${pop.chat}`, { pick: id })
      const t = j.turn
      if (t?.go) return answered({ ...t.go, chat: pop.chat })
      if (t?.options?.length) setPop({ ...pop, text: t.text || pop.text, options: t.options })
    } catch (err) { toast(said(err)) }
  }
  return (
    <div>
      <h3 className="m-0 mb-3 font-display text-xl font-extrabold uppercase">{pop.text}</h3>
      <div role="list" aria-label="Answers" className="flex flex-col gap-1">
        {pop.options.map((o, i) => (
          <div role="listitem" key={o.id}>
            <Button role={i ? 'ghost' : 'secondary'} autoFocus={!i} className="!h-auto w-full !justify-start !py-2 !normal-case !tracking-normal" onPress={() => void pick(o.id)}>
              <span className="flex flex-1 flex-col text-left"><span>{o.label}</span>{o.why && <small className="text-muted">{o.why}</small>}</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
