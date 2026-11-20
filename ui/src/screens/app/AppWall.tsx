// The app build wall (spec 44), the screen: an app build's App room, at ?version=<run>&room=app. Where the person is
// comes from the machine; the app from its routes (source.ts), loaded once and kept up to date from the stream: an
// app:* event for this build reads its state again (a local call), a file written is read again. While it shows,
// it tells the server a viewer is here every 30 s, so the app is not stopped under them (decision 0017).
// A game build's App room is the Game room (../GameRoom.tsx): once the build says it is a game, this hands over and
// reads nothing more. A file dropped on the wall goes to the project's References
// (shared/RefDrop.tsx, issue #543), by the build's address when the project is not known, and Hermia asks in the chat.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../../nav/NavProvider'
import { useTrail } from '../../shell/Trail'
import { AppWallView, WINDOWS, type Said } from './AppWallView'
import { doneScreens, type AppModel, type RunEvent } from './model'
import { AppSourceContext } from './source'
import { foldRadio, NO_RADIO, type Radio } from './radio'
import { Chat, type ChatLine } from '../../chat'
import { doneSections } from '../deck/model'
import { useDeckRun } from '../deck/source'
import { crew } from '../deck/crew'
import { refAt } from '../../shared/refs'
import { useRefDrop } from '../../shared/RefDrop'
import { useToast } from '../../primitives/Toast'
import { GameRoom } from '../GameRoom'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function AppWall() {
  const { view } = useNav()
  const run = view.run || view.version
  const source = useContext(AppSourceContext)
  const [model, setModel] = useState<AppModel | null>(null)
  // the run that turned out to be a game: the Game room draws it, and this wall stops reading it
  const [gameRun, setGameRun] = useState<string | null>(null)
  const game = !!run && gameRun === run
  const [said, setSaid] = useState<Said>(null)
  // the crew's radio for this build (#529): Hermia's orders and the helpers' acts and replies, from the stream
  const [radio, setRadio] = useState<Radio>(NO_RADIO)
  // the room's chat (issue #542, one box): what was said in it here, the person's words and the answers
  const [lines, setLines] = useState<ChatLine[]>([])
  const line = useCallback((who: ChatLine['who'], text: string) => setLines(ls => [...ls, { id: `${Date.now()}:${ls.length}`, at: Date.now(), who, text }]), [])
  // the live app's window is a frame: the overlay takes the drop itself (cover), or a file over it would not arrive
  const hermia = useCallback((text: string) => line('hermia', text), [line])
  // a file that could not be added (a build in no project yet) is a toast, not a line in the chat
  const toast = useToast()
  const drop = useRefDrop({ at: refAt(view.project, run), said: hermia, failed: toast, cover: true })
  // the design the app is made from: a change sends its finished sections, as the current Studio's appAsk does
  const { model: deck } = useDeckRun(run ?? null)
  // the chat shows the build's own lines too, as the deck's chat does (the crew in its shade; the build's news in the Log)
  const feed = useMemo(() => {
    const all = [...deck.lines.map(l => ({ ...l, ...(l.who === 'crew' && l.name ? { color: crew().color(l.name) } : {}) }) as ChatLine), ...lines].sort((a, b) => a.at - b.at)
    return { lines: all.filter(l => l.who !== 'sys'), log: all.filter(l => l.who === 'sys' || l.who === 'err') }
  }, [deck.lines, lines])
  const filePath = useRef<string | null>(null)

  const readFile = useCallback((path: string | null) => {
    if (!run) return
    filePath.current = path
    if (!path) return setModel(m => (m ? { ...m, file: null } : m))
    source.file(run, path).then(f => { if (filePath.current === path) setModel(m => (m ? { ...m, file: f } : m)) }).catch(() => {})
  }, [run, source])

  useEffect(() => {
    if (!run || game) return
    let live = true, again = 0
    setModel(null)
    const refresh = () => {
      clearTimeout(again)
      again = window.setTimeout(() => {
        Promise.all([source.state(run), source.files(run).catch(() => ({ files: [] })), source.versions?.(run).catch(() => null)]).then(([app, f, v]) => { if (live) setModel(m => (m ? { ...m, app, files: f.files, ...(v ? { versions: v.versions } : {}) } : m)) }).catch(() => {})
      }, 300)
    }
    Promise.all([source.state(run), source.map(run).catch(() => null), source.events(run).catch(() => [] as RunEvent[]), source.files(run).catch(() => ({ files: [] })), source.versions?.(run).catch(() => null)]).then(([app, map, events, f, v]) => {
      if (!live) return
      if (app.kind === 'game') return setGameRun(run)
      const start = events.find(e => e.type === 'run:start')
      const agents = Array.isArray(start?.agents) ? (start.agents as { name?: string }[]).map(x => str(x.name)).filter(Boolean) : []
      setModel({
        run, title: (app.name || str(start?.title) || str(start?.brief)).slice(0, 60), crew: agents.slice(0, 4), app, map, files: f.files, file: null,
        done: doneScreens(events), deployedAt: events.findLast(e => e.type === 'app:deployed')?.t, versions: v?.versions
      })
      // the orders and replies saved with the build: the strip says the last one (the stream adds the live ones)
      setRadio(events.reduce(foldRadio, { ...NO_RADIO, run }))
      const writing = [...(app.steps || [])].reverse().find(s => s.kind === 'write' && s.file)?.text
      if (writing) readFile(writing)
    }).catch(() => { if (live) setModel(null) })
    const stop = source.stream?.(e => {
      if (e.run !== run) return
      if (e.type === 'appkit:checks') setModel(m => (m ? { ...m, done: doneScreens([e]) } : m))
      if (e.type === 'app:deployed') setModel(m => (m ? { ...m, deployedAt: e.t } : m))
      const step = e.type === 'app:step' ? e.step as { kind?: string, file?: boolean, text?: string } : null
      if (step?.kind === 'write' && step.file && step.text) readFile(step.text)
      if (e.type === 'crew:lead' || e.type === 'crew:act' || e.type === 'agent:say') setRadio(r => foldRadio(r, e))
      if (e.type.startsWith('app:')) refresh()
    })
    const beat = source.seen ? window.setInterval(() => source.seen?.(run).catch(() => {}), 30000) : 0
    source.seen?.(run).catch(() => {})
    return () => { live = false; clearTimeout(again); clearInterval(beat); stop?.() }
  }, [run, source, readFile, game])

  useTrail(model?.title || undefined)

  const onAsk = useCallback((text: string) => {
    if (!run || !model) return
    // a question naming one of the crew is theirs, about the window they are on (the web wall's tellCrew)
    const k = model.crew.findIndex(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))
    const who = k >= 0 ? model.crew[k] : ''
    const on = k === 2 ? `writing ${model.file?.path || 'code'}` : k >= 0 ? `the ${WINDOWS[k].toLowerCase()} window` : ''
    setSaid({ at: k, who: who || 'Hermia', text: '…' })
    source.tell?.(run, text, who, on).then(r => setSaid({ at: k, who: who || 'Hermia', text: r.answer || 'The crew is working.' })).catch(err => setSaid({ at: k, who: who || 'Hermia', text: String(err.message || err) }))
  }, [run, model, source])

  // the chat's words (web/canvas/rooms.js appAsk): while the app is built, or before there is one, the crew answers
  // from what it is doing; once there is an app, they are one more change to it
  const onChat = useCallback(({ text }: { text: string }) => {
    if (!run || !model) return
    line('you', text)
    const a = model.app
    if (a?.state === 'working' || !a?.hasApp || !source.change) {
      // the answer comes back as `said` (the window's bubble too), and goes into the chat below
      onAsk(text)
      return
    }
    source.change(run, text, doneSections(deck)).then(app => { setModel(m => (m ? { ...m, app: { ...m.app, ...app } } : m)); line('sys', `💬 to the app: ${text}`) })
      .catch(err => line('err', `App: ${String(err.message || err)}`))
  }, [run, model, source, deck, onAsk, line])

  // an answer to the chat's question (not the '…' while it comes): one line, by whoever answered
  const answered = useRef<Said>(null)
  useEffect(() => {
    if (!said || said.text === '…' || answered.current === said) return
    answered.current = said
    setLines(ls => [...ls, { id: `${Date.now()}:${ls.length}`, at: Date.now(), who: said.who === 'Hermia' ? 'hermia' : 'crew', text: said.text, ...(said.who === 'Hermia' ? {} : { name: said.who }) }])
  }, [said])

  const onOpen = useCallback(() => {
    if (!run) return
    source.open?.(run).then(app => setModel(m => (m ? { ...m, app } : m))).catch(() => {})
  }, [run, source])

  // back to one of the app's versions (issue #542): its files as they were, served again
  const [going, setGoing] = useState('')
  const onBack = useCallback((rev: string) => {
    if (!run || !source.back) return
    setGoing(rev)
    source.back(run, rev).then(r => setModel(m => (m ? { ...m, app: { ...m.app, ...r }, versions: r.versions || m.versions } : m)))
      .catch(err => setSaid({ at: 3, who: 'Hermia', text: String(err.message || err) }))
      .finally(() => setGoing(''))
  }, [run, source])

  if (game) return <GameRoom />
  if (!model) return <section aria-label="App build" aria-busy="true" className="grid flex-1 grid-cols-2 grid-rows-2 gap-[10px] p-3">{WINDOWS.map(w => <div key={w} className="rounded-[12px] border border-edge bg-deep" />)}</section>
  return (
    <>
      <div className="relative flex min-h-0 flex-col" {...drop.zone}>
        <AppWallView model={model} said={said} onAsk={onAsk} onOpen={onOpen} onFile={readFile} onBack={onBack} going={going} docked radio={radio} />
        {drop.layer}
      </div>
      {/* the App room opens with its chat docked (issue #542): it is where a change to the app is asked for */}
      <Chat from={run} project={view.project} lines={feed.lines} log={feed.log} onSubmit={onChat}
        box={{ placeholder: "Change the app, or ask the crew…", empty: "Ask the crew what they are on, or say what to change: once the app is built, your words change it.", action: "Send" }} />
    </>
  )
}
