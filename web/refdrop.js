// @ts-check
// One drop target for references (issue #543, decision 0015: "drop anything anywhere"). Whatever is dropped on a
// screen that has one (the Studio board, a project's Overview, the Design deck, the App room) goes to the project's References,
// the one place the crew's brief reads. Then Hermia asks once, beside it: "like this, or use as is?". Like this
// keeps it a reference (the crew matches its look, or reads its words); Use as is moves it to the project's
// Assets, placed as it is (spec 37). A file over the screen shows where it will go.
//
//   refDrop({ root, at, api, said, done, hosted })
//     root:    the element that takes the drop (its whole area)
//     at():    the project's address, `/api/projects/<pid>`, or a build's, `/api/runs/<run>` (the server finds its
//              project), or null: then the drop is not taken
//     api(path, opts): the studio's fetch with the token, answering a Response
//     said(text): Hermia's line in this screen's chat
//     done(refs, added): the project's references after the drop, and the ones it added
//     asset(refs, assets): after Use as is, the references and the assets as they are now
//     hosted(): true in the hosted studio, which takes no drops
// Joined into the studio's and the canvas's one script (server/page.mjs): every top-level name has refDrop in it.
import { ic } from './icons.js'

const refDropEsc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const refDropFiles = (/** @type {DragEvent} */ e) => [...(e.dataTransfer?.types || [])].includes('Files')

/**
 * @param {{ root: HTMLElement, at: () => string | null, api: (path: string, opts?: RequestInit) => Promise<Response>,
 *   said?: (text: string) => void, done?: (refs: any[], added: any[]) => void, asset?: (refs: any[], assets: any[]) => void,
 *   hosted?: () => boolean, skip?: (e: DragEvent) => boolean }} o
 *   skip(e): a drop this screen handles itself (the Studio's Assets section, the chat's own chips)
 */
export function refDrop({ root, at, api, said = () => {}, done = () => {}, asset = () => {}, hosted = () => false, skip = () => false }) {
  const over = document.createElement('div')
  over.className = 'rd-over'
  over.hidden = true
  over.innerHTML = `<span>${ic('image', 18)}Drop to add to References</span>`
  root.append(over)
  let depth = 0
  const takes = (/** @type {DragEvent} */ e) => refDropFiles(e) && !hosted() && !!at() && !skip(e)
  root.addEventListener('dragenter', e => { if (!takes(e)) return; e.preventDefault(); depth++; over.hidden = false })
  root.addEventListener('dragover', e => { if (!takes(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' })
  root.addEventListener('dragleave', e => { if (!refDropFiles(e)) return; if (--depth <= 0) { depth = 0; over.hidden = true } })
  root.addEventListener('drop', e => {
    depth = 0; over.hidden = true
    if (!takes(e)) return
    e.preventDefault()
    add([...(e.dataTransfer?.files || [])])
  })

  /** @param {File[]} files */
  async function add(files) {
    const p = at()
    if (!p || !files.length) return
    const added = []
    let refs = null
    for (const f of files.slice(0, 12)) {
      const res = await api(`${p}/refs?name=${encodeURIComponent(f.name || 'reference')}&source=upload`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f }).catch(() => null)
      const j = res ? await res.json().catch(() => ({})) : {}
      if (!res?.ok || !j.ref) { said(`${f.name} could not be added${j.error ? `: ${j.error}` : ''}.`); continue }
      added.push(j.ref); refs = j.refs
    }
    if (!added.length) return
    done(refs || [], added)
    ask(p, added)
  }

  // Hermia asks once, beside the drop: like this, or use as is? Nothing is asked again for these.
  /** @param {string} p  @param {any[]} added */
  function ask(p, added) {
    root.querySelector('.rd-ask')?.remove()
    const what = added.length === 1 ? added[0].name : `${added.length} files`
    said(`I put ${what} in References. Like this, or use as is?`)
    const box = document.createElement('div')
    box.className = 'rd-ask'
    box.setAttribute('role', 'group')
    box.setAttribute('aria-label', `${what}: like this, or use as is?`)
    box.innerHTML = `<span>${refDropEsc(what)} is in References.</span><button type="button" class="btn ghost sm" data-rd="like">Like this</button><button type="button" class="btn ghost sm" data-rd="asis">${ic('pin', 14)}Use as is</button>`
    root.append(box)
    box.querySelector('[data-rd="like"]')?.addEventListener('click', () => box.remove())
    box.querySelector('[data-rd="asis"]')?.addEventListener('click', async () => {
      box.remove()
      let j = null
      for (const r of added) {
        const res = await api(`${p}/assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: r.id }) }).catch(() => null)
        j = res?.ok ? await res.json().catch(() => null) : j
      }
      if (j) { asset(j.refs || [], j.assets || []); said(`${what} will be placed as it is.`) }
    })
    // Escape is "like this": it stays a reference
    box.addEventListener('keydown', e => { if (e.key === 'Escape') box.remove() })
    const like = /** @type {HTMLElement | null} */ (box.querySelector('[data-rd="like"]'))
    like?.focus({ preventScroll: true })
  }

  return { add }
}
