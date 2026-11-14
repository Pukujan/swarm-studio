// The picker in a built app's pages (issue #542, "pointing"): the App room says what to change by pointing at it.
// Swarm puts this script into the HTML it serves for a finished app (engine/appjob.mjs serveBuilt: its files, or
// the front before its server). Never into the app's files, its build or a deploy. It does nothing until the
// page's parent (the Studio's App room, a sandboxed frame without same origin) asks with postMessage; then it
// outlines what is under the pointer, and a click posts back what it is: its role, its visible words and the
// route, to the origin that asked, and nothing more. Esc ends it.
export const PICKER = `<script data-swarm-pick>(() => {
  const P = window.parent
  if (P === window) return
  let on = false, box = null, to = ''
  const ROLE = { a: 'link', button: 'button', input: 'field', textarea: 'field', select: 'field', img: 'picture', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', label: 'label', li: 'item', nav: 'menu', form: 'form', table: 'table' }
  const words = el => String(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.alt || el.title || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
  const what = el => ({ role: el.getAttribute('role') || ROLE[el.tagName.toLowerCase()] || el.tagName.toLowerCase(), text: words(el), route: location.pathname })
  const mark = el => {
    if (!box) { box = document.createElement('div'); box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #2b6cff;border-radius:4px;background:rgba(43,108,255,.08)'; document.documentElement.appendChild(box) }
    const r = el.getBoundingClientRect()
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', display: 'block' })
  }
  const over = e => mark(e.target)
  const pick = e => { e.preventDefault(); e.stopPropagation(); stop(); P.postMessage({ swarmPick: what(e.target) }, to) }
  const key = e => { if (e.key === 'Escape') { stop(); P.postMessage({ swarmPick: null }, to) } }
  const start = () => { if (on) return; on = true; addEventListener('mouseover', over, true); addEventListener('click', pick, true); addEventListener('keydown', key, true); document.documentElement.style.cursor = 'crosshair' }
  const stop = () => { on = false; removeEventListener('mouseover', over, true); removeEventListener('click', pick, true); removeEventListener('keydown', key, true); document.documentElement.style.cursor = ''; if (box) box.style.display = 'none' }
  addEventListener('message', e => {
    if (e.source !== P || !e.data || typeof e.data !== 'object') return
    if (e.data.swarmPick === 'start') { to = e.origin; start() }
    if (e.data.swarmPick === 'stop') stop()
  })
})()</script>`

// The picker in one HTML document: before </head>, else at the start of <body>. Anything that is not a document
// (no head or body: a fragment, a game's bare canvas) is left as it is.
export function withPicker(html) {
  const s = String(html)
  if (s.includes('data-swarm-pick')) return s
  if (/<\/head>/i.test(s)) return s.replace(/<\/head>/i, `${PICKER}</head>`)
  if (/<body[^>]*>/i.test(s)) return s.replace(/<body[^>]*>/i, m => m + PICKER)
  return s
}
