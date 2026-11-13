// The Design deck's chat: the shared Chat (src/chat, decision 0015: a dock along the bottom), fed the build's own
// lines, and Send routed as the current deck routes it (web/canvas/loop.js sendDock, web/route.js):
//   layers dragged into the chat      the words go to just those sections (a comment on them)
//   a section picked, words about it  that section is rewritten (fix)
//   anything else, with a build open  the project's next version extends it, after the planner reads whether the
//                                     person wants to build now or talk first (engine/talkplan.mjs)
//   no build                          a new build
// A talk (the Chat's own) ends in a brief; its Build starts the build here. A new build takes the deck over.
import { useCallback, useMemo, useState } from 'react'
import { routeMessage } from '@studio/route'
import { Chat, type BuildRoute, type ChatCommand, type ChatLine, type ChatTalk } from '../../chat'
import { useNav } from '../../nav/NavProvider'
import { crew } from './crew'
import { doneSections, type DeckModel, type DeckLine } from './model'

const token = () => window.SWARM?.token ?? ''
const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'x-swarm-token': token(), 'content-type': 'application/json' }, body: JSON.stringify(body) })

// the commands the deck takes in the chat (web/canvas/loop.js SLASH, the ones this deck has moved)
const COMMANDS: ChatCommand[] = [
  { name: 'play', what: 'Open the prototype' },
  { name: 'publish', what: 'Publish a live link' },
  { name: 'export', what: 'Export the files' },
  { name: 'replay', what: 'Watch the build again' }
]

export function DeckChat({ model, picked, onCommand }: {
  model: DeckModel, picked: string | null, onCommand: (name: 'play' | 'publish' | 'export' | 'replay') => void
}) {
  const { view, go } = useNav()
  const [talk, setTalk] = useState<ChatTalk | null>(null)
  const [notes, setNotes] = useState<DeckLine[]>([])
  const note = (who: DeckLine['who'], text: string) => setNotes(n => [...n, { id: `note:${Date.now()}:${n.length}`, at: Date.now(), who, text }])
  const run = model.run

  // the build's lines, each crew line in its agent's shade; the build's news goes to the Log tab
  const toChat = (l: DeckLine): ChatLine => ({ ...l, ...(l.who === 'crew' && l.name ? { color: crew().color(l.name) } : {}), where: l.layers?.map(k => model.layers[k]?.role ?? k).join(', ') })
  const all = useMemo(() => [...model.lines, ...notes].sort((a, b) => a.at - b.at), [model.lines, notes])
  const lines = all.filter(l => l.who !== 'sys').map(toChat)
  const log = all.filter(l => l.who === 'sys' || l.who === 'err').map(toChat)

  // a build: this project's next version (from the open one), a new project, or this one from scratch
  const build = useCallback(async ({ brief, agents, route, chat }: { brief: string, agents?: number, route: BuildRoute | 'extend', chat?: string | null }) => {
    const r = await post('/api/run', {
      brief, ...(agents ? { agents } : {}), ...(view.project ? { project: view.project } : {}),
      ...((route === 'extend' || route === 'add' || route === 'redo') && run ? { from: run } : {}), ...(route === 'redo' ? { redo: true } : {}), ...(chat ? { chat } : {})
    }).catch(() => null)
    const j = await r?.json().catch(() => ({})) as { run?: string, error?: string, message?: string, hermes?: boolean } | undefined
    if (r?.ok && j?.run) { setTalk(null); go({ type: 'started', run: j.run, project: view.project, room: 'deck' }); return }
    if (r?.status === 409) return note('err', 'The crew are still on the last change.')
    if (r?.status === 503 && j?.hermes) return note('err', j.message || j.error || 'Hermes is not answering.')
    note('err', `Couldn't start the build${r ? ` (${j?.error || r.status})` : ''}. Is the studio server running?`)
  }, [run, view.project, go])

  const comment = async (text: string, body: { target?: string | null, targets?: string[] }) => {
    const r = await post(`/api/runs/${encodeURIComponent(run!)}/comment`, { text, sections: doneSections(model).map(s => ({ ...s, role: model.layers[s.key]?.role })), ...body }).catch(() => null)
    if (r?.ok) return
    const j = await r?.json().catch(() => ({})) as { error?: string } | undefined
    // "which section?": the crew already said so in the chat
    if (!/which section/.test(j?.error || '')) note('err', `comment: ${j?.error || 'the studio server is not answering'}`)
  }

  const submit = useCallback(async ({ text, agents, chips }: { text: string, agents: number, chips: { key: string, kind: string }[] }) => {
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
  }, [run, model, picked, build])

  return (
    <Chat talk={talk} from={run} project={view.project} lines={lines} log={log} commands={COMMANDS}
      onSubmit={e => void submit(e)}
      onTalk={setTalk}
      onBuild={({ brief, chat, route }) => void build({ brief, route, chat })}
      onCommand={({ name }) => {
        if (name === 'play' || name === 'publish' || name === 'export' || name === 'replay') onCommand(name)
        else note('err', `/${name} is not a command here. Try /play, /publish, /export or /replay.`)
      }} />
  )
}
