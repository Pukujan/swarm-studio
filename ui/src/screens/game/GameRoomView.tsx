// The Game room, as drawn (web/canvas/rooms.js renderApp for a game, web/canvas/stage.js): the bar and the stage.
// Pure: it draws the model it is given and reports what the person does, so its stories need no server
// (../GameRoom.tsx is the screen that feeds it).
//   the bar    the state pill and the stage's line; the switch Crew · Art · Live · Map (each only when it has
//              something to show; a press pins a view, a press on the pinned one lets go); Autoplay, once the game
//              runs; Preview | Code; Reload, the engine project to download, Open in its own tab, and Stop
//   the stage  by itself it follows the build: the crew's wall while it builds, the live game once it has an address,
//              the art sheet before there is anything to play, else the room's card (starting, stopped, failed)
import { useState, type ReactNode } from 'react'
import { painterOf } from '@studio/icons'
import { neverDrew } from '@studio/wander'
import { appPill } from '@studio/replaytalk'
import { followName, type StageNow, type StageView } from '@studio/stage'
import { BoardVideo } from '../../primitives/BoardVideo'
import { Button, IconButton, LinkButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { ToggleGroup } from '../../primitives/ToggleGroup'
import { MermaidDiagram } from '../../shared/MermaidDiagram'
import { Wall, type WallWindow } from '../../shared/Wall'
import { crew as crewOf } from '../deck/crew'
import { failLine, frameUrl, stopSummary, type GameModel, type GameStep } from './model'
import type { Autoplay } from './useAutoplay'

export const GAME_WINDOWS = ['Map', 'Play test', 'Art', 'Code'] as const
const STAGE_NAME: Record<StageView, string> = { crew: 'Crew', art: 'Art', live: 'Live', map: 'Map' }
const media = (src: string) => `${window.SWARM?.base || ''}${src}`
export type Said = { at: number, who: string, text: string } | null
type AutoplayView = Pick<Autoplay, 'offered' | 'on' | 'live' | 'say' | 'screen' | 'toggle'>

const quiet = (text: string) => <p className="p-4 font-monospace text-sm text-muted">{text}</p>
const H2 = ({ children }: { children: ReactNode }) => <h2 className="font-display text-3xl font-extrabold uppercase">{children}</h2>
// a crew member's mark, where they are at work (the classic rooms' cursor)
const Mark = ({ name }: { name: string }) => <span aria-hidden className="inline-flex items-center gap-1 font-monospace text-xs text-muted"><span className="inline-block size-5 overflow-hidden rounded-full" dangerouslySetInnerHTML={{ __html: crewOf().avatar(name, 20) }} />{name}</span>

// the last play test that left something to say: its film, or that the game never started
const playStep = (steps: GameStep[] = []) => steps.findLast(x => x.clip || (x.kind === 'test' && neverDrew(x))) ?? null

// A play test, filmed: the clip loops, with the key it pressed last; a game that never drew has no film worth the
// name, so the error stands where the clip would be
function PlayTest({ step }: { step: GameStep }) {
  const none = neverDrew(step)
  if (none || !step.clip) return (
    <p className="p-3 text-sm"><b className="block font-label text-xs font-semibold uppercase tracking-[.07em]">The game did not start</b>
      <span className="font-monospace text-xs text-muted">{step.line || String(step.text || '').replace(/^[^:]*: /, '')}</span></p>
  )
  return <BoardVideo src={media(step.clip)} auto label="The play test, filmed" className={`h-full w-full bg-void object-contain ${step.ok === false ? 'outline outline-2 -outline-offset-2 outline-red' : ''}`} />
}

// The game's whole art plan as one sheet, each picture in its cell as the crew paints it, the cell being painted
// showing who is on it (web/canvas/rooms.js artSheet)
function ArtSheet({ model }: { model: GameModel }) {
  const a = model.app, mid = a.state === 'working' || !a.hasApp
  const cells = model.sheet, done = cells.filter(c => c.src).length
  const next = mid ? cells.find(c => !c.src) : null
  const last = mid ? a.steps?.at(-1)?.text || a.stage || '' : ''
  const head = !mid ? `The art · ${done}/${cells.length}` : !cells.length ? 'Building the game' : done < cells.length ? `Painting the art · ${done}/${cells.length}` : 'Building the game'
  return (
    // the sheet scrolls: it takes the keyboard
    <div role="region" aria-label="Art" tabIndex={0} className="absolute inset-0 overflow-auto bg-bg p-6 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-frame-hi">
      <H2>{head}</H2>
      {last && <p className="mt-1 font-monospace text-xs text-muted">{last}</p>}
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {cells.map(c => (
          <figure key={c.id} className={`m-0 ${c.aspect === 'wide' || c.aspect === 'landscape' ? 'col-span-2' : ''}`}>
            <div className={`grid place-items-center overflow-hidden rounded-[10px] border bg-deep ${c.aspect === 'wide' || c.aspect === 'landscape' ? 'aspect-video' : c.aspect === 'tall' || c.aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-square'} ${c === next ? 'border-line-2' : 'border-edge'}`}>
              {c.src ? <img src={media(c.src)} alt="" loading="lazy" className="h-full w-full object-contain" /> : c === next ? <Mark name={painterOf(c.id)} /> : null}
            </div>
            <figcaption className="mt-1 truncate font-monospace text-xs text-muted">{c.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

// The room's card, when there is nothing to play and no art to show: starting, building, stopped, failed
function Card({ model, opening, openError, onBuild, onInCode, onReopen, onStart }: { model: GameModel, opening: boolean, openError: string, onBuild: () => void, onInCode: () => void, onReopen: () => void, onStart?: () => void }) {
  const a = model.app, st = a.state, working = st === 'working', part = model.part
  // why the game's server did not start, when the room's own try failed
  const openFailed = !!openError, notStarted = openError || a.message
  const fail = (title: ReactNode, body: ReactNode, icon = 'x') => (
    <div className="grid max-w-[560px] justify-items-center gap-3 text-center">
      <span aria-hidden className="grid size-10 place-items-center rounded-full border border-line text-muted"><Icon name={icon} /></span>
      <H2>{title}</H2>{body}
    </div>
  )
  const msg = (text: string) => <p className="font-monospace text-sm text-muted">{text}</p>
  const details = (text: string) => <details className="w-full text-left"><summary className="cursor-pointer font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">Show details</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-[8px] border border-edge bg-deep p-3 font-monospace text-xs text-code">{text}</pre></details>
  const again = (label: string, on: () => void) => <Button role="primary" onPress={on}><Icon name="rotate-ccw" />{label}</Button>
  let body: ReactNode
  // a game opened again after its server stopped: the shape of a page while it starts
  if ((opening || (a.hasApp && !a.message && st !== 'failed' && st !== 'stopped' && !openFailed)) && !working) body = (
    <div role="status" aria-busy="true" aria-label="Starting the game" className="grid w-[min(520px,80%)] gap-3">
      <i className="block h-6 rounded-[6px] bg-panel-2" /><i className="block h-40 rounded-[10px] bg-panel-2" />
      <span className="grid grid-cols-3 gap-3"><i className="block h-16 rounded-[8px] bg-panel-2" /><i className="block h-16 rounded-[8px] bg-panel-2" /><i className="block h-16 rounded-[8px] bg-panel-2" /></span>
      <p className="text-center font-monospace text-sm text-muted">Starting the game…</p>
    </div>
  )
  else if (working) body = <div role="status" aria-busy="true" className="grid justify-items-center gap-2 text-center"><H2>Building the game…</H2>{msg(a.stage || 'starting')}</div>
  // the image model ran out before any art landed: build again, or with shapes drawn in code
  else if (st === 'failed' && a.result?.artStop) body = fail(<>No <em>art</em></>, <>
    {msg(`${a.result.artStop.model || 'The image model'} is out of quota`)}
    <div className="flex flex-wrap justify-center gap-2">{again('Try again', onBuild)}<Button role="secondary" onPress={onInCode}>Draw in code</Button></div>
  </>, 'image')
  else if (st === 'stopped' || (st === 'failed' && a.message === 'stopped')) body = <div className="grid max-w-[560px] justify-items-center gap-3 text-center"><H2><em>Stopped</em></H2>{msg(stopSummary(a.steps))}{again('Go on', onBuild)}</div>
  // it failed, and the state says why in plain words, what to do, and the one way forward the server takes
  else if (st === 'failed' && part?.state === 'failed' && part.reason) body = fail(<>The game didn't <em>build</em></>, <>
    {msg(part.reason.message)}{part.reason.action && msg(part.reason.action)}
    {part.detail && part.detail !== part.reason.message && details(part.detail)}
    {part.next ? again('Try again', onBuild) : null}
  </>)
  else if (st === 'failed') body = fail(<>The game didn't <em>build</em></>, <>{msg(failLine(a.message))}{a.message && details(a.message)}{again('Try again', onBuild)}</>)
  else if ((a.hasApp || openFailed) && notStarted) body = fail(<>The game didn't <em>start</em></>, <>{msg(String(notStarted).split('\n')[0].slice(0, 220))}{again('Try again', onReopen)}</>)
  // a game that was never built starts with its questions (start/GameStart.tsx)
  else body = <div className="grid justify-items-center gap-4 text-center"><H2>A game starts with a few questions</H2><Button role="primary" aria-haspopup="dialog" onPress={onStart}>Start a game</Button></div>
  return <div className="absolute inset-0 grid place-content-center justify-items-center overflow-auto bg-bg p-6">{body}</div>
}

// The Map: the build as diagrams, one tab each, with Hermia's one line under it
function MapPane({ model }: { model: GameModel }) {
  const tabs = model.map?.tabs || []
  const [tab, setTab] = useState('')
  const now = tabs.find(t => t.id === tab) || tabs[0]
  if (model.map === undefined) return <div aria-busy="true" className="h-full" />
  if (!now) return quiet('There is no plan to draw for this game yet.')
  return (
    <div className="flex flex-col gap-3 p-3">
      {tabs.length > 1 && <div className="max-w-[560px]"><ToggleGroup label="Diagrams" value={now.id} onChange={setTab} items={tabs.slice(0, 4).map(t => ({ k: t.id, label: t.name }))} /></div>}
      <MermaidDiagram text={now.text} label={now.name} />
      {model.map?.say && <p className="font-monospace text-xs text-muted">{model.map.say}</p>}
    </div>
  )
}

// The game's files, and one of them open (the classic room's Code)
function CodePane({ model, writing, onFile }: { model: GameModel, writing: string | null, onFile: (path: string | null) => void }) {
  const building = model.app.state === 'working'
  return (
    <div className="flex h-full min-h-0">
      <ul aria-label="Files" className={`w-56 flex-none overflow-auto border-r border-edge py-1 ${model.file ? 'max-[1100px]:hidden' : 'max-[1100px]:w-full max-[1100px]:border-r-0'}`}>
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
        </> : quiet(building ? 'Waiting for the first file.' : model.files.length ? 'Pick a file.' : 'No files yet.')}
      </div>
    </div>
  )
}

export function GameRoomView({ model, now, said = null, mode = 'preview', opening = false, openError = '', autoplay, reload = 0, onPick, onMode, onReload, onStop, onBuild, onInCode, onReopen, onStart, onFile, onPort }: {
  model: GameModel
  // the stage now (web/canvas/stage.js stageNow): the options offered, the one shown and the pin
  now: StageNow
  // a crew member's answer, over their window of the wall (0–3), or Hermia's over the wall (-1)
  said?: Said
  mode?: 'preview' | 'code'
  // the game's server is being started; why the last try failed
  opening?: boolean
  openError?: string
  autoplay?: AutoplayView
  // counts the presses of Reload: the frame loads again
  reload?: number
  onPick: (v: StageView) => void
  onMode: (m: 'preview' | 'code') => void
  onReload: () => void
  onStop: () => void
  // build again or go on; with shapes drawn in code; start the game's server again
  onBuild: () => void
  onInCode: () => void
  onReopen: () => void
  // the questions a new game starts with
  onStart?: () => void
  onFile: (path: string | null) => void
  onPort?: () => void
}) {
  const a = model.app, working = a.state === 'working'
  const [shut, setShut] = useState('')
  const writing = [...(a.steps || [])].reverse().find(s => s.kind === 'write' && s.file)?.text ?? model.file?.path ?? null
  const play = playStep(a.steps)
  const playKey = play ? (neverDrew(play) ? `none:${play.t || ''}` : play.clip || '') : ''
  const painted = model.sheet.filter(c => c.src)
  const nextCell = model.sheet.find(c => !c.src)
  const say = (i: number) => (said && said.at === i ? { who: said.who, text: said.text } : null)
  const stageLine = working ? a.stage || '' : a.result ? `${a.result.turns ?? 0} turn${a.result.turns === 1 ? '' : 's'} · ${a.result.files ?? 0} files · checks ${a.result.gatesPassed ? 'passed' : 'not passed'}${a.deployed ? ` · live at ${a.deployed}` : ''}` : ''
  const port = a.result?.port?.files ? a.result.port : null
  const preview = mode === 'preview'
  const showLive = preview && now.shown === 'live' && !now.empty
  const src = a.url ? frameUrl(a.url, location.href) : ''

  // the crew's wall for a game: the Map, the play test, the art as it is painted, the file being written
  const windows: WallWindow[] = [
    { id: 'map', title: GAME_WINDOWS[0], say: say(0), busy: model.map === undefined, content: <MapPane model={model} /> },
    { id: 'play', title: GAME_WINDOWS[1], say: say(1), content: play ? <PlayTest step={play} /> : quiet('The bots play each slice once it is built; their film shows here.') },
    {
      id: 'art', title: GAME_WINDOWS[2], say: say(2),
      tools: model.sheet.length ? <span className="font-monospace text-xs text-muted">{painted.length}/{model.sheet.length}</span> : undefined,
      content: painted.length || nextCell ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-3">
          {working && nextCell && <figure className="m-0"><div className="grid aspect-square place-items-center rounded-[8px] border border-line-2 bg-deep"><Mark name={painterOf(nextCell.id)} /></div><figcaption className="mt-1 truncate font-monospace text-[11px] text-muted">{nextCell.name}</figcaption></figure>}
          {painted.slice(-11).reverse().map(c => <figure key={c.id} className="m-0"><img src={media(c.src!)} alt="" loading="lazy" className="aspect-square w-full rounded-[8px] border border-edge bg-deep object-contain" /><figcaption className="mt-1 truncate font-monospace text-[11px] text-muted">{c.name}</figcaption></figure>)}
        </div>
      ) : quiet('No art is painted for this game yet.')
    },
    { id: 'code', title: GAME_WINDOWS[3], say: say(3), tools: <span className="font-monospace text-xs text-muted">{model.files.length ? `${model.files.length} files` : ''}</span>, content: <CodePane model={model} writing={writing} onFile={onFile} /> }
  ]

  return (
    // the room fills the screen under the top bar (h-14), beside and above the chat (chat/Dock.tsx)
    <div className="ml-[var(--chat-w,0px)] flex h-[calc(100dvh-3.5rem-var(--chat-h,0px))] min-h-0 flex-col" data-game-room>
      <header className="flex min-h-12 flex-wrap items-center gap-2 border-b border-edge px-3 py-1">
        <span role="status" className="rounded-full border border-line px-2.5 py-1 font-label text-xs font-semibold uppercase tracking-[.07em]">{appPill({ state: a.state, url: a.url, hasApp: a.hasApp, kind: 'game', part: model.part })}</span>
        <span className="min-w-0 flex-1 truncate font-monospace text-xs text-muted">{stageLine}</span>
        {/* the switch shows once there are two views to choose between, or one is pinned: the pinned one is pressed;
            while the stage follows the build, the one on now is current (a dot before its name) */}
        {(now.offers.length > 1 || now.pin) && (
          <div role="group" aria-label="Stage" className="flex gap-1 rounded-[12px] border border-edge bg-[rgb(var(--void-rgb)/.5)] p-1">
            {now.offers.map(v => {
              const pinned = now.pin === v, current = !now.pin && now.shown === v
              return (
                <button key={v} type="button" aria-pressed={pinned} aria-current={current || undefined} onClick={() => onPick(v)}
                  aria-label={v === 'live' ? (pinned ? `End live · back to ${followName(now)}` : 'Show the game live') : undefined}
                  className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[8px] px-3 font-label text-[13.5px] font-semibold uppercase leading-none tracking-[.08em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-frame-hi ${pinned ? 'bg-text text-bg' : current ? 'text-text hover:bg-panel-2' : 'text-muted hover:bg-panel-2 hover:text-text'}`}>
                  {current && <i aria-hidden className="block size-1.5 rounded-full bg-text" />}{STAGE_NAME[v]}
                </button>
              )
            })}
          </div>
        )}
        {autoplay?.offered && <Button role={autoplay.on ? 'secondary' : 'ghost'} aria-pressed={autoplay.on} onPress={autoplay.toggle}><Icon name={autoplay.on ? 'square-stop' : 'play'} />Autoplay</Button>}
        <ToggleGroup label="View" value={mode} onChange={onMode} items={[{ k: 'preview', label: 'Preview' }, { k: 'code', label: 'Code' }]} />
        <IconButton icon="rotate-cw" label="Reload the game" onPress={onReload} isDisabled={!a.url} />
        {port && onPort && <Button role="ghost" aria-label={`Download the ${port.label} project`} onPress={onPort}>{port.label}</Button>}
        {a.url && <LinkButton role="ghost" href={a.url} target="_blank" aria-label="Open the game in its own tab"><Icon name="external-link" /></LinkButton>}
        {working && !a.elsewhere && <Button role="secondary" onPress={onStop}><Icon name="square" />Stop</Button>}
      </header>
      <div className="relative min-h-0 flex-1">
        {/* the game stays loaded under the wall, the Map and the code, so coming back to it does not start it again */}
        {a.url && !now.empty && (
          <div className={`absolute inset-0 bg-void ${showLive ? '' : 'invisible'}`}>
            {/* scripts only, no origin of its own: the frame the play test and the AI player run the game in
                (docs/engines/godot.md "Play-testing"; tests/sandbox.test.mjs holds every frame of the next UI to it) */}
            <iframe key={`${src}:${reload}`} title="The game" src={src} sandbox="allow-scripts" allow="autoplay; fullscreen; gamepad" className="h-full w-full border-0 bg-void" />
            {/* the AI player's screen lies over the game while it plays, with what it just decided */}
            {autoplay && (
              <div hidden={!autoplay.on} className="absolute inset-0 grid place-items-center bg-void">
                <img ref={autoplay.screen} alt="The AI player's screen" hidden={!autoplay.live} className="h-full w-full object-contain" />
                {!autoplay.live && <div role="status" aria-busy="true" aria-label="Starting the AI player" className="grid w-[min(420px,70%)] gap-3"><i className="block h-6 rounded-[6px] bg-panel-2" /><i className="block h-40 rounded-[10px] bg-panel-2" /></div>}
                {autoplay.say && <span role="status" className="absolute bottom-4 left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded-full border border-line bg-[rgb(var(--deep-rgb)/.94)] px-3 py-1.5 font-monospace text-xs">{autoplay.say}</span>}
              </div>
            )}
          </div>
        )}
        {preview && now.empty && (now.sheet ? <ArtSheet model={model} /> : <Card model={model} opening={opening} openError={openError} onBuild={onBuild} onInCode={onInCode} onReopen={onReopen} onStart={onStart} />)}
        {preview && now.shown === 'crew' && <div className="absolute inset-0 flex flex-col bg-bg"><Wall label="Game build" windows={windows} start={1} /></div>}
        {preview && now.shown === 'map' && <div className="absolute inset-0 overflow-auto bg-bg"><MapPane model={model} /></div>}
        {/* off the wall the play test is a small card over the stage, which × hides; never over the live game, which is
            the person's own screen to play on */}
        {preview && play && now.shown !== 'crew' && now.shown !== 'live' && shut !== playKey && (
          <aside aria-label="Play test" className="absolute right-3 bottom-3 w-[min(320px,60%)] overflow-hidden rounded-[12px] border border-line bg-deep shadow-[0_4px_14px_rgb(var(--shade-rgb)/.5)]">
            <header className="flex items-center gap-2 pl-3"><b className="flex-1 font-label text-xs font-semibold uppercase tracking-[.07em]">Play test</b><IconButton icon="x" label="Hide the play test" onPress={() => setShut(playKey)} /></header>
            <div className="aspect-video"><PlayTest step={play} /></div>
          </aside>
        )}
        {!preview && <div className="absolute inset-0 bg-bg"><CodePane model={model} writing={writing} onFile={onFile} /></div>}
      </div>
    </div>
  )
}
