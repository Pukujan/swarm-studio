// Make with Meshy (spec 20), against a mocked Meshy API: no network, no credits.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { meshyCost, meshyKey, meshyJobs, BATCH_MAX,imageTo3dBody, rigBody, rigOutputs, classifyFailure, backoffMs, waitTask, download, makeCharacter, assetAllowed, meshyPick, spritePick, STYLE } from '../engine/meshy.mjs'
import { cleanCast, castPrompt, castCredits, spriteFile } from '../engine/cast.mjs'

const KEY = 'msy_test_not_a_real_key'
const tmp = () => mkdtempSync(join(tmpdir(), 'meshy-'))
const clock = () => { let t = 0; return { now: () => t, sleep: async ms => { t += ms } } }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const GLB = Buffer.from('glTF\x02\x00\x00\x00fake')

// A fake Meshy: image-to-3d runs one poll, then the rig; assets come from assets.meshy.ai.
function fakeMeshy({ failRig = false } = {}) {
  const calls = []
  let polls = 0
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', auth: opts.headers?.authorization, body: opts.body ? JSON.parse(opts.body) : null })
    const u = new URL(url)
    if (u.hostname === 'assets.meshy.ai') return new Response(GLB, { status: 200 })
    if (u.pathname === '/openapi/v1/image-to-3d' && opts.method === 'POST') return json({ result: 'mesh-1' })
    if (u.pathname === '/openapi/v1/image-to-3d/mesh-1') return json(++polls < 2 ? { id: 'mesh-1', status: 'IN_PROGRESS', progress: 40 } : { id: 'mesh-1', status: 'SUCCEEDED', progress: 100, thumbnail_url: 'https://assets.meshy.ai/t/mesh-1.png', model_urls: { glb: 'https://assets.meshy.ai/m/mesh-1.glb' } })
    if (u.pathname === '/openapi/v1/rigging' && opts.method === 'POST') return json({ result: 'rig-1' })
    if (u.pathname === '/openapi/v1/rigging/rig-1') return json(failRig
      ? { id: 'rig-1', status: 'FAILED', task_error: { message: 'pose not detected' } }
      : { id: 'rig-1', status: 'SUCCEEDED', result: { rigged_character_glb_url: 'https://assets.meshy.ai/r/rig.glb', rigged_character_fbx_url: 'https://assets.meshy.ai/r/rig.fbx', basic_animations: { walking_glb_url: 'https://assets.meshy.ai/r/walk.glb', running_glb_url: 'https://assets.meshy.ai/r/run.glb' } } })
    return json({ message: 'not found' }, 404)
  }
  return { fetchImpl, calls }
}

test('one character costs 35 credits: a textured model and a rig', () => {
  const c = meshyCost()
  assert.equal(c.credits, 35)
  assert.deepEqual(c.parts.map(p => p.what), ['model', 'rig'])
  assert.equal(meshyCost({ rig: false }).credits, 30)
})

test('the key comes from the environment, else the env files; none is empty', () => {
  const d = tmp()
  const f = join(d, '.env')
  writeFileSync(f, `OTHER=1\nexport MESHY_API_KEY="${KEY}"\n`)
  assert.equal(meshyKey({ env: { MESHY_API_KEY: 'from-env' }, files: [f] }), 'from-env')
  assert.equal(meshyKey({ env: {}, files: [join(d, 'missing'), f] }), KEY)
  assert.equal(meshyKey({ env: {}, files: [join(d, 'missing')] }), '')
})

test('the image-to-3D ask is anime cel, flat colours, A-pose, one GLB', () => {
  const b = imageTo3dBody('data:image/png;base64,AAAA')
  assert.equal(b.texture_prompt, STYLE)
  assert.match(b.texture_prompt, /anime/)
  assert.match(b.texture_prompt, /not realistic/)
  assert.equal(b.enable_pbr, false)
  assert.equal(b.pose_mode, 'a-pose')
  assert.deepEqual(b.target_formats, ['glb'])
  assert.deepEqual(rigBody('mesh-1'), { input_task_id: 'mesh-1', height_meters: 1.7 })
  assert.deepEqual(rigOutputs({ result: { rigged_character_glb_url: 'a', basic_animations: { walking_glb_url: 'w' } } }), { glb: 'a', walk: 'w', run: null })
})

test('polling policy matches the plugin: 5xx/408/429/network retry, other 4xx stop, early 404 waits', () => {
  assert.equal(classifyFailure(null, 0), 'transient')
  assert.equal(classifyFailure(503, 0), 'transient')
  assert.equal(classifyFailure(429, 0), 'transient')
  assert.equal(classifyFailure(401, 0), 'permanent')
  assert.equal(classifyFailure(404, 1000), 'transient')
  assert.equal(classifyFailure(404, 120000), 'permanent')
  assert.deepEqual([1, 2, 3, 10].map(backoffMs), [3000, 6000, 12000, 60000])
})

test('a 500 while polling is retried; a 401 stops at once without the key in the message', async () => {
  let n = 0
  const flaky = async () => (++n === 1 ? json({ message: 'oops' }, 500) : json({ status: 'SUCCEEDED' }))
  assert.equal((await waitTask('image-to-3d', 'x', { key: KEY, fetchImpl: flaky, clock: clock() })).status, 'SUCCEEDED')
  const denied = async () => json({ message: 'Invalid API key' }, 401)
  await assert.rejects(waitTask('image-to-3d', 'x', { key: KEY, fetchImpl: denied, clock: clock() }), err => err.status === 401 && !err.message.includes(KEY))
})

test('make a character: two paid calls, rigged GLB, walk and run clips and a thumbnail saved', async () => {
  const d = tmp()
  const img = join(d, 'hero.png')
  writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const { fetchImpl, calls } = fakeMeshy()
  const steps = []
  const out = await makeCharacter({ image: img, role: 'Hero', outDir: join(d, 'models'), key: KEY, fetchImpl, clock: clock(), stamp: 't1', onStep: s => steps.push(s.stage) })
  assert.equal(out.file, 'meshy-hero-t1.glb')
  assert.deepEqual(out.clips, { walk: 'meshy-hero-t1-walk.glb', run: 'meshy-hero-t1-run.glb' })
  assert.equal(out.thumb, 'meshy-hero-t1.png')
  assert.equal(out.credits, 35)
  assert.deepEqual(out.tasks, { mesh: 'mesh-1', rig: 'rig-1' })
  assert.deepEqual(readdirSync(join(d, 'models')).sort(), ['meshy-hero-t1-run.glb', 'meshy-hero-t1-walk.glb', 'meshy-hero-t1.glb', 'meshy-hero-t1.png'])
  assert.equal(readFileSync(join(d, 'models', out.file)).subarray(0, 4).toString(), 'glTF')
  // exactly two spending calls, in order, and the picture went as a data URI
  const posts = calls.filter(c => c.method === 'POST')
  assert.deepEqual(posts.map(c => new URL(c.url).pathname), ['/openapi/v1/image-to-3d', '/openapi/v1/rigging'])
  assert.match(posts[0].body.image_url, /^data:image\/png;base64,/)
  assert.equal(posts[1].body.input_task_id, 'mesh-1')
  // the key goes to api.meshy.ai only, never to the asset host
  for (const c of calls) assert.equal(!!c.auth, new URL(c.url).hostname === 'api.meshy.ai')
  assert.ok(steps.includes('model') && steps.includes('rig') && steps.at(-1) === 'done')
})

test('a failed rig stops the run with Meshy\'s reason and saves nothing', async () => {
  const d = tmp()
  const img = join(d, 'hero.png')
  writeFileSync(img, 'x')
  const { fetchImpl } = fakeMeshy({ failRig: true })
  await assert.rejects(makeCharacter({ image: img, outDir: join(d, 'models'), key: KEY, fetchImpl, clock: clock() }), /pose not detected/)
  assert.deepEqual(readdirSync(join(d, 'models')), [])
})

test('no key: nothing is called', async () => {
  let called = false
  await assert.rejects(makeCharacter({ image: 'x.png', outDir: tmp(), key: '', fetchImpl: async () => { called = true } }), /no Meshy key/)
  assert.equal(called, false)
})

test('downloads only from Meshy\'s asset host, every redirect hop checked', async () => {
  assert.equal(assetAllowed('https://assets.meshy.ai/a.glb'), true)
  assert.equal(assetAllowed('http://assets.meshy.ai/a.glb'), false)
  assert.equal(assetAllowed('https://evil.example/a.glb'), false)
  const d = tmp()
  await assert.rejects(download('https://evil.example/a.glb', join(d, 'a.glb'), { fetchImpl: async () => new Response(GLB) }), /asset host/)
  const hop = async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/b.glb' } })
  await assert.rejects(download('https://assets.meshy.ai/a.glb', join(d, 'a.glb'), { fetchImpl: hop }), /asset host/)
  assert.equal(existsSync(join(d, 'a.glb')), false)
})

test('art-made picks join the cast: Meshy needs its file, a sprite needs a project picture', () => {
  const meshy = meshyPick({ role: 'hero', label: 'Hero', file: 'meshy-hero-t1.glb', clips: { walk: 'meshy-hero-t1-walk.glb', run: '../etc/passwd' } })
  const sprite = spritePick({ role: 'boss', label: 'Boss', art: '/img/2026-11-08T23-10-57-171Z/3.png' })
  const cast = cleanCast([meshy, sprite, { ...meshy, file: '../x.glb' }, { ...sprite, art: 'https://evil.example/x.png' }])
  assert.equal(cast.length, 2)
  assert.deepEqual(cast[0].clips, { walk: 'meshy-hero-t1-walk.glb' })
  assert.equal(cast[0].licence.creditRequired, false)
  assert.equal(spriteFile(cast[1]), 'boss.png')
  const p = castPrompt(cast)
  assert.match(p, /models\/meshy-hero-t1\.glb, made with Meshy/)
  assert.match(p, /walk models\/meshy-hero-t1-walk\.glb/)
  assert.match(p, /models\/boss\.png, the project's own art as a 2\.5D billboard/)
  assert.doesNotMatch(p, /primitive shapes\)/)
  const credits = castCredits(cast)
  assert.match(credits, /Hero: Made from the project's own art with Meshy\n/)
  assert.doesNotMatch(credits, / — \n/)
})

test('own-art characters go past the four found models: up to 16 in one cast', () => {
  const many = Array.from({ length: 18 }, (_, i) => meshyPick({ role: `r${i}`, label: `R${i}`, file: `meshy-r${i}-t.glb` }))
  const found = Array.from({ length: 6 }, (_, i) => ({ role: `f${i}`, name: 'x', creator: 'y', url: `https://sketchfab.com/3d-models/x-${i}`, source: 'sketchfab' }))
  const cast = cleanCast([...found, ...many])
  assert.equal(cast.filter(c => c.source === 'meshy').length, 16)
  assert.equal(cast.filter(c => c.source === 'sketchfab').length, 4)
})

// ---------- the Studio's job list (meshyJobs): one or several at once, the price checked first
const settle = () => new Promise(r => setImmediate(r))
function jobList({ key = KEY, parallel, fail = new Set() } = {}) {
  const d = tmp()
  for (const n of ['a', 'b', 'c', 'd']) writeFileSync(join(d, `${n}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const resolveArt = art => { const m = /^\/img\/run\/([a-d])\.png$/.exec(art); if (!m) throw Object.assign(new Error('pick a picture from the project'), { status: 400 }); return join(d, `${m[1]}.png`) }
  // each run waits for the test to let it finish, so the line can be seen
  const gates = new Map(), made = []
  const make = ({ role, image, key: k }) => {
    made.push({ role, image, key: k })
    return new Promise((ok, no) => gates.set(role, () => (fail.has(role) ? no(new Error('pose not detected')) : ok({ file: `meshy-${role}-t.glb`, clips: {}, thumb: `meshy-${role}-t.png`, credits: 35 }))))
  }
  let n = 0
  const q = meshyJobs({ outDir: join(d, 'models'), resolveArt, key: () => key, make, parallel, newId: () => `job${++n}` })
  return { q, made, finish: async role => { gates.get(role)(); for (let i = 0; i < 5; i++) await settle() } }
}
const items = roles => roles.map(r => ({ role: r, label: r.toUpperCase(), art: `/img/run/${r}.png` }))

test('make all: the total on the button is checked before anything starts', async () => {
  const { q, made } = jobList()
  assert.throws(() => q.batch({ items: items(['a', 'b', 'c']), credits: 35 }), err => err.status === 402 && /105/.test(err.message))
  assert.throws(() => q.batch({ items: items(['a', 'b', 'c']) }), err => err.status === 402)
  assert.throws(() => q.batch({ items: items(['a', 'b', 'c']), credits: 140 }), err => err.status === 402)
  await settle()
  assert.equal(q.jobs.size, 0)
  assert.equal(made.length, 0)
})

test('make all: one bad item refuses the whole ask, nothing spent', async () => {
  const { q, made } = jobList()
  assert.throws(() => q.batch({ items: [...items(['a', 'b']), { role: 'c', art: 'https://evil.example/x.png' }], credits: 105 }), err => err.status === 400)
  assert.throws(() => q.batch({ items: [...items(['a']), ...items(['a'])], credits: 70 }), /asked twice/)
  assert.throws(() => q.batch({ items: [], credits: 0 }), /nothing to make/)
  assert.throws(() => q.batch({ items: Array.from({ length: BATCH_MAX + 1 }, (_, i) => ({ role: `r${i}`, art: '/img/run/a.png' })), credits: 35 * (BATCH_MAX + 1) }), /at most/)
  await settle()
  assert.equal(q.jobs.size, 0)
  assert.equal(made.length, 0)
})

test('no key: neither one nor several start', async () => {
  const { q, made } = jobList({ key: '' })
  assert.throws(() => q.start({ role: 'a', art: '/img/run/a.png', credits: 35 }), err => err.status === 409)
  assert.throws(() => q.batch({ items: items(['a', 'b']), credits: 70 }), err => err.status === 409)
  await settle()
  assert.equal(made.length, 0)
})

test('make all: jobs run in parallel up to the limit, the rest wait in line, each with its own worker', async () => {
  const { q, made, finish } = jobList({ parallel: 2 })
  const out = q.batch({ items: items(['a', 'b', 'c', 'd']), credits: 140 })
  assert.equal(out.credits, 140)
  assert.equal(out.spent, 140)
  assert.deepEqual(out.jobs.map(j => j.stage), ['model', 'model', 'queued', 'queued'])
  await settle()
  assert.deepEqual(made.map(m => m.role), ['a', 'b'])
  assert.equal(new Set(out.jobs.map(j => j.worker)).size, 4)
  assert.ok(made.every(m => m.key === KEY))
  // the key is never on a job the browser sees
  assert.ok(!JSON.stringify([...q.jobs.values()]).includes(KEY))
  await finish('a')
  assert.equal(q.get('job1').state, 'done')
  assert.equal(q.get('job1').pick.thumbSrc, '/models/meshy-a-t.png')
  assert.equal(q.get('job3').stage, 'model')
  assert.deepEqual(made.map(m => m.role), ['a', 'b', 'c'])
  await finish('b'); await finish('c'); await finish('d')
  assert.deepEqual([...q.jobs.values()].map(j => j.state), ['done', 'done', 'done', 'done'])
})

test('a role already being made joins its run: the batch never spends more than was clicked', async () => {
  const { q, made, finish } = jobList({ fail: new Set(['b']) })
  const one = q.start({ role: 'a', label: 'A', art: '/img/run/a.png', credits: 35 })
  assert.throws(() => q.start({ role: 'b', art: '/img/run/b.png', credits: 30 }), err => err.status === 402)
  const out = q.batch({ items: items(['a', 'b']), credits: 70 })
  assert.equal(out.jobs[0].id, one.id)
  assert.equal(out.spent, 35)
  await settle()
  assert.deepEqual(made.map(m => m.role), ['a', 'b'])
  await finish('b')
  assert.equal(out.jobs[1].state, 'failed')
  assert.match(out.jobs[1].error, /pose not detected/)
  await finish('a')
  assert.equal(one.state, 'done')
})

test('the full run through the job list on a mocked Meshy: two paid calls per character', async () => {
  const d = tmp()
  writeFileSync(join(d, 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const { fetchImpl, calls } = fakeMeshy()
  const q = meshyJobs({ outDir: join(d, 'models'), resolveArt: () => join(d, 'hero.png'), key: () => KEY, fetchImpl, clock: clock() })
  const job = q.start({ role: 'hero', art: '/img/run/hero.png', credits: 35 })
  for (let i = 0; i < 200 && job.state === 'running'; i++) await settle()
  assert.equal(job.state, 'done', job.error || '')
  assert.equal(calls.filter(c => c.method === 'POST').length, 2)
  assert.ok(existsSync(join(d, 'models', job.pick.file)))
})
