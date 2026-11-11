// Make with Meshy (spec 20), against a mocked Meshy API: no network, no credits.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { meshyCost, meshyKey, imageTo3dBody, rigBody, rigOutputs, classifyFailure, backoffMs, waitTask, download, makeCharacter, assetAllowed, meshyPick, spritePick, STYLE } from '../engine/meshy.mjs'
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
