// @ts-check
// Bring in a project (docs/specs/45-intake.md): the one door for work made outside the Studio. An entry in
// the Make box's kind menu opens a small sheet: a GitHub repository or a folder on this computer, the folder
// inside it, Game or App, and Bring in. The server answers at once with the new run in its project, working
// while the files come in, so Projects shows its card with the crew on it; when they are in, its room opens.
import { cursor, CREW } from './icons.js'

/** @typedef {{ api: (path: string, body?: any) => Promise<any>, esc: (s: string) => string, refresh: () => any, toast: (html: string) => void, open: (kind: string, run: string, project: string) => void, atHome: () => boolean, kind: () => string }} BringHost */

/** a repository (owner/name, an https GitHub address) or a folder (a path from the top, or from ~)
 * @param {string} v @returns {{ repo?: string, folder?: string }} */
export const bringSource = v => (/^([~/\\]|[A-Za-z]:[\\/])/.test(v.trim()) ? { folder: v.trim() } : { repo: v.trim() })

/** the kind menu's entry, after a line: its name only
 * @param {BringHost} host @returns {any[]} */
export const bringEntry = host => ['-', { k: 'bring', icon: 'download', label: 'Bring in a project', run: () => bringSheet(host) }]

/** @param {BringHost} host */
export function bringSheet(host) {
  const { esc } = host
  let kind = host.kind() === 'app' ? 'app' : 'game'
  const d = /** @type {any} */ (window).SwarmUI.dialog({
    title: 'Bring in a project',
    className: 'bring',
    body: `<form class="bring-form" autocomplete="off">
      <label class="ui-field"><span class="ui-label">Repository or folder</span><input class="ui-input" name="src" placeholder="owner/name or ~/folder" maxlength="1000" required></label>
      <label class="ui-field"><span class="ui-label">Subfolder</span><input class="ui-input" name="path" placeholder="games/ares" maxlength="300"></label>
      <div class="ui-toggle-group ui-block" role="radiogroup" aria-label="Kind">${[['game', 'Game'], ['app', 'App']].map(([k, n]) => `<button type="button" class="ui-toggle" role="radio" aria-checked="${k === kind}" data-kind="${k}">${n}</button>`).join('')}</div>
      <p class="bring-err" role="alert" hidden></p>
      <button type="submit" hidden></button>
    </form>`,
    footer: '<button type="button" class="ui-btn ui-btn-default bring-go">Bring in</button>'
  })
  const form = /** @type {HTMLFormElement} */ (d.body.querySelector('form'))
  const go = /** @type {HTMLButtonElement} */ (d.footer.querySelector('.bring-go'))
  const err = /** @type {HTMLElement} */ (d.body.querySelector('.bring-err'))
  const src = /** @type {HTMLInputElement} */ (form.elements.namedItem('src'))
  const path = /** @type {HTMLInputElement} */ (form.elements.namedItem('path'))
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (form.querySelectorAll('[data-kind]'))) b.onclick = () => {
    kind = b.dataset.kind || 'game'
    for (const x of form.querySelectorAll('[data-kind]')) x.setAttribute('aria-checked', String(x === b))
  }
  const send = async () => {
    if (go.disabled) return
    if (!src.value.trim()) return src.focus()
    go.disabled = true
    go.setAttribute('aria-busy', 'true')
    err.hidden = true
    try {
      const out = await host.api('/api/intake', { ...bringSource(src.value), path: path.value.trim(), kind })
      d.close('done')
      bringWatch(host, out, kind)
    } catch (e) {
      const said = /** @type {any} */ (e)
      err.textContent = String(said?.body?.error || said?.message || 'That did not work')
      err.hidden = false
      go.disabled = false
      go.removeAttribute('aria-busy')
    }
  }
  form.onsubmit = e => { e.preventDefault(); send() }
  go.onclick = send
  src.focus({ preventScroll: true })
  return d
}

/** the card being brought in: there at once with a crew cursor on it (the server's own working card takes
 * over on the next refresh), then its room once the files are in; a failure says why, once
 * @param {BringHost} host @param {{ project: string, run: string }} out @param {string} kind */
export function bringWatch(host, out, kind) {
  bringCard(out.project)
  Promise.resolve(host.refresh()).catch(() => {})
  let n = 0
  const tick = async () => {
    const st = await host.api(`/api/runs/${encodeURIComponent(out.run)}/app`).catch(() => null)
    if (st?.state === 'working' || (!st && ++n < 20)) return void setTimeout(tick, 1200)
    document.querySelector('.card.bring-wait')?.remove()
    if (!host.atHome()) return
    if (st?.state === 'done') return host.open(kind, out.run, out.project)
    await Promise.resolve(host.refresh()).catch(() => {})
    host.toast(`<span>${host.esc(String(st?.message || 'It did not come in').split('\n')[0].slice(0, 200))}</span>`)
  }
  setTimeout(tick, 600)
}

/** a waiting card at the head of the grid until Projects has drawn the real one
 * @param {string} project */
function bringCard(project) {
  const grid = document.querySelector('.home .hm-body.grid, .home .hm-body')
  if (!grid || grid.querySelector(`.card[data-id="${CSS.escape(project)}"]`)) return
  const el = document.createElement('div')
  el.className = 'card live wait-in bring-wait'
  el.setAttribute('aria-busy', 'true')
  el.setAttribute('aria-label', 'Bringing it in')
  el.innerHTML = `<div class="cv"><div class="crew">${cursor(CREW[1])}</div></div><div class="nm"><b></b></div>`
  grid.querySelector('.hm-none')?.remove()
  grid.prepend(el)
}
