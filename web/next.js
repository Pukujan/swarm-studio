// @ts-check
// Where the current Studio meets the next one (ui/, served at /next/; docs/decisions/0013-react-ui-coexists.md). A
// project's brand sheet has an address of its own (?room=brand&project=…&step=…, web/nav.js), so /next/ can draw
// it. Here web/studio.js draws the sheet only when something opens it, and on a reload or Back nothing has: this
// opens it, as the Studio's Brand card does (web/scaffold.js).
//
// It starts itself beside the studio controller, as web/pet.js does, so web/studio.js carries no code for it.
// Joined into the studio's one script (server/page.mjs): every top-level name here has next in it.

/**
 * @param {{ C: any, sw: any }} o
 */
export function makeNextLink({ C, sw }) {
  // the project whose sheet is open already (the Studio's Brand card calls C.brand)
  let opened = /** @type {string | null} */ (null)
  const open = C.brand
  C.brand = (/** @type {any} */ opts) => { opened = opts?.project || null; return open(opts) }
  const json = (/** @type {string} */ path) => sw.api(path).then((/** @type {Response} */ r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))

  /** @param {any} v the machine's view */
  function onView(v) {
    if (v?.room !== 'brand') { if (v?.room !== 'studio') opened = null; return }
    if (v.from !== 'studio' || !v.project || v.project === opened) return
    const project = opened = v.project
    json(`/api/studio/${encodeURIComponent(project)}`)
      .then(d => { if (C.nav.view.room === 'brand' && C.nav.view.project === project) C.brandView.open({ project, brief: d.studio?.idea || '', kind: d.studio?.kind === 'app' ? 'app' : 'site', done: () => {} }) })
      .catch(() => { opened = null })
  }
  C.nav.subscribe(onView)
  onView(C.nav.view)
  return { onView }
}

if (typeof document !== 'undefined' && window.swarm && !window.swarm.wall) {
  const nextStart = () => { const C = window.swarmCosmos; if (C?.nav && !C.nextLink) C.nextLink = makeNextLink({ C, sw: window.swarm }) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', nextStart)
  else setTimeout(nextStart)
}
