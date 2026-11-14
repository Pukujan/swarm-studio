// One card on the Studio first's board. A kit's card (spec 37's kit contract: render(el, ctx)) is drawn by the kit
// into the card itself, as in the current Studio; the screen's own cards (the brand sheet, a reference, Add…) are
// drawn here. Either way it is a button: a click or Enter presses it, and the selected one has its corner marks.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { KitCtx } from '../../legacy'

interface Props {
  id: string
  name: string
  cls: string
  selected: boolean
  onPress: () => void
  // a kit's card: the kit draws it
  draw?: ((el: HTMLElement, ctx: KitCtx) => void) | null
  ctx?: () => KitCtx
  // drawn again when this changes (the kit's state, the data)
  version?: unknown
  children?: ReactNode
}

const MARKS = '<i></i><i></i><i></i><i></i>'

export function KitCard({ id, name, cls, selected, onPress, draw, ctx, version, children }: Props) {
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    if (draw && ctx) { node.replaceChildren(); draw(node, ctx()) }
    node.querySelector(':scope > .sel')?.remove()
    // a card that shows words is called by them (WCAG 2.5.3); one that shows only a picture keeps its name
    if (node.textContent?.trim()) node.removeAttribute('aria-label'); else node.setAttribute('aria-label', name)
    if (selected) node.insertAdjacentHTML('beforeend', `<div class="sel">${MARKS}</div>`)
  }, [draw, ctx, version, selected, name])
  return (
    <div ref={el} className={`ab ${cls}`} data-key={id} tabIndex={0} role="button" aria-label={name} aria-pressed={selected}
      onClick={onPress} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress() } }}>
      {draw ? null : children}
    </div>
  )
}
