// Remix (spec 21): a plan saved as a template, and a new plan made from one, priced for the new creator.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { planFromAnswers, planPrice, editCard, card } from '../engine/plan.mjs'
import { planTemplate, remixPlan, templateStore } from '../engine/template.mjs'
import { planRoutes } from '../server/plans.mjs'

const ARES = join(dirname(fileURLToPath(import.meta.url)), '..', 'games', 'ares', 'plan.json')

test('the built-in ARES template remixes into a plan at the gate: 324 credits, 8 runs, its cards kept', () => {
  const t = JSON.parse(readFileSync(ARES, 'utf8'))
  const p = remixPlan(t)
  assert.equal(p.from, 't-ares')
  assert.equal(p.title, 'ARES')
  assert.equal(p.gate.locked, false)
  assert.match(card(p, 'world').body.setting, /colosseum/)
  const pr = planPrice(p)
  assert.equal(pr.credits, 324)
  assert.equal(pr.runs, 8)
})

test('a template keeps the cards, the picked cells and the made characters, not the build state', () => {
  const p = planFromAnswers({ idea: 'Nova, a 3D test', answers: { size: '2' } })
  editCard(p, 'story', { premise: 'A changed premise' })
  p.sheets = [{ id: 's-1', kind: 'cast', grid: [5, 4], picks: [3], notes: { 3: 'heels' }, file: 's-1.webp', state: 'done' }, { id: 's-2', kind: 'weapons', grid: [5, 4], picks: [], file: 's-2.webp', state: 'done' }]
  p.build.characters = [{ name: 'Hero 1', state: 'done', model: { state: 'done', file: 'meshy-hero-1-t.glb' }, front: { state: 'done', file: 'v-1.webp' } }, { name: 'Hero 2', state: 'failed' }]
  p.gate = { locked: true, phase: 'all' }
  const t = planTemplate(p, { name: 'Nova kit' })
  assert.match(t.id, /^t-/)
  assert.equal(t.name, 'Nova kit')
  assert.equal(t.sheets.length, 1)
  assert.deepEqual(t.parts, [{ kind: 'character', name: 'Hero 1', file: 'meshy-hero-1-t.glb', views: ['v-1.webp'] }])
  assert.equal(t.gate, undefined)
  // the remix: a carried character whose file is present is not charged again
  const r = remixPlan(t, { has: () => true })
  assert.equal(card(r, 'story').body.premise, 'A changed premise')
  assert.equal(planPrice(r).parts[0].n, 1)
  assert.equal(planPrice(remixPlan(t)).parts[0].n, 2)
  assert.throws(() => remixPlan({}), e => e.status === 400)
})

test('routes: save as a template, list it beside ARES, remix it with its files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'))
  const handle = planRoutes({ dataDir: dir, builtInTemplates: [ARES] })
  const srv = createServer((req, res) => { if (!handle(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const post = (path, body) => fetch(base + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(async r => ({ status: r.status, data: await r.json() }))
  try {
    const { data: plan } = await post('/api/plans', { idea: 'Nova, a 3D test', answers: { size: '2' } })
    // a made character and a picked sheet, as a finished build would leave them
    const pdir = join(dir, 'plans', plan.id)
    mkdirSync(join(pdir, 'models'), { recursive: true })
    writeFileSync(join(pdir, 's-1.webp'), 'pic')
    writeFileSync(join(pdir, 'models', 'meshy-hero-1-t.glb'), 'glb')
    const f = join(dir, 'plans', `${plan.id}.json`)
    const saved = JSON.parse(readFileSync(f, 'utf8'))
    saved.sheets = [{ id: 's-1', kind: 'cast', grid: [5, 4], picks: [2], notes: {}, file: 's-1.webp', state: 'done' }]
    saved.build.characters = [{ name: 'Hero 1', state: 'done', model: { state: 'done', file: 'meshy-hero-1-t.glb' } }]
    writeFileSync(f, JSON.stringify(saved))
    const t = (await post(`/api/plans/${plan.id}/template`, { name: 'Nova kit' })).data.template
    assert.equal(t.parts, 1)
    const list = await fetch(`${base}/api/templates`).then(r => r.json())
    assert.deepEqual(list.templates.map(x => x.name), ['ARES', 'Nova kit'])
    assert.equal(list.templates[0].price, 324)
    const r = await post(`/api/templates/${t.id}/remix`)
    assert.equal(r.status, 200)
    assert.notEqual(r.data.id, plan.id)
    assert.equal(r.data.from, t.id)
    assert.equal(r.data.price.parts[0].n, 1)
    assert.ok(existsSync(join(dir, 'plans', r.data.id, 'models', 'meshy-hero-1-t.glb')))
    assert.equal((await fetch(base + r.data.sheets[0].src)).status, 200)
    assert.equal((await post('/api/templates/t-ares/remix')).data.price.credits, 324)
    assert.equal((await post('/api/templates/t-nope/remix')).status, 404)
    assert.equal((await post('/api/templates/T-BAD/remix')).status, 404)
  } finally { srv.close() }
})
