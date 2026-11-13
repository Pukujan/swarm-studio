// @ts-check
// Hermia's cursor, always there (docs/specs/41-pet-cursor.md): one small cursor on every Studio screen that
// trails the person's pointer, settles on the card they last touched, dozes when they are idle and says a
// short line when something happens. Her lines come from the rules below, never from a model.
//
// Two halves. The top is pure (no document, no window): the lines table and the brain that picks a line,
// spaces bubbles out and never repeats itself or the chat; tests/pet.test.mjs reads it directly. The
// bottom, makePet, is the cursor on the page. A screen tells her what happened with one call:
//
//   pet.on('step', { step })            a Studio step reached (brand, references, assets, plan, proposal)
//   pet.on('file', { name, type, count })  a file dropped or picked
//   pet.on('link', { url })             a link pasted
//   pet.on('pick', { name })            an option picked (a palette, a type pair, a pack)
//   pet.on('skip', { step })            a step skipped
//   pet.on('brief', { idea })           the brief's own words
//   pet.on('back', { ms })              the person is back after a doze
//   pet.on('built', { name, pages })    a build finished
//   pet.on('loading') / pet.on('ready') a screen is starting / has drawn
//
// Most of these she notices herself (the address, drops, pastes, clicks on a card, the canvas's events), so
// the screens need no code for them. Joined into the studio's one script (server/page.mjs): every top-level
// name here starts with pet or PET.

// ---------- the pure half

/** @typedef {{ step?: string, name?: string, type?: string, count?: number, url?: string, idea?: string, ms?: number, pages?: number }} PetData */

// a name cut to fit a line of at most 40 characters
const petFit = (s, n) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…` }
const petHost = url => { try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '') } catch { return '' } }

// words in a brief that say nothing about what it is
const PET_PLAIN = new Set('a an the and or for with from about into onto that this these those our your their my its of to in on at by is are be am was it i we you they me us them site website app application page pages game video film deck brand make build want need like some just very really simple small little new kind sort thing things people folks community place where who what which help lets let made making show shows'.split(' '))

/** @type {Record<string, (d: PetData) => string[]>} */
export const PET_LINES = {
  step: d => ({
    brand: ['ooh, the fun part', 'colours! my favourite bit', 'brand time, love it'],
    references: ['show me what you like', 'moodboard o\'clock', 'references, nice'],
    assets: ['the good stuff goes here', 'logos, photos, all of it', 'asset shelf, ready'],
    plan: ['the planning bit, my bit', 'plans! I live here', 'mapping it out'],
    proposal: ['nearly there', 'last look before we go', 'the final stretch']
  }[d.step || ''] || ['onwards', 'next stop', 'ok, this one']),
  file: d => {
    const name = String(d.name || ''), type = String(d.type || ''), more = (d.count || 1) > 1
    if (more) return [`${d.count} files! reading them`, 'a whole stack, nice', 'ooh, a pile of files']
    if (/logo/i.test(name)) return ['nice logo', 'ooh, a logo', 'that logo though']
    if (/pdf$/i.test(type) || /\.pdf$/i.test(name)) return ['a PDF! reading it', 'ooh, a PDF', 'PDF in, reading']
    if (/^image\//.test(type) || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name)) return ['nice picture', 'ooh, pretty', 'good one, saved']
    if (/^video\//.test(type) || /\.(mp4|mov|webm)$/i.test(name)) return ['a video! fancy', 'ooh, moving pictures', 'video in, nice']
    if (/^audio\//.test(type) || /\.(mp3|wav|ogg|m4a)$/i.test(name)) return ['ooh, sounds', 'audio! nice', 'a tune, love it']
    if (/font|\.(ttf|otf|woff2?)$/i.test(`${type} ${name}`)) return ['a font! fancy', 'new letters, nice', 'ooh, type']
    return [`${petFit(name, 24)}, got it`, 'got it, thanks', 'filed that away']
  },
  link: d => {
    const host = petHost(d.url || '')
    if (/pinterest\./.test(host)) return ['pinterest, my favourite rabbit hole', 'ooh, a pin', 'pinterest! good taste']
    if (/dribbble\.|behance\./.test(host)) return ['ooh, a shot', 'portfolio browsing, nice', 'good eye']
    if (/youtube\.|youtu\.be|vimeo\./.test(host)) return ['a video link, nice', 'ooh, watching later', 'saved the video']
    if (/figma\./.test(host)) return ['a figma link! hi', 'ooh, a figma file', 'figma, my people']
    if (/instagram\.|tiktok\./.test(host)) return ['ooh, socials', 'scrolling with you', 'nice find']
    if (/github\./.test(host)) return ['code! I see you', 'ooh, a repo', 'github, nice']
    return host ? [`${petFit(host, 24)}, noted`, 'ooh, a link', 'saved that link'] : ['ooh, a link', 'saved that link']
  },
  pick: d => {
    const n = petFit(d.name, 26)
    return n ? [`${n}, good call`, `ooh, ${n}`, `${n}. yes.`] : ['good call', 'ooh, nice pick']
  },
  skip: () => ['fine, we\'ll wing it', 'skipping, no worries', 'we can come back to it'],
  brief: d => {
    const words = String(d.idea || '').toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []
    // the first word that says what it is ("a site for rats and their owners": rats)
    const w = words.find(x => !PET_PLAIN.has(x))
    const n = w && petFit(w, 18)
    return n ? [`${n}!! love that`, `ooh, ${n}`, `${n}, yes please`] : ['love this idea', 'ooh, I like it']
  },
  back: d => (d.ms || 0) > 10 * 60000 ? ['oh hi, you\'re back', 'welcome back', 'missed you a bit'] : ['oh hi, I kept your spot', 'hey, still here', 'back! hi'],
  built: d => {
    const p = d.pages || 0
    return p ? [`all ${p} page${p === 1 ? '' : 's'} up`, 'built! go look', 'done, and it\'s cute'] : ['built! go look', 'all done', 'done, and it\'s cute']
  }
}
// what wins when several things happen at once: the rarer and bigger moment
export const PET_ORDER = ['built', 'file', 'link', 'pick', 'skip', 'brief', 'step', 'back']
export const PET_MAX = 40
// at most one bubble about every 20 seconds
export const PET_GAP = 20000

const petNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * The brain: which line, if any, for a burst of events. Nothing here knows about the page.
 * @param {{ now?: () => number, random?: () => number, gap?: number, chat?: () => Iterable<string> }} [o]
 */
export function petBrain({ now = () => Date.now(), random = Math.random, gap = PET_GAP, chat = () => [] } = {}) {
  let at = -Infinity
  let last = ''
  /** lines a kind said last, so the same line never comes twice in a row */
  const lastOf = new Map()
  return {
    /** the lines this event could say: short, never a question, never what the chat or she just said */
    lines(kind, d = {}) {
      const make = PET_LINES[kind]
      if (!make) return []
      const heard = new Set([...chat()].map(petNorm))
      return make(d).filter(l => l && l.length <= PET_MAX && !l.includes('?') && l !== last && l !== lastOf.get(kind) && !heard.has(petNorm(l)))
    },
    /** one line for a burst of events, or null: too soon after the last bubble, or nothing new to say */
    take(events) {
      const t = now()
      if (t - at < gap) return null
      const ranked = [...events].filter(e => PET_LINES[e.kind]).sort((a, b) => PET_ORDER.indexOf(a.kind) - PET_ORDER.indexOf(b.kind))
      for (const e of ranked) {
        const ls = this.lines(e.kind, e.data)
        if (!ls.length) continue
        const line = ls[Math.floor(random() * ls.length) % ls.length]
        at = t
        last = line
        lastOf.set(e.kind, line)
        return line
      }
      return null
    },
    get at() { return at }
  }
}

// ---------- the cursor on the page

const PET_ROOMS = { home: 'home', overview: 'project', plan: 'plan', brand: 'brand', studio: 'scaffold' }
const PET_VIEW = { home: 'homeView', project: 'projectView', plan: 'planView', brand: 'brandView', scaffold: 'scaffoldView' }
const PET_DOZE = 30000 // idle this long, she dozes
const PET_BATCH = 900 // events this close together make one reaction
const PET_SAY = 3600 // a bubble stays this long, then fades
const PET_PHONE = 760 // the studio's own phone width

/**
 * Hermia's cursor on the page. sw is window.swarm, C the studio controller (web/studio.js).
 * @param {{ sw: any, C: any, doc?: Document }} o
 */
export function makePet({ sw, C, doc = document }) {
  const win = doc.defaultView || window
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches
  const phone = () => win.innerWidth <= PET_PHONE
  const chatSaid = new Set()
  const brain = petBrain({ chat: () => chatSaid })
  const el = doc.createElement('div')
  el.className = 'pet'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = '<span class="pet-body"><svg class="pet-nib" viewBox="0 0 10 10"><path d="M.6.6L9.2 4 5 5 4 9.2z"/></svg>'
    + `<span class="pet-av">${win.SwarmCrew?.avatar('Hermia', 22) || ''}</span><span class="pet-z">z</span><span class="pet-dots"><i></i><i></i><i></i></span></span><span class="pet-bub"></span>`
  doc.body.append(el)
  const bub = /** @type {HTMLElement} */ (el.querySelector('.pet-bub'))

  const P = {
    x: win.innerWidth - 120, y: win.innerHeight - 160, tx: 0, ty: 0,
    px: -1, py: -1, movedAt: Date.now(), active: 0,
    card: '', raf: 0, settle: 0, doze: 0, dozing: false, dozedAt: 0,
    queue: /** @type {{ kind: string, data: PetData }[]} */ ([]), batch: 0, batchFirst: 0, sayTimer: 0,
    room: '', loading: false, loadTimer: 0, loadSince: 0, building: false, buildAt: 0, briefed: '', step: ''
  }
  P.tx = P.x; P.ty = P.y

  // ---------- where she goes: behind the pointer, onto the last-touched card, clear of the chat and the inspector
  const avoid = () => [...doc.querySelectorAll('body.cosmos-chat .side, .pj-insp:not([hidden]), .ui-overlay, .ui-popover')]
    .map(n => n.getBoundingClientRect()).filter(r => r.width && r.height)
  function clear(x, y) {
    const W = win.innerWidth, H = win.innerHeight
    x = Math.max(8, Math.min(W - 40, x)); y = Math.max(56, Math.min(H - 40, y))
    for (const r of avoid()) {
      if (x < r.left - 30 || x > r.right + 4 || y < r.top - 30 || y > r.bottom + 4) continue
      // out by the nearer side
      const left = r.left - 34, right = r.right + 8
      x = (x - left < right - x && left > 8) || right > W - 40 ? left : right
    }
    return [x, y]
  }
  function cardEl() {
    if (!P.card) return null
    const n = doc.querySelector(`.ab[data-key="${CSS.escape(P.card)}"]`)
    return n && n.getClientRects().length ? n : null
  }
  function aim() {
    if (phone()) {
      // a phone: the edge of the board, above the chat; touches are not followed
      const side = doc.querySelector('body.cosmos-chat .side')
      const top = side ? side.getBoundingClientRect().top : win.innerHeight
      ;[P.tx, P.ty] = [Math.max(8, win.innerWidth - 44), Math.max(70, Math.min(win.innerHeight - 110, top - 48))]
      el.classList.add('flip')
      return
    }
    const c = Date.now() - P.movedAt > 1600 && cardEl()
    if (c) { const r = c.getBoundingClientRect(); [P.tx, P.ty] = clear(r.right + 6, r.top - 12) }
    else if (P.px >= 0) [P.tx, P.ty] = clear(P.px + 26, P.py + 30)
    else [P.tx, P.ty] = clear(P.tx, P.ty)
    // near the right edge the bubble opens to her left
    el.classList.toggle('flip', P.tx > win.innerWidth - 240)
  }
  const draw = () => { el.style.transform = `translate(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px)` }
  // the loop runs only while she is on her way, and never in a hidden tab
  let then = 0
  function step(t) {
    P.raf = 0
    const dt = then ? Math.min(64, t - then) : 16.7
    then = t
    const k = 1 - Math.pow(1 - 0.075, dt / 16.7)
    P.x += (P.tx - P.x) * k
    P.y += (P.ty - P.y) * k
    const far = Math.abs(P.tx - P.x) + Math.abs(P.ty - P.y) > 0.6
    if (!far) { P.x = P.tx; P.y = P.ty }
    draw()
    if (far && !doc.hidden) P.raf = win.requestAnimationFrame(step)
    else then = 0
  }
  function go() {
    aim()
    if (reduced() || phone()) { P.x = P.tx; P.y = P.ty; draw(); return }
    if (!P.raf && !doc.hidden) P.raf = win.requestAnimationFrame(step)
  }
  // once the pointer rests, she walks to the card (and follows it while the board pans)
  function rest() {
    clearTimeout(P.settle)
    P.settle = win.setTimeout(() => { if (cardEl()) go(); if (!P.dozing && cardEl()) rest() }, 1700)
  }

  // ---------- awake, dozing, loading, away
  function wake(quiet = false) {
    const t = Date.now()
    if (P.dozing) {
      P.dozing = false
      el.classList.remove('doze')
      if (!quiet) note('back', { ms: t - P.dozedAt })
    } else if (t - P.active < 1000) return
    P.active = t
    clearTimeout(P.doze)
    P.doze = win.setTimeout(() => { P.dozing = true; P.dozedAt = Date.now(); el.classList.add('doze') }, PET_DOZE)
  }
  function loading(on) {
    P.loading = on
    el.classList.toggle('loading', on)
    clearTimeout(P.loadTimer)
    if (on) { P.loadSince = Date.now(); P.loadTimer = win.setTimeout(watchLoad, 250) }
  }
  // a screen is ready once its view is shown and holds no placeholder (`.wait-in`, `aria-busy`); a screen
  // may also say so itself with on('ready'). At most 12 seconds of dots either way.
  function viewEl() {
    const v = PET_VIEW[PET_ROOMS[P.room]]
    return v && C?.[v]?.el
  }
  function watchLoad() {
    if (!P.loading) return
    const v = viewEl()
    const shown = !v || (!v.hidden && v.childElementCount > 0)
    const busy = v && v.querySelector('.wait-in, [aria-busy="true"]')
    if ((shown && !busy) || Date.now() - P.loadSince > 12000) return ready()
    P.loadTimer = win.setTimeout(watchLoad, 250)
  }
  function ready() {
    if (!P.loading) return
    loading(false)
    // the screen has its final shape now (the chat sheet open or not): her spot again
    go()
    // a Studio project's brief: its own words, once per project
    if (P.room === 'studio') {
      const idea = doc.querySelector('.sc-idea span')?.textContent || ''
      const pid = C?.nav?.view?.project || ''
      if (idea && pid !== P.briefed) { P.briefed = pid; note('brief', { idea }) }
    }
  }
  // the crew works: she hands over to their cursors until the build is done (the rooms, the deck among
  // them, keep her at rest: their docked crew is hidden in the Studio)
  function away() { el.classList.toggle('away', P.building) }

  // ---------- what she says: a burst of events makes one reaction, at most one bubble every ~20 s
  function note(kind, data = {}) {
    P.queue.push({ kind, data })
    const t = Date.now()
    if (!P.batch) P.batchFirst = t
    clearTimeout(P.batch)
    // the burst ends once quiet for a moment, or 2.5 s after it began
    P.batch = win.setTimeout(flush, t - P.batchFirst > 2500 ? 0 : PET_BATCH)
  }
  function flush() {
    P.batch = 0
    const evs = P.queue.splice(0)
    if (P.building || el.classList.contains('away')) return
    const line = brain.take(evs)
    if (line) say(line)
  }
  function say(line) {
    bub.textContent = line
    el.classList.add('talking')
    clearTimeout(P.sayTimer)
    P.sayTimer = win.setTimeout(() => el.classList.remove('talking'), PET_SAY)
    win.SwarmChatter?.babble?.('Hermia', line)
  }

  // ---------- what she notices without being told
  const norm = s => String(s || '').trim()
  // the chat's lines, so she never says one of them
  function hearChat(box) {
    if (!box) return
    const take = n => { const t = norm(n.querySelector?.('.txt')?.textContent || n.textContent); if (t) chatSaid.add(t) }
    box.querySelectorAll('.item').forEach(take)
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => n.nodeType === 1 && take(n)) }).observe(box, { childList: true })
  }
  hearChat(doc.getElementById('feed'))

  doc.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return
    P.px = e.clientX; P.py = e.clientY; P.movedAt = Date.now()
    wake()
    go()
    rest()
  }, { passive: true, capture: true })
  doc.addEventListener('pointerdown', e => {
    const t = /** @type {Element} */ (e.target)
    const card = t?.closest?.('.ab[data-key]')
    if (card) P.card = card.getAttribute('data-key') || ''
    wake()
  }, { passive: true, capture: true })
  doc.addEventListener('keydown', () => wake(true), { capture: true })
  // an option picked: the card's own name (a palette, a type pair, a pack on the brand sheet)
  doc.addEventListener('click', e => {
    const t = /** @type {Element} */ (e.target)
    const card = t?.closest?.('.ab[data-key]')
    if (!card) return
    P.card = card.getAttribute('data-key') || ''
    if (/^(palette|type|pack):/.test(P.card) && !card.classList.contains('on')) note('pick', { name: card.getAttribute('aria-label') || '' })
  }, { capture: true })
  // files dropped anywhere, or picked from a file input
  const files = list => {
    const fs = [...(list || [])]
    if (fs.length) note('file', { name: fs[0].name, type: fs[0].type, count: fs.length })
  }
  doc.addEventListener('drop', e => {
    if (e.dataTransfer?.files?.length) return files(e.dataTransfer.files)
    const url = e.dataTransfer?.getData('text/uri-list') || ''
    if (/^https?:\/\//.test(url)) note('link', { url })
  }, { capture: true })
  doc.addEventListener('change', e => {
    const t = /** @type {HTMLInputElement} */ (e.target)
    if (t?.type === 'file') files(t.files)
  }, { capture: true })
  doc.addEventListener('paste', e => {
    const text = e.clipboardData?.getData('text') || ''
    const url = text.trim().match(/^(https?:\/\/|www\.)\S+$/i)?.[0]
    if (url) note('link', { url })
  }, { capture: true })
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) go() })
  win.addEventListener('resize', () => go())
  win.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => go())

  // the address: a new screen loads; a Studio step reached (or skipped)
  function onView(v) {
    if (!v) return
    const room = v.room
    if (room !== P.room) {
      P.room = room
      P.card = ''
      away()
      if (PET_ROOMS[room]) loading(true)
      if (room === 'brand') note('step', { step: 'brand' })
      if (room === 'plan') note('step', { step: 'plan' })
    }
    const s = room === 'studio' ? v.step : null
    if (s && s !== P.step) {
      const skipped = doc.querySelector(`[data-sec="${CSS.escape(s)}"] .sc-dot.skipped`)
      note(skipped ? 'skip' : 'step', { step: s })
    }
    P.step = s || ''
    go()
  }
  C?.nav?.subscribe?.(onView)
  // the canvas's events: a build starts (she hands over) and ends (she says so)
  sw?.on?.(e => {
    if (e.type === 'run:start') { P.building = true; P.buildAt = Date.now(); away() }
    if (e.type === 'run:done' || e.type === 'run:stopped' || e.type === 'reset') {
      const was = P.building && Date.now() - P.buildAt > 5000
      P.building = false
      away()
      if (was && e.type === 'run:done') note('built', { pages: e.pages })
    }
  })

  onView(C?.nav?.view)
  draw()
  wake(true)
  go()

  const pet = {
    el,
    /**
     * Tell her what happened.
     * @param {string} kind
     * @param {PetData} [data]
     */
    on(kind, data = {}) {
      if (kind === 'loading') return loading(true)
      if (kind === 'ready') return ready()
      wake(true)
      note(kind, data)
    },
    get state() { return { dozing: P.dozing, loading: P.loading, away: el.classList.contains('away'), room: P.room } }
  }
  win.swarmPet = pet
  return pet
}

// She starts herself beside the studio controller (web/studio.js, joined right after this file), on the same
// tick, so the Studio's own files carry no code for her. Never on the Swarm Wall.
if (typeof document !== 'undefined' && window.swarm && !window.swarm.wall) {
  const petStart = () => { const C = window.swarmCosmos; if (C && !C.pet) C.pet = makePet({ sw: window.swarm, C }) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', petStart)
  else setTimeout(petStart)
}
