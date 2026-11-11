import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromVroid, fromSketchfab, vroidLicence, blockHit, searchCast, castRoles, castQuery, needsCast, castPrompt } from '../engine/cast.mjs'

const fx = f => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cast', f), 'utf8'))
const vroid = fx('vroid.json').data
const sketch = fx('sketchfab.json').results
const v = id => vroid.find(m => m.id === id)

test('an allowed VRM 1.0 model passes with its credit line', () => {
  const c = fromVroid(v('101'))
  assert.equal(c.source, 'vroid')
  assert.equal(c.vrm, '1.0')
  assert.equal(c.licence.ok, true)
  assert.equal(c.licence.restyle, true)
  assert.equal(c.licence.creditRequired, true)
  assert.equal(c.licence.credit, '“Night Courier” by Rin Aoki (VRoid Hub, VRM 1.0 licence)')
  assert.equal(c.url, 'https://hub.vroid.com/characters/c101/models/101')
  assert.equal(c.preview, 'https://vroid-hub.pximg.net/101.png')
  assert.equal(c.triangles, 42000)
})

test('violence forbidden: dropped for a combat game, kept for a calm one', () => {
  assert.match(fromVroid(v('102')).drop, /no violence/)
  const calm = fromVroid(v('102'), { violent: false })
  assert.equal(calm.licence.ok, true)
  assert.equal(calm.licence.restyle, false) // modification prohibited: keeps its own look
  // the hub's own licence narrows a VRM that allows violence
  assert.match(fromVroid(v('107')).drop, /no violence/)
})

test('author-only models are dropped (VRM 0.x)', () => {
  assert.match(fromVroid(v('103')).drop, /only its author/)
  assert.deepEqual(vroidLicence(v('103')).why, ['only its author may use it'])
})

test('IP blocklist hits drop fan models, adult and child-looking models', () => {
  assert.equal(fromVroid(v('104')).drop, 'ip')
  assert.equal(fromVroid(v('106')).drop, 'adult') // 水着, swimsuit
  assert.equal(fromVroid(v('108')).drop, 'adult') // R18 flag
  assert.equal(fromSketchfab(sketch[1]).drop, 'ip') // Kill La Kill
  assert.equal(fromSketchfab(sketch[2]).drop, 'young') // "10 Year Old"
  assert.equal(blockHit('Hatsune Miku techwear').why, 'ip')
  assert.equal(blockHit('power armor soldier'), null)
  assert.equal(blockHit('Gothic Lolita dress'), null) // a fashion style, not an age
})

test('VRM 0.x no-derivatives licence keeps the model but not the restyle', () => {
  const c = fromVroid(v('105'))
  assert.equal(c.licence.ok, true)
  assert.equal(c.licence.restyle, false)
})

test('Sketchfab: CC BY and CC0 pass, NonCommercial does not; the 720 px thumbnail is the preview', () => {
  const t = fromSketchfab(sketch[0])
  assert.equal(t.licence.credit, '“Taila | Original work” by Partaevil (Sketchfab, CC BY 4.0)')
  assert.equal(t.preview, 'https://media.sketchfab.com/t/720.jpg')
  assert.equal(fromSketchfab(sketch[3]).licence.creditRequired, false)
  assert.match(fromSketchfab(sketch[4]).drop, /not CC BY or CC0/)
})

test('searchCast ranks, numbers and counts drops without live calls', async () => {
  const urls = []
  const fetchImpl = async (url, opts) => {
    urls.push(String(url))
    if (String(url).startsWith('https://hub.vroid.com/')) {
      assert.equal(opts.headers['X-Api-Version'], '11')
      return Response.json({ data: vroid })
    }
    if (String(url).startsWith('https://api.sketchfab.com/')) return Response.json({ results: /license=by/.test(url) ? sketch : [] })
    throw new Error(`unexpected ${url}`)
  }
  const r = await searchCast({ look: 'a courier in black techwear' }, { fetchImpl })
  assert.ok(urls.some(u => /is_downloadable=1/.test(u) && /keyword=techwear/.test(u)))
  assert.ok(urls.every(u => !/skowt/.test(u)))
  assert.ok(urls.some(u => /rigged=true/.test(u) && /sort_by=-likeCount/.test(u) && /license=cc0/.test(u)))
  assert.deepEqual(r.models.map(m => m.n), r.models.map((_, i) => i + 1))
  // techwear matches lead; the 200k-triangle model sinks below the rest
  assert.deepEqual(r.models.map(m => m.name), ['Night Courier', 'Taila | Original work', 'Ghost Runner', 'Neon Medic'])
  assert.equal(r.dropped.ip, 2)
  assert.deepEqual(r.errors, [])
})

test('one source down still returns the other', async () => {
  const r = await searchCast({ query: 'gothic' }, { fetchImpl: async url => (String(url).includes('vroid') ? new Response('', { status: 503 }) : Response.json({ results: sketch })) })
  assert.ok(r.models.length > 0)
  assert.match(r.errors[0], /VRoid Hub: HTTP 503/)
})

test('roles, queries and the build prompt', () => {
  const spec = { engine: 'three.js', hero: 'Senna, a young woman in gothic techwear', boss: { name: 'The Oni', look: 'cyborg oni' }, characters: [{ name: 'Abner', role: 'keeper', look: 'old man' }] }
  assert.deepEqual(castRoles(spec).map(r => r.id), ['hero', 'c-abner', 'boss'])
  assert.equal(needsCast(spec), true)
  assert.equal(needsCast({ engine: 'Phaser 3', hero: 'x' }), false)
  assert.deepEqual(castQuery(castRoles(spec)[0]).style, ['techwear', 'gothic'])
  assert.equal(castQuery(castRoles(spec)[1]).sketchfab.at(-1), 'anime boy')
  const p = castPrompt([{ label: 'Hero', ...fromVroid(v('101')), file: 'night-courier.vrm' }])
  assert.match(p, /godot-vrm/)
  assert.match(p, /never rebuild a character from primitive shapes/)
  assert.match(p, /“Night Courier” by Rin Aoki/)
})

test('picks are trusted only from the two sources, and reach the build prompt and credits', async () => {
  const { cleanCast, castCredits } = await import('../engine/cast.mjs')
  const { gamePrompt } = await import('../engine/game.mjs')
  const good = { role: 'hero', label: 'Hero', ...fromSketchfab(sketch[0]) }
  const bad = [{ ...good, url: 'https://skowt.cc/rip/1' }, { ...good, url: 'https://evil.example/x' }, { ...good, url: 'https://sketchfab.com/x', file: '../../etc/passwd' }]
  assert.equal(cleanCast([good, ...bad.slice(0, 2)]).length, 1)
  assert.equal(cleanCast([bad[2]])[0].file, undefined)
  assert.match(castCredits([good]), /Hero: “Taila \| Original work” by Partaevil \(Sketchfab, CC BY 4.0\)/)
  const p = gamePrompt({ title: 'T', loop: 'l', engine: 'three.js', cast: [good] })
  assert.match(p, /never rebuild a character from primitive shapes/)
  assert.doesNotMatch(p, /group primitive geometries/)
})
