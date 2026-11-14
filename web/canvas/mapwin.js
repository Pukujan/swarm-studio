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
  el.innerHTML = '<div class="cw-file"><span class="cw-path">Map</span><div class="mp-tabs" role="group" aria-label="Diagrams"></div><button type="button" class="mp-zoom" aria-expanded="false" aria-label="Enlarge the Map"></button></div>'
    + '<div class="mp-body"></div><ol class="mp-alt"></ol>'
  const tabsEl = /** @type {HTMLElement} */ (el.querySelector('.mp-tabs')), body = /** @type {HTMLElement} */ (el.querySelector('.mp-body'))
  const alt = /** @type {HTMLElement} */ (el.querySelector('.mp-alt')), zoomBtn = /** @type {HTMLButtonElement} */ (el.querySelector('.mp-zoom'))
  /** @type {{ map: MapData | null | undefined, asked: MapAsked | null, tab: string, drawn: string, tabsKey: string, working: boolean, big: boolean, n: number }} */
  const st = { map: undefined, asked: null, tab: '', drawn: '', tabsKey: '', working: false, big: false, n: 0 }
  /** @type {{ zoom: (() => void) | null }} */
  const on = { zoom: null }
  zoomBtn.innerHTML = icons.grow
  zoomBtn.onclick = () => on.zoom?.()
  // a click on the diagram enlarges it, as on the wall's other windows
  body.onclick = () => { if (!zoomBtn.hidden) on.zoom?.() }

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

  /** the shape of a diagram while it is fetched or written, with Hermia's cursor on it (aria-busy)  @param {string} label */
  function skeleton(label) {
    const d = document.createElement('div')
    d.className = 'mp-skel'
    d.setAttribute('role', 'status')
    d.setAttribute('aria-busy', 'true')
    d.setAttribute('aria-label', label)
    d.innerHTML = `<i></i><b></b><i></i><b></b><i></i><em class="mp-bot" aria-hidden="true">${cursor}</em>`
    body.replaceChildren(d)
    alt.replaceChildren()
  }
  /** @param {string} line */
  function plain(line) {
    const p = document.createElement('p')
    p.className = 'mp-none'
    p.textContent = line
    body.replaceChildren(p)
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
    fig.className = 'mp-pic'
    fig.setAttribute('role', 'img')
    fig.setAttribute('aria-label', label)
    fig.append(document.adoptNode(pic))
    body.replaceChildren(fig)
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
      zoomBtn.setAttribute('aria-expanded', String(big))
      zoomBtn.setAttribute('aria-label', big ? 'Shrink the Map' : 'Enlarge the Map')
      zoomBtn.innerHTML = big ? icons.shrink : icons.grow
    },
    /** Alone on the stage there is nothing to enlarge against.  @param {boolean} alone */
    alone(alone) { zoomBtn.hidden = alone; el.classList.toggle('alone', alone) },
    /** @param {() => void} fn */
    onZoom(fn) { on.zoom = fn },
    draw,
    say: () => st.map?.say || '',
    has: () => !!st.map
  }
}
