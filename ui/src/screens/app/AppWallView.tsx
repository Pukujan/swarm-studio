// The app build wall (spec 44), as drawn: four windows on the shared Wall. Pure: it draws the model it is given and
// reports what the person does, so its stories need no server (AppWall.tsx is the screen that feeds it).
//   1 Map       the plan as diagrams (Mermaid): the screens and the ways between them, the screen being built now
//               and the ones done; the data as an ER diagram
//   2 Live app  the app as the crew builds it (its dev server), with Phone/Tablet/Desktop and Reload; when the build
//               stops, its photo (image-first), with Open to serve it again
//   3 Code      the file being written now, and the app's files to open one
//   4 Shipped   the last thing finished and the next screen in the plan; after a deploy, the live address
// A question naming one of the crew is theirs, answered over their window; any other is Hermia's, over the wall.
import { useState } from 'react'
import { Button, LinkButton } from '../../primitives/Button'
import { TextField } from '../../primitives/TextField'
import { ToggleGroup } from '../../primitives/ToggleGroup'
import { MermaidDiagram } from '../../shared/MermaidDiagram'
import { Wall, type WallWindow } from '../../shared/Wall'
import { markedFlow, nextScreen, nowScreen, type AppModel } from './model'

export const WINDOWS = ['Map', 'Live app', 'Code', 'Shipped'] as const
type Device = 'phone' | 'tablet' | 'desktop'
const WIDTH: Record<Device, string> = { phone: '390px', tablet: '820px', desktop: '100%' }
export type Said = { at: number, who: string, text: string } | null

const quiet = (text: string) => <p className="p-4 font-monospace text-sm text-muted">{text}</p>
const time = (t?: number) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')

export function AppWallView({ model, said, onAsk, onOpen, onFile }: {
  model: AppModel
  // the last answer: over window `at` (0–3), or over the wall (-1) when it was Hermia's
  said: Said
  onAsk: (text: string) => void
  onOpen: () => void
  // a file to read, or null to go back to the list (a narrow wall shows one or the other)
  onFile: (path: string | null) => void
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const [reload, setReload] = useState(0)
  const [ask, setAsk] = useState('')
  const a = model.app, building = a?.state === 'working'
  const writing = [...(a?.steps || [])].reverse().find(s => s.kind === 'write' && s.file)?.text ?? model.file?.path ?? null
  const now = building ? nowScreen(model.map, writing) : null
  const next = nextScreen(model.map, model.done, now)
  const live = building && !!a?.url
  const say = (i: number) => (said && said.at === i ? { who: said.who, text: said.text } : null)

  const map: WallWindow = {
    id: 'map', title: WINDOWS[0], say: say(0), busy: model.map === undefined,
    content: model.map === undefined ? <div className="h-full" /> : model.map === null ? quiet('No map: this app was built without a plan.') : (
      <div className="flex flex-col gap-4 p-3">
        <MermaidDiagram text={markedFlow(model.map, now, model.done)} label="Screens" />
        {model.map.note && <p className="font-monospace text-xs text-muted">{model.map.note}</p>}
        {model.map.er && <MermaidDiagram text={model.map.er} label="Data" />}
      </div>
    )
  }

  const liveWin: WallWindow = {
    id: 'live', title: WINDOWS[1], say: say(1), busy: building && !a?.url,
    tools: live ? <>
      <ToggleGroup label="Device" value={device} onChange={setDevice} items={[{ k: 'phone', label: 'Phone' }, { k: 'tablet', label: 'Tablet' }, { k: 'desktop', label: 'Desktop' }]} />
      <Button role="ghost" onPress={() => setReload(n => n + 1)}>Reload</Button>
    </> : undefined,
    content: live ? (
      <div className="flex h-full justify-center bg-void">
        <iframe key={reload} title="The app, as it is built" src={a!.url!} sandbox="allow-scripts allow-forms" style={{ width: WIDTH[device] }} className="h-full max-w-full border-0 bg-paper" />
      </div>
    ) : building ? <div className="h-full" /> : a?.photo ? (
      <div className="relative h-full">
        <img src={a.photo} alt="The app as built" className="h-full w-full object-cover object-top" />
        <div className="absolute right-3 bottom-3">{a.url ? <LinkButton role="primary" href={a.url} target="_blank">Open</LinkButton> : <Button role="primary" onPress={onOpen}>Open</Button>}</div>
      </div>
    ) : a?.hasApp ? (
      <div className="grid h-full place-content-center justify-items-center gap-3 p-4">
        <b className="font-label text-sm font-semibold uppercase tracking-[.07em]">Built</b>
        {a.url ? <LinkButton role="primary" href={a.url} target="_blank">Open</LinkButton> : <Button role="primary" onPress={onOpen}>Open</Button>}
      </div>
    ) : quiet('No app yet.')
  }

  const code: WallWindow = {
    id: 'code', title: WINDOWS[2], say: say(2),
    tools: <span className="font-monospace text-xs text-muted">{model.files.length ? `${model.files.length} files` : ''}</span>,
    content: (
      <div className="flex h-full min-h-0">
        <ul aria-label="Files" className={`w-48 flex-none overflow-auto border-r border-edge py-1 ${model.file ? 'max-[1100px]:hidden' : 'max-[1100px]:w-full max-[1100px]:border-r-0'}`}>
          {model.files.map(f => (
            <li key={f.path}><button type="button" onClick={() => onFile(f.path)}
              className={`block min-h-8 w-full cursor-pointer truncate px-3 text-left font-monospace text-xs hover:bg-panel-2 ${model.file?.path === f.path ? 'text-text' : 'text-muted'}`}>{f.path}</button></li>
          ))}
        </ul>
        <div className={`min-w-0 flex-1 overflow-auto ${model.file ? '' : 'max-[1100px]:hidden'}`}>
          {model.file ? <>
            <p className="sticky top-0 flex items-center gap-2 border-b border-edge bg-deep px-3 py-1 font-monospace text-xs text-muted">
              <button type="button" onClick={() => onFile(null)} className="hidden min-h-8 cursor-pointer rounded-[6px] px-1 text-text hover:bg-panel-2 max-[1100px]:inline">Files</button>
              <span className="truncate">{model.file.path}{building && model.file.path === writing ? ' · being written' : ''}</span>
            </p>
            <pre className="p-3 font-monospace text-xs leading-relaxed text-code"><code>{model.file.text}</code></pre>
          </> : quiet(building ? 'Waiting for the first file.' : 'Pick a file.')}
        </div>
      </div>
    )
  }

  const lastTurn = [...(a?.steps || [])].reverse().find(s => s.kind === 'turn')
  const shipped: WallWindow = {
    id: 'shipped', title: WINDOWS[3], say: say(3),
    content: (
      <div className="flex flex-col gap-4 p-4">
        <section aria-label="Last finished">
          <b className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">Last finished</b>
          {a?.result ? (
            <p className="mt-1 font-monospace text-sm">{a.result.turns ?? 0} turn{a.result.turns === 1 ? '' : 's'} · {a.result.files ?? 0} files · checks {a.result.gatesPassed ? 'passed' : 'not passed'}</p>
          ) : <p className="mt-1 font-monospace text-sm text-muted">{lastTurn?.text || (building ? a?.stage || 'starting' : 'Nothing yet.')}</p>}
          {a?.photo && !building && <img src={a.photo} alt="" className="mt-2 aspect-video w-full max-w-[360px] rounded-[8px] border border-edge object-cover object-top" />}
        </section>
        {next && <section aria-label="Next"><b className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">Next</b><p className="mt-1 font-monospace text-sm">{next.name}</p></section>}
        {a?.deployed && (
          <section aria-label="Live">
            <b className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">Live</b>
            <p className="mt-1 font-monospace text-sm"><a href={a.deployed} target="_blank" rel="noreferrer" className="underline">{a.deployed.replace(/^https?:\/\//, '')}</a>{model.deployedAt ? ` · ${time(model.deployedAt)}` : ''}</p>
          </section>
        )}
      </div>
    )
  }

  return (
    // the wall fills the screen under the top bar (h-14), as the boards do; its windows scroll inside
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <form className="flex items-end gap-2 px-3 pt-3" onSubmit={e => { e.preventDefault(); const t = ask.trim(); if (t) { onAsk(t); setAsk('') } }}>
        <div className="max-w-[520px] flex-1"><TextField label="Ask the crew" placeholder="Pip, what are you on?" value={ask} onChange={setAsk} /></div>
        <Button role="secondary" type="submit" isDisabled={!ask.trim()}>Ask</Button>
      </form>
      {said && said.at < 0 && <p role="status" className="mx-3 mt-2 max-w-[640px] rounded-[4px_12px_12px_12px] border border-line bg-deep px-3 py-2 font-monospace text-xs"><b className="mr-1.5">{said.who}</b>{said.text}</p>}
      <Wall label="App build" windows={[map, liveWin, code, shipped]} start={building ? 1 : 3} />
    </div>
  )
}
