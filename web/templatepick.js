// @ts-check
// The design template a person picks for a website (Open Design's, decision 0016; engine/odlibrary.mjs): up to
// four in Make's Examples pop, the ones whose name or line fit what is typed, and the pick as a chip beside
// Make, × to drop it. The next website's build carries it (its request's `template`).
import { ic } from './icons.js'

/** @typedef {{ id: string, name: string, line: string, category: string }} Template */

/**
 * @param {{ api: (path: string) => Promise<any>, esc: (s: string) => string, form: HTMLElement, input: HTMLInputElement }} o
 */
export function templatePicker({ api, esc, form, input }) {
  /** @type {Promise<Template[]> | null} */
  let list = null
  /** @type {{ id: string, name: string } | null} */
  let picked = null
  const all = () => (list ||= api('/api/library/templates').then(j => j.templates || []).catch(() => { list = null; return [] }))

  function draw() {
    form.querySelector('.hm-picked')?.remove()
    if (!picked) return
    const chip = document.createElement('span')
    chip.className = 'hm-picked'
    chip.innerHTML = `${esc(picked.name)}<button type="button" class="ib" aria-label="No template">${ic('x', 14)}</button>`
    const drop = chip.querySelector('button')
    if (drop) drop.onclick = () => { picked = null; draw(); input.focus() }
    form.querySelector('.hm-make')?.before(chip)
  }

  return {
    /** the Templates part of the Examples pop: '' when there are none */
    async html() {
      const words = [...new Set(String(input.value || '').toLowerCase().match(/[a-z]{4,}/g) || [])]
      /** @param {Template} t */
      const score = t => words.filter(w => `${t.name} ${t.line} ${t.category}`.toLowerCase().includes(w)).length
      const best = (await all()).map(t => /** @type {[number, Template]} */ ([score(t), t])).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, t]) => t)
      return best.length ? `<h3>Templates</h3><div class="hm-show" role="list" aria-label="Templates">${best.map(t => `<button type="button" class="hm-sc hm-tpl" role="listitem" data-tpl="${esc(t.id)}" data-name="${esc(t.name)}">${ic('layers', 18)}<span class="nm">${esc(t.name)}</span><span class="ds">${esc(t.line)}</span>${ic('chr', 15)}</button>`).join('')}</div>` : ''
    },
    /** a template clicked in the pop is the pick
     * @param {HTMLElement} pop @param {() => void} close */
    bind(pop, close) {
      for (const b of /** @type {NodeListOf<HTMLElement>} */ (pop.querySelectorAll('.hm-tpl'))) b.onclick = () => { picked = { id: b.dataset.tpl || '', name: b.dataset.name || '' }; draw(); close(); input.focus() }
    },
    /** the pick, for the next build, which drops it */
    take() { const p = picked; picked = null; draw(); return p ? { template: p.id } : {} }
  }
}
