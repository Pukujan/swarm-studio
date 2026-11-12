// The Story lane on the Overview (docs/specs/39-story.md): the build's story as cards, one artboard per
// beat, in the shape picked (Phone, Desktop, Square). A card opens in the inspector: its words, its
// picture (the build's own art and pages), earlier or later, the story's type. Every change goes to
// /api/runs/:id/story/edit, which checks it (engine/story.mjs) and redraws only that card.
import { ic } from './icons.js'

export const STORY_SHAPES = [['tall', 'Phone'], ['wide', 'Desktop'], ['square', 'Square']]
const STORY_ROLE = { hook: 'Hook', what: 'What it is', who: 'Who it is for', moment: 'Moment', making: 'How it was made', next: 'Next' }

// the lane's artboards: one per beat; while it is being written, one working card
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

// what an inspector event asks for, as an edit for the server (or a shape or a fresh write)
export function storyIntent(e, x, view) {
  const t = e.target
  if (e.type === 'click') {
    const sh = t.closest('[data-shape]')
    if (sh) return { shape: sh.dataset.shape }
    const pic = t.closest('[data-pic]')
    if (pic) return { op: 'picture', beat: x.beat.id, picture: pic.dataset.pic === 'none' ? null : view.pictures[Number(pic.dataset.pic)] || null }
    const st = t.closest('[data-st]')?.dataset.st
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
