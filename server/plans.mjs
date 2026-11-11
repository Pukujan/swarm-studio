// The Plan board's routes (docs/specs/21-plan-before-spend.md). Kept out of server.mjs so the
// plan, its previews and its gate live in one place. Nothing here spends credits or starts a coding
// run unless the plan is locked at the price the person was shown (engine/plan.mjs lockPlan).
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { planStore, planView, editCard, setSystems, lockPlan, assertLocked, pickCell, PLAN_ID } from '../engine/plan.mjs'
import { addSheet, addMocks, lockStyle, addBackdrops, addCloseups, entryFor, settleStale } from '../engine/planart.mjs'

// paint({ prompt, quality: 'medium' | 'high', aspect, crop, refs }) -> { ok, path, error }: one picture
// through the person's own image login (imagegen.py). paint.ready() says whether one is signed in.
export function planRoutes({ dataDir, hooks = {}, paint = null, onPicture = null }) {
  const store = planStore(join(dataDir, 'plans'))
  const files = id => join(store.dir, id)
  const view = plan => planView(settleStale(plan))

  // Pictures paint in the background, two at a time per plan; each lands in the plan as it finishes.
  const queues = new Map()
  function runJobs(planId, jobs) {
    const q = queues.get(planId) || { jobs: [], busy: 0 }
    queues.set(planId, q)
    q.jobs.push(...jobs)
    const next = () => {
      while (q.busy < 2 && q.jobs.length) {
        const job = q.jobs.shift()
        q.busy++
        paint(job).catch(err => ({ ok: false, error: String(err?.message || err) })).then(r => {
          const plan = store.get(planId)
          const e = plan && entryFor(plan, job.list, job.id)
          if (e) {
            if (r?.ok && r.path && existsSync(r.path)) {
              const file = `${job.id}${extname(r.path).toLowerCase() || '.png'}`
              mkdirSync(files(planId), { recursive: true })
              copyFileSync(r.path, join(files(planId), file))
              Object.assign(e, { state: 'done', file, src: `/plans/${planId}/${file}`, model: r.model || null, error: null })
            } else Object.assign(e, { state: 'failed', error: String(r?.error || 'no picture').slice(0, 200) })
            store.save(plan)
            onPicture?.(planId, job, e)
          }
        }).finally(() => { q.busy--; next() })
      }
    }
    setImmediate(next)
  }
  const PAINTS = new Set(['sheet', 'mocks', 'backdrops', 'closeups'])
  function painting(plan, make) {
    const jobs = make(files(plan.id))
    return () => runJobs(plan.id, jobs)
  }
  const art = {
    sheet: (plan, input) => painting(plan, () => addSheet(plan, String(input.kind || 'cast'))),
    mocks: (plan, input) => painting(plan, dir => addMocks(plan, dir, Array.isArray(input.shots) && input.shots.length ? input.shots.map(String) : undefined)),
    backdrops: (plan, input) => painting(plan, () => addBackdrops(plan, { stage: input.stage })),
    closeups: (plan, input) => painting(plan, dir => addCloseups(plan, dir, { name: input.name ? String(input.name) : undefined })),
    style: (plan, input) => { lockStyle(plan, input.locked !== false) }
  }
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
          json(res, 200, view(plan))
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
    if (req.method === 'GET' && !sub) { json(res, 200, view(plan)); return true }
    if (req.method === 'GET' && sub === 'build') { json(res, 200, { gate: plan.gate, build: plan.build }); return true }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    body(req).then(async input => {
      try {
        if (PAINTS.has(sub) && !(paint && await paint.ready())) throw Object.assign(new Error('sign in an image model first'), { status: 503 })
        // read again after every wait: a picture may have landed meanwhile; nothing below awaits
        const plan = store.get(id)
        let after = null
        if (sub === 'card') editCard(plan, String(input.card || ''), input.body || {})
        else if (sub === 'systems') setSystems(plan, input || {})
        else if (sub === 'title') { const t = String(input.title || '').trim().slice(0, 80); if (t) plan.title = t }
        else if (sub === 'pick') pickCell(plan, input)
        else if (sub === 'lock') lockPlan(plan, { credits: input.credits, testFirst: input.testFirst === true })
        else if (sub === 'build') {
          assertLocked(plan)
          if (!hooks.build) throw Object.assign(new Error('the build is not ready on this server yet'), { status: 501 })
          await hooks.build(plan, store)
        } else if (art[sub]) after = art[sub](plan, input)
        else if (hooks[sub]) await hooks[sub](plan, input, store)
        else return json(res, 404, { error: 'no such action' })
        store.save(plan)
        if (typeof after === 'function') after()
        json(res, 200, view(plan))
      } catch (err) { fail(res, err) }
    })
    return true
  }
}
