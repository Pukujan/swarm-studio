// Play: each page as one real document (the theme, the shared nav and footer, its own sections) for a sandboxed
// frame at true size, so Tailwind's breakpoints apply and Mobile is the site at 390 px, not a scaled desktop
// (web/canvas/player.js pageDoc). Links built with data-goto move between pages; nothing else navigates.
import { clean } from '@studio/clean'
import { layersOf, type DeckModel } from './model'

// inside the page: a data-goto link asks the player for that page; any other click only flashes the links
const PLAY_SCRIPT = `<script>
addEventListener('click', e => {
  const g = e.target.closest('[data-goto]')
  e.preventDefault()
  if (g) return parent.postMessage({ type: 'goto', target: g.dataset.goto }, '*')
  document.body.classList.add('hint')
  setTimeout(() => document.body.classList.remove('hint'), 700)
}, true)
addEventListener('submit', e => e.preventDefault(), true)
<\/script>`

const fam = (n: string) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`

// the page's sections in order, every one cleaned (web/clean.js), as the deck's frames get them
export const pageBody = (m: DeckModel, page: string) => layersOf(m, page).filter(l => l.text).map(l => clean(l.text)).join('\n')

export function pageDoc(m: DeckModel, page: string): string {
  const t = m.theme
  const heading = t?.fonts?.heading || 'Georgia', body = t?.fonts?.body || 'Inter'
  const vars = Object.entries(t?.vars ?? {}).map(([k, v]) => `${k}:${v};`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com/3.4.17"><\/script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam(heading)}&${fam(body)}&display=swap">
<style>:root{--radius:${t?.radius || '12px'};--font-heading:'${heading}',Georgia,serif;--font-body:'${body}',system-ui,sans-serif;${vars}}
html,body{margin:0;background:var(--background,#fff);color:var(--foreground,#111);font-family:var(--font-body)}
[data-goto]{cursor:pointer}
body.hint [data-goto]{outline:3px solid #8e8e93cc;outline-offset:2px}</style>
${PLAY_SCRIPT}</head><body>${pageBody(m, page)}</body></html>`
}
