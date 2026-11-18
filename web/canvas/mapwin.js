// @ts-check
// The Map window (spec 44): a build as diagrams, drawn with Mermaid. One window, shown as the wall's first window
// while the crew builds (web/canvas/dock.js) or alone on the stage (web/canvas/rooms.js). It holds the standing
// map the server makes from what it knows (GET /api/runs/<id>/map: a tab per diagram) and, when the chat asked for
// one, a diagram the planner wrote (the Asked tab).
//
// Mermaid is the pinned copy in web/vendor/mermaid/ (scripts/vendor.mjs), a classic script fetched from the
// plugin's own server the first time a Map is on screen, never before and never from anywhere else. It renders
// with securityLevel strict. The standing map's labels are the person's own words, cleaned by the server; an asked
// diagram is a model's text, so it is untrusted: capped in size, parsed before it is drawn, and a diagram that
// does not parse is a plain line, not an error picture. Mermaid's SVG is put in as nodes with scripts, event
// attributes and outside links taken out, and nothing a model wrote is ever set as HTML.
//
// Imports only the pure rules; the room hands it the cursor, the icons and the address.
import { chartFits, mapLook, mapList, chartWords } from './mapask.js'

/**
 * @typedef {{ id: string, name: string, text: string, marks?: boolean, nodes?: { name: string, state?: string }[] }} MapTab
 * @typedef {{ kind: string, version: string, tabs: MapTab[], say: string }} MapData
 * @typedef {{ busy?: boolean, text?: string, fail?: boolean }} MapAsked
 */

/**
 * @param {object} h
 * @param {string} h.src the address of the vendored Mermaid script
 * @param {string} h.cursor Hermia's cursor (markup the Studio's own code made)
 * @param {{ grow: string, shrink: string }} h.icons the enlarge button's two icons
 */
export function mapWindow({ src, cursor, icons }) {
  const el = document.createElement('section')
  el.className = 'cw-map'
  el.setAttribute('aria-label', 'Map')
  // A visible zoom control (the person, 2026-11-16: "needs a better zoom in button/slider its too hard
  // right now"): the wheel works but nothing showed it was there. A minus, a slider, a plus and Fit, on
  // the diagram's own edge, out of the way of its top bar. The slider is the reading of the same value
  // the wheel and a pinch set, so all three always agree.
  el.innerHTML = '<div class="cw-file"><span class="cw-path">Map</span><div class="mp-tabs" role="group" aria-label="Diagrams"></div><button type="button" class="mp-zoom" aria-expanded="false" aria-label="Enlarge the Map"></button></div>'
    + '<div class="mp-body"><div class="mp-pan"><div class="mp-pic"></div></div></div>'
    + '<div class="mp-zoomctl" role="group" aria-label="Zoom">'
    + '<button type="button" class="mp-out" aria-label="Zoom out">\u2212</button>'
    + '<input type="range" class="mp-range" min="0" max="100" step="1" value="0" aria-label="Zoom" aria-valuetext="100%">'
    + '<button type="button" class="mp-in" aria-label="Zoom in">+</button>'
    + '<button type="button" class="mp-fit" aria-label="Fit the diagram in the window" hidden>Fit</button>'
    + '</div><ol class="mp-alt"></ol>'
  const tabsEl = /** @type {HTMLElement} */ (el.querySelector('.mp-tabs')), body = /** @type {HTMLElement} */ (el.querySelector('.mp-body'))
  const picEl = /** @type {HTMLElement} */ (el.querySelector('.mp-pic'))
  const fitBtn = /** @type {HTMLButtonElement} */ (el.querySelector('.mp-fit'))
  const rangeEl = /** @type {HTMLInputElement} */ (el.querySelector('.mp-range'))
  const outBtn = /** @type {HTMLButtonElement} */ (el.querySelector('.mp-out'))
  const inBtn = /** @type {HTMLButtonElement} */ (el.querySelector('.mp-in'))
  const alt = /** @type {HTMLElement} */ (el.querySelector('.mp-alt'))
  /** @type {{ map: MapData | null | undefined, asked: MapAsked | null, tab: string, drawn: string, tabsKey: string, working: boolean, big: boolean, n: number }} */
  const st = { map: undefined, asked: null, tab: '', drawn: '', tabsKey: '', working: false, big: false, n: 0 }
  /** @type {{ zoom: (() => void) | null }} */
  const on = { zoom: null }
  const enumZoom = /** @type {HTMLButtonElement} */ (el.querySelector('.mp-zoom'))
  enumZoom.innerHTML = icons.grow
  enumZoom.onclick = () => on.zoom?.()

  // ---------- zooming the diagram (the person, 2026-11-16: "wish this map had zoom in zoom out feature").
  // The diagram used to be forced to the window's size, so a plan wider than the window kept its end cut
  // off and nothing made it readable. Now the picture keeps its own size inside a panning box: the wheel
  // or a pinch zooms about the pointer, dragging moves it, and a Recentre button appears only once it has
  // been moved off its place (docs/ux/RULES.md, rule 22: direct manipulation, and the button is the way back).
  const view = { k: 1, x: 0, y: 0, moved: false }
  const K = { min: 0.2, max: 6 }
  // The slider is the same value, on a log scale so half the track is 1x and the steps feel even either
  // side of it: track 0 is K.min, 100 is K.max.
  const toTrack = k => Math.round(100 * (Math.log(k / K.min) / Math.log(K.max / K.min)))
  const toZoom = t => K.min * Math.pow(K.max / K.min, Math.min(100, Math.max(0, t)) / 100)
  const apply = () => {
    picEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`
    const pct = Math.round(view.k * 100)
    rangeEl.value = String(toTrack(view.k))
    rangeEl.setAttribute('aria-valuetext', `${pct}%`)
    // the button is the way home, shown only once there is somewhere to come back from
    fitBtn.hidden = !view.moved && Math.abs(view.k - 1) < 0.001
    body.classList.toggle('zoomed', view.k > 1.001 || view.moved)
    outBtn.disabled = view.k <= K.min + 1e-6
    inBtn.disabled = view.k >= K.max - 1e-6
  }
  const reset = () => { Object.assign(view, { k: 1, x: 0, y: 0, moved: false }); apply() }
  fitBtn.onclick = reset
  // zoom to an absolute factor about a point (the slider, the buttons); the centre when no point is given
  // Zoom to an absolute factor about a point on screen — the pointer for the wheel and a pinch, the middle
  // for the slider and the buttons — and keep the diagram's own point under it exactly still.
  //
  // The picture is scaled about its OWN centre (transform-origin 50% 50%), and that centre sits at the
  // window's middle. So a point p of the window lands at C + (p + t - C)/k. Asking that to stay put while k
  // goes k1 -> k2 gives t2 = (p - C)*k2 - p + C. The first version scaled the offset as if the origin were
  // the window's top-left corner, so every wheel step slid the diagram sideways: the point under the cursor
  // ran away by a thousand pixels (the person, 2026-11-16: "doesnt zoom into cursor's current position").
  const zoomTo = (k2, cx, cy) => {
    const r = body.getBoundingClientRect()
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top
    const k = Math.min(K.max, Math.max(K.min, k2))
    if (Math.abs(k - view.k) < 1e-6) return
    // The picture's centre, unmoved by its own transform. offsetLeft/offsetWidth describe the LAYOUT box,
    // where getBoundingClientRect() reports the scaled one: reading that back after each step feeds the
    // previous scale into the next and drifts. And it is not the window's middle either — a picture wider
    // than the window is centred by the grid, so its centre sits off to one side (measured: 712,224 in a
    // 898x481 window). Scaling about the wrong point is what sent the diagram under the cursor running.
    const C = { x: picEl.offsetLeft + picEl.offsetWidth / 2, y: picEl.offsetTop + picEl.offsetHeight / 2 }
    // Solved from scratch, not from the old offset: f(p) = C + (p - C)/k + t must equal p, so
    // t = (p - C)(1 - 1/k). Iterating on the previous t compounded rounding and, worse, carried a pan
    // made at another scale straight into the new one.
    view.x = (px - C.x) * (1 - 1 / k)
    view.y = (py - C.y) * (1 - 1 / k)
    view.k = k
    if (Math.abs(k - 1) > 0.001) view.moved = true
    apply()
  }
  /** zoom by `f` about a point in the window's own coordinates */
  const zoomAt = (f, cx, cy) => zoomTo(view.k * f, cx, cy)
  rangeEl.oninput = () => { zoomTo(toZoom(Number(rangeEl.value))); rangeEl.blur?.() }
  outBtn.onclick = () => zoomAt(1 / 1.5)
  inBtn.onclick = () => zoomAt(1.5)
  apply()
  body.addEventListener('wheel', e => {
    if (!picEl.firstElementChild) return
    // the wheel zooms rather than scrolls, but ctrl+wheel (a pinch on a trackpad) does not zoom the whole page
    e.preventDefault()
    zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY)
  }, { passive: false })
  // dragging moves the diagram; a drag that went nowhere is left to the click that enlarges the Map
  let drag = null
  body.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !picEl.firstElementChild) return
    drag = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y, moved: false }
    body.setPointerCapture(e.pointerId)
  })
  body.addEventListener('pointermove', e => {
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    drag.moved = true
    view.x = drag.ox + dx
    view.y = drag.oy + dy
    view.moved = true
    body.classList.add('dragging')
    apply()
  })
  const endDrag = () => {
    if (!drag) return
    const moved = drag.moved
    drag = null
    body.classList.remove('dragging')
    // a real drag is not also a click: enlarging the Map mid-pan would be a surprise
    if (moved) body.dataset.panned = '1'
    setTimeout(() => delete body.dataset.panned, 0)
  }
  body.addEventListener('pointerup', endDrag)
  body.addEventListener('pointercancel', endDrag)
  // a pinch on a touch screen (two fingers): the same zoom, about the fingers' middle
  let pinch = null
  const spread = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  body.addEventListener('touchstart', e => {
    if (e.touches.length !== 2 || !picEl.firstElementChild) return
    pinch = { d: spread([e.touches[0], e.touches[1]]) }
  }, { passive: true })
  body.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return
    e.preventDefault()
    const d = spread([e.touches[0], e.touches[1]])
    if (pinch.d > 0) zoomAt(d / pinch.d, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2)
    pinch.d = d
  }, { passive: false })
  body.addEventListener('touchend', () => { pinch = null }, { passive: true })
  // zoom in or out from the keyboard while the diagram has focus
  body.tabIndex = 0
  body.addEventListener('keydown', e => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); const r = body.getBoundingClientRect(); zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2) }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); const r = body.getBoundingClientRect(); zoomAt(0.8, r.left + r.width / 2, r.top + r.height / 2) }
    else if (e.key === '0') { e.preventDefault(); reset() }
  })
  // a new diagram starts fitted, not wherever the last one was left
  // a click on the diagram enlarges it, as on the wall's other windows (but not the click that ended a pan)
  body.onclick = () => { if (!enumZoom.hidden && !body.dataset.panned) on.zoom?.() }

  /** @type {Promise<any> | null} */
  let lib = null
  const load = () => (lib ||= new Promise((resolve, reject) => {
    const w = /** @type {any} */ (window)
    if (w.mermaid) return resolve(w.mermaid)
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => (w.mermaid ? resolve(w.mermaid) : reject(new Error('Mermaid did not load')))
    s.onerror = () => { lib = null; reject(new Error('Mermaid did not load')) }
    document.head.append(s)
  }))

  /** the tabs there are now: the standing map's, then the asked diagram's */
  const tabs = () => [...(st.map?.tabs || []), ...(st.asked ? [{ id: 'asked', name: 'Asked', text: st.asked.text || '', marks: false }] : [])]
  const current = () => { const all = tabs(); return all.find(t => t.id === st.tab) || all[0] || null }

  function paintTabs() {
    const all = tabs(), now = current()
    const key = `${all.map(t => `${t.id}:${t.name}`).join('|')}>${now?.id}`
    if (key === st.tabsKey) return
    st.tabsKey = key
    tabsEl.replaceChildren(...all.map(t => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = t.name
      b.setAttribute('aria-pressed', String(t.id === now?.id))
      b.classList.toggle('on', t.id === now?.id)
      b.onclick = () => { st.tab = t.id; draw() }
      return b
    }))
    tabsEl.hidden = all.length < 2
  }

  /** Replace what the window shows. Text and skeletons go in the body itself; a diagram goes in the pannable
   *  picture, so it keeps its own size and the wheel and drag have something to move.  @param {Node} node  @param {boolean} [panned] */
  function fill(node, panned = false) {
    if (panned) {
      let pan = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .mp-pan'))
      if (!pan) {
        pan = document.createElement('div')
        pan.className = 'mp-pan'
        pan.append(picEl)
      }
      body.replaceChildren(pan)
      picEl.replaceChildren(node)
    } else {
      body.replaceChildren(node)
    }
    // anything new starts fitted, not wherever the last diagram was left
    reset()
  }
  /** the shape of a diagram while it is fetched or written, with Hermia's cursor on it (aria-busy)  @param {string} label */
  function skeleton(label) {
    const d = document.createElement('div')
    d.className = 'mp-skel'
    d.setAttribute('role', 'status')
    d.setAttribute('aria-busy', 'true')
    d.setAttribute('aria-label', label)
    d.innerHTML = `<i></i><b></b><i></i><b></b><i></i><em class="mp-bot" aria-hidden="true">${cursor}</em>`
    fill(d)
    alt.replaceChildren()
  }
  /** @param {string} line */
  function plain(line) {
    const p = document.createElement('p')
    p.className = 'mp-none'
    p.textContent = line
    fill(p)
    alt.replaceChildren()
  }
  /** Mermaid's SVG as nodes, with nothing in it that runs or leaves the page  @param {string} svg  @param {string} label  @param {string[]} list */
  function place(svg, label, list) {
    const doc = new DOMParser().parseFromString(svg, 'text/html')
    const pic = doc.body.querySelector('svg')
    if (!pic) return plain('Could not draw that.')
    for (const bad of pic.querySelectorAll('script, iframe, object, embed, link, meta, title')) bad.remove()
    for (const node of [pic, ...pic.querySelectorAll('*')]) for (const a of [...node.attributes]) {
      const name = a.name.toLowerCase()
      if (name.startsWith('on') || name === 'title' || ((name === 'href' || name === 'xlink:href' || name === 'src') && !a.value.startsWith('#'))) node.removeAttribute(a.name)
    }
    const fig = document.createElement('div')
    fig.className = 'mp-fig'
    fig.setAttribute('role', 'img')
    fig.setAttribute('aria-label', label)
    fig.append(document.adoptNode(pic))
    fill(fig, true)
    alt.replaceChildren(...list.map(w => { const li = document.createElement('li'); li.textContent = w; return li }))
  }

  const token = n => getComputedStyle(document.documentElement).getPropertyValue(n)
  // Draw what the window holds now, if it is on screen and anything changed (the data, the tab, the theme).
  async function draw() {
    paintTabs()
    if (!el.isConnected || !el.getClientRects().length) return
    const tab = current(), look = mapLook(token)
    const asked = tab?.id === 'asked' ? st.asked : null
    const state = asked?.busy ? 'busy' : asked?.fail ? 'fail' : !tab ? (st.map === undefined ? 'wait' : 'none') : 'draw'
    const key = `${state}|${tab?.id}|${tab?.text}|${look.key}`
    if (key === st.drawn || st.working) return
    st.drawn = key
    if (state === 'busy') return skeleton('Hermia is drawing it')
    if (state === 'wait') return skeleton('Drawing the map')
    if (state === 'none') return plain('No plan to draw yet.')
    if (state === 'fail' || !tab || !chartFits(tab.text)) return plain('Could not draw that.')
    st.working = true
    // only the first time, while Mermaid itself is fetched, the window shows the diagram's shape
    if (!(/** @type {any} */ (window)).mermaid) skeleton('Drawing the map')
    try {
      const m = await load()
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: look.vars, fontFamily: getComputedStyle(document.body).fontFamily, flowchart: { htmlLabels: true, useMaxWidth: true, wrappingWidth: 240 }, er: { useMaxWidth: true }, suppressErrorRendering: true, maxTextSize: 20000 })
      const text = tab.marks ? `${tab.text}\n${look.defs.map(d => `  ${d}`).join('\n')}` : tab.text
      // parsed first: a diagram that does not parse is a plain line, never Mermaid's own error picture
      if (!(await m.parse(text, { suppressErrors: true }))) plain('Could not draw that.')
      else {
        const { svg } = await m.render(`mp-svg-${++st.n}`, text)
        place(svg, `${tab.name} diagram`, tab.id === 'asked' ? chartWords(tab.text) : mapList(tab.nodes))
      }
    } catch {
      plain('Could not draw that.')
    } finally {
      // (Mermaid can leave its measuring box behind when a render throws)
      document.getElementById(`dmp-svg-${st.n}`)?.remove()
      st.working = false
    }
    // what changed while this was drawn is drawn next
    draw()
  }

  return {
    el,
    /** The standing map as the server gave it; null: this build has no plan to draw; undefined: not read yet.  @param {MapData | null | undefined} map */
    set(map) { st.map = map; draw() },
    /** A diagram the chat asked for: being written ({ busy }), written ({ text }), or not drawable ({ fail }); null takes its tab away.  @param {MapAsked | null} asked */
    ask(asked) { st.asked = asked; if (asked) st.tab = 'asked'; else if (st.tab === 'asked') st.tab = ''; draw() },
    /** Show one of the standing tabs (the first when it is not named).  @param {string} [id] */
    show(id = '') { st.tab = id; draw() },
    /** Enlarged on the wall or not: the button says which.  @param {boolean} big */
    big(big) {
      if (st.big === big) return
      st.big = big
      el.classList.toggle('big', big)
      enumZoom.setAttribute('aria-expanded', String(big))
      enumZoom.setAttribute('aria-label', big ? 'Shrink the Map' : 'Enlarge the Map')
      enumZoom.innerHTML = big ? icons.shrink : icons.grow
    },
    /** Alone on the stage there is nothing to enlarge against.  @param {boolean} alone */
    alone(alone) { enumZoom.hidden = alone; el.classList.toggle('alone', alone) },
    /** @param {() => void} fn */
    onZoom(fn) { on.zoom = fn },
    draw,
    say: () => st.map?.say || '',
    has: () => !!st.map
  }
}
