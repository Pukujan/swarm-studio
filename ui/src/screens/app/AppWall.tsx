// The app build wall (spec 44), the screen: an app build's App room, at ?version=<run>&room=app. Where the person is
// comes from the machine; the app from its routes (source.ts), loaded once and kept up to date from the stream: an
// app:* event for this build reads its state again (a local call), a file written is read again. While it shows,
// it tells the server a viewer is here every 30 s, so the app is not stopped under them (decision 0017).
// A game's App room has not moved: it stays the stand-in.
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { search } from '../../nav/address'
import { useNav } from '../../nav/NavProvider'
import { LinkButton } from '../../primitives/Button'
import { useTrail } from '../../shell/Trail'
import { AppWallView, WINDOWS, type Said } from './AppWallView'
import { doneScreens, type AppModel, type RunEvent } from './model'
import { AppSourceContext } from './source'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function AppWall() {
  const { view } = useNav()
  const run = view.run || view.version
  const source = useContext(AppSourceContext)
  const [model, setModel] = useState<AppModel | null>(null)
  const [said, setSaid] = useState<Said>(null)
  const filePath = useRef<string | null>(null)

  const readFile = useCallback((path: string | null) => {
    if (!run) return
    filePath.current = path
    if (!path) return setModel(m => (m ? { ...m, file: null } : m))
    source.file(run, path).then(f => { if (filePath.current === path) setModel(m => (m ? { ...m, file: f } : m)) }).catch(() => {})
  }, [run, source])

  useEffect(() => {
    if (!run) return
    let live = true, again = 0
    setModel(null)
    const refresh = () => {
      clearTimeout(again)
      again = window.setTimeout(() => {
        Promise.all([source.state(run), source.files(run).catch(() => ({ files: [] }))]).then(([app, f]) => { if (live) setModel(m => (m ? { ...m, app, files: f.files } : m)) }).catch(() => {})
      }, 300)
    }
    Promise.all([source.state(run), source.map(run).catch(() => null), source.events(run).catch(() => [] as RunEvent[]), source.files(run).catch(() => ({ files: [] }))]).then(([app, map, events, f]) => {
      if (!live) return
      const start = events.find(e => e.type === 'run:start')
      const agents = Array.isArray(start?.agents) ? (start.agents as { name?: string }[]).map(x => str(x.name)).filter(Boolean) : []
      setModel({
        run, title: (app.name || str(start?.title) || str(start?.brief)).slice(0, 60), crew: agents.slice(0, 4), app, map, files: f.files, file: null,
        done: doneScreens(events), deployedAt: events.findLast(e => e.type === 'app:deployed')?.t
      })
      const writing = [...(app.steps || [])].reverse().find(s => s.kind === 'write' && s.file)?.text
      if (writing) readFile(writing)
    }).catch(() => { if (live) setModel(null) })
    const stop = source.stream?.(e => {
      if (e.run !== run) return
      if (e.type === 'appkit:checks') setModel(m => (m ? { ...m, done: doneScreens([e]) } : m))
      if (e.type === 'app:deployed') setModel(m => (m ? { ...m, deployedAt: e.t } : m))
      const step = e.type === 'app:step' ? e.step as { kind?: string, file?: boolean, text?: string } : null
      if (step?.kind === 'write' && step.file && step.text) readFile(step.text)
      if (e.type.startsWith('app:')) refresh()
    })
    const beat = source.seen ? window.setInterval(() => source.seen?.(run).catch(() => {}), 30000) : 0
    source.seen?.(run).catch(() => {})
    return () => { live = false; clearTimeout(again); clearInterval(beat); stop?.() }
  }, [run, source, readFile])

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

  const onOpen = useCallback(() => {
    if (!run) return
    source.open?.(run).then(app => setModel(m => (m ? { ...m, app } : m))).catch(() => {})
  }, [run, source])

  // a game's App room has not moved: its name and the way to the current Studio, at this address (as NotMovedYet,
  // which this cannot import: it reads the screens' list, which lists this)
  if (model?.app?.kind === 'game') return (
    <section className="grid min-h-[60dvh] place-content-center justify-items-center gap-6 p-6 text-center">
      <h1 className="font-display text-5xl font-extrabold uppercase">Game room</h1>
      <LinkButton role="primary" href={`/${search(view, location.search)}`}>Open in the Studio</LinkButton>
    </section>
  )
  if (!model) return <section aria-label="App build" aria-busy="true" className="grid flex-1 grid-cols-2 grid-rows-2 gap-[10px] p-3">{WINDOWS.map(w => <div key={w} className="rounded-[12px] border border-edge bg-deep" />)}</section>
  return <AppWallView model={model} said={said} onAsk={onAsk} onOpen={onOpen} onFile={readFile} />
}
