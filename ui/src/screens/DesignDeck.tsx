// The Design deck (docs/ux/OBJECTS.md; the current one is web/canvas/): the crew watched at work on a build's pages,
// in Figma's layout (PATTERNS.md). The open version comes from the machine (`view.run`, room `deck`); its events
// are folded into the model the canvas and the panels draw. Slice 1 of the port (#404): the frame, the pages, the
// crew's cursors, Pages and Layers, the toolbar, and the variables. The chat, editing, marks, Play and Publish
// follow, and until then the current Studio has them at the same address.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LinkButton } from '../primitives/Button'
import { Icon } from '../primitives/Icon'
import { search } from '../nav/address'
import { useNav } from '../nav/NavProvider'
import { DeckStage, type Picked, type StageHandle } from './deck/DeckStage'
import { DesignTab } from './deck/DesignTab'
import { useEdits } from './deck/edit'
import { LeftPanel, RightPanel, Toolbar } from './deck/DeckPanels'
import { ExportDialog } from './deck/ExportDialog'
import { Player } from './deck/Player'
import { PublishDialog } from './deck/PublishDialog'
import { useDeckRun } from './deck/source'

export function DesignDeck() {
  const { view, go } = useNav()
  // ☰ → Replay (the machine's `replay`): the saved build plays again, and ends on the finished build
  const { model, loading, error } = useDeckRun(view.run ?? view.version, view.replay, useCallback(() => go({ type: 'replay', on: false }), [go]))
  const stage = useRef<StageHandle>(null)
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
  // the picked section (and the part of it the Design tab shows); hand edits, with Undo and Redo
  const [sel, setSel] = useState<Picked | null>(null)
  const [part, setPart] = useState<string | null>(null)
  const edits = useEdits(model.run, model.layers)
  const select = useCallback((p: Picked | null) => { setSel(p); setPart(null); if (p) setFollow(false) }, [])
  useEffect(() => { select(null) }, [model.run, select])
  // Esc lets go of the part, then the section, before the frame's Esc (which goes up a level); ⌘Z and ⇧⌘Z undo
  // and redo, never inside a field
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || view.player !== 'closed') return
      const field = e.target instanceof Element && !!e.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')
      if (e.key === 'Escape' && sel && !field) { e.preventDefault(); if (part) setPart(null); else select(null) }
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !field) { e.preventDefault(); if (e.shiftKey) edits.redo(); else edits.undo() }
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [sel, part, select, edits, view.player])
  const pickedLayer = sel ? model.layers[sel.key] : undefined
  useEffect(() => { setPicked(null); setFollow(true) }, [model.run, view.replay])
  const working = model.state === 'planning' || model.state === 'building'
  const play = () => go({ type: 'play', page: page ?? undefined, pages: model.pages.length })
  const canPlay = !loading && model.pages.some(p => model.order.some(k => model.layers[k].text && (model.layers[k].page === p.id || model.layers[k].page === '*')))
  const replay = { on: view.replay, can: !loading && (view.replay || model.state === 'done'), toggle: () => go({ type: 'replay', on: !view.replay }) }

  const studio = <LinkButton role="secondary" href={`/${search(view, location.search)}`}>Open in the Studio</LinkButton>
  if (error) {
    return (
      <section role="alert" className="grid h-[calc(100dvh-3.5rem)] place-content-center justify-items-center gap-4 p-6 text-center">
        <p className="font-monospace text-text">{error}</p>
        {studio}
      </section>
    )
  }

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-w-0 overflow-hidden">
      <LeftPanel id="deck-layers-panel" model={model} page={page} sheet={sheet} onClose={closeSheet} selected={sel?.key ?? null}
        onPage={id => { setPicked(id); setFollow(false); setSheet(false); stage.current?.focusPage(id) }}
        onLayer={k => { const l = model.layers[k]; const on = l && l.page !== '*' ? l.page : page ?? model.pages[0]?.id; if (!on) return; select({ key: k, page: on }); setPicked(on); setSheet(false); stage.current?.focusPage(on) }} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute top-3 left-3 z-20 flex gap-2">
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
          : model.state === 'empty'
            ? <div className="grid flex-1 place-content-center justify-items-center gap-4 p-6 text-center">
                <p className="font-monospace text-muted">This version has nothing on its pages yet.</p>
                {studio}
              </div>
            : <DeckStage ref={stage} model={model} onZoom={setZoom} follow={follow && working} onFollow={setFollow} selected={sel} onSelect={select} />}
        {!loading && model.state !== 'empty' && <Toolbar model={model} />}
      </div>
      <RightPanel model={model} zoom={zoom} onFit={() => stage.current?.fit()} canPlay={canPlay} onPlay={play} replay={replay}
        onPublish={() => setDialog('publish')} onExport={() => setDialog('export')} history={edits}
        design={pickedLayer && <DesignTab layer={pickedLayer} part={part} onPart={setPart} onClose={() => select(null)}
          onEdit={(patch, why) => { edits.edit(pickedLayer.key, patch, why).then(id => { if (id !== undefined) setPart(id) }) }} />} />
      {view.player !== 'closed' && model.pages.length > 0 && <Player model={model} />}
      {model.run && <PublishDialog model={model} isOpen={dialog === 'publish'} onOpenChange={o => setDialog(o ? 'publish' : null)} />}
      {model.run && <ExportDialog model={model} isOpen={dialog === 'export'} onOpenChange={o => setDialog(o ? 'export' : null)} />}
    </div>
  )
}
