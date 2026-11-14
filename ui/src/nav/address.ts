// The address carries the machine's state and nothing else (spec 34), as web/studio.js writes it: a new place (room,
// project, version, plan) is a history entry; the player, its page and a Studio step replace the current one. Back,
// Forward and a reload rebuild the state from the address alone. Other keys are kept as they are.
// web/studio.js keeps these rules inside its controller, so they are restated here; keep the two the same.
import { toAddress, type Nav, type View } from './nav'

const NAV_KEYS = ['project', 'version', 'room', 'run', 'plan', 'play', 'page', 'replay', 'step']
const place = (v: View) => [v.room === 'brand' ? v.from : v.room, v.version, v.run, v.plan, v.room === 'studio' ? v.project : ''].join('|')

export function search(v: View, current: string) {
  const q = new URLSearchParams(toAddress(v))
  for (const [k, x] of new URLSearchParams(current)) if (!NAV_KEYS.includes(k)) q.append(k, x)
  return q.toString() ? `?${q}` : ''
}

// Keeps the address and the machine together until the returned function is called
export function followAddress(nav: Nav) {
  let restoring = false
  let written = nav.view
  const unsubscribe = nav.subscribe((v: View) => {
    if (restoring) return
    const s = search(v, location.search)
    const before = written
    written = v
    if (s === location.search) return
    const url = `${location.pathname}${s}${location.hash}`
    if (place(v) !== place(before)) history.pushState(null, '', url)
    else history.replaceState(history.state, '', url)
  })
  const onPop = () => {
    restoring = true
    try { nav.restore(location.search) } finally { restoring = false }
    written = nav.view
  }
  addEventListener('popstate', onPop)
  return () => { unsubscribe(); removeEventListener('popstate', onPop) }
}
