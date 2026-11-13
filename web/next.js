// @ts-check
// Where the current Studio meets the next one (ui/, served at /next/; docs/decisions/0013-react-ui-coexists.md and
// 0014-switching-on-a-ported-screen.md). Two jobs, both read from the navigation machine (web/nav.js):
//
//   - a project's brand sheet has an address (?room=brand&project=…&step=…). web/studio.js draws the sheet for it;
//     on a reload or Back nothing has opened it yet, so this opens it, as the Studio's Brand card does
//     (web/scaffold.js);
//   - a room the server has switched on (server/next.mjs LIVE, in the page as SWARM.next) is drawn by /next/: the
//     Studio goes there, at the same address.
//
// It starts itself beside the studio controller, as web/pet.js does, so web/studio.js carries no code for it.
// Joined into the studio's one script (server/page.mjs): every top-level name here has next in it.
import { toAddress } from './nav.js'

/**
 * The /next/ page that draws this view, when its room is switched on there; else null. Only a view with an
 * address of its own can go: a brand sheet opened from a chat stays here.
 * @param {any} v the machine's view
 * @param {string[]} live the rooms switched on
 * @returns {string | null}
 */
export function nextLive(v, live) {
  if (!v || !live.length) return null
  const room = v.room === 'brand' ? (v.from === 'studio' && v.project ? 'brand' : null) : v.room
  return room && live.includes(room) ? `/next/${toAddress(v)}` : null
}

/**
 * @param {{ C: any, sw: any, live?: string[], go?: (url: string) => void }} o
 */
export function makeNextLink({ C, sw, live = [], go = url => location.assign(url) }) {
  // the project whose sheet the Studio opened itself (its Brand card calls C.brand)
  let opened = /** @type {string | null} */ (null)
  const open = C.brand
  C.brand = (/** @type {any} */ opts) => { opened = opts?.project || null; return open(opts) }
  const json = (/** @type {string} */ path) => sw.api(path).then((/** @type {Response} */ r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))

  /** @param {any} v */
  function onView(v) {
    const url = nextLive(v, live)
    if (url) return go(url)
    if (v?.room !== 'brand' || v.from !== 'studio' || !v.project || v.project === opened) return
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
  const nextStart = () => { const C = window.swarmCosmos; if (C?.nav && !C.nextLink) C.nextLink = makeNextLink({ C, sw: window.swarm, live: window.SWARM?.next || [] }) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', nextStart)
  else setTimeout(nextStart)
}
