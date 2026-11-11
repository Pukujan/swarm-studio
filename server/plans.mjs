// The Plan board's routes (docs/specs/21-plan-before-spend.md). Kept out of server.mjs so the
// plan, its previews and its gate live in one place. Nothing here spends credits or starts a coding
// run unless the plan is locked at the price the person was shown (engine/plan.mjs lockPlan).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planStore, planView, editCard, setSystems, lockPlan, assertLocked, pickCell, PLAN_ID } from '../engine/plan.mjs'

export function planRoutes({ dataDir, hooks = {} }) {
  const store = planStore(join(dataDir, 'plans'))
  const files = id => join(store.dir, id)
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = (req, cap = 1e5) => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > cap) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  const fail = (res, err) => json(res, err.status || 400, { error: String(err.message || err), ...(err.price ? { price: err.price } : {}) })

  // the plan's pictures: /plans/<id>/<file>, by name pattern only
  function servePicture(req, res, url) {
    const m = url.pathname.match(/^\/plans\/(p-[a-z0-9]{6,20})\/([a-z0-9-]{1,64}\.(png|webp|jpe?g))$/)
    if (!m) return false
    const f = join(files(m[1]), m[2])
    if (!existsSync(f)) { res.writeHead(404).end('not found'); return true }
    res.writeHead(200, { 'content-type': `image/${m[3] === 'jpg' ? 'jpeg' : m[3]}`, 'cache-control': 'max-age=31536000, immutable' })
    res.end(readFileSync(f))
    return true
  }

  // true when the request was a plan route (and has been answered)
  return function handle(req, res, url) {
    if (servePicture(req, res, url)) return true
    if (url.pathname === '/api/plans') {
      if (req.method === 'GET') { json(res, 200, { plans: store.list() }); return true }
      if (req.method === 'POST') {
        body(req).then(input => {
          const plan = store.create({ idea: input.idea, answers: input.answers && typeof input.answers === 'object' ? input.answers : {}, title: input.title })
          json(res, 200, planView(plan))
        }).catch(err => fail(res, err))
        return true
      }
      json(res, 405, { error: 'GET or POST' }); return true
    }
    const m = url.pathname.match(/^\/api\/plans\/([^/]+)(?:\/([a-z]+))?$/)
    if (!m) return false
    const [, id, sub = ''] = m
    if (!PLAN_ID.test(id)) { json(res, 404, { error: 'no such plan' }); return true }
    const plan = store.get(id)
    if (!plan) { json(res, 404, { error: 'no such plan' }); return true }
    if (req.method === 'GET' && !sub) { json(res, 200, planView(plan)); return true }
    if (req.method === 'GET' && sub === 'build') { json(res, 200, { gate: plan.gate, build: plan.build }); return true }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    body(req).then(async input => {
      try {
        if (sub === 'card') editCard(plan, String(input.card || ''), input.body || {})
        else if (sub === 'systems') setSystems(plan, input || {})
        else if (sub === 'title') { const t = String(input.title || '').trim().slice(0, 80); if (t) plan.title = t }
        else if (sub === 'pick') pickCell(plan, input)
        else if (sub === 'lock') lockPlan(plan, { credits: input.credits, testFirst: input.testFirst === true })
        else if (sub === 'build') {
          assertLocked(plan)
          if (!hooks.build) throw Object.assign(new Error('the build is not ready on this server yet'), { status: 501 })
          await hooks.build(plan, store)
        } else if (hooks[sub]) await hooks[sub](plan, input, store)
        else return json(res, 404, { error: 'no such action' })
        store.save(plan)
        json(res, 200, planView(plan))
      } catch (err) { fail(res, err) }
    })
    return true
  }
}
