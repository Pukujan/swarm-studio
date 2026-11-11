// The Plan board's routes (docs/specs/21-plan-before-spend.md). Kept out of server.mjs so the
// plan, its previews and its gate live in one place. Nothing here spends credits or starts a coding
// run unless the plan is locked at the price the person was shown (engine/plan.mjs lockPlan).
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { planStore, planView, editCard, setSystems, lockPlan, assertLocked, pickCell, roster, PLAN_ID } from '../engine/plan.mjs'
import { addSheet, addMocks, lockStyle, addBackdrops, addCloseups, entryFor, settleStale, buildScope, charEntry, viewJob, VIEWS } from '../engine/planart.mjs'

// paint({ prompt, quality: 'medium' | 'high', aspect, crop, refs }) -> { ok, path, error }: one picture
// through the person's own image login (imagegen.py). paint.ready() says whether one is signed in.
// make.character(opts) is engine/meshy.mjs makeCharacter (spends Meshy credits); make.key() the key or ''.
export function planRoutes({ dataDir, hooks = {}, paint = null, make = null, onPicture = null }) {
  const store = planStore(join(dataDir, 'plans'))
  const files = id => join(store.dir, id)
  const view = plan => planView(settleStale(plan))

  // a finished picture lands in its entry: copied next to the plan, served by name
  function land(planId, job, r) {
    const plan = store.get(planId)
    const e = plan && entryFor(plan, job.list, job.id)
    if (!e) return null
    if (r?.ok && r.path && existsSync(r.path)) {
      const file = `${job.id}${extname(r.path).toLowerCase() || '.png'}`
      mkdirSync(files(planId), { recursive: true })
      copyFileSync(r.path, join(files(planId), file))
      Object.assign(e, { state: 'done', file, src: `/plans/${planId}/${file}`, model: r.model || null, error: null })
    } else Object.assign(e, { state: 'failed', error: String(r?.error || 'no picture').slice(0, 200) })
    store.save(plan)
    onPicture?.(planId, job, e)
    return e
  }
  const paintNow = (planId, job) => paint(job).catch(err => ({ ok: false, error: String(err?.message || err) })).then(r => land(planId, job, r))

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
        paintNow(planId, job).finally(() => { q.busy--; next() })
      }
    }
    setImmediate(next)
  }

  // ---------- the build (spec 21): per character in the locked scope, the three views, the close-up
  // art, then Meshy multi-image-to-3D and the rig. Runs only on a locked plan, one build per plan.
  const building = new Set()
  // read, change, save in one step (nothing awaits in between, so a landing picture is never lost)
  const step = (planId, fn) => { const p = store.get(planId); const out = fn(p); store.save(p); return out }
  const done = e => e?.state === 'done'
  async function runBuild(planId) {
    if (building.has(planId)) return
    building.add(planId)
    try {
      const dir = files(planId)
      for (const r of buildScope(store.get(planId))) {
        const c0 = step(planId, p => { const c = charEntry(p, r); if (c.state !== 'done') c.state = 'building'; return { ...c } })
        if (c0.state === 'done') continue
        if (!done(c0.front)) await paintNow(planId, step(planId, p => viewJob(p, dir, r, 'front')))
        const c1 = step(planId, p => ({ ...charEntry(p, r) }))
        if (!done(c1.front)) { step(planId, p => { charEntry(p, r).state = 'failed' }); continue }
        const rest = step(planId, p => [
          ...['side', 'back'].filter(v => !done(c1[v])).map(v => viewJob(p, dir, r, v)),
          ...addCloseups(p, dir, { name: r.name, missing: true })
        ])
        await Promise.all(rest.map(j => paintNow(planId, j)))
        const c2 = step(planId, p => ({ ...charEntry(p, r) }))
        if (!VIEWS.every(v => done(c2[v]))) { step(planId, p => { charEntry(p, r).state = 'failed' }); continue }
        if (!make?.key()) { step(planId, p => { const c = charEntry(p, r); c.model = { state: 'failed', error: 'no Meshy key' }; c.state = 'failed' }); continue }
        step(planId, p => { charEntry(p, r).model = { state: 'making', stage: 'model', started: Date.now(), error: null } })
        try {
          let last = ''
          const plan = store.get(planId)
          const out = await make.character({
            images: VIEWS.map(v => join(dir, c2[v].file)), polycount: Number(plan.settings?.polycount) || undefined,
            role: r.name, outDir: join(dir, 'models'), key: make.key(),
            onStep: s => { if (s.stage !== last) { last = s.stage; step(planId, p => { const m = charEntry(p, r).model; if (m) m.stage = s.stage }) } }
          })
          step(planId, p => {
            const c = charEntry(p, r)
            c.model = { state: 'done', file: out.file, src: `/plans/${planId}/models/${out.file}`, thumb: out.thumb ? `/plans/${planId}/models/${out.thumb}` : null, clips: out.clips, tasks: out.tasks, credits: out.credits }
            c.state = 'done'
          })
        } catch (err) {
          step(planId, p => { const c = charEntry(p, r); c.model = { state: 'failed', error: String(err?.message || err).slice(0, 200) }; c.state = 'failed' })
        }
      }
      // test one first: once the first is made, the gate opens again for the rest, at its own price
      step(planId, p => {
        p.build.state = 'idle'
        const first = roster(p)[0]
        if (p.gate?.phase === 'first' && first && p.build.characters.find(c => c.name === first.name)?.state === 'done') {
          p.gate = { locked: false, testFirst: false, price: null, lockedAt: null, phase: null, tested: first.name }
        }
      })
    } finally { building.delete(planId) }
  }

  const PAINTS = new Set(['sheet', 'mocks', 'backdrops', 'closeups', 'view', 'build'])
  function painting(plan, make) {
    const jobs = make(files(plan.id))
    return () => runJobs(plan.id, jobs)
  }
  const art = {
    sheet: (plan, input) => painting(plan, () => addSheet(plan, String(input.kind || 'cast'))),
    mocks: (plan, input) => painting(plan, dir => addMocks(plan, dir, Array.isArray(input.shots) && input.shots.length ? input.shots.map(String) : undefined)),
    backdrops: (plan, input) => painting(plan, () => addBackdrops(plan, { stage: input.stage })),
    closeups: (plan, input) => painting(plan, dir => addCloseups(plan, dir, { name: input.name ? String(input.name) : undefined })),
    // draw one view of a character again (the person did not like it), before or between builds
    view: (plan, input) => painting(plan, dir => {
      assertLocked(plan)
      const r = roster(plan).find(x => x.name === String(input.name || ''))
      if (!r || !VIEWS.includes(input.view)) throw Object.assign(new Error('no such view'), { status: 404 })
      if (input.view !== 'front' && charEntry(plan, r).front?.state !== 'done') throw Object.assign(new Error('draw the front first'), { status: 409 })
      return [viewJob(plan, dir, r, input.view)]
    }),
    style: (plan, input) => { lockStyle(plan, input.locked !== false) }
  }
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = (req, cap = 1e5) => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > cap) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  const fail = (res, err) => json(res, err.status || 400, { error: String(err.message || err), ...(err.price ? { price: err.price } : {}) })

  // the plan's pictures and models: /plans/<id>/<file> and /plans/<id>/models/<file>, by name pattern only
  const TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', glb: 'model/gltf-binary' }
  function servePicture(req, res, url) {
    const m = url.pathname.match(/^\/plans\/(p-[a-z0-9]{6,20})\/(?:([a-z0-9-]{1,64}\.(png|webp|jpe?g))|models\/([a-z0-9-]{1,80}\.(glb|png)))$/)
    if (!m) return false
    const f = m[2] ? join(files(m[1]), m[2]) : join(files(m[1]), 'models', m[4])
    if (!existsSync(f)) { res.writeHead(404).end('not found'); return true }
    res.writeHead(200, { 'content-type': TYPES[m[3] || m[5]], 'cache-control': 'max-age=31536000, immutable' })
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
        const ready = PAINTS.has(sub) ? !!(paint && await paint.ready()) : true
        const noPainter = () => Object.assign(new Error('sign in an image model first'), { status: 503 })
        if (!ready && sub !== 'build') throw noPainter()
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
          if (!ready) throw noPainter()
          if (building.has(plan.id)) throw Object.assign(new Error('the build is running'), { status: 409 })
          plan.build ||= { characters: [], props: [], animations: null }
          plan.build.state = 'building'
          after = () => setImmediate(() => runBuild(plan.id))
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
