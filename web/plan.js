// The Plan board (docs/specs/21-plan-before-spend.md): a game's plan before anything costly is made.
// It follows a project's canvas (Figma's, docs/ux/PATTERNS.md): sections of artboards on a dotted
// stage that pans and zooms, the inspector on the right only while something is selected, and the
// top bar's one primary button, which carries the price: "Lock · 324 credits". Nothing expensive
// runs before that click; the server checks the same number again (engine/plan.mjs lockPlan).
import { ic, cursor, CREW } from './icons.js'

export function makePlan({ sw, C, root }) {
  const esc = sw.esc
  const base = () => sw.base || ''
  const P = { on: false, id: null, plan: null, sel: null, cam: { x: 0, y: 0, k: 1 }, framed: false, writing: null, saving: null }

  root.className = 'project plan'
  root.hidden = true
  root.innerHTML = `
    <div class="pj-stage" tabindex="-1" aria-label="Plan">
      <div class="pj-world"></div>
    </div>
    <aside class="pj-insp" hidden aria-label="Inspector"></aside>`
  const stage = root.querySelector('.pj-stage'), world = root.querySelector('.pj-world'), insp = root.querySelector('.pj-insp')

  // ---------- the top bar: Projects › name, and the one primary button (the price)
  const bar = document.querySelector('.topbar')
  const crumb = document.createElement('div')
  crumb.className = 'pl-crumb'
  crumb.innerHTML = `<button class="pl-up">Projects</button>${ic('chr', 14)}<b class="pl-name"></b>`
  bar?.querySelector('.spacer')?.before(crumb)
  crumb.querySelector('.pl-up').onclick = () => C.go('home')
  const primary = document.createElement('button')
  primary.className = 'toggle pl-primary'
  primary.innerHTML = '<span class="t"></span>'
  bar?.querySelector('.spacer')?.after(primary)
  primary.onclick = () => gate()

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, body: j }); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  const url = sub => `/api/plans/${encodeURIComponent(P.id)}${sub ? `/${sub}` : ''}`
  async function load() {
    if (!P.id) return
    try { P.plan = await api(url()) } catch (err) { toast(err.message); return }
    render()
  }
  function take(plan) { P.plan = plan; render() }

  // ---------- render
  const price = () => P.plan?.price || { credits: 0, runs: 0, images: 0, parts: [], first: { credits: 0 }, rest: { credits: 0 } }
  const cardValue = c => {
    const b = c.body || {}
    if (c.id === 'cast') return `${(b.roster || []).length}`
    if (c.id === 'systems') return `${Object.values(b).filter(v => v === 'on').length}`
    const first = Object.values(b).find(v => typeof v === 'string' && v.trim())
    return first ? first.split(/[,.]/)[0].slice(0, 28) : ''
  }
  function render() {
    const p = P.plan
    if (!p) { world.innerHTML = ''; return }
    crumb.querySelector('.pl-name').textContent = p.title || 'Plan'
    renderPrimary()
    const cards = p.cards.map((c, i) => `<div class="ab pcard${P.writing != null && i >= P.writing ? ' wait' : ''}" data-key="card:${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)}">
      <b>${esc(c.name)}</b><span>${esc(cardValue(c))}</span>${P.sel === `card:${c.id}` ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : ''}${P.writing != null && i === P.writing - 1 ? cursor(CREW[i % CREW.length]) : ''}</div>`).join('')
    world.innerHTML = `<div class="col"><section class="pj-sec plan-cards"><span class="al">Plan</span><div class="abs">${cards}</div></section></div>`
    applyCam()
    if (!P.framed && world.offsetWidth) { P.framed = true; frameAll(false) }
    renderInsp()
  }
  function renderPrimary() {
    const p = P.plan, pr = price()
    const label = !p ? '' : p.gate?.locked ? (p.gate.phase === 'first' ? 'Build one' : 'Build') : `Lock · ${pr.credits} credits`
    primary.querySelector('.t').textContent = label
    primary.classList.toggle('pri', !!p)
    primary.setAttribute('aria-label', label)
  }

  // the crew write the cards in, one after another (a new plan only)
  function writeIn() {
    P.writing = 0
    render()
    const step = () => {
      if (!P.on || !P.plan) { P.writing = null; return }
      P.writing += 1
      if (P.writing > P.plan.cards.length) { P.writing = null; render(); return }
      render()
      setTimeout(step, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320)
    }
    setTimeout(step, 200)
  }

  // ---------- the inspector: the selected card's lines, as inputs; saved as they change
  function renderInsp() {
    const c = P.sel?.startsWith('card:') && P.plan?.cards.find(x => `card:${x.id}` === P.sel)
    insp.hidden = !c
    root.classList.toggle('insp-on', !!c)
    if (!c) return
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return
    const b = c.body || {}
    let html = ''
    if (c.id === 'systems') {
      html = Object.entries(b).map(([k, v]) => `<label class="pl-sw"><input type="checkbox" data-k="${esc(k)}" ${v === 'on' ? 'checked' : ''}><span>${esc(k)}</span></label>`).join('')
    } else {
      html = Object.entries(b).filter(([k]) => k !== 'roster' && !(c.id === 'cast' && k === 'count')).map(([k, v]) => `<label class="pl-f"><span>${esc(label(k))}</span><input data-k="${esc(k)}" value="${esc(Array.isArray(v) ? v.join(', ') : v)}" maxlength="400"></label>`).join('')
      if (c.id === 'cast') {
        html += `<div class="pl-roster" role="list" aria-label="Cast">${(b.roster || []).map((r, i) => `<div class="pl-r" role="listitem" data-i="${i}">
          <input data-r="name" value="${esc(r.name)}" aria-label="Name" maxlength="40"><input data-r="weapon" value="${esc(r.weapon)}" aria-label="Weapon" maxlength="60">
          <button class="ib sm" data-del="${i}" aria-label="Remove ${esc(r.name)}">${ic('x', 14)}</button>
          <input class="wide" data-r="look" value="${esc(r.look)}" aria-label="Look" placeholder="Look" maxlength="300"></div>`).join('')}</div>
          <button class="btn ghost" data-add>${ic('plus', 15)}Add</button>`
      }
    }
    insp.innerHTML = `<h3><span>${esc(c.name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>${html}`
  }
  const label = k => ({ levelUp: 'Level-ups', ngPlus: 'New Game+', enemyAI: 'Enemy AI' }[k] || k.replace(/([A-Z])/g, ' $1').replace(/^\w/, s => s.toUpperCase()))
  function readCard() {
    const c = P.plan?.cards.find(x => `card:${x.id}` === P.sel)
    if (!c) return null
    const body = {}
    for (const i of insp.querySelectorAll('input[data-k]')) body[i.dataset.k] = i.type === 'checkbox' ? (i.checked ? 'on' : 'off') : i.value
    if (c.id === 'cast') body.roster = [...insp.querySelectorAll('.pl-r')].map(r => Object.fromEntries([...r.querySelectorAll('input[data-r]')].map(i => [i.dataset.r, i.value])))
    return { c, body }
  }
  function saveSoon(now = false) {
    clearTimeout(P.saving)
    const go = async () => {
      const x = readCard()
      if (!x) return
      try {
        const plan = await post(url('card'), { card: x.c.id, body: x.body })
        P.plan = plan
        renderPrimary()
        // the card's value at rest, in place (re-rendering would steal the focus)
        const el = world.querySelector(`.pcard[data-key="card:${CSS.escape(x.c.id)}"] span`)
        const c = plan.cards.find(y => y.id === x.c.id)
        if (el && c) el.textContent = cardValue(c)
      } catch (err) { toast(err.message) }
    }
    if (now) return go()
    P.saving = setTimeout(go, 450)
  }
  insp.addEventListener('input', e => { if (e.target.matches('input:not([type=checkbox])')) saveSoon() })
  insp.addEventListener('change', e => { if (e.target.matches('input[type=checkbox]')) saveSoon(true) })
  insp.addEventListener('click', e => {
    if (e.target.closest('.pj-x')) return select(null)
    const del = e.target.closest('[data-del]')
    if (del) { del.closest('.pl-r').remove(); saveSoon(true).then(() => { insp.innerHTML = ''; renderInsp() }); return }
    if (e.target.closest('[data-add]')) {
      const c = P.plan.cards.find(x => x.id === 'cast')
      const n = (c.body.roster || []).length + 1
      post(url('card'), { card: 'cast', body: { roster: [...(c.body.roster || []), { name: `Hero ${n}`, role: '', look: '', weapon: '' }] } })
        .then(plan => { P.plan = plan; insp.innerHTML = ''; render() }).catch(err => toast(err.message))
    }
  })

  // ---------- the gate: the parts, the total, Test one first, and one confirm carrying the price
  function gate() {
    const p = P.plan
    if (!p) return
    if (p.gate?.locked) return build()
    const pr = price()
    let first = false
    const rows = pr.parts.filter(x => x.n).map(x => `<div class="pl-row"><span>${esc(x.what)}</span><i>${x.n} × ${x.each}</i><b>${x.credits}</b></div>`).join('')
    const d = window.SwarmUI.dialog({
      title: `Lock · ${pr.credits} credits`,
      className: 'pl-gate',
      body: `<div class="pl-rows">${rows}<div class="pl-row"><span>Coding runs</span><i></i><b>${pr.runs}</b></div><div class="pl-row"><span>Pictures</span><i></i><b>${pr.images}</b></div></div>
        <label class="pl-sw"><input type="checkbox" class="pl-first" ${pr.first.credits && pr.first.credits < pr.credits ? '' : 'disabled'}><span>Test one first</span></label>`,
      footer: '<button class="btn pri pl-go"></button>'
    })
    const go = d.footer.querySelector('.pl-go')
    const paint = () => { go.textContent = `Lock · ${first ? pr.first.credits : pr.credits} credits` }
    paint()
    d.body.querySelector('.pl-first').onchange = e => { first = e.target.checked; paint() }
    go.onclick = async () => {
      go.disabled = true
      try {
        take(await post(url('lock'), { credits: first ? pr.first.credits : pr.credits, testFirst: first }))
        d.close('done')
        toast('Locked')
      } catch (err) {
        go.disabled = false
        // the price moved: show the new one, nothing was locked
        if (err.status === 402) { d.close('stale'); await load(); gate() } else toast(err.message)
      }
    }
  }
  async function build() {
    try { take(await post(url('build'))) } catch (err) { toast(err.message) }
  }

  // ---------- the stage: pan, zoom, select (the project canvas's gestures)
  function applyCam() { world.style.transform = `translate(${P.cam.x}px, ${P.cam.y}px) scale(${P.cam.k})` }
  function frameAll(animate = true) {
    const sw_ = stage.clientWidth - (insp.hidden ? 0 : 272), sh = stage.clientHeight - 40
    const w = world.scrollWidth, h = world.scrollHeight
    if (!w || !h || sw_ <= 0) return
    const k = Math.min(1.25, Math.max(0.3, Math.min(sw_ / w, sh / h)))
    P.cam = { k, x: Math.max(0, (sw_ - w * k) / 2), y: Math.max(0, Math.min(40, (sh - h * k) / 2)) }
    world.classList.toggle('ease', animate)
    applyCam()
    setTimeout(() => world.classList.remove('ease'), 300)
  }
  let drag = null
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.pj-insp, .ab')) return
    drag = { x: e.clientX, y: e.clientY, cx: P.cam.x, cy: P.cam.y, moved: false }
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', e => {
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    if (drag.moved) { P.cam.x = drag.cx + dx; P.cam.y = drag.cy + dy; applyCam(); stage.classList.add('panning') }
  })
  stage.addEventListener('pointerup', () => { if (drag && !drag.moved && P.sel) select(null); drag = null; stage.classList.remove('panning') })
  stage.addEventListener('wheel', e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
      const k = Math.min(3, Math.max(0.2, P.cam.k * Math.exp(-e.deltaY * 0.01)))
      P.cam.x = px - (px - P.cam.x) * k / P.cam.k; P.cam.y = py - (py - P.cam.y) * k / P.cam.k; P.cam.k = k
    } else { P.cam.x -= e.deltaX; P.cam.y -= e.deltaY }
    applyCam()
  }, { passive: false })
  function select(key) {
    P.sel = key
    insp.innerHTML = ''
    render()
  }
  world.addEventListener('click', e => { const a = e.target.closest('.ab'); if (a) select(a.dataset.key) })
  world.addEventListener('keydown', e => { const a = e.target.closest('.ab'); if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(a.dataset.key) } })
  addEventListener('keydown', e => {
    if (!P.on || e.key !== 'Escape' || e.defaultPrevented || window.SwarmUI?.open?.()) return
    if (e.target.closest?.('input, textarea')) return
    if (P.sel) { e.preventDefault(); select(null) }
  }, true)

  // ---------- one toast spot
  let toastEl = null
  function toast(text) {
    toastEl?.remove()
    const t = toastEl = document.createElement('div')
    t.className = 'hm-toast'
    t.setAttribute('role', 'status')
    t.textContent = text
    root.append(t)
    setTimeout(() => t.remove(), 3000)
  }

  return {
    el: root,
    get id() { return P.id },
    get selected() { return !!P.sel },
    async show(id, { fresh = false } = {}) {
      if (id && id !== P.id) { P.id = id; P.plan = null; P.sel = null; P.framed = false }
      P.on = true
      root.hidden = false
      crumb.hidden = false
      await load()
      if (fresh) writeIn()
    },
    hide() { P.on = false; root.hidden = true; clearTimeout(P.saving) },
    // the plan made from the questions, from Projects' Make box
    async create(idea, answers) {
      const plan = await post('/api/plans', { idea, answers })
      return plan.id
    },
    select
  }
}
