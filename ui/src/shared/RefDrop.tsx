// A screen's drop to References (refs.ts; the classic Studio's web/refdrop.js): while files are dragged over the
// screen, "Drop to add to References" covers it; after the drop, Hermia asks once, beside it, "like this, or use
// as is?" (RefAsk). The hook gives the handlers to spread on the element that takes the drop (it is
// `position: relative`) and the layer to draw inside it.
//
//   useRefDrop({ at, api, said, done, asset, skip, cover })
//     at:     refAt(project, run), or null: then nothing is taken
//     said:   Hermia's line in this screen's chat (or a toast)
//     failed: a file that could not be added, and why ("this build is not in a project yet"); said, unless given
//     done:   the project's references after the drop, and the ones it added
//     asset:  after Use as is, the references and the assets as they are now
//     skip:   a drop this screen handles itself (the Studio's Assets section)
//     source: 'upload', or 'import' where the drop is also read for what it says (the Studio's board)
//     cover:  the overlay takes the drop itself, for a screen with a live frame in it (a file over an iframe never
//             reaches the page around it once the overlay is up)
// The hosted studio (window.SWARM.hosted, server/hosted.mjs) takes no drops.
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { chatApi } from '../chat/api'
import { Button } from '../primitives/Button'
import { Icon } from '../primitives/Icon'
import { addRefs, askLabel, askLine, inRefs, placed, placeAsIs, whatOf, type Ref, type RefApi } from './refs'

export interface RefDropOptions<R extends Ref> {
  at: string | null
  api?: RefApi
  said?: (text: string) => void
  failed?: (text: string) => void
  done?: (refs: R[], added: R[]) => void
  asset?: (refs: R[], assets: R[]) => void
  skip?: (e: DragEvent) => boolean
  source?: 'upload' | 'import'
  cover?: boolean
  // where the ask sits: 'bottom' (above a screen's toolbar or dock), or 'top' where a chat dock runs under the drop
  place?: 'bottom' | 'top'
}
export interface RefDropZone {
  onDragEnter: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files')
const hosted = () => !!window.SWARM?.hosted

export function useRefDrop<R extends Ref = Ref>({ at, api = chatApi, said = () => {}, failed = said, done = () => {}, asset = () => {}, skip = () => false, source = 'upload', cover = false, place = 'bottom' }: RefDropOptions<R>): { zone: RefDropZone, layer: ReactNode } {
  const [over, setOver] = useState(false)
  const [ask, setAsk] = useState<{ at: string, added: R[], n: number } | null>(null)
  const depth = useRef(0)
  const n = useRef(0)
  const takes = (e: DragEvent) => hasFiles(e) && !hosted() && !!at && !skip(e)

  const add = useCallback(async (files: File[]) => {
    if (!at || !files.length) return
    const { refs, added } = await addRefs<R>(api, at, files, failed, source)
    if (!added.length) return
    done(refs, added)
    said(askLine(whatOf(added)))
    setAsk({ at, added, n: ++n.current })
  }, [at, api, said, failed, done, source])

  const zone: RefDropZone = {
    onDragEnter: e => { if (!takes(e)) return; e.preventDefault(); depth.current++; setOver(true) },
    onDragOver: e => { if (!takes(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: e => { if (!hasFiles(e)) return; if (--depth.current <= 0) { depth.current = 0; setOver(false) } },
    onDrop: e => {
      depth.current = 0; setOver(false)
      if (!takes(e)) return
      e.preventDefault()
      void add([...e.dataTransfer.files])
    }
  }

  const asIs = (a: { at: string, added: R[] }) => {
    setAsk(null)
    void placeAsIs<R>(api, a.at, a.added).then(j => { if (j) { asset(j.refs, j.assets); said(placed(whatOf(a.added))) } })
  }
  const layer = (
    <>
      {over && (
        <div aria-hidden className={`absolute inset-[10px] z-30 grid place-items-center rounded-[14px] border-[1.5px] border-dashed border-text bg-[rgb(var(--void-rgb)/.4)] ${cover ? '' : 'pointer-events-none'}`}>
          <span className="flex items-center gap-2 rounded-full bg-text px-4 py-2.5 font-body text-sm font-semibold text-void"><Icon name="image" size={18} />Drop to add to References</span>
        </div>
      )}
      {ask && <RefAsk key={ask.n} place={place} what={whatOf(ask.added)} onLike={() => setAsk(null)} onAsIs={() => asIs(ask)} />}
    </>
  )
  return { zone, layer }
}

// Hermia's one question, beside the drop: Like this (focused first; Escape does the same) or Use as is
export function RefAsk({ what, onLike, onAsIs, place = 'bottom' }: { what: string, onLike: () => void, onAsIs: () => void, place?: 'bottom' | 'top' }) {
  return (
    <div role="group" aria-label={askLabel(what)} data-refask
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onLike() } }}
      className={`absolute ${place === 'top' ? 'top-[56px]' : 'bottom-[88px]'} left-1/2 z-[31] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[12px] border border-line bg-deep py-2 pr-2 pl-3.5 font-body text-[13px] text-text shadow-[0_12px_30px_-10px_rgb(var(--shade-rgb)/.6)]`}>
      <span className="min-w-0 truncate">{inRefs(what)}</span>
      <Button role="ghost" autoFocus onPress={onLike}>Like this</Button>
      <Button role="ghost" onPress={onAsIs}><Icon name="pin" size={14} />Use as is</Button>
    </div>
  )
}
