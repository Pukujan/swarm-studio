// Setup › Pictures: what builds use for pictures, Painted, Stock photos or Drawn. Painted shows the image model
// Hermes has and whether it is ready; while it is not, stock photos fill in.
import { Disclosure } from '../../primitives/Disclosure'
import { ToggleGroup } from '../../primitives/ToggleGroup'
import { Line, Mark, Note, Val, Why, short } from './bits'
import type { Pictures } from './types'

const PICTURES = [
  { k: 'painted', label: 'Painted', note: 'About a minute each' },
  { k: 'stock', label: 'Stock photos', note: 'Built-in library and Pexels · instant' },
  { k: 'drawn', label: 'Drawn', note: 'SVG · fastest, no keys' }
] as const

export function PicturesRow({ pictures: p, onPick, isExpanded, onToggle }: {
  pictures: Pictures
  onPick: (mode: Pictures['mode']) => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const on = PICTURES.find(x => x.k === p.mode) ?? PICTURES[1]
  const painted = p.painted.model ? `${short(p.painted.model)} · ${p.painted.provider}` : 'No image model'
  const state = <><Val>{on.label}</Val>{p.mode === 'painted' && !p.painted.ready && <Mark ok={false} label="Not ready" />}</>
  return (
    <Disclosure name="Pictures" state={state} isExpanded={isExpanded} onToggle={onToggle}>
      <ToggleGroup label="Pictures" items={PICTURES} value={p.mode} onChange={onPick} />
      {on.k === 'painted' ? (
        <>
          <Line><span className="text-text">{painted}</span><Mark ok={!!p.painted.ready} label={p.painted.ready ? 'Ready' : 'Not ready'} /></Line>
          {p.painted.error && <Why>{p.painted.error}</Why>}
          <Note>{p.painted.ready ? on.note : 'Stock photos fill in'}</Note>
        </>
      ) : <Note>{on.note}</Note>}
    </Disclosure>
  )
}
