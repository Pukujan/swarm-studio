// The Plan board's pictures (spec 21): sheets, mocks, the style lock, backdrops, close-up art.
// A fake painter stands in for imagegen.py: no network, no image runs, no credits.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { planFromAnswers, setSystems, planPrice, lockPlan, pickCell, CLOSEUP_RULE } from '../engine/plan.mjs'
import { sheetPrompt, addSheet, addMocks, lockStyle, addBackdrops, addCloseups, stageNames, entryFor, settleStale, artBrief, SHOTS } from '../engine/planart.mjs'
import { planRoutes } from '../server/plans.mjs'

const ares = () => setSystems(planFromAnswers({ idea: 'ARES, a girls-only action RPG', answers: { cast: 'Girls only', size: '6', look: 'Anime cel-shaded', enemies: 'Minions, elites, bosses' } }), { logins: true, payments: true, leaderboard: true, gacha: true, pilot: true })

test('a sketch sheet is one medium picture of a numbered 5 × 4 grid; drawn again it keeps its picks and notes', () => {
  const p = ares()
  const [job] = addSheet(p, 'cast')
  assert.equal(job.quality, 'medium')
  assert.match(job.prompt, /5 × 4 grid of 20 numbered options/)
  assert.match(job.prompt, /Heroine 1/)
  const s = p.sheets[0]
  assert.throws(() => addSheet(p, 'cast'), e => e.status === 409)
  s.state = 'done'
  pickCell(p, { sheet: s.id, cell: 2, note: 'heels' })
  addSheet(p, 'cast')
  assert.equal(p.sheets.length, 1)
  assert.deepEqual(p.sheets[0].picks, [2])
  assert.match(p.sheets[0].prompt, /option 3 \(heels\)/)
  assert.throws(() => sheetPrompt(p, 'nope'), e => e.status === 400)
})

test('mocks: five in-game frames with the picked sheets as references', () => {
  const p = ares()
  addSheet(p, 'cast')
  Object.assign(p.sheets[0], { state: 'done', file: 's.png', picks: [1] })
  const jobs = addMocks(p, '/d')
  assert.deepEqual(p.mocks.map(m => m.shot), SHOTS.map(s => s[0]))
  assert.equal(jobs.length, 5)
  assert.deepEqual(jobs[0].refs, ['/d/s.png'])
  assert.match(jobs.find(j => j.id === p.mocks.find(m => m.shot === 'ult').id).prompt, /cut-in/)
})

test('the style lock takes the picks; backdrops wait for it and are 2:1 skies and 4:1 strips per stage', () => {
  const p = ares()
  assert.throws(() => addBackdrops(p), e => e.status === 409)
  addSheet(p, 'cast'); Object.assign(p.sheets[0], { state: 'done', src: '/plans/x/s.png' })
  pickCell(p, { sheet: p.sheets[0].id, cell: 4, note: 'red scarf' })
  lockStyle(p)
  assert.equal(p.style.locked, true)
  assert.match(p.style.picks, /cast 5 \(red scarf\)/)
  assert.deepEqual(p.style.refs, ['/plans/x/s.png'])
  const jobs = addBackdrops(p)
  assert.equal(stageNames(p).length, 3)
  assert.equal(jobs.length, 9)
  assert.deepEqual([...new Set(jobs.map(j => j.crop))], ['2:1', '4:1'])
  assert.ok(jobs.every(j => j.quality === 'high' && /red scarf/.test(j.prompt)))
  assert.match(jobs[0].prompt, /equirectangular/)
  assert.throws(() => addBackdrops(p), e => e.status === 409)
  p.backdrops.forEach(b => { b.state = 'done' })
  assert.equal(addBackdrops(p, { stage: 1 }).length, 3)
  assert.throws(() => (p.backdrops.forEach(b => { b.state = 'done' }), addBackdrops(p, { stage: 7 })), e => e.status === 400)
})

test('close-up art waits for the lock; test one first paints one character', () => {
  const p = ares()
  assert.throws(() => addCloseups(p, '/d'), e => e.status === 409)
  lockPlan(p, { credits: planPrice(p).first.credits, testFirst: true })
  const jobs = addCloseups(p, '/d')
  assert.equal(jobs.length, 2)
  assert.deepEqual(jobs.map(j => [j.quality, j.crop]), [['high', '16:9'], ['high', '']])
  assert.match(jobs[0].prompt, /cut-in.*right third empty/)
  const c = p.build.characters[0]
  assert.equal(c.slug, 'heroine-1')
  assert.equal(entryFor(p, 'closeups', jobs[1].id), c.portrait)
})

test('pictures count down on the gate as they land; credits do not change', () => {
  const p = ares()
  const before = planPrice(p)
  assert.deepEqual(before.pics, { sheets: 2, mocks: 5, backdrops: 9, closeups: 12, turnarounds: 12 })
  addSheet(p, 'cast'); p.sheets[0].state = 'done'
  addMocks(p, '/d'); p.mocks.forEach(m => { m.state = 'done' })
  const after = planPrice(p)
  assert.equal(after.pics.sheets, 1)
  assert.equal(after.pics.mocks, 0)
  assert.equal(after.credits, before.credits)
})

test('a picture left painting by a stopped server shows as failed', () => {
  const p = ares()
  addSheet(p, 'cast')
  settleStale(p, Date.now() + 16 * 60 * 1000)
  assert.equal(p.sheets[0].state, 'failed')
})

test('the build brief carries the close-up rule and the painted files', () => {
  const p = ares()
  lockPlan(p, { credits: planPrice(p).credits })
  addCloseups(p, '/d', { name: 'Heroine 2' })
  p.build.characters[0].cutin.state = 'done'
  lockStyle(p); addBackdrops(p, { stage: 0 }); p.backdrops[0].state = 'done'
  const b = artBrief(p)
  assert.ok(b.startsWith(CLOSEUP_RULE))
  assert.match(b, /public\/art\/heroine-2-cutin\.png/)
  assert.doesNotMatch(b, /heroine-2-portrait/)
  assert.match(b, /backdrops\/1-1\.png \(equirect/)
})

test('routes: pictures paint in the background and land in the plan; no image login is a 503', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'planart-'))
  const calls = []
  const paint = async job => {
    calls.push(job)
    const f = join(dir, `out-${calls.length}.png`)
    writeFileSync(f, 'png')
    return { ok: true, path: f, model: 'fake' }
  }
  let ready = true
  paint.ready = async () => ready
  const landed = []
  const handle = planRoutes({ dataDir: dir, paint, onPicture: (id, job, e) => landed.push(e) })
  const srv = createServer((req, res) => { if (!handle(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const post = (path, body) => fetch(base + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(async r => ({ status: r.status, data: await r.json() }))
  try {
    const { data: plan } = await post('/api/plans', { idea: 'ARES, a test', answers: { size: '2' } })
    const r = await post(`/api/plans/${plan.id}/sheet`, { kind: 'cast' })
    assert.equal(r.status, 200)
    assert.equal(r.data.sheets[0].state, 'painting')
    await new Promise(r => setTimeout(r, 50))
    const got = await fetch(`${base}/api/plans/${plan.id}`).then(r => r.json())
    assert.equal(got.sheets[0].state, 'done')
    assert.equal(calls[0].quality, 'medium')
    assert.ok(existsSync(join(dir, 'plans', plan.id, got.sheets[0].file)))
    const pic = await fetch(base + got.sheets[0].src)
    assert.equal(pic.status, 200)
    assert.equal((await post(`/api/plans/${plan.id}/backdrops`)).status, 409)
    assert.equal((await post(`/api/plans/${plan.id}/style`, { locked: true })).data.style.locked, true)
    assert.equal((await post(`/api/plans/${plan.id}/backdrops`, { stage: 0 })).status, 200)
    ready = false
    assert.equal((await post(`/api/plans/${plan.id}/mocks`)).status, 503)
    await new Promise(r => setTimeout(r, 50))
    const end = await fetch(`${base}/api/plans/${plan.id}`).then(r => r.json())
    assert.ok(end.backdrops.every(b => b.state === 'done'))
    assert.equal(landed.length, 4)
  } finally { srv.close() }
})
