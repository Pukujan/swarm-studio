// When the studio's background work stops by itself (decision 0017, issue #450). Three small rules, each with its clock passed in
// so tests drive them with fake time:
// - idleWatch: something busy-or-not, checked every `every` ms; once it has been idle for `ms`, onIdle runs once
//   (the server exits after 20 min with no pane, build, render or job);
// - previewPool: apps with a server running (a dev server, or a built app's own server), each seen by a viewer's
//   heartbeat; one with no viewer and no build for `idleMs` is stopped, and at most `max` run at once, the one
//   seen longest ago stopped first (an app being built is never stopped for either);
// - serialQueue: at most `size` jobs at a time, the rest wait their turn (one film render at a time).

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ms may be a number or a function; 0 or less never fires (Settings: Never)
export function idleWatch({ ms, busy, onIdle, every = 30000, now = Date.now, timers = globalThis }) {
  let since = now(), fired = false
  const limit = () => (typeof ms === 'function' ? ms() : ms)
  const tick = () => {
    if (fired) return
    if (busy()) { since = now(); return }
    if (limit() > 0 && now() - since >= limit()) { fired = true; timers.clearInterval(h); onIdle() }
  }
  const h = timers.setInterval(tick, every)
  h?.unref?.()
  return {
    tick,
    // something happened (a request, a job): the idle time starts again
    touch: () => { since = now() },
    idleFor: () => now() - since,
    stop: () => { fired = true; timers.clearInterval(h) }
  }
}

// max and idleMs may be numbers or functions (a Settings pick, read each time)
export function previewPool({ max = 2, idleMs = 120000, busy = () => false, stop, now = Date.now }) {
  const val = v => (typeof v === 'function' ? v() : v)
  const seen = new Map() // id -> last time a viewer was there
  const victims = () => [...seen.entries()].filter(([id]) => !busy(id)).sort((a, b) => a[1] - b[1]).map(([id]) => id)
  return {
    // a server for this app is starting: make room first (the one seen longest ago goes)
    async admit(id) {
      seen.set(id, now())
      while (seen.size > val(max)) {
        const v = victims().find(x => x !== id)
        if (!v) break // every other one is being built: they stay
        seen.delete(v)
        await stop(v, 'room')
      }
    },
    seen(id) { if (seen.has(id)) seen.set(id, now()) },
    // its server stopped by itself or was stopped elsewhere
    gone(id) { seen.delete(id) },
    running: () => [...seen.keys()],
    // the ones nobody has looked at for idleMs, and nobody is building
    async sweep() {
      for (const id of victims()) if (now() - seen.get(id) >= val(idleMs)) { seen.delete(id); await stop(id, 'idle') }
    }
  }
}

export function serialQueue(size = 1) {
  let active = 0
  const waiting = []
  const next = () => { if (active < size && waiting.length) { active++; waiting.shift()() } }
  return {
    // fn runs when a slot is free; onWait hears how many are ahead while it waits
    run(fn, onWait = () => {}) {
      return new Promise((ok, fail) => {
        const go = () => Promise.resolve().then(fn).then(ok, fail).finally(() => { active--; next() })
        waiting.push(go)
        if (active >= size) onWait(waiting.length)
        next()
      })
    },
    busy: () => active > 0 || waiting.length > 0,
    waiting: () => waiting.length
  }
}

// The server's own code on disk: the newest change under these folders (their .mjs files, not deeper), in ms.
// The launcher asks the same of server/ and engine/ (launcher.py code_stamp).
export function codeStamp(dirs, { readdir = readdirSync, stat = statSync } = {}) {
  let newest = 0
  for (const d of dirs) {
    let names = []
    try { names = readdir(d) } catch { continue }
    for (const n of names) if (n.endsWith('.mjs')) { try { newest = Math.max(newest, stat(join(d, n)).mtimeMs) } catch {} }
  }
  return newest
}
// True when the code changed after this process started (a second's grace, as the launcher gives). The web
// files are read fresh on every request, so an old server serves a page whose parts no longer fit: the
// Studio's frame failed to load after an update (2026-11-13).
export const staleCode = (booted, stamp) => stamp > booted + 1000
