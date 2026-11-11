// Shape it: the game walked one part at a time (engine/workshop.mjs, server/workshops.mjs).
// Each step shows at most four options as something to see or hear: a painted picture, the
// hero's sprite sheet moving, a level map, a music loop. Next writes the pick and moves on.
import { cursor, painterOf } from './icons.js'
const STEPS = [['design', 'Game'], ['story', 'Story'], ['world', 'World'], ['heroes', 'Hero'], ['enemies', 'Enemies'], ['levels', 'Levels'], ['sound', 'Sound']]
const HEAD = { design: 'How does it play?', story: 'What is the story?', world: 'Where is it set?', heroes: 'Who do you play?', enemies: 'Who stands in the way?', levels: 'The first stage', sound: 'How does it sound?' }
const wsEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const POSES = ['idle', 'run', 'jump', 'attack', 'hurt', 'win']

// `mount` puts the walk in the left chat as one card (all guiding lives there, RULES 4)
export function openWorkshop({ api, ico = () => '', spec, id, onBuilt, onClose, mount }) {
  const W = { ws: null, sel: null, multi: new Set(), busy: '', err: '', models: null, voice: '', timers: [], audio: null, own: '' }
  const el = document.createElement('div')
  el.className = mount ? 'ws-pop ws-inchat item' : 'ws-pop'
  el.setAttribute('role', mount ? 'group' : 'dialog')
  el.setAttribute('aria-label', 'Shape the game')
  if (mount) mount(el); else document.body.append(el)
  const call = (path, body) => api(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
  const off = mount ? null : window.SwarmUI?.layer(el, close, { canClose: () => !W.busy })
  const onKey = e => {
    if (W.busy || document.activeElement?.matches('input, textarea')) return
    if (e.key === 'ArrowRight') next()
    else if (e.key === 'ArrowLeft') back()
  }
  document.addEventListener('keydown', onKey)

  function close() {
    stopSound(); clearTimers(); clearInterval(W.poll)
    document.removeEventListener('keydown', onKey)
    off?.(); el.remove(); onClose?.()
  }
  const clearTimers = () => { W.timers.forEach(clearInterval); W.timers = [] }
  const stepId = () => W.ws?.step || 'design'
  const opts = () => W.ws?.options?.[stepId()] || []
  const picked = () => !!(W.own || (stepId() === 'enemies' ? W.multi.size : W.sel))

  async function start() {
    W.busy = 'Opening'
    render()
    try { W.ws = id ? await call(`/api/workshops/${id}`) : await call('/api/workshops', { spec }); W.busy = ''; await load(stepId()) } catch (err) { W.busy = ''; W.err = err.message; render() }
  }
  async function load(step, again = false) {
    W.sel = null; W.multi = new Set(); W.models = null; W.own = ''; W.err = ''
    if (!again && W.ws.options?.[step]?.length) { W.ws.step = step; render(); watch(); return }
    W.ws.step = step
    W.busy = 'Thinking'
    render()
    try { W.ws = await call(`/api/workshops/${W.ws.id}/options`, { step }) } catch (err) { W.err = err.message }
    W.busy = ''
    const picked = W.ws.picks?.[step]
    if (picked?.id) W.sel = picked.id
    if (picked?.ids) W.multi = new Set(picked.ids)
    render()
    watch()
  }
  // pictures land in the background: look again every 3 s while one is painting
  function watch() {
    clearInterval(W.poll)
    const painting = () => opts().some(o => o.state === 'painting' || o.sprite?.state === 'painting')
    if (!painting()) return
    W.poll = setInterval(async () => {
      try { const ws = await call(`/api/workshops/${W.ws.id}`); W.ws = { ...ws, step: W.ws.step }; render() } catch {}
      if (!painting()) clearInterval(W.poll)
    }, 3000)
  }

  async function next() {
    if (W.busy || !W.ws) return
    const step = stepId()
    const pick = step === 'enemies' ? { ids: [...W.multi], own: W.own } : W.own ? { own: W.own } : W.sel ? { id: W.sel } : null
    // nothing picked: the step is skipped and the spec keeps what it had
    const skip = !pick || (step === 'enemies' && !W.multi.size && !W.own)
    W.busy = 'Saving'
    render()
    try {
      if (!skip) W.ws = await call(`/api/workshops/${W.ws.id}/choose`, { step, pick })
      W.busy = ''
      const i = STEPS.findIndex(s => s[0] === step)
      if (i === STEPS.length - 1) return build()
      stopSound()
      await load(STEPS[i + 1][0])
    } catch (err) { W.busy = ''; W.err = err.message; render() }
  }
  function back() {
    if (W.busy || !W.ws) return
    const i = STEPS.findIndex(s => s[0] === stepId())
    if (i > 0) { stopSound(); load(STEPS[i - 1][0]) }
  }
  async function build() {
    W.busy = 'Starting the build'
    render()
    try { const ws = await call(`/api/workshops/${W.ws.id}/build`, {}); close(); onBuilt?.(ws.run, ws.spec) } catch (err) { W.busy = ''; W.err = err.message; render() }
  }

  // ---------- slices
  function picture(o) {
    // a crew member is painting it: their cursor works over the slot until the picture lands
    if (o.state === 'painting' && !o.src) return `<div class="ws-pic ws-wait"><span class="as-bot">${cursor(painterOf(o.id))}</span></div>`
    if (o.state === 'failed' && !o.src) return '<div class="ws-pic ws-fail" aria-label="The picture failed">⚠</div>'
    return o.src ? `<div class="ws-pic"><img src="${wsEsc(o.src)}" alt=""></div>` : ''
  }
  function sprite(o) {
    if (o.sprite?.src) return `<div class="ws-sprite" data-sheet="${wsEsc(o.sprite.src)}" role="img" aria-label="${wsEsc(o.name)} moving"></div>`
    if (o.sprite?.state === 'painting') return `<div class="ws-sprite ws-wait"><span class="as-bot">${cursor(painterOf(`${o.id}-sheet`))}</span></div>`
    return ''
  }
  function slice(o) {
    const step = stepId(), on = step === 'enemies' ? W.multi.has(o.id) : W.sel === o.id
    let vis = ''
    if (step === 'design') vis = `<div class="ws-card-text"><b>${wsEsc(o.twist || o.loop)}</b><span>${wsEsc(o.camera || '')}</span></div>`
    else if (step === 'levels') vis = `<canvas class="ws-map" width="320" height="160" data-map="${wsEsc(JSON.stringify(o.map || []))}" aria-label="Level map"></canvas>`
    else if (step === 'sound') vis = `<div class="ws-wave" data-sound="${wsEsc(o.id)}"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`
    else if (step === 'heroes') vis = o.sprite?.src && on ? sprite(o) : picture(o)
    else vis = picture(o)
    const tag = step === 'enemies' ? `<em>${wsEsc(o.kind)}</em>` : ''
    return `<button class="ws-slice${on ? ' on' : ''}${step === 'heroes' || step === 'enemies' ? ' tall' : ''}" data-id="${wsEsc(o.id)}" aria-pressed="${on}">${vis}<span class="ws-name">${wsEsc(o.name)}${tag}</span></button>`
  }

  // ---------- the inspector: the selected option's details and its few actions
  function inspector() {
    const o = opts().find(x => x.id === W.sel)
    const step = stepId()
    if (!o) return ''
    const row = (k, v) => (v ? `<dt>${k}</dt><dd>${wsEsc(v)}</dd>` : '')
    let dl = ''
    if (step === 'design') dl = row('Loop', o.loop) + row('Goal', o.goal) + row('Twist', o.twist) + row('Camera', o.camera)
    if (step === 'story') dl = row('Story', o.logline) + row('Hero', o.hero) + (o.acts || []).map((a, i) => row(`Act ${i + 1}`, a)).join('')
    if (step === 'world') dl = row('Place', o.setting) + row('Palette', o.palette)
    if (step === 'heroes') dl = row('Role', o.role) + row('Look', o.look) + row('Personality', o.personality)
    if (step === 'enemies') dl = row('Kind', o.kind) + row('Moves', o.behaviour) + row('Look', o.look)
    if (step === 'levels') dl = row('Idea', o.idea)
    if (step === 'sound') dl = row('Feel', o.feel) + row('Tempo', `${o.bpm} bpm, ${o.scale}`) + row('Line', o.line ? `“${o.line}”` : '')
    const acts = []
    if (['story', 'world', 'heroes', 'enemies'].includes(step) && o.state !== 'painting') acts.push(`<button class="btn ghost" data-act="paint">Draw again</button>`)
    if (step === 'heroes' && o.src) acts.push(`<button class="btn${o.sprite?.src ? ' ghost' : ' pri'}" data-act="sprite" ${o.sprite?.state === 'painting' ? 'disabled' : ''}>${o.sprite?.src ? 'Sprites again' : 'Make sprites'}</button>`)
    if (step === 'heroes') acts.push(`<button class="btn ghost" data-act="models">3D models</button>`)
    if (step === 'sound') {
      acts.push(`<button class="btn pri" data-act="play">${W.audio?.id === o.id ? 'Stop' : 'Play'}</button>`)
      const vs = W.ws.voices || []
      if (o.line && vs.length) acts.push(`<select class="ws-voice" aria-label="Voice">${vs.map(v => `<option value="${wsEsc(v.key)}" ${W.voice === v.key ? 'selected' : ''}>${wsEsc(v.about.split(':')[0])}</option>`).join('')}</select><button class="btn ghost" data-act="say">Hear the line</button>`)
    }
    const models = W.models ? `<div class="ws-models">${W.models === 'loading' ? '<i class="spin"></i>' : W.models.length ? W.models.map((m, i) => `<button class="ws-model" data-model="${i}"><img src="${wsEsc(m.preview)}" alt=""><span>${wsEsc(m.name)}</span></button>`).join('') : '<span>None found</span>'}</div>` : ''
    const poses = step === 'heroes' && o.sprite?.src ? `<div class="ws-poses">${POSES.map(p => `<span>${p}</span>`).join('')}</div>` : ''
    return `<aside class="ws-insp" aria-label="${wsEsc(o.name)}"><h4>${wsEsc(o.name)}</h4><dl>${dl}</dl>${poses}<div class="ws-acts">${acts.join('')}</div>${models}</aside>`
  }

  function render() {
    stopVisuals()
    const step = stepId(), i = STEPS.findIndex(s => s[0] === step), ws = W.ws
    const title = ws?.spec?.title || spec?.title || 'Game'
    const last = i === STEPS.length - 1
    const ring = `<button class="ws-ring" data-ring aria-label="Step ${i + 1} of ${STEPS.length}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="t"/><circle cx="18" cy="18" r="15" class="f" style="stroke-dasharray:${((i + 1) / STEPS.length) * 94.2} 94.2"/></svg><b>${i + 1}/${STEPS.length}</b></button>`
    const crumbs = `<nav class="ws-crumb" aria-label="Breadcrumb"><span>${wsEsc(title)}</span><span>›</span><b>${wsEsc(STEPS[i][1])}</b></nav>`
    const top = `<header class="ws-top">${crumbs}<div class="ws-ctl">${ring}<button class="ws-back" data-back aria-label="Back" ${i === 0 ? 'disabled' : ''}>${ico('arrow-left') || '←'}</button>${last ? '' : `<button class="btn ghost" data-now ${W.busy ? 'disabled' : ''}>Build now</button>`}<button class="btn pri ws-next" data-next ${W.busy ? 'disabled' : ''}>${last ? 'Build the game' : picked() ? 'Next' : 'Skip'}</button><button class="ws-x" data-close aria-label="Close">${ico('x') || '×'}</button></div></header>`
    const list = W.ringOpen ? `<div class="ws-steps">${STEPS.map(([k, n], j) => `<button data-jump="${k}" class="${(ws?.done || []).includes(k) ? 'done' : ''}${k === step ? ' on' : ''}"><i></i>${wsEsc(n)}</button>`).join('')}</div>` : ''
    let stage
    if (W.busy && !opts().length) stage = `<div class="ws-stage busy"><i class="spin"></i></div>`
    else stage = `<div class="ws-stage"><h3>${wsEsc(HEAD[step])}</h3><div class="ws-grid n${opts().length}">${opts().map(slice).join('')}</div><div class="ws-own"><input class="ws-input" data-own placeholder="…or in your own words" value="${wsEsc(W.own)}"><button class="btn ghost" data-again ${W.busy ? 'disabled' : ''}>New options</button></div>${W.err ? `<p class="ws-err">${wsEsc(W.err)}</p>` : ''}</div>`
    el.innerHTML = `${top}${list}<div class="ws-body">${stage}${inspector()}</div>`
    bind()
    startVisuals()
  }

  function bind() {
    el.querySelector('[data-close]').onclick = () => close()
    el.querySelector('[data-next]').onclick = () => next()
    const now = el.querySelector('[data-now]')
    if (now) now.onclick = () => { if (!W.busy) { stopSound(); build() } }
    el.querySelector('[data-back]').onclick = () => back()
    el.querySelector('[data-ring]').onclick = () => { W.ringOpen = !W.ringOpen; render() }
    for (const b of el.querySelectorAll('[data-jump]')) b.onclick = () => { W.ringOpen = false; stopSound(); load(b.dataset.jump) }
    el.querySelector('[data-again]')?.addEventListener('click', () => load(stepId(), true))
    const own = el.querySelector('[data-own]')
    if (own) own.oninput = () => {
      W.own = own.value; W.err = ''
      const nx = el.querySelector('[data-next]')
      if (nx && nx.textContent !== 'Build the game') nx.textContent = picked() ? 'Next' : 'Skip'
    }
    if (own) own.onkeydown = e => { if (e.key === 'Enter') next() }
    for (const b of el.querySelectorAll('.ws-slice')) b.onclick = () => {
      const id = b.dataset.id
      if (stepId() === 'enemies') { W.multi.has(id) ? W.multi.delete(id) : W.multi.add(id); W.sel = id }
      else W.sel = W.sel === id ? null : id
      W.models = null; W.err = ''
      if (stepId() === 'sound' && W.sel) playSound(opts().find(o => o.id === W.sel))
      render()
    }
    for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => action(b.dataset.act)
    const vsel = el.querySelector('.ws-voice')
    if (vsel) vsel.onchange = () => { W.voice = vsel.value }
    for (const b of el.querySelectorAll('[data-model]')) b.onclick = () => pickModel(W.models[Number(b.dataset.model)])
  }

  async function action(a) {
    const o = opts().find(x => x.id === W.sel)
    if (!o) return
    try {
      if (a === 'paint') { W.ws = await call(`/api/workshops/${W.ws.id}/paint`, { step: stepId(), id: o.id }); watch() }
      if (a === 'sprite') { W.ws = await call(`/api/workshops/${W.ws.id}/sprite`, { id: o.id }); watch() }
      if (a === 'play') { W.audio?.id === o.id ? stopSound() : playSound(o) }
      if (a === 'say') {
        const ws = await call(`/api/workshops/${W.ws.id}/voice`, { text: o.line, voice: W.voice || W.ws.voices?.[0]?.key })
        new Audio(ws.voiceSrc).play().catch(() => {})
      }
      if (a === 'models') {
        W.models = 'loading'
        render()
        const r = await call('/api/cast', { role: { look: o.look, name: o.role || o.name }, violent: true })
        W.models = (r.models || []).filter(m => m.preview).slice(0, 4)
      }
    } catch (err) { W.err = err.message; if (W.models === 'loading') W.models = null }
    render()
  }
  async function pickModel(m) {
    if (!m) return
    W.busy = 'Saving'
    render()
    try {
      const cast = { ...m, role: 'hero', label: W.ws.options.heroes.find(x => x.id === W.sel)?.name || m.name }
      delete cast.key; delete cast.preview
      W.ws = await call(`/api/workshops/${W.ws.id}/choose`, { step: 'heroes', pick: { cast } })
      W.busy = ''
      await load('enemies')
    } catch (err) { W.busy = ''; W.err = err.message; render() }
  }

  // ---------- moving pictures: sprite sheets step through their six poses; maps draw
  function startVisuals() {
    for (const s of el.querySelectorAll('.ws-sprite[data-sheet]')) {
      s.style.backgroundImage = `url("${s.dataset.sheet}")`
      let f = 0
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      const show = () => { s.style.backgroundPosition = `${(f % 3) * 50}% ${Math.floor(f / 3) * 100}%` }
      show()
      if (!reduce) W.timers.push(setInterval(() => { f = (f + 1) % 6; show() }, 450))
    }
    for (const c of el.querySelectorAll('canvas.ws-map')) drawMap(c, JSON.parse(c.dataset.map || '[]'))
    if (W.audio) el.querySelector(`[data-sound="${W.audio.id}"]`)?.classList.add('on')
  }
  const stopVisuals = () => clearTimers()
  function drawMap(c, rows) {
    const g = c.getContext('2d'), css = getComputedStyle(el)
    const fg = css.getPropertyValue('--text').trim() || '#f4f4f5', line = css.getPropertyValue('--frame-hi').trim() || '#a1a1a6', acc = css.getPropertyValue('--accent').trim() || fg
    const W0 = 32, H0 = 16, s = Math.floor(Math.min(c.width / W0, c.height / H0))
    g.clearRect(0, 0, c.width, c.height)
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const X = x * s, Y = y * s
      if (ch === '#') { g.fillStyle = line; g.fillRect(X, Y, s, s) }
      else if (ch === '=') { g.fillStyle = line; g.fillRect(X, Y, s, Math.max(2, s / 3)) }
      else if (ch === '^') { g.fillStyle = fg; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X, Y + s); g.lineTo(X + s / 2, Y + 2); g.lineTo(X + s, Y + s); g.fill(); g.globalAlpha = 1 }
      else if ('SXBEC'.includes(ch) || ch === 'D') {
        g.fillStyle = ch === 'S' || ch === 'X' ? acc : fg
        g.globalAlpha = ch === 'C' ? 0.6 : 1
        g.beginPath()
        const rr = ch === 'B' ? s * 0.9 : ch === 'C' ? s * 0.22 : s * 0.38
        g.arc(X + s / 2, Y + s / 2, rr, 0, Math.PI * 2)
        if (ch === 'D' || ch === 'X') g.fillRect(X + s * 0.15, Y, s * 0.7, s); else g.fill()
        g.globalAlpha = 1
      }
    }))
  }

  // ---------- the music loop: a small synth from the option's tempo, scale, lead and drums
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 3, 5, 7, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] }
  function playSound(o) {
    stopSound()
    if (!o) return
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const out = ctx.createGain(); out.gain.value = 0.18; out.connect(ctx.destination)
    const scale = SCALES[o.scale] || SCALES.minor, beat = 60 / (o.bpm || 110), root = 220
    let seed = [...o.id].reduce((a, c) => a + c.charCodeAt(0), 0)
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    const melody = Array.from({ length: 16 }, () => (rnd() < 0.2 ? null : scale[Math.floor(rnd() * scale.length)] + (rnd() < 0.25 ? 12 : 0)))
    const bass = [0, 0, scale[3] ?? 5, scale[4] ?? 7]
    const note = (t, semi, len, type, vol) => {
      const osc = ctx.createOscillator(), g = ctx.createGain()
      osc.type = type; osc.frequency.value = root * 2 ** (semi / 12)
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len)
      osc.connect(g).connect(out); osc.start(t); osc.stop(t + len + 0.02)
    }
    const noise = (t, len, vol, hp) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
      src.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol
      src.connect(f).connect(g).connect(out); src.start(t)
    }
    const kick = t => { const osc = ctx.createOscillator(), g = ctx.createGain(); osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); osc.connect(g).connect(out); osc.start(t); osc.stop(t + 0.22) }
    let bar = 0
    const schedule = () => {
      const t0 = ctx.currentTime + 0.05
      for (let i = 0; i < 16; i++) {
        const t = t0 + i * beat / 2
        if (melody[i] != null) note(t, melody[i] + 12, beat * 0.45, o.wave || 'triangle', 0.35)
        if (i % 4 === 0) note(t, bass[(i / 4 + bar) % 4] - 12, beat * 1.8, 'sine', 0.5)
        if (o.drums !== 'none') {
          if (i % 4 === 0 || (o.drums === 'breakbeat' && i % 8 === 6)) kick(t)
          if (o.drums !== 'soft' && i % 4 === 2) noise(t, 0.12, 0.35, 1500)
          if (o.drums === 'driving' || o.drums === 'breakbeat' || i % 2 === 0) noise(t, 0.03, 0.12, 7000)
        }
      }
      bar++
    }
    schedule()
    const timer = setInterval(schedule, beat * 8 * 1000)
    W.audio = { id: o.id, ctx, timer }
    el.querySelector(`[data-sound="${o.id}"]`)?.classList.add('on')
  }
  function stopSound() {
    if (!W.audio) return
    clearInterval(W.audio.timer)
    W.audio.ctx.close().catch(() => {})
    W.audio = null
  }

  start()
  return { close }
}
