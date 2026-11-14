// One file on the stage, drawn as web/project.js board() draws it: a page from its saved snapshot, else its cover over
// its planned sections, else a block per planned section in the project's colours (spec 36); a picture, a clip with
// its length, the game with its play mark or its build's bar, an upload with its progress. A page is 124 wide and as
// long as its snapshot (nine widths at most). Pictures only: a generated page is never run here (the Design deck runs
// it, in a sandboxed frame).
import type { CSSProperties } from 'react'
import { Icon } from '../../primitives/Icon'
import { boardSize, fmtTime, skeletonBlocks, type Board, type Item, type Work } from './model'

const ICON: Record<string, string> = { page: 'site', app: 'code', game: 'game', film: 'film', upload: 'file', code: 'code', art: 'image' }
const WORK: Record<string, string> = { site: 'the site', app: 'the app', game: 'the game', film: 'the film' }

function Skeleton({ x, theme, cover }: { x: Item, theme: Board['theme'], cover?: string | null }) {
  const cs = theme?.colors || []
  const vars = (cs.length ? { '--sk-bg': cs[0], '--sk-a': cs[1] || cs[0], '--sk-b': cs[2] || cs[1] || cs[0], '--sk-fg': cs[3] || cs.at(-1) } : {}) as CSSProperties
  return (
    <div className="ov-sk absolute inset-0 overflow-hidden rounded-[3px]" style={vars}>
      {skeletonBlocks(x).map(b => (
        <i key={b.id} className={`ov-sk-b ${b.hero ? 'hero' : b.odd ? 'odd' : ''}`}
          style={{ top: `${(b.top * 100).toFixed(2)}%`, height: `${(b.h * 100).toFixed(2)}%`, backgroundImage: b.hero && cover ? `url('${cover}')` : undefined }}><b /></i>
      ))}
    </div>
  )
}

// the cover a page has before any picture: its theme's colours and heading font
function TypeCover({ x, theme }: { x: Item, theme: Board['theme'] }) {
  const cs = theme?.colors || []
  if (x.kind !== 'page' || !cs.length) return null
  const vars = { '--tc-bg': cs[0], '--tc-pr': cs[1] || cs[0], '--tc-fg': cs[3] || cs.at(-1), '--tc-font': `'${theme?.fonts?.heading || theme?.fonts?.display || ''}'` } as CSSProperties
  return <div className="ov-tc" style={vars}><i /><b>{x.name}</b><span /></div>
}

export function WorkBar({ w }: { w: Work }) {
  const pct = w.pct == null ? null : Math.round(w.pct * 100)
  return (
    <span className={`ov-work ${pct == null ? 'ind' : ''}`} role="progressbar" aria-label={`Building ${WORK[w.what || ''] || ''}`.trim()} aria-valuenow={pct ?? undefined}>
      <i style={pct == null ? undefined : { width: `${Math.max(4, pct)}%` }} />
    </span>
  )
}

export function Artboard({ x, theme, selected, aspect, sharp, onMeasure }: { x: Item, theme: Board['theme'], selected: boolean, aspect?: number, sharp: boolean, onMeasure: (page: string, ratio: number) => void }) {
  const [w, h] = boardSize(x, aspect)
  const src = sharp && x.sharp ? x.sharp : x.src
  const pic = x.kind === 'page' && !x.snap
    ? <Skeleton x={x} theme={theme} cover={x.cover} />
    : src
      ? <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className="block h-full w-full rounded-[3px] object-cover object-top"
          onLoad={e => { const im = e.currentTarget; if (x.kind === 'page' && x.snap && im.naturalWidth) onMeasure(x.page!, im.naturalHeight / im.naturalWidth) }} />
      : <TypeCover x={x} theme={theme} />
  const blank = !src && !(x.kind === 'page' && !x.snap) && !(x.kind === 'page' && theme?.colors?.length)
  return (
    <div data-key={x.key} className={`ov-ab ${x.kind} ${x.pending ? `pt-${x.pending.state}` : ''}`} style={{ width: w, height: h }}>
      {!(x.pending && !x.src) && pic}
      {blank && <span className="absolute inset-0 grid place-items-center text-dim"><Icon name={x.kind === 'ref' && x.ref?.kind === 'link' ? 'ext' : ICON[x.kind] || 'file'} size={26} /></span>}
      {x.kind === 'ref' && !x.src && <span className="ov-cap">{x.name}</span>}
      {x.pending && <span className="ov-paint" role="progressbar" aria-label={`Painting ${x.name}`}><i /></span>}
      {x.kind === 'film' && <><span className="ov-play" />{x.seconds ? <span className="ov-dur">{fmtTime(x.seconds)}</span> : null}</>}
      {x.kind === 'game' && <>{x.work ? <WorkBar w={x.work} /> : <span className="ov-play" />}<span className="ov-cap">{x.name}</span></>}
      {x.sending != null && <span className="ov-upl"><i style={{ width: `${Math.round(x.sending * 100)}%` }} /></span>}
      {selected && <div className="ov-sel"><i /><i /><i /><i /></div>}
    </div>
  )
}

// three pages drawn while the version's board is on its way
export function WaitingPages() {
  return (
    <section className="ov-sec">
      <span className="ov-al">Site</span>
      <div className="ov-abs">{[0, 1, 2].map(i => <div key={i} className="ov-ab page ov-wait" aria-busy="true" style={{ width: 124, height: 233 }} />)}</div>
    </section>
  )
}
