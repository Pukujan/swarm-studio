// @ts-check
// The match check on a link's look (docs/decisions/0022-copy-the-look-from-a-link.md, engine/lookmatch.mjs): the
// reference beside the build, and the top style differences, each with Fix. Nothing is fixed until the person
// presses it. Shared by the Studio's References card (web/scaffold.js) and the Overview's inspector
// (web/project.js). Names only at rest, no tooltips (docs/ux/RULES.md).
import { ic } from './icons.js'

const lmEsc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

/** A link whose look is ready and can be compared.  @param {any} ref */
export const canMatch = ref => ref?.kind === 'link' && ref.look?.state === 'ready'
/** True while a walk or a check is running, so the caller keeps refreshing.  @param {any} ref */
export const lookBusy = ref => ref?.look?.state === 'walking' || ref?.look?.match?.state === 'checking'

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
  const state = busy ? '<p class="lm-state">Comparing…</p>' : m?.state === 'failed' ? `<p class="lm-state">${lmEsc(m.note || 'Could not compare')}</p>` : m?.state === 'ready' && !(m.diffs || []).length ? '<p class="lm-state">The style matches.</p>' : ''
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
 * Wire a panel: clicks inside the block, and a refresh every 3 s while a walk or a check runs.
 * @param {HTMLElement} el
 * @param {{ post: (path: string, body?: object) => Promise<any>, busy: () => boolean, reload: () => Promise<any>, sent?: () => void }} o
 */
export function matchWire(el, { post, busy, reload, sent }) {
  let timer = 0
  const tick = () => { clearTimeout(timer); if (busy()) timer = window.setTimeout(() => reload().then(tick), 3000) }
  el.addEventListener('click', e => { const m = matchClick(e, post); if (m) m.then(out => { if (out?.sent) sent?.(); tick() }).catch(() => {}) })
  return tick
}
