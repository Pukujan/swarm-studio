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
import { DeckStage, type StageHandle } from './deck/DeckStage'
import { DeckBoard } from './deck/DeckBoard'
import { boardMode, type BoardMode } from '../board/flag'
import { LeftPanel, RightPanel, Toolbar } from './deck/DeckPanels'
import { useDeckRun } from './deck/source'

// `board` forces the board's mode (a story); otherwise the address's ?board= says (src/board/flag.ts)
export function DesignDeck({ board: forced }: { board?: BoardMode }) {
  const { view } = useNav()
  const { model, loading, error } = useDeckRun(view.run ?? view.version)
  const stage = useRef<StageHandle>(null)
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
  useEffect(() => { setPicked(null); setFollow(true) }, [model.run])
  const working = model.state === 'planning' || model.state === 'building'

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
      <LeftPanel id="deck-layers-panel" model={model} page={page} sheet={sheet} onClose={closeSheet} onPage={id => { setPicked(id); setFollow(false); setSheet(false); stage.current?.focusPage(id) }} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute top-3 left-3 z-20 flex gap-2">
          <Button role="secondary" aria-expanded={sheet} aria-controls="deck-layers-panel" onPress={() => setSheet(s => !s)} className="md:hidden">
            <Icon name="layers" size={16} />Layers
          </Button>
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
            : board === 'dom'
              ? <DeckStage ref={stage} model={model} onZoom={setZoom} follow={follow && working} onFollow={setFollow} />
              // the image-first board, behind ?board=tiers|pixi until the gauge says (src/board/flag.ts)
              : <DeckBoard ref={stage} model={model} mode={board} onZoom={setZoom} follow={follow && working} onFollow={setFollow} selected={picked ?? view.page ?? null} />}
        {!loading && model.state !== 'empty' && <Toolbar model={model} />}
      </div>
      <RightPanel model={model} zoom={zoom} onFit={() => stage.current?.fit()} />
    </div>
  )
}
