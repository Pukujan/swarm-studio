// One place for the canvas's state. Each part of the page registers a named slice
// with its starting values (plain data only: no functions or elements). A slice's state is still a plain object you read and write
// as before, but every write to a top-level field is noticed: listeners added with on()
// run once per tick after a change, and reset() puts the slice back to its start
// (keeping the fields named in `keep`), so nothing from the last run lingers.
// window.swarmState() returns a snapshot of every slice, for debugging in the console.
// Nested changes (steps.push(...)) are not noticed: assign the field, or call set().
const slices = new Map()

export function stateSlice(name, start, { keep = [] } = {}) {
  const fresh = () => structuredClone(start)
  const data = fresh()
  const subs = new Set()
  let queued = false
  const flush = () => { queued = false; for (const f of subs) { try { f(state) } catch (err) { console.error(`state ${name}:`, err) } } }
  const note = () => { if (!queued && subs.size) { queued = true; queueMicrotask(flush) } }
  const state = new Proxy(data, {
    set(t, k, v) { if (t[k] !== v || !(k in t)) { t[k] = v; note() } return true },
    deleteProperty(t, k) { if (k in t) { delete t[k]; note() } return true }
  })
  const api = {
    state,
    set(patch) { Object.assign(state, patch); return state },
    reset(patch = {}) {
      const kept = Object.fromEntries(keep.filter(k => k in data).map(k => [k, data[k]]))
      for (const k of Object.keys(data)) delete data[k]
      Object.assign(data, fresh(), kept, patch)
      note()
      return state
    },
    on(f) { subs.add(f); return () => subs.delete(f) }
  }
  slices.set(name, api)
  return api
}

const plain = (k, v) => (typeof Element !== 'undefined' && v instanceof Element ? `<${v.tagName.toLowerCase()}>` : v instanceof Set ? [...v] : typeof v === 'function' ? undefined : v)
export const stateSnapshot = () => Object.fromEntries([...slices].map(([n, s]) => [n, JSON.parse(JSON.stringify(s.state, plain))]))
if (typeof window !== 'undefined') window.swarmState = stateSnapshot
