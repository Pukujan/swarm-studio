// The Design deck's chat: the shared Chat (src/chat, decision 0015: a dock along the bottom), fed the build's own
// lines, and Send routed as the current deck routes it (web/canvas/loop.js sendDock, web/route.js):
//   layers dragged into the chat      the words go to just those sections (a comment on them)
//   a section picked, words about it  that section is rewritten (fix)
//   anything else, with a build open  the project's next version extends it, after the planner reads whether the
//                                     person wants to build now or talk first (engine/talkplan.mjs)
//   no build                          a new build
// With no build at all (the machine's `draft`: a new project's deck, web/home.js newChat and openChat) the chat is a
// talk from the start: the one Projects handed over (src/chat/opening.ts), else a new website's. Its Build makes the
// new project, as its kind builds (a website live, an app or a video by its steps), and the build opens here.
//   "publish to <organization>"       where builds go on GitHub, answered here (web/github.js ownerSay), when the
//                                     name is the person's account or one of their organizations
// A talk (the Chat's own) ends in a brief; its Build starts the build here. A new build takes the deck over.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { routeMessage } from '@studio/route'
import { ownerSay } from '@studio/github'
import { isResearchStop, stopText, againBody, type Stop } from '@studio/researchstop'
import { ResearchStop } from '../../studio/ResearchStop'
import { Chat, talkTaken, talkWaiting, type BuildRoute, type ChatCommand, type ChatGo, type ChatApi, type ChatKind, type ChatLine, type ChatTalk } from '../../chat'
import { makeOf, runOf } from '../projects/make'
import { chatApi } from '../../chat/api'
import { useNav } from '../../nav/NavProvider'
import { crew } from './crew'
import { doneSections, type DeckModel, type DeckLine } from './model'
import { videoAsk, type FilmAsk } from '../video/model'


// the commands the deck takes in the chat (web/canvas/loop.js SLASH, the ones this deck has moved)
const COMMANDS: ChatCommand[] = [
  { name: 'play', what: 'Open the prototype' },
  { name: 'publish', what: 'Publish a live link' },
  { name: 'export', what: 'Export the files' },
  { name: 'replay', what: 'Watch the build again' },
  { name: 'video', arg: '[prompt]', what: 'Cut a film from a prompt, e.g. a fast trailer, scary but cute' }
]

// `api`: the server, with the token (src/chat/api.ts); a story answers from a fixture instead
// `onVideo`: `/video [style] [idea]` makes the build's film (web/canvas/loop.js runSlash); the deck's film panel shows it
export function DeckChat({ model, picked, onCommand, onVideo, api = chatApi }: {
  model: DeckModel, picked: string | null, onCommand: (name: 'play' | 'publish' | 'export' | 'replay') => void, onVideo: (ask: FilmAsk) => void, api?: ChatApi
}) {
  const post = useCallback((path: string, body: unknown) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), [api])
  const { view, go } = useNav()
  const draft = view.room === 'draft'
  // a new project's deck opens talking: the talk Projects handed over, else a new website's (never a blank chat)
  const [talk, setTalk] = useState<ChatTalk | null>(() => (draft ? talkWaiting() ?? { id: `draft:${Date.now()}`, kind: 'site', blank: true } : null))
  useEffect(() => { talkTaken(talk) }, [])
  const [notes, setNotes] = useState<DeckLine[]>([])
  // a build that looked something up first: what it found, shown before the crew uses it (decision 0025)
  const [stop, setStop] = useState<{ stop: Stop, at: number, again: (more: object) => void } | null>(null)
  const note = (who: DeckLine['who'], text: string) => setNotes(n => [...n, { id: `note:${Date.now()}:${n.length}`, at: Date.now(), who, text }])
  const run = model.run

  // the build's lines, each crew line in its agent's shade; the build's news goes to the Log tab
  const toChat = (l: DeckLine): ChatLine => ({ ...l, ...(l.who === 'crew' && l.name ? { color: crew().color(l.name) } : {}), where: l.layers?.map(k => model.layers[k]?.role ?? k).join(', ') })
  const all = useMemo(() => [...model.lines, ...notes].sort((a, b) => a.at - b.at), [model.lines, notes])
  const said = all.filter(l => l.who !== 'sys').map(toChat)
  const lines: ChatLine[] = stop ? [...said, { id: `research:${stop.at}`, at: stop.at, who: 'hermia' as const, text: stopText(stop.stop), card: <ResearchStop stop={stop.stop} post={post} onBuild={kept => stop.again(againBody(stop.stop, kept))} /> }].sort((a, b) => a.at - b.at) : said
  const log = all.filter(l => l.who === 'sys' || l.who === 'err').map(toChat)

  // a build: this project's next version (from the open one), a new project, or this one from scratch
  const build = useCallback(async ({ brief, agents, route, chat, more, kind }: { brief: string, agents?: number, route: BuildRoute | 'extend', chat?: string | null, more?: object, kind?: ChatKind }) => {
    // a new project that is not a website runs its kind's steps, as the Make box starts it (web/home.js start)
    const steps = !run && kind && kind !== 'site' ? runOf(makeOf(kind === 'film' ? 'video' : kind)) : null
    const r = await (steps ? post('/api/auto', { prompt: brief, ...steps, ...(chat ? { chat } : {}) }) : post('/api/run', {
      brief, ...(agents ? { agents } : {}), ...(view.project ? { project: view.project } : {}),
      ...((route === 'extend' || route === 'add' || route === 'redo') && run ? { from: run } : {}), ...(route === 'redo' ? { redo: true } : {}), ...(chat ? { chat } : {}), ...(more || {})
    })).catch(() => null)
    const j = await r?.json().catch(() => ({})) as { run?: string, error?: string, ask?: string, chat?: string | null, text?: string, message?: string, hermes?: boolean } | undefined
    if (r?.ok && j?.run) { setTalk(null); go({ type: 'started', run: j.run, project: view.project, room: 'deck' }); return }
    // a new website asks first (docs/decisions/0020-ask-before-build.md): the question waits in its chat, here, with
    // its answers in Suggestions; "don't build yet" opens the talk instead. Not busy, and not an error
    if (r?.status === 409 && j?.error === 'ask') {
      if (j.ask === 'talk' || !j.chat) return setTalk({ id: `deck:${Date.now()}`, kind: 'site', text: brief })
      return setTalk({ id: `ask:${j.chat}:${Date.now()}`, kind: 'site', chat: j.chat, said: [{ who: 'you', text: brief }, { who: 'hermia', text: j.text || '' }] })
    }
    // it looked something up first: what it found waits in the chat, with Build (decision 0025)
    if (r?.status === 409 && isResearchStop(j)) return setStop({ stop: j, at: Date.now(), again: m => void build({ brief, agents, route, chat, more: m }) })
    if (r?.status === 409) return note('err', 'The crew are still on the last change.')
    if (r?.status === 503 && j?.hermes) return note('err', j.message || j.error || 'Hermes is not answering.')
    note('err', `Couldn't start the build${r ? ` (${j?.error || r.status})` : ''}. Is the studio server running?`)
  }, [run, view.project, go, post])

  // the answer: all builds the brief now from its chat (answered); the rest open the Studio walk with steps skipped
  const answered = useCallback(async ({ path, skip, brief, chat }: ChatGo) => {
    if (path === 'all') return build({ brief, route: 'new', chat })
    const start = skip.includes('brand') ? 'plan' : 'brand'
    const r = await post('/api/studio', { kind: 'site', idea: brief, chat, skip, start }).catch(() => null)
    const j = await r?.json().catch(() => ({})) as { project?: { id: string }, error?: string } | undefined
    if (r?.ok && j?.project?.id) return go({ type: 'studio', project: j.project.id, step: start })
    note('err', j?.error || 'The Studio did not open. Say it again.')
  }, [build, go, post])

  // a build that stopped for a reason before any page was planned (the model failed, Hermes was gone): its own
  // words come back as the brief, so Build starts it again, once per build (#541). Hermia's line says why.
  useEffect(() => {
    if (!run || model.state !== 'stopped' || !model.stopped || model.planned || !model.brief) return
    // its first button reads Try again, as the current deck's does (web/canvas/panels.js stoppedMsg)
    setTalk(t => (t?.id === `again:${run}` ? t : { id: `again:${run}`, kind: 'site', brief: model.brief, what: 'The same build, once more', go: 'Try again' }))
  }, [run, model.state, model.stopped, model.planned, model.brief])

  const comment = async (text: string, body: { target?: string | null, targets?: string[] }) => {
    const r = await post(`/api/runs/${encodeURIComponent(run!)}/comment`, { text, sections: doneSections(model).map(s => ({ ...s, role: model.layers[s.key]?.role })), ...body }).catch(() => null)
    if (r?.ok) return
    const j = await r?.json().catch(() => ({})) as { error?: string } | undefined
    // "which section?": the crew already said so in the chat
    if (!/which section/.test(j?.error || '')) note('err', `comment: ${j?.error || 'the studio server is not answering'}`)
  }

  const submit = useCallback(async ({ text, agents, chips }: { text: string, agents: number, chips: { key: string, kind: string }[] }) => {
    if (!chips.length && await ownerSay(text, { api, said: t => note('you', t), answer: t => note('hermia', t) })) return
    const layers = chips.filter(c => c.kind === 'layer').map(c => c.key)
    if (layers.length && run) return comment(text, { targets: layers })
    const route = routeMessage({ text, run, site: model.kind !== 'game' && model.pages.length > 0, selected: !!picked })
    if (route === 'fix' && run) return comment(text, { target: picked })
    if (route === 'extend') {
      // "don't build yet, let's talk": the planner answers here and nothing is built until the person says so
      const intent = await post('/api/discuss/read', { text, kind: 'site' }).then(r => r.json() as Promise<{ intent?: string }>).then(j => j.intent || 'build').catch(() => 'build')
      if (intent !== 'build') return setTalk({ id: `deck:${Date.now()}`, kind: 'site', text })
    }
    return build({ brief: text, agents, route: route === 'new' ? 'new' : 'extend' })
  }, [run, model, picked, build, post, api])

  return (
    <Chat api={api} talk={talk} from={run} project={view.project} lines={lines} log={log} commands={COMMANDS}
      onSubmit={e => void submit(e)}
      // a loose chat reopened from Chats is outside every project: the deck with nothing on it (talk.js talkStart
      // `blank`). New chat stays where it is: a build just started is not yet known here by its project
      onTalk={t => { setTalk(t); if (t.blank && t.chat && !draft) go({ type: 'draft' }) }}
      onBuild={({ brief, chat, route, kind }) => void build({ brief, route, chat, kind })}
      onGo={e => void answered(e)}
      onCommand={({ name, arg }) => {
        if (!run) note('err', 'Nothing is built yet.')
        else if (name === 'play' || name === 'publish' || name === 'export' || name === 'replay') onCommand(name)
        else if (name === 'video') onVideo(videoAsk(arg))
        else note('err', `/${name} is not a command here. Try /play, /publish, /export, /replay or /video.`)
      }} />
  )
}
