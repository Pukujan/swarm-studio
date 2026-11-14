// Play: each page as one real document (the theme, the shared nav and footer, its own sections) for a sandboxed
// frame at true size, so Tailwind's breakpoints apply and Mobile is the site at 390 px, not a scaled desktop
// (web/canvas/player.js pageDoc, pageBody, pageParts). Links built with data-goto move between pages; nothing else
// navigates. A visitor tour asks the page to find, scroll to, hover, press and type into elements by their data-tour
// id, since nothing outside the sandbox can reach in.
import { clean } from '@studio/clean'
import type { DeckModel } from './model'

const PLAY_SCRIPT = `<script>
addEventListener('click', e => {
  const g = e.target.closest('[data-goto]')
  e.preventDefault()
  if (g) return parent.postMessage({ type: 'goto', target: g.dataset.goto }, '*')
  document.body.classList.add('hint')
  setTimeout(() => document.body.classList.remove('hint'), 700)
}, true)
addEventListener('submit', e => e.preventDefault(), true)
const wait = ms => new Promise(r => setTimeout(r, ms))
const shown = el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' }
const find = id => {
  const el = document.querySelector('[data-tour="' + id + '"]')
  if (!el || shown(el)) return el
  // a nav link folded away on a phone: another visible link to the same page will do
  const to = el.closest('[data-goto]')?.dataset.goto
  return (to && [...document.querySelectorAll('[data-goto="' + to + '"]')].find(shown)) || null
}
addEventListener('message', async e => {
  const m = e.data || {}
  if (e.source !== parent || m.type !== 'tour') return
  const el = m.el ? find(m.el) : null
  const done = x => parent.postMessage({ type: 'tour:ok', seq: m.seq, ...x }, '*')
  document.querySelectorAll('.tour-hover').forEach(x => x !== el && x.classList.remove('tour-hover'))
  if (m.op === 'locate') {
    if (!el) return done({ box: null })
    const before = scrollY
    el.scrollIntoView({ block: 'center', behavior: m.still ? 'auto' : 'smooth' })
    await wait(Math.abs(el.getBoundingClientRect().top - innerHeight / 2) > 40 || scrollY !== before ? (m.still ? 60 : 750) : 60)
    const r = el.getBoundingClientRect()
    return done({ box: [r.left, r.top, r.width, r.height] })
  }
  if (m.op === 'hover') el?.classList.add('tour-hover')
  if (m.op === 'press' && el) { el.classList.add('tour-press'); await wait(180); el.classList.remove('tour-press', 'tour-hover') }
  if (m.op === 'type' && el) {
    el.focus()
    const kind = el.tagName === 'SELECT' ? 'select' : el.type
    const set = { date: () => new Date().toISOString().slice(0, 10), time: () => '23:15', 'datetime-local': () => new Date().toISOString().slice(0, 11) + '23:15',
      number: () => (m.text || '').replace(/\\D/g, '') || '2', select: () => ([...el.options].find(o => o.text.toLowerCase().includes((m.text || '').toLowerCase())) || el.options[1] || el.options[0])?.value,
      checkbox: () => (el.checked = true, el.value), radio: () => (el.checked = true, el.value) }[kind]
    if (set) { await wait(300); el.value = set() }
    else {
      el.value = ''
      for (const ch of m.text || '') { el.value += ch; await wait(45 + Math.random() * 70) }
    }
  }
  done({})
})
<\/script>`

const fam = (n: string) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`

// the page's sections: the shared nav first, its own (and any other shared) in the planner's order, the shared
// footer last; each one cleaned (web/clean.js) and marked with its layer id
export function pageBody(m: DeckModel, page: string): string {
  const layers = m.order.map(k => m.layers[k]).filter(l => l.page === page || l.page === '*')
  const shared = (id: string) => layers.filter(l => l.page === '*' && l.id === id)
  const mid = layers.filter(l => l.page === page || (l.page === '*' && l.id !== 'nav' && l.id !== 'footer'))
  return [...shared('nav'), ...mid, ...shared('footer')].map(l => `<div data-layer="${l.id.replace(/["<&]/g, '')}">${clean(l.text)}</div>`).join('\n')
}

// What a visitor could use or read on a page, each with a data-tour id: the same id in the inventory the tour writer
// is sent and in the document the player shows
export interface TourItem { id: string, kind: 'input' | 'heading' | 'link' | 'button', text: string, goto?: string }
const TOURABLE = 'a, button, [data-goto], input, textarea, select, h1, h2, h3'
export function pageParts(html: string): { html: string, items: TourItem[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const items: TourItem[] = []
  let n = 0
  for (const el of doc.body.querySelectorAll<HTMLElement>(TOURABLE)) {
    const tag = el.tagName.toLowerCase()
    const input = tag === 'input' || tag === 'textarea' || tag === 'select'
    const text = (input ? el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name') || (el as HTMLInputElement).type : el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    const link = el.closest<HTMLElement>('[data-goto]')
    if (!text || (link && link !== el && !input)) continue
    const id = `e${++n}`
    el.setAttribute('data-tour', id)
    const goto = link?.dataset.goto
    if (items.length < 60) items.push({ id, kind: input ? 'input' : /^h\d$/.test(tag) ? 'heading' : goto || tag === 'a' ? 'link' : 'button', text, ...(goto ? { goto } : {}) })
  }
  return { html: doc.body.innerHTML, items }
}

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
body.hint [data-goto]{outline:3px solid #8e8e93cc;outline-offset:2px}
.tour-hover{outline:2px solid #8e8e93aa;outline-offset:3px;filter:brightness(1.06)}
.tour-press{transform:scale(.96);transition:transform .1s}</style>
${PLAY_SCRIPT}</head><body>${pageParts(pageBody(m, page)).html}</body></html>`
}
