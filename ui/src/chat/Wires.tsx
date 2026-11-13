// The wires (web/layerlink.js): a thin line from each layer chip in the message box up to its layer where it is on
// screen, and from a hovered turn to each layer it was about. A layer off screen, or under the chat's dock, ends at
// the edge of what shows. They
// follow the canvas while any is drawn (it pans and zooms under them), so they are drawn each frame into one SVG
// over the page, not through React's state.
import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ChatProps } from './types'

const NS = 'http://www.w3.org/2000/svg'

export function Wires({ side, rect, hot, hover, chips }: { side: RefObject<HTMLElement | null>, rect?: ChatProps['layerRect'], hot: string | null, hover: HTMLElement | null, chips: number }) {
  const svg = useRef<SVGSVGElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = 0
      const root = svg.current, s = side.current
      if (!root || !s) return
      const list: { from: Element, key: string, hot: boolean }[] = []
      for (const el of s.querySelectorAll<HTMLElement>('[data-chip][data-wire]')) list.push({ from: el, key: el.dataset.chip || '', hot: el.dataset.chip === hot })
      if (hover?.isConnected) for (const key of (hover.dataset.layers || '').split(' ').filter(Boolean)) list.push({ from: hover, key, hot: true })
      // the chat is a dock along the bottom: a wire ends above its top edge
      const W = innerWidth, pad = 6
      const top = s.getBoundingClientRect().top, H = top
      const keep = new Set<string>()
      for (const [i, l] of list.entries()) {
        const a = l.from.getBoundingClientRect()
        if (!a.width) continue
        const ax = a.left + a.width / 2
        const r = rect?.(l.key)
        let bx: number, by: number, edge = false
        if (r && r.width) {
          bx = r.left; by = r.top + Math.min(r.height / 2, 60)
          if (bx < pad || bx > W - pad || by < pad || by > H - pad) { edge = true; bx = Math.min(W - pad, Math.max(pad, bx)); by = Math.min(H - pad, Math.max(pad, by)) }
        } else { edge = true; bx = ax; by = H - 28 }
        // from the chip's top up to the layer: a gentle curve, upward
        const sx = a.left + a.width / 2, sy = a.top
        const dy = Math.max(30, Math.abs(sy - by) * 0.4)
        const d = `M${sx.toFixed(1)},${sy.toFixed(1)} C${sx.toFixed(1)},${(sy - dy).toFixed(1)} ${bx.toFixed(1)},${(by + dy).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`
        const id = `l${i}`
        keep.add(id)
        let g = root.querySelector<SVGGElement>(`g[data-id="${id}"]`)
        if (!g) {
          g = document.createElementNS(NS, 'g')
          g.dataset.id = id
          g.append(document.createElementNS(NS, 'path'), document.createElementNS(NS, 'circle'))
          root.append(g)
        }
        g.dataset.key = l.key
        g.style.opacity = l.hot ? '1' : '.55'
        const path = g.firstElementChild as SVGPathElement, dot = g.lastElementChild as SVGCircleElement
        path.setAttribute('d', d)
        path.setAttribute('stroke-dasharray', edge ? '4 4' : '')
        dot.setAttribute('cx', bx.toFixed(1))
        dot.setAttribute('cy', by.toFixed(1))
        dot.setAttribute('r', '3')
      }
      for (const g of [...root.children] as SVGGElement[]) if (!keep.has(g.dataset.id || '')) g.remove()
      if (list.length) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [side, rect, hot, hover, chips])
  return createPortal(
    <svg ref={svg} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full fill-accent stroke-accent [&_path]:fill-none [&_path]:[stroke-width:1.5]" />,
    document.body
  )
}
