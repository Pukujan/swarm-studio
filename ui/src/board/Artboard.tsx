// One artboard on a board: a card the person selects with a click, Enter or Space. It keeps the current Studio's
// hooks (.ab, data-key), which Hermia's cursor reads to settle on the card last touched.
import type { CSSProperties, ReactNode } from 'react'
import { Handles } from './Board'

export function Artboard({ id, label, className = '', pressed, selected, onPress, style, children }: {
  id: string
  label: string
  className?: string
  pressed?: boolean
  selected: boolean
  onPress: (id: string) => void
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      className={`ab ${className}`}
      data-key={id}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      style={style}
      onClick={() => onPress(id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(id) } }}
    >
      {children}
      {selected && <Handles />}
    </div>
  )
}
