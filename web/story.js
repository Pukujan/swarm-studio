// @ts-check
// The Story lane on the Overview (docs/specs/39-story.md): the build's story as cards, one artboard per
// beat, in the shape picked (Phone, Desktop, Square). A card opens in the inspector: its words, its
// picture (the build's own art and pages), earlier or later, the story's type. Every change goes to
// /api/runs/:id/story/edit, which checks it (engine/story.mjs) and redraws only that card.
import { ic } from './icons.js'

export const STORY_SHAPES = [['tall', 'Phone'], ['wide', 'Desktop'], ['square', 'Square']]
// how long the Overview rests on a build before a story is written for it without a press
const STORY_REST = 4000
const STORY_ROLE = { hook: 'Hook', what: 'What it is', who: 'Who it is for', moment: 'Moment', making: 'How it was made', next: 'Next' }

// the lane's artboards: one per beat; while it is being written, one working card
/** @param {any} view @param {string} run @param {string} shape */
export function storyItems(view, run, shape, { writing = false } = {}) {
  if (writing && !view?.story) return [{ key: 'story:new', kind: 'story', name: 'Story', shape, pending: true }]
  if (!view?.story) return []
  const v = view.story.t || 0
  return view.story.beats.map(b => ({
    key: `story:${b.id}`, kind: 'story', name: b.headline, shape, beat: b,
    src: (view.cards?.[shape] || []).includes(`${shape}-${b.id}.jpg`) ? `/story/${run}/${shape}-${b.id}.jpg?v=${v}` : null
  }))
}

// the inspector for one card
/** @param {any} x @param {any} view @param {(s: any) => string} esc @param {string} base */
export function storyInspHtml(x, view, esc, base) {
  const s = view?.story
  if (!s || !x.beat) return `<h3><span>Story</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><div class="pv st-pv st-${x.shape}"><span class="blank">${ic('film', 26)}</span></div>`
  const b = x.beat, i = s.beats.findIndex(y => y.id === b.id)
  const shapes = STORY_SHAPES.map(([id, name]) => `<button type="button" class="st-shape${id === x.shape ? ' on' : ''}" data-shape="${id}" aria-pressed="${id === x.shape}">${name}</button>`).join('')
  const types = (view.types || []).map(t => `<option value="${esc(t.id)}"${t.id === s.type ? ' selected' : ''}>${esc(t.label)}</option>`).join('')
  const same = p => b.picture && p.kind === b.picture.kind && (p.kind === 'screen' ? p.page === b.picture.page : p.src === b.picture.src)
  const pics = (view.pictures || []).map((p, n) => `<button type="button" class="st-pic${same(p) ? ' on' : ''}" data-pic="${n}" aria-label="${esc(p.name || `Picture ${n + 1}`)}" aria-pressed="${same(p)}">${p.thumb ? `<img src="${esc(base + p.thumb)}" alt="" loading="lazy">` : ic('site', 18)}</button>`).join('')
  const none = `<button type="button" class="st-pic${b.picture ? '' : ' on'}" data-pic="none" aria-label="No picture" aria-pressed="${!b.picture}">${ic('type', 18)}</button>`
  return `<h3><span>${esc(STORY_ROLE[b.role] || 'Beat')} ${i + 1}/${s.beats.length}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>
    <div class="pv st-pv st-${x.shape}">${x.src ? `<img src="${esc(base + x.src)}" alt="">` : `<span class="blank">${ic('film', 26)}</span>`}</div>
    <div class="st-shapes" role="group" aria-label="Shape">${shapes}</div>
    <form class="st-words" autocomplete="off">
      <label class="st-f"><span>Kicker</span><input name="kicker" maxlength="32" value="${esc(b.kicker)}"></label>
      <label class="st-f"><span>Headline</span><input name="headline" maxlength="60" value="${esc(b.headline)}"></label>
      <label class="st-f"><span>Line</span><textarea name="line" rows="2" maxlength="140">${esc(b.line)}</textarea></label>
    </form>
    <div class="st-pics" role="group" aria-label="Picture">${none}${pics}</div>
    <label class="st-f"><span>Type</span><select class="st-type" aria-label="Story type">${types}</select></label>
    <div class="btns"><button class="btn ghost" data-st="earlier"${i === 0 ? ' disabled' : ''}>${ic('chl', 15)}Earlier</button><button class="btn ghost" data-st="later"${i === s.beats.length - 1 ? ' disabled' : ''}>Later${ic('chr', 15)}</button><button class="btn ghost" data-st="again">${ic('restore', 15)}Again</button></div>`
}

/** @typedef {{ op?: string, beat?: string, by?: number, picture?: any, type?: string, write?: boolean, shape?: string, kicker?: string, headline?: string, line?: string }} StoryWant */

// what an inspector event asks for, as an edit for the server (or a shape or a fresh write)
/** @param {Event} e @param {any} x @param {any} view @returns {StoryWant | null} */
export function storyIntent(e, x, view) {
  const t = /** @type {HTMLInputElement} */ (e.target)
  if (e.type === 'click') {
    const sh = /** @type {HTMLElement | null} */ (t.closest('[data-shape]'))
    if (sh) return { shape: sh.dataset.shape }
    const pic = /** @type {HTMLElement | null} */ (t.closest('[data-pic]'))
    if (pic) return { op: 'picture', beat: x.beat.id, picture: pic.dataset.pic === 'none' ? null : view.pictures[Number(pic.dataset.pic)] || null }
    const st = /** @type {HTMLElement | null} */ (t.closest('[data-st]'))?.dataset.st
    if (st === 'earlier' || st === 'later') return { op: 'move', beat: x.beat.id, by: st === 'earlier' ? -1 : 1 }
    if (st === 'again') return { write: true, type: view.story.type }
    return null
  }
  if (e.type === 'change' && t.matches('.st-type')) return { op: 'type', type: t.value }
  if (e.type === 'change' && t.closest('.st-words') && ['kicker', 'headline', 'line'].includes(t.name)) {
    if (t.value === x.beat[t.name]) return null
    return { op: 'reword', beat: x.beat.id, [t.name]: t.value }
  }
  return null
}

/**
 * What the lane needs from the Overview (web/project.js), which owns the stage, the Files panel and the
 * inspector's frame.
 * @typedef {object} StoryHost
 * @property {(path: string) => Promise<any>} api
 * @property {(path: string, body: any) => Promise<any>} post
 * @property {(html: string) => void} toast
 * @property {(s: any) => string} esc
 * @property {{ get: (k: string, d?: any) => any, set: (k: string, v: any) => void }} store
 * @property {HTMLElement} insp the inspector
 * @property {() => boolean} hosted
 * @property {() => string} base
 * @property {() => boolean} on the Overview is showing
 * @property {() => string | null} run the build it shows
 * @property {() => any} selected the artboard selected
 * @property {(key: string) => void} pick selects an artboard, drawn at the next render
 * @property {() => void} render
 * @property {() => void} renderStage
 * @property {() => void} renderInsp
 */

// The lane itself: the story of the build shown, written once a build with pages is finished, without a
// press (it only draws cards here; nothing is posted), and every change a card's inspector asks for.
/** @param {StoryHost} d */
export function storyLane(d) {
  /** @type {{ view: any, run: string | null, shape: string, writing: Set<string>, asked: Set<string>, soon: any, looks: Map<string, number> }} */
  const S = { view: null, run: null, shape: d.store.get('story.shape', 'tall'), writing: new Set(), asked: new Set(), soon: 0, looks: new Map() }
  const here = (/** @type {string} */ run) => d.on() && d.run() === run
  const url = (/** @type {string} */ run, path = '') => `/api/runs/${encodeURIComponent(run)}/story${path}`

  // the Overview draws its pages first and never waits for the story: its cards come in when it is read
  /** @param {string} run @param {any} board */
  async function load(run, board) {
    if (d.hosted() || !board?.pages?.length) { S.view = null; S.run = run; return }
    if (S.run !== run || !S.view) {
      // the board says whether there is one to read (asking for a story not written yet is a 404)
      const got = board.story ? await d.api(url(run)).catch(() => null) : null
      if (d.run() !== run) return
      S.view = got; S.run = run
      if (got && d.on()) d.render()
    }
    clearTimeout(S.soon)
    if (!S.view && !board.busy && !S.asked.has(run)) S.soon = setTimeout(() => auto(run, board.pages), STORY_REST)
  }
  // The story nobody asked for waits its turn: the Overview has rested on this build, and its pages have
  // their saved pictures in both sizes (spec 36). Writing it exports the site and draws every card, which
  // slowed the photographs of the pages when the two ran together. After ten looks at a build it is written
  // anyway (the looks are counted per build: every poll of the Overview starts the wait again).
  /** @param {string} run @param {{ id: string }[]} pages */
  async function auto(run, pages) {
    const n = S.looks.get(run) || 0
    if (!here(run) || S.view || S.asked.has(run)) return
    const disk = n < 10 ? await d.api(`/api/runs/${encodeURIComponent(run)}/snaps`).catch(() => null) : null
    if (!here(run) || S.view || S.asked.has(run)) return
    if (n < 10 && !pages.every(p => disk?.pages?.[p.id]?.s && disk.pages[p.id].f)) { S.looks.set(run, n + 1); clearTimeout(S.soon); S.soon = setTimeout(() => auto(run, pages), STORY_REST); return }
    S.asked.add(run)
    write(run, { auto: true })
  }
  /** @param {string} run @param {any} body */
  function write(run, body, path = '') {
    S.writing.add(run)
    d.insp.classList.add('st-busy')
    if (here(run)) d.renderStage()
    return d.post(url(run, path), body)
      .then(v => { if (d.run() === run) { S.view = v; S.run = run } return v })
      .catch(err => { d.toast(`<span>${d.esc(err.message || 'The story could not be written')}</span>`); return null })
      .finally(() => { S.writing.delete(run); d.insp.classList.remove('st-busy'); if (here(run)) d.render() })
  }
  // an inspector event on a story card: true when it was the lane's
  /** @param {Event} e */
  function act(e) {
    const x = d.selected()
    if (x?.kind !== 'story' || !S.view?.story) return false
    const want = storyIntent(e, x, S.view)
    if (!want) return false
    if (want.shape) {
      S.shape = want.shape; d.store.set('story.shape', want.shape)
      d.renderStage(); d.renderInsp()
      return true
    }
    const run = d.run()
    if (!run) return false
    const keep = x.beat?.id
    // a new type rewrites every beat, so the inspector must redraw when it lands
    if (want.op === 'type' || want.write) /** @type {HTMLElement} */ (e.target).blur?.()
    ;(want.write ? write(run, { type: want.type }) : write(run, want, '/edit')).then(v => {
      // the card stays selected where it went (a move), or the first card after a new type
      if (!v) return
      const at = want.op === 'move' ? v.story.beats.findIndex((/** @type {any} */ b) => b.headline === x.beat.headline) : v.story.beats.findIndex((/** @type {any} */ b) => b.id === keep)
      d.pick(`story:${(v.story.beats[at] || v.story.beats[0]).id}`)
      d.render()
    })
    return true
  }
  // the lane hears the inspector before the Overview does (it is made first), and keeps what is its own
  for (const type of ['change', 'click']) d.insp.addEventListener(type, e => { if (act(e)) e.stopImmediatePropagation() })
  d.insp.addEventListener('keydown', e => {
    // a story card's words: Enter keeps them (the change saves), Shift+Enter is a new line in Line
    const t = /** @type {HTMLElement} */ (e.target)
    if (e.key === 'Enter' && !e.shiftKey && t.closest('.st-words')) { e.preventDefault(); e.stopImmediatePropagation(); t.blur() }
  })

  return {
    load,
    writing: () => S.writing.has(d.run() || ''),
    // the lane's artboards, into the Overview's groups
    into(/** @type {Record<string, any[]>} */ g) {
      const run = d.run()
      const items = run && S.run === run ? storyItems(S.view, run, S.shape, { writing: S.writing.has(run) }) : []
      if (items.length) g.story = items
    },
    // a story card's inspector: true when the artboard was one
    inspect(/** @type {any} */ x) {
      if (x.kind !== 'story') return false
      d.insp.innerHTML = storyInspHtml(x, S.view, d.esc, d.base())
      return true
    }
  }
}
