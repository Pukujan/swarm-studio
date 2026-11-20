// The Design deck (docs/ux/OBJECTS.md; the current one is web/canvas/): the crew watched at work on a build's pages,
// in Figma's layout (PATTERNS.md). The open version comes from the machine (`view.run`, room `deck`); its events
// are folded into the model the canvas and the panels draw: the pages, the crew's cursors, Pages and Layers, the
// toolbar (the person's Move, Text and Comment), the variables, a picked section's Design tab (Open Design's Edit),
// comments, the chat, Play and Watch a visitor, Replay, Publish and Post to Feed, and Export (#404). A file dropped
// on the stage goes to the project's References (shared/RefDrop.tsx, issue #543; web/canvas/base.js's refDrop).
// scripts/deck-walk.mjs uses each of them end to end.
// The machine's `draft` is this deck too: a new project talked through before anything is built (web/home.js newChat,
// web/canvas/talk.js). There is no build, so the canvas has nothing on it and the chat is the talk (deck/DeckChat.tsx);
// its Build starts the build, which opens here.
import { classicHref } from '../shell/classic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { takeOpening } from '../nav/opening'
import { Button, LinkButton } from '../primitives/Button'
import { Icon } from '../primitives/Icon'
import { search } from '../nav/address'
import { useNav } from '../nav/NavProvider'
import { DeckStage, type Picked, type StageHandle } from './deck/DeckStage'
import { CommentPin } from './deck/Comment'
import { DeckChat } from './deck/DeckChat'
import type { ChatApi } from '../chat'
import { DesignTab } from './deck/DesignTab'
import { useEdits } from './deck/edit'
import { DeckBoard } from './deck/DeckBoard'
import { boardMode, type BoardMode } from '../board/flag'
import { LeftPanel, RightPanel, StatusPill, Toolbar, type MyTool } from './deck/DeckPanels'
import { swEdit } from '@studio/edit'
import { ExportDialog } from './deck/ExportDialog'
import { Player } from './deck/Player'
import { PublishDialog } from './deck/PublishDialog'
import { useDeckRun } from './deck/source'
import { useToast } from '../primitives/Toast'
import { refAt } from '../shared/refs'
import { useRefDrop } from '../shared/RefDrop'

// `board` forces the board's mode (a story); otherwise the address's ?board= says (src/board/flag.ts).
// `api` is the chat's server in a story (src/chat/types.ts ChatApi)
export function DesignDeck({ board: forced, api }: { board?: BoardMode, api?: ChatApi }) {
  const { view, go } = useNav()
  const draft = view.room === 'draft'
  // ☰ → Replay (the machine's `replay`): the saved build plays again, and ends on the finished build
  const { model, loading, error, unfinished = false } = useDeckRun(view.run ?? view.version, view.replay, useCallback(() => go({ type: 'replay', on: false }), [go]))
  const stage = useRef<StageHandle>(null)
  // a file dropped on the stage: to the project's References, by the build's address when the project is not known
  const toast = useToast()
  const drop = useRefDrop({ at: refAt(view.project, model.run ?? view.run ?? view.version), said: toast })
  const [board] = useState(() => forced ?? boardMode())
  const [zoom, setZoom] = useState(1)
  // the page Layers lists: the one the person picked, else the address's page, else the first
  const [picked, setPicked] = useState<string | null>(null)
  const page = model.pages.find(p => p.id === picked)?.id ?? model.pages.find(p => p.id === view.page)?.id ?? model.pages[0]?.id ?? null
  // Follow is on for every build that opens; the person turns it off by moving the camera
  const [follow, setFollow] = useState(true)
  // below 768 px Layers is a sheet behind its button
  const [sheet, setSheet] = useState(false)
  const closeSheet = useCallback(() => setSheet(false), [])
  const [dialog, setDialog] = useState<'publish' | 'export' | null>(null)
  // Publish's button: its menu opens under it
  const publishBtn = useRef<HTMLButtonElement>(null)
  // the picked section (and the part of it the Design tab shows); hand edits, with Undo and Redo
  const [sel, setSel] = useState<Picked | null>(null)
  const [part, setPart] = useState<string | null>(null)
  const edits = useEdits(model.run, model.layers)
  // the person's tool (the toolbar's Move, Text, Comment): Text and Comment act on the picked section, or wait for
  // the next one clicked, then hand back to Move (web/canvas/marks.js)
  const [tool, setTool] = useState<MyTool>('move')
  const [askComment, setAskComment] = useState(0)
  const layersNow = useRef(model.layers)
  layersNow.current = model.layers
  const act = useCallback((t: MyTool, p: Picked | null): boolean => {
    const l = p ? layersNow.current[p.key] : undefined
    if (t === 'move' || !l || l.status !== 'done') return false
    if (t === 'comment') { setAskComment(n => n + 1); return true }
    const words = swEdit.tree(l.text, 60).find(r => swEdit.read(l.text, r.id)?.wordsEditable)
    if (!words) return false
    setPart(words.id)
    // its Words field, once the Design tab shows the part
    setTimeout(() => document.querySelector<HTMLElement>('section[aria-label="Design"] input')?.focus(), 50)
    return true
  }, [])
  const toolNow = useRef(tool)
  toolNow.current = tool
  const select = useCallback((p: Picked | null) => {
    setSel(p); setPart(null); setAskComment(0)
    if (p) setFollow(false)
    if (p && act(toolNow.current, p)) setTool('move')
  }, [act])
  const selNow = useRef(sel)
  selNow.current = sel
  const pressTool = useCallback((t: MyTool) => {
    if (t !== 'move' && act(t, selNow.current)) { setTool('move'); return }
    setTool(was => (was === t ? 'move' : t))
  }, [act])
  useEffect(() => { select(null) }, [model.run, select])
  // Esc lets go of the part, then the section, before the frame's Esc (which goes up a level); ⌘Z and ⇧⌘Z undo
  // and redo, never inside a field
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || view.player !== 'closed') return
      const field = e.target instanceof Element && !!e.target.closest('input, textarea, select, [contenteditable], [role="dialog"], [data-refask]')
      if (e.key === 'Escape' && tool !== 'move' && !field) { e.preventDefault(); setTool('move'); return }
      if (e.key === 'Escape' && sel && !field) { e.preventDefault(); if (part) setPart(null); else select(null) }
      // V, T and C press the person's tools (web/canvas/loop.js)
      const k = e.key.toLowerCase()
      if (!field && !e.metaKey && !e.ctrlKey && !e.altKey && (k === 'v' || k === 't' || k === 'c')) { e.preventDefault(); pressTool(k === 'v' ? 'move' : k === 't' ? 'text' : 'comment') }
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !field) { e.preventDefault(); if (e.shiftKey) edits.redo(); else edits.undo() }
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [sel, part, select, edits, view.player, tool, pressTool])
  const pickedLayer = sel ? model.layers[sel.key] : undefined
  useEffect(() => { setPicked(null); setFollow(true) }, [model.run, view.replay])
  // opened on a page (the Overview's Open): that page is picked and the camera goes to it, once it is in the build
  const opening = useRef(takeOpening())
  useEffect(() => {
    const want = opening.current
    if (!want || !model.pages.some(p => p.id === want)) return
    opening.current = null
    setPicked(want); setFollow(false)
    requestAnimationFrame(() => stage.current?.focusPage(want))
  }, [model.pages, model.run])
  // a crew at work: a saved build that stopped before it finished has agents still holding sections, but none is
  // working, so there is nothing to Follow (as web/canvas/deck.js bboxActive skips a stalled build's)
  const working = (model.state === 'planning' || model.state === 'building') && !unfinished
  const play = () => go({ type: 'play', page: page ?? undefined, pages: model.pages.length })
  const canPlay = !loading && model.pages.some(p => model.order.some(k => model.layers[k].text && (model.layers[k].page === p.id || model.layers[k].page === '*')))
  const replay = { on: view.replay, can: !loading && (view.replay || model.state === 'done'), toggle: () => go({ type: 'replay', on: !view.replay }) }

  const studio = <LinkButton role="secondary" href={classicHref(search(view, location.search))}>Open in the Studio</LinkButton>
  if (error) {
    return (
      <section role="alert" className="grid h-[calc(100dvh-3.5rem)] place-content-center justify-items-center gap-4 p-6 text-center">
        <p className="font-monospace text-text">{error}</p>
        {studio}
      </section>
    )
  }

  return (
    <>
    {/* the chat is down the left in a wide window, along the bottom in a narrower one (decision 0015, chat/Dock.tsx);
        the deck takes what is beside or above it */}
    <div className="relative flex min-w-0 overflow-hidden" style={{ height: 'calc(100dvh - 3.5rem - var(--chat-h, 0px))', marginLeft: 'var(--chat-w, 0px)' }}>
      <LeftPanel id="deck-layers-panel" model={model} page={page} sheet={sheet} onClose={closeSheet} selected={sel?.key ?? null}
        onPage={id => { setPicked(id); setFollow(false); setSheet(false); stage.current?.focusPage(id) }}
        onLayer={k => { const l = model.layers[k]; const on = l && l.page !== '*' ? l.page : page ?? model.pages[0]?.id; if (!on) return; select({ key: k, page: on }); setPicked(on); setSheet(false); stage.current?.focusPage(on) }} />
      <div className="relative flex min-w-0 flex-1 flex-col" {...drop.zone}>
        {drop.layer}
        <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2">
          {!loading && model.state !== 'empty' && <StatusPill model={model} unfinished={unfinished} />}
          <Button role="secondary" aria-expanded={sheet} aria-controls="deck-layers-panel" onPress={() => setSheet(s => !s)} className="md:hidden">
            <Icon name="layers" size={16} />Layers
          </Button>
          <Button role="primary" isDisabled={!canPlay} onPress={play} className="md:hidden"><Icon name="play" size={16} />Play</Button>
          {working && !loading && (
            <Button role="secondary" aria-pressed={follow} onPress={() => setFollow(f => !f)} className={follow ? 'outline-1 outline-frame-hi' : 'text-muted'}>
              <Icon name="users" size={16} />Follow
            </Button>
          )}
        </div>
        {loading
          ? <div role="status" aria-busy="true" aria-label="Loading the build" className="wait-in flex-1 bg-void [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px]">
              <div className="m-12 h-[60%] max-w-[640px] rounded-[4px] border border-line bg-surface-2 motion-safe:animate-pulse" />
            </div>
          : draft
            // a new project: the canvas with nothing on it (web/canvas/base.js fresh); the chat says what to do
            ? <div role="region" aria-label="Canvas" className="flex-1 bg-void [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px]" />
          : model.state === 'empty'
            ? <div className="grid flex-1 place-content-center justify-items-center gap-4 p-6 text-center">
                <p className="font-monospace text-muted">This version has nothing on its pages yet.</p>
                {studio}
              </div>
            : board === 'dom'
              ? <DeckStage ref={stage} model={model} onZoom={setZoom} follow={follow && working} onFollow={setFollow} selected={sel} onSelect={select}
                pickExtra={sel && model.run ? <CommentPin model={model} target={sel.key} ask={askComment} /> : null} />
              // the image-first board, behind ?board=tiers until the gauge says (src/board/flag.ts); a picked section's page is live
              : <DeckBoard ref={stage} model={model} mode={board} onZoom={setZoom} follow={follow && working} onFollow={setFollow} selected={sel?.page ?? picked ?? null}
                picked={sel} onSelect={select} pickExtra={sel && model.run ? <CommentPin model={model} target={sel.key} ask={askComment} /> : null} />}
        {!loading && model.state !== 'empty' && <Toolbar model={model} tool={tool} onTool={pressTool} />}
      </div>
      <RightPanel model={model} zoom={zoom} onFit={() => stage.current?.fit()} canPlay={canPlay} onPlay={play} replay={replay}
        onPublish={() => setDialog('publish')} onExport={() => setDialog('export')} history={edits} publishRef={publishBtn}
        design={pickedLayer && <DesignTab layer={pickedLayer} issue={model.issues[pickedLayer.key]?.problem} part={part} onPart={setPart} onClose={() => select(null)}
          onEdit={(patch, why) => { edits.edit(pickedLayer.key, patch, why).then(id => { if (id !== undefined) setPart(id) }) }} />} />
      {view.player !== 'closed' && model.pages.length > 0 && <Player model={model} />}
      {model.run && <PublishDialog model={model} anchor={publishBtn} isOpen={dialog === 'publish'} onOpenChange={o => setDialog(o ? 'publish' : null)} />}
      {model.run && <ExportDialog model={model} isOpen={dialog === 'export'} onOpenChange={o => setDialog(o ? 'export' : null)} />}
    </div>
    {(model.run || draft) && <DeckChat api={api} model={model} picked={sel?.key ?? null}
      onCommand={c => { if (c === 'play') play(); else if (c === 'replay') replay.toggle(); else setDialog(c) }} />}
    </>
  )
}
