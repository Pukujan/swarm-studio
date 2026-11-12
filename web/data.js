// The canvas's shared data (docs/specs/34-navigation-state.md): the App view, the advisor and the game
// interview, each an XState actor made from fromTransition (XState's reducer actor), so the studio has
// one library and one way to subscribe. Its events are `set` (merge a patch) and `reset` (back to the
// start, keeping the fields named in `keep`). `state` is a view of the actor's context that reads and
// writes like a plain object, so `appv.url = x` sends `set`. Listeners added with on() run once per
// tick after a change. Nested changes (steps.push(...)) are not noticed: assign the field, or set().
// window.swarmState() dumps the navigation machine and every store, for debugging in the console.
import { createActor, fromTransition } from './vendor/xstate/xstate.mjs'

const stores = new Map()
const changed = (ctx, patch) => Object.keys(patch).some(k => ctx[k] !== patch[k] || !(k in ctx))

export function dataStore(name, start, { keep = [] } = {}) {
  const fresh = () => structuredClone(start)
  const actor = createActor(fromTransition((ctx, e) => {
    if (e.type === 'set') return changed(ctx, e.patch) ? { ...ctx, ...e.patch } : ctx
    if (e.type === 'drop') { if (!(e.key in ctx)) return ctx; const { [e.key]: _, ...rest } = ctx; return rest }
    if (e.type === 'reset') return { ...fresh(), ...Object.fromEntries(keep.filter(k => k in ctx).map(k => [k, ctx[k]])), ...e.patch }
    return ctx
  }, fresh())).start()
  const ctx = () => actor.getSnapshot().context
  const subs = new Set()
  let queued = false, seen = ctx()
  const flush = () => { queued = false; for (const f of subs) { try { f(state) } catch (err) { console.error(`data ${name}:`, err) } } }
  actor.subscribe(snap => {
    if (snap.context === seen) return
    seen = snap.context
    if (!queued && subs.size) { queued = true; queueMicrotask(flush) }
  })
  const state = new Proxy({}, {
    get: (_, k) => ctx()[k],
    set: (_, k, v) => { actor.send({ type: 'set', patch: { [k]: v } }); return true },
    deleteProperty: (_, k) => { actor.send({ type: 'drop', key: k }); return true },
    has: (_, k) => k in ctx(),
    ownKeys: () => Reflect.ownKeys(ctx()),
    getOwnPropertyDescriptor: (_, k) => (k in ctx() ? { value: ctx()[k], writable: true, enumerable: true, configurable: true } : undefined)
  })
  const api = {
    actor,
    state,
    set(patch) { actor.send({ type: 'set', patch }); return state },
    reset(patch = {}) { actor.send({ type: 'reset', patch }); return state },
    on(f) { subs.add(f); return () => subs.delete(f) }
  }
  stores.set(name, api)
  return api
}

const plain = (k, v) => (typeof Element !== 'undefined' && v instanceof Element ? `<${v.tagName.toLowerCase()}>` : v instanceof Set ? [...v] : typeof v === 'function' ? undefined : v)
export const dataSnapshot = () => Object.fromEntries([...stores].map(([n, s]) => [n, JSON.parse(JSON.stringify(s.actor.getSnapshot().context, plain))]))
// the console's debug dump: where the person is (the navigation machine, web/nav.js) and the data
export function swarmState() {
  const nav = typeof window !== 'undefined' ? window.swarmCosmos?.nav : null
  const snap = nav?.actor.getSnapshot()
  return { ...(snap ? { nav: { state: snap.value, context: JSON.parse(JSON.stringify(snap.context)) } } : {}), ...dataSnapshot() }
}
if (typeof window !== 'undefined') window.swarmState = swarmState
