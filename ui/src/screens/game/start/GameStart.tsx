// A new game (web/canvas/rooms.js "game mode"; docs/specs/22-guided-game-maker.md "Two paths, one front door"): a
// few questions, one at a time (chips or your own words; Just build it fills the rest), then the spec card the
// planner writes, every line editable. From the card: Build the game (through the Cast step first when the game is 3D
// with people in it, specs 19 and 20), or Shape it, the same spec walked step by step with pictures (ShapeIt.tsx).
// A site build that is open can have the game as its promo game: in its world and colours, linking back to it.
// The same routes as the classic Studio: GET /api/game (the questions), POST /api/game/spec, POST /api/game (the
// build), /api/workshops (an unfinished walk is offered again), /api/cast and /api/meshy (Cast.tsx).
import { useEffect, useRef, useState } from 'react'
import type { ChatApi } from '../../../chat'
import { chatApi, getJson, postJson } from '../../../chat/api'
import { Button } from '../../../primitives/Button'
import { Checkbox } from '../../../primitives/Checkbox'
import { Dialog } from '../../../primitives/Dialog'
import { Icon } from '../../../primitives/Icon'
import { CastStep } from './Cast'
import { SPEC_ROWS, castForBuild, newCast, specEdit, specLine, walkAt, type Answers, type Cast, type Question, type Role, type Spec } from './model'
import { ShapeIt } from './ShapeIt'
import './start.css'

export interface GameStartProps {
  isOpen: boolean
  onClose: () => void
  // the server, with the token (src/chat/api.ts); a story answers from a fixture instead
  api?: ChatApi
  // a site build is open: the game can be its promo game
  site?: { run: string, name: string } | null
  // the idea the person already gave (/game <idea>)
  idea?: string
  // the answers already given: the planner writes the spec at once, no questions asked (rooms.js openGame(idea, answers))
  answers?: Answers
  // /cast on a build: the Cast step on its own, no questions and no spec
  castOnly?: { run: string, title: string } | null
  // the build started: its run, and what to say about it in the room's chat
  onBuilt: (run: string, say: string) => void
}

const HOSTS: Record<string, string> = { github: 'GitHub Pages', vercel: 'Vercel', cloudflare: 'Cloudflare' }
const LINK = '!min-h-10 !px-1.5 text-muted data-[hovered]:!bg-transparent data-[hovered]:text-text'
const H3 = 'mt-1.5 mb-5 font-display text-[clamp(36px,5.4vw,64px)] leading-[.95] font-extrabold uppercase'
const FIELD = 'mb-2.5 min-h-10 w-full rounded-[14px] border border-line-2 bg-[rgb(var(--glass-rgb)/.05)] px-3 py-2 text-sm text-text outline-none placeholder:text-dim focus:border-frame-hi'
const EDIT = 'rounded-[4px] outline-offset-[3px] hover:outline hover:outline-1 hover:outline-dashed hover:outline-line focus:outline focus:outline-1 focus:outline-accent'

export function GameStart(props: GameStartProps) {
  // each opening starts over: the questions from the first, nothing kept from the last time
  return props.isOpen ? <Start {...props} /> : null
}

function Start({ onClose, api = chatApi, site = null, idea: idea0 = '', answers: given, castOnly = null, onBuilt }: GameStartProps) {
  const [qs, setQs] = useState<Question[] | null>(null)
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [idea, setIdea] = useState(idea0.trim())
  const [free, setFree] = useState('')
  const [promo, setPromo] = useState(!!site)
  // an unfinished Shape it walk can be picked up from here
  const [resume, setResume] = useState<{ id: string, title?: string, step?: string } | null>(null)
  const [spec, setSpec] = useState<Spec | null>(castOnly ? { title: castOnly.title || 'Cast', brand: null } : null)
  const [cast, setCast] = useState<Cast | null>(castOnly ? newCast({ only: true }) : null)
  const [castOpen, setCastOpen] = useState(!!castOnly)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [walk, setWalk] = useState<{ spec?: Spec, id?: string } | null>(null)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  useEffect(() => {
    void getJson<{ questions?: Question[] }>(api, '/api/game').then(j => { if (live.current) setQs(j?.questions || []) })
    if (given) return void writeSpec(given)
    if (!castOnly) void getJson<{ workshops?: { id: string, title?: string, step?: string }[] }>(api, '/api/workshops').then(j => { if (live.current) setResume(j?.workshops?.[0] || null) })
  }, [api])

  const q = qs?.[i]
  const val = q ? answers[q.id] || '' : ''
  // the question shown: its own words are in the box when the answer is not one of the chips
  useEffect(() => { setFree(q && !q.chips.includes(val) ? val : '') }, [q?.id])
  const take = (v: string): Answers => { const a = { ...answers }; if (!q) return a; if (v) a[q.id] = v; else delete a[q.id]; return a }
  const castFrom = spec?.brand?.from || site?.run || castOnly?.run || ''
  const fail = (e: unknown) => { if (live.current) { setBusy(''); setErr(`Game: ${(e as Error).message || e}`) } }

  // the planner writes the spec from the idea and the answers; a 3D game with people in it names the roles to cast
  async function writeSpec(a: Answers) {
    setAnswers(a); setErr('')
    setBusy('The planner is writing the game spec: an original world, hero and enemies…')
    try {
      const out = await postJson<{ spec?: Spec, cast?: { roles?: Role[], violent?: boolean }, error?: string }>(api, '/api/game/spec', { idea, answers: a, from: promo && site ? site.run : null })
      if (!out.spec) throw new Error(out.error || 'no spec')
      if (!live.current) return
      setSpec(out.spec)
      setCast(out.cast?.roles?.length ? newCast({ roles: out.cast.roles, violent: out.cast.violent }) : null)
      setBusy('')
    } catch (e) { fail(e) }
  }
  function next(v: string) {
    const a = take(v)
    if (qs && i < qs.length - 1) { setAnswers(a); setI(i + 1) } else void writeSpec(a)
  }
  // the build: the card's spec, with the picked cast, one model per role
  async function build() {
    if (!spec) return
    const s: Spec = cast ? { ...spec, cast: castForBuild(cast) } : spec
    setCastOpen(false); setErr('')
    setBusy('Starting the build…')
    try {
      const out = await postJson<{ run?: string, error?: string }>(api, '/api/game', { spec: s })
      if (!out.run) throw new Error(out.error || 'could not start')
      onBuilt(out.run, `🎮 Building “${s.title}” (${s.engine || 'the engine'}). The Game room shows every file as it is written; the game opens there when it builds. Chat here to change it after.`)
    } catch (e) { fail(e) }
  }
  // The promo game links back only to a real address: the site goes online first (a connected Vercel or
  // Cloudflare, else GitHub Pages), then the link goes in the spec
  async function online() {
    const brand = spec?.brand
    if (!brand?.from) return
    const h = await getJson<{ vercel?: { user?: string }, cloudflare?: { user?: string }, github?: unknown }>(api, '/api/publish') || {}
    const target = h.vercel?.user ? 'vercel' : h.cloudflare?.user ? 'cloudflare' : h.github ? 'github' : null
    if (!target) return setErr('Game: sign in to a host first (Publish on the Overview), then try again.')
    setErr('')
    setBusy(`Putting ${brand.name} online on ${HOSTS[target]}…`)
    const path = `/api/runs/${encodeURIComponent(brand.from)}/publish`
    type Job = { state?: string, url?: string, message?: string, error?: string }
    let job = await postJson<Job>(api, path, { target }).catch((e): Job => ({ state: 'failed', error: (e as Error).message }))
    for (let n = 0; n < 120 && job.state === 'working' && live.current; n++) {
      await new Promise(r => setTimeout(r, 2000))
      job = await getJson<Job>(api, path) || job
    }
    if (!live.current) return
    setBusy('')
    if (job.state === 'done' && job.url) setSpec(s => (s?.brand ? { ...s, brand: { ...s.brand, url: job.url } } : s))
    else setErr(`Game: ${brand.name} did not go online: ${job.message || job.error || 'it took too long'}`)
  }
  // Shape it: an unfinished walk of the same game opens where it was left
  async function shape() {
    if (!spec) return
    const key = String(spec.title || '').trim().toLowerCase()
    const open = await getJson<{ workshops?: { id: string, title?: string }[] }>(api, '/api/workshops')
    setWalk({ spec, id: (open?.workshops || []).find(w => String(w.title || '').trim().toLowerCase() === key)?.id })
  }

  if (walk) return (
    <ShapeIt isOpen api={api} spec={walk.spec} id={walk.id} onClose={onClose}
      onBuilt={(run, built) => onBuilt(run, `🎮 Building “${built?.title || walk.spec?.title || 'the game'}” with the art, story, levels and sound you picked. The Game room shows every file as it is written.`)} />
  )

  const edit = (key: string, label: string) => ({
    contentEditable: true, suppressContentEditableWarning: true, role: 'textbox', 'aria-label': label, tabIndex: 0,
    onBlur: (e: React.FocusEvent<HTMLElement>) => { const t = e.currentTarget.textContent || ''; setSpec(s => (s ? specEdit(s, key, t) : s)) }
  })
  const feel = spec?.answers?.like && !/nothing/i.test(spec.answers.like) ? spec.answers.like : ''
  const alert = err && <p role="alert" className="mt-3 text-[13px] text-hot-text">{err}</p>

  return (
    <Dialog title="New game" size="wide" locked={!!busy} isOpen onOpenChange={on => { if (!on) onClose() }}>
      <div>
        {qs === null ? <div className="grid place-items-center py-8"><div role="img" aria-label="Opening" aria-busy="true" className="gs-spin" /></div>
          : busy ? <div role="status" className="flex flex-col items-center gap-3 px-2.5 py-8 text-center text-muted"><div aria-hidden className="gs-spin" /><p className="m-0">{busy}</p></div>
            : spec && cast && castOpen ? <><CastStep cast={cast} from={castFrom} api={api} onBack={() => setCastOpen(false)} onBuild={() => void build()} onSay={setErr} />{alert}</>
              : spec ? (
                <>
                  <h2 {...edit('title', 'Title')} className={`${H3} mb-1 ${EDIT}`}>{spec.title}</h2>
                  <p {...edit('pitch', 'Pitch')} className={`mt-0 mb-2 text-muted ${EDIT}`}>{spec.pitch || ''}</p>
                  {spec.brand && <>
                    <p className="mt-0 mb-2.5 text-xs text-ok">🎮 A promo game for {spec.brand.name}, in its colours{spec.brand.url ? `, linking to ${spec.brand.url}` : ''}</p>
                    {!spec.brand.url && <Button role="ghost" className={`${LINK} -mt-1 mb-2.5 !min-h-8 text-xs`} onPress={() => void online()}>Put {spec.brand.name} online first</Button>}
                  </>}
                  {feel && <p className="mt-0 mb-2.5 text-xs text-ok">Feel of {feel}, original world: {spec.original || ''}</p>}
                  <dl className="my-2.5 grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
                    {SPEC_ROWS.map(k => [
                      <dt key={`${k}t`} className="pt-0.5 text-xs text-muted">{k}</dt>,
                      k === 'Engine' ? <dd key={k} className="m-0">{specLine(spec, k)}</dd> : <dd key={k} {...edit(k.toLowerCase(), k)} className={`m-0 ${EDIT}`}>{specLine(spec, k)}</dd>
                    ])}
                  </dl>
                  <small className="text-muted">Click any line to change it.</small>
                  {alert}
                  <div className="mt-2 flex items-center justify-between gap-2.5">
                    <Button role="ghost" className={LINK} onPress={() => { setSpec(null); setI(0) }}>← Change answers</Button>
                    <span className="flex items-center gap-2.5">
                      <Button role="ghost" className={LINK} onPress={() => void shape()}>Shape it</Button>
                      <Button role="primary" onPress={() => (cast && !cast.done ? setCastOpen(true) : void build())}>Build the game</Button>
                    </span>
                  </div>
                </>
              ) : !q ? <p className="m-0 py-8 text-center text-muted">Game mode isn't loaded on this server yet. Restart Swarm Studio (<code>hermes swarm</code>) and try again.</p>
                : (
                  <>
                    {i === 0 && resume && (
                      <button type="button" onClick={() => setWalk({ id: resume.id })} className="mb-4 flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[12px] border border-line bg-panel px-3.5 text-left text-sm text-text hover:border-accent">
                        <Icon name="rotate-ccw" size={16} /><span className="min-w-0 flex-1 truncate">Continue <b>{resume.title || 'the game'}</b></span><em className="text-xs text-muted not-italic">{walkAt(resume.step)}/7</em>
                      </button>
                    )}
                    <div aria-label={`Question ${i + 1} of ${qs.length}`} className="mb-3.5 flex gap-[5px]">
                      {qs.map((x, n) => <i key={x.id} className={`h-0.5 flex-1 rounded-[2px] ${n <= i ? 'bg-accent' : 'bg-[rgb(var(--glass-rgb)/.14)]'}`} />)}
                    </div>
                    {i === 0 && site && (
                      <Checkbox isSelected={promo} onChange={setPromo} className="mb-3 rounded-[10px] border border-line bg-panel-2 px-3 py-1">{`A promo game for ${site.name}: set in its world, in its colours, with a button back to it`}</Checkbox>
                    )}
                    {i === 0 && <input aria-label="Your idea in a line (optional)" placeholder="Your idea in a line (optional): “a neon spirit eating its way through a night market”" value={idea} maxLength={600} autoFocus onChange={e => setIdea(e.target.value)} className={FIELD} />}
                    <h3 className={H3}>{q.q}</h3>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {q.chips.map(c => (
                        <Button key={c} role="ghost" aria-pressed={val === c} onPress={() => { setFree(''); next(c) }}
                          className={`!rounded-full border !px-4 ${val === c ? '!border-accent text-accent' : '!border-[rgb(var(--glass-rgb)/.3)] bg-[rgb(var(--glass-rgb)/.05)] data-[hovered]:!border-accent data-[hovered]:text-accent'}`}>{c}</Button>
                      ))}
                    </div>
                    <input key={q.id} aria-label="Your own words" placeholder="…or in your own words" value={free} maxLength={300} autoFocus={i > 0} onChange={e => setFree(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(free.trim() || val) } }} className={FIELD} />
                    {alert}
                    <div className="mt-2 flex items-center justify-between gap-2.5">
                      {i ? <Button role="ghost" className={LINK} onPress={() => setI(i - 1)}>← Back</Button> : <span />}
                      <span className="flex items-center gap-2.5">
                        <Button role="ghost" className={LINK} onPress={() => void writeSpec(take(free.trim() || val))}>Just build it</Button>
                        <Button role="primary" onPress={() => next(free.trim() || val)}>{i === qs.length - 1 ? 'Write the spec' : 'Next'}</Button>
                      </span>
                    </div>
                  </>
                )}
      </div>
    </Dialog>
  )
}
