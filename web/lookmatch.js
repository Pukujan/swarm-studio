// @ts-check
// The match check on a link's look (docs/decisions/0022-copy-the-look-from-a-link.md, engine/lookmatch.mjs): the
// reference beside the build, and the top style differences, each with Fix. Nothing is fixed until the person
// presses it. Shared by the Studio's References card (web/scaffold.js) and the Overview's inspector
// (web/project.js). Names only at rest, no tooltips (docs/ux/RULES.md).
import { ic, cursor, painterOf, PAINTERS, REVIEWER } from './icons.js'

const lmEsc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

/** A link whose look is ready and can be compared.  @param {any} ref */
export const canMatch = ref => ref?.kind === 'link' && ref.look?.state === 'ready'
/** True while a walk or a check is running, so the caller keeps refreshing.  @param {any} ref */
export const lookBusy = ref => ref?.look?.state === 'walking' || ref?.look?.match?.state === 'checking'

// ---------- the crew at work on a link (the owner, 2026-11-13: "if anything is loading it's supposed to look like
// a cursor and an agent is working on it"): who is on it, and what they are doing right now
/** How often a panel asks again while a walk or a check runs: fast enough that each step is seen. */
export const LOOK_POLL = 1200
/** One round of the cursor's spots on a card, in ms (lk-roam's duration in web/scaffold.css). */
export const LOOK_ROAM = 9000
// Hermia says the chat lines, so she is never the one reading
const LOOK_READERS = PAINTERS.filter(n => n !== 'Hermia')
/** The crew member reading a link's look: the same name on its card, in the inspector and in the chat.  @param {any} ref */
export const lookReader = ref => { const n = painterOf(`ref:${ref?.id}`); return n === 'Hermia' ? LOOK_READERS[String(ref?.id).length % LOOK_READERS.length] : n }
/**
 * Who is working on this link now and their step in plain words, or null when nobody is. The reader walks the
 * site; the reviewer compares it with the build.
 * @param {any} ref  @returns {{ name: string, step: string, job: 'read' | 'match' } | null}
 */
export function lookWorker(ref) {
  const L = ref?.kind === 'link' ? ref.look : null
  if (L?.state === 'walking') return { name: lookReader(ref), step: String(L.step || 'Opening the site'), job: 'read' }
  if (L?.match?.state === 'checking') return { name: REVIEWER, step: String(L.match.step || 'Comparing'), job: 'match' }
  return null
}
/** The state line while someone works: their name, then the step.  @param {{ name: string, step: string }} w */
export const workLine = w => `${w.name} · ${w.step}`
/**
 * The crew on a card: the working sheen and the worker's named cursor, which goes between a few spots on the
 * card (web/scaffold.css, lk-roam). The start is counted back from the clock, so a card drawn again mid-walk
 * carries on where its cursor was. Empty when nobody is working.
 * @param {any} ref  @param {number} [now]
 */
export function workHtml(ref, now = Date.now()) {
  const w = lookWorker(ref)
  return w ? `<div class="pl-work" aria-busy="true"></div>${cursor(w.name).replace('<span class="cur"', `<span class="cur" style="animation-delay:-${now % LOOK_ROAM}ms"`)}` : ''
}
/** Where a link stands, for telling one state from the next.  @param {any} ref */
export const lookPhase = ref => `${ref?.look?.state || ''}/${ref?.look?.match?.state || ''}`
/**
 * What Hermia says in the chat when a link's state changes: one line when the reading or the comparing starts,
 * one when it is done. was: lookPhase before ('' for a link not seen before); empty when there is nothing to say.
 * @param {string} was  @param {any} ref
 */
export function lookSays(was, ref) {
  if (ref?.kind !== 'link' || was === lookPhase(ref)) return ''
  const [look = '', match = ''] = String(was).split('/')
  const L = ref.look || {}, m = L.match || {}, who = lookReader(ref), host = L.from?.host || ref.name || 'the link'
  const tail = (/** @type {unknown} */ t) => (t ? `: ${String(t).replace(/[.\s]+$/, '')}.` : '.')
  if (L.state !== look) {
    if (L.state === 'walking') return `${who} is reading ${host}.`
    if (look !== 'walking') return ''
    if (L.state === 'ready') return `${who} read ${host}${L.words?.mood ? `: ${L.words.mood}` : ''}. Use this look?`
    if (L.state === 'failed') return `${who} could not read ${host}${tail(L.note)}`
    return ''
  }
  if (m.state === 'checking') return `${REVIEWER} is comparing your build with ${host}.`
  if (match !== 'checking') return ''
  if (m.state === 'ready') { const n = (m.diffs || []).length; return `${REVIEWER} compared your build with ${host}: ${Number.isFinite(m.score) ? `${Math.round(m.score)} of 100, ` : ''}${n ? `${n} ${n === 1 ? 'thing' : 'things'} to fix` : 'the style matches'}.` }
  if (m.state === 'failed') return `${REVIEWER} could not compare${tail(m.note)}`
  return ''
}

/**
 * The block's HTML. built: the project has a build to compare.
 * @param {any} ref  @param {{ base?: string, built?: boolean }} [o]
 */
export function matchHtml(ref, { base = '', built = false } = {}) {
  if (!canMatch(ref)) return ''
  const m = ref.look.match || null
  const busy = m?.state === 'checking'
  const pair = m?.state === 'ready' && m.ours?.[0] && ref.look.shots?.[0]
    ? `<div class="lm-pair"><figure><img src="${lmEsc(base + ref.look.shots[0])}" alt="" loading="lazy"><figcaption>Reference</figcaption></figure><figure><img src="${lmEsc(base + m.ours[0])}" alt="" loading="lazy"><figcaption>Yours</figcaption></figure></div>` : ''
  const diffs = m?.state === 'ready' ? (m.diffs || []).map((/** @type {any} */ d, /** @type {number} */ i) => `<div class="lm-diff"><p><b>${lmEsc(d.part)}</b>${lmEsc(d.say)}</p><button class="btn ghost" data-lm="fix" data-i="${i}">${ic('check', 15)}Fix</button></div>`).join('') : ''
  const state = busy ? `<p class="lm-state" aria-live="polite">${lmEsc(workLine(/** @type {{ name: string, step: string }} */ (lookWorker(ref))))}</p>` : m?.state === 'failed' ? `<p class="lm-state">${lmEsc(m.note || 'Could not compare')}</p>` : m?.state === 'ready' && !(m.diffs || []).length ? '<p class="lm-state">The style matches.</p>' : ''
  const score = m?.state === 'ready' && Number.isFinite(m.score) ? `<p class="lm-score"><b>${Math.round(m.score)}</b><span>of 100</span></p>` : ''
  const btn = built ? `<button class="btn ghost" data-lm="match"${busy ? ' disabled' : ''}>${ic('search', 15)}${m?.state === 'ready' ? 'Compare again' : 'Compare with build'}</button>` : ''
  if (!btn && !m) return ''
  return `<div class="lm" data-ref="${lmEsc(ref.id)}">${state}${pair}${score}${diffs}${btn ? `<div class="lm-acts">${btn}</div>` : ''}</div>`
}

/**
 * A click inside the block. post(path, body) -> Promise of { refs }, path relative to the project's refs.
 * Returns the promise, or null when the click was not the block's.
 * @param {Event} e  @param {(path: string, body?: object) => Promise<any>} post
 */
export function matchClick(e, post) {
  const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-lm]'))
  const id = b?.closest('.lm')?.getAttribute('data-ref')
  if (!b || !id) return null
  b.setAttribute('disabled', '')
  return b.dataset.lm === 'fix' ? post(`${id}/fix`, { i: Number(b.dataset.i) }).then(out => { b.innerHTML = `${ic('check', 15)}Sent`; return out }) : post(`${id}/match`)
}

/**
 * Wire a panel: clicks inside the block, and a refresh every LOOK_POLL while a walk or a check runs.
 * @param {HTMLElement} el
 * @param {{ post: (path: string, body?: object) => Promise<any>, busy: () => boolean, reload: () => Promise<any>, sent?: () => void }} o
 */
export function matchWire(el, { post, busy, reload, sent }) {
  let timer = 0
  const tick = () => { clearTimeout(timer); if (busy()) timer = window.setTimeout(() => reload().then(tick), LOOK_POLL) }
  el.addEventListener('click', e => { const m = matchClick(e, post); if (m) m.then(out => { if (out?.sent) sent?.(); tick() }).catch(() => {}) })
  return tick
}
