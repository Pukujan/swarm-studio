// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): what web/studio.js, web/home.js and web/project.js may read and call (window.swarm).
import { layerDrag } from '../layerlink.js'
import { clean } from '../clean.js'
import { S, Q, WALL, BASE, BOOT, store, api, cosmosHooks, cam, els } from './core.js'
import { view, setView, openGame } from './rooms.js'
import { toggleModels, toggleTheme, showTab } from './settings.js'
import { viewing, files, openRun, loadFiles, stopReplay } from './replay.js'
import { holds, shownRun } from './film.js'
import { esc, sectionProps, commitEdit, remember, restoreLayer, design, SPACE, SIZES, FONTS, tw, layoutEl, sizeOf, SIZE_RE } from './design.js'
import { focusPage } from './deck.js'
import { openPlayer, closePlayer, followPlayer } from './player.js'
import { botMsg, hermesReady, hermesSays, layerKids, renderTree } from './panels.js'
import { readTalk, talkStart, talkAsk, talkEnd, saidOf, talk, gameLock } from './talk.js'
import { setCrewMode, crewMode } from './auto.js'
import { snapFrame, pageCapture, hiddenCopy, ANCHOR_JS, layerKey, SNAP_SECTION, sendComment } from './marks.js'
import { gensOf, pics } from './start.js'
import { nextRoute, setNextRoute, github } from './loop.js'
import { dataUrl } from '../capture.js'

// ---------- studio hook: what web/studio.js, web/home.js and web/project.js may read and call.
// Kept to this one block so the canvas and the studio views merge cleanly.
window.swarm = {
  // a drag source for a layer (the Overview's section list and outline): it drops into the left chat
  layerDrag,
  get S() { return S }, get view() { return view }, get viewing() { return viewing }, holds, get files() { return files },
  replay: !!Q.get('replay'), wall: WALL, base: BASE, store, api, esc,
  on: fn => cosmosHooks.add(fn),
  openRun, setView, loadFiles, focusPage, openPlayer, closePlayer, followPlayer,
  // talk first (engine/talkplan.mjs): readTalk(text, answerTo, kind) → build | talk | unsure;
  // talk.start({ text, kind, build, blank, said }) opens the talk in this chat; talk.end() leaves it
  // the planner's one line in the left chat (the Studio's "start with…", docs/specs/37-studio-first.md)
  say: text => botMsg(String(text || '')),
  readTalk, hermesReady, hermesSays, talk: { start: talkStart, ask: talkAsk, end: talkEnd, saidOf, lock: () => (talk.on && talk.kind === 'game' ? gameLock() : null), get on() { return talk.on }, get chat() { return talk.on ? talk.chat : null } },
  // a replay started from ☰ → Replay ends when the deck is left
  stopReplay,
  // the project's canvas is being zoomed or panned: page swaps and screenshots here wait for it too
  moved() { cam.movedAt = performance.now() },
  // the crew's sound: 'on', 'muted' or 'quiet' (☰ → Crew sound in the studio)
  sound(m) { if (m && !WALL) setCrewMode(m); return crewMode },
  // ☰'s items, called straight from any screen (never a click on a ☰ button that may be hidden):
  // models(anchor) opens the models pop beside anchor, theme() swaps Light and Dark,
  // game() opens the game wizard, tab(name) shows a side tab (chat, log)
  models: anchor => toggleModels(true, anchor), theme: toggleTheme, game: () => openGame(), get kind() { return S.kind }, tab: showTab,
  // a page's picture for its artboard: the resting snapshot, or a small fresh one
  async thumb(id, scale = 0.25) {
    const f = S.frames.find(x => x.id === id)
    if (!f) return null
    if (f.frozen && scale <= 0.25) return f.frozen.img.src
    if (!f.ready || !f.slots.size) return f.frozen?.img.src || null
    return (await snapFrame(f, scale)).image
  },
  // a page's saved snapshots for the Overview (spec 36): photographed once inside the page (web/capture.js), a JPEG
  // data URL at each scale in `urls`, or null while the page is not drawn yet or could not be photographed
  async capture(id, scales = [0.25, 0.6]) {
    const f = S.frames.find(x => x.id === id)
    if (!f?.ready || !f.slots.size) return null
    const out = await pageCapture.shoot(f.iframe.contentWindow, { scales }).catch(() => null)
    if (!out) return null
    /** @type {Map<number, string>} */
    const urls = new Map()
    for (const s of scales) urls.set(s, await dataUrl(out.jpegs.get(s)))
    return { ...out, urls }
  },
  // Scribble (the Overview draws the marks): what a mark points at, a draft's picture, sending the marks
  // with the person's words, and closing a draft or erasing a sent mark
  marks: {
    async anchor(page, box) {
      if (!S.frames.some(f => f.id === page)) return null
      const out = await hiddenCopy(page, `() => (${ANCHOR_JS})(${JSON.stringify(box)})`)
      if (!out || out.error) return null
      return { section: out.layer ? layerKey(page, out.layer) : null, selector: out.selector || null, path: out.path || [], text: out.text || null, tag: out.tag || null, region: out.region || null }
    },
    // a draft section drawn on its own: { image, height } (its height in page px at 1280 wide)
    async render(page, html) {
      const out = await hiddenCopy(page, SNAP_SECTION, { body: `<div data-layer="draft">${clean(html)}</div>`, timeout: 45000 })
      return out?.image ? { image: out.image, height: out.height } : null
    },
    async send({ text, marks, shots, crops }) {
      const run = shownRun()
      if (!run) throw new Error('Open a build first.')
      const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, role: l.role, html: l.text }))
      const res = await api(`/api/runs/${encodeURIComponent(run)}/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, marks, shots, crops, sections }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'the marks did not go')
      return out
    },
    async close(id, accept) {
      const run = shownRun()
      const res = run && await api(`/api/runs/${encodeURIComponent(run)}/drafts/${encodeURIComponent(id)}/${accept ? 'accept' : 'dismiss'}`, { method: 'POST' }).catch(() => null)
      return !!res?.ok
    },
    async erase(id) {
      const run = shownRun()
      const res = run && await api(`/api/runs/${encodeURIComponent(run)}/marks/${encodeURIComponent(id)}/erase`, { method: 'POST' }).catch(() => null)
      return !!res?.ok
    }
  },
  // a page's sections for the project canvas's inspector: pick one, change it by hand, open its
  // code, or tell the crew about just that one. Every change is a saved edit event, so it undoes,
  // replays when the file reopens and reaches anyone else looking at the same build.
  layers: {
    // in page order, each with where it sits on the page (0..1 of the page's height) once laid out
    list(page) {
      const f = S.frames.find(x => x.id === page)
      const hgt = f ? Math.max(f.h || 0, f.geo.height || 0) : 0
      return S.order.map(k => S.layers.get(k)).filter(l => l && (l.page === page || l.page === '*')).map(l => {
        const g = f?.geo.slots[l.key]
        return { key: l.key, id: l.id, role: l.role || l.id, shared: l.page === '*', done: l.status === 'done', box: g && hgt ? { top: g.box[1] / hgt, height: g.box[3] / hgt } : null }
      }).sort((a, b) => (a.box?.top ?? 9) - (b.box?.top ?? 9))
    },
    get(key) {
      const l = S.layers.get(key)
      if (!l) return null
      return { key, id: l.id, page: l.page, role: l.role || l.id, done: l.status === 'done', html: l.text, props: sectionProps(l), kids: layerKids(l.text), gens: gensOf(l).map(g => ({ gen: g, src: S.images.get(`${l.key}|${g}`) || null, busy: pics.pending.has(`${l.key}|${g}`) })) }
    },
    get theme() { return S.theme },
    // one finished section: pad, gap, dir, align, bg, hsize or radius (the Design panel's edits)
    edit(key, prop, value) { const l = S.layers.get(key); if (l?.status === 'done') return commitEdit({ kind: 'section', layer: key, prop, value }) },
    // a design token: a colour (--name) or a font (heading / body); it changes every page
    token(kind, name, value) { return kind === 'font' ? commitEdit({ kind: 'font', role: name, value }) : commitEdit({ kind: 'var', name, value }) },
    // its words, in order, and a way to change them
    texts(key) {
      const l = S.layers.get(key)
      if (!l) return []
      const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
      const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), out = []
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg, script, style')) {
        const tag = n.parentElement.tagName.toLowerCase()
        out.push({ i: out.length, text: n.textContent.trim().replace(/\s+/g, ' '), kind: /^h[1-6]$/.test(tag) ? 'Heading' : tag === 'a' || tag === 'button' ? 'Button' : 'Text' })
      }
      return out
    },
    async setText(key, i, value) {
      const l = S.layers.get(key)
      if (l?.status !== 'done') return false
      const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
      const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      let n = walk.nextNode(), at = 0
      for (; n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg, script, style')) { if (at === i) break; at++ }
      if (!n || n.textContent.trim().replace(/\s+/g, ' ') === value.trim()) return false
      const old = n.textContent
      n.textContent = old.match(/^\s*/)[0] + value.trim() + old.match(/\s*$/)[0]
      return window.swarm.layers.save(key, doc.body.innerHTML.trim(), 'text')
    },
    // the whole section's HTML, from the code editor
    async save(key, html, why = 'code') {
      const l = S.layers.get(key)
      if (!l || html == null || html === l.text) return false
      const step = { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: html, label: `${why} in ${l.role || l.id}` }
      remember(step)
      await restoreLayer(step, html, why)
      return true
    },
    // tell the crew about this section only: its builder rewrites it
    fix(key, text) { return sendComment(text, S.layers.get(key)?.status === 'done' ? key : null) },
    // paint one of its pictures again, from new words
    async paint(key, gen, prompt) {
      const l = S.layers.get(key), run = shownRun()
      if (!l || !run) return false
      const k = `${l.key}|${gen}`
      pics.pending.add(k)
      const res = await api(`/api/runs/${encodeURIComponent(run)}/image`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: l.page, layer: l.id, gen, prompt: prompt && prompt !== gen ? prompt : '' }) }).catch(() => null)
      if (!res?.ok) pics.pending.delete(k)
      return !!res?.ok
    },
    select(key) { S.sel = key && S.layers.has(key) ? key : null; design.last = ''; renderTree() },
    scales: { space: SPACE, sizes: SIZES, fonts: FONTS, radius: ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full', 'theme'] },
    // the values the hand edits step from: vertical padding, gap and heading size as Tailwind steps
    current(key) {
      const l = S.layers.get(key)
      if (!l?.text) return {}
      const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
      const root = doc.body.firstElementChild
      if (!root) return {}
      const cls = el => el?.getAttribute('class') || ''
      const py = tw(cls(root), /^py-(\S+)$/) || tw(cls(root), /^p-(\S+)$/)
      const lay = layoutEl(root)
      const gap = lay && tw(cls(lay), /^gap-(\S+)$/)
      const h = root.querySelector('h1, h2, h3') || [...root.querySelectorAll('[class*="text-"]')].sort((a, b) => sizeOf(b) - sizeOf(a))[0]
      const hs = h && tw(cls(h), SIZE_RE)
      const bg = tw(cls(root), /^bg-\[var\(--([\w-]+)\)\]$/)
      const rad = [root, ...root.querySelectorAll('[class*="rounded"]')].map(cls).join(' ').match(/(?:^|\s)rounded(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[var\(--radius\)\]))?(?=\s|$)/)
      return { py: py?.[1] ?? '0', gap: lay ? gap?.[1] ?? '0' : null, hsize: hs?.[1] || null, bg: bg?.[1] || null, radius: rad ? (rad[1]?.startsWith('[') ? 'theme' : rad[1] || '') : null }
    }
  },
  // a project's source on GitHub (web/github.js): its sheet, and a typed move from a project's dock (true when
  // the words were one); null on the hosted studio, which has no such door
  github: BOOT.hosted ? null : { open: github.open, say: github.say },
  // start a build from Projects or a project's dock (the second argument, once Auto, is ignored).
  // Without a project (Projects home) it is a new project; with one, `from` is the open version it extends
  // It resolves to the new run's id (null when none started, { busy } while the last turn still builds)
  // `opts.pictures` (painted, stock or drawn) is this build's own pick (docs/specs/06-onboarding.md)
  submit(text, auto = false, project = null, from = null, opts = {}) {
    talkEnd()
    return new Promise(done => {
      els.brief.value = text
      setNextRoute(project || from ? { project, from, route: from ? 'extend' : 'new', selected: false, done, chat: opts.chat } : { fresh: true, done, pictures: opts.pictures, chat: opts.chat, template: opts.template })
      if (view !== 'canvas') setView('canvas')
      els.form.requestSubmit()
    })
  }
}
