// The Deck and App kits are handed the project as the Studio scaffold has it ({ id, name, … }, web/scaffold.js),
// and must ask for their saved state at its id, never at "[object Object]" (#397)
import { test } from 'node:test'
import assert from 'node:assert/strict'

// the kits add their style sheet once; here it is already there
globalThis.document ??= { getElementById: () => true }
const { deckKit } = await import('../web/kit-deck.js')
const { appKit } = await import('../web/kit-app.js')

// a server that knows one saved deck and one saved app kit, at p-deck and p-app
function sw(paths) {
  const saved = { '/api/kit/deck/p-deck': { deck: { title: 'Pitch', slides: [], look: 'plain' }, looks: ['plain'] }, '/api/kit/app/p-app': { kit: { title: 'Tracker' } }, '/api/kit/deck/looks': { looks: [] } }
  return { base: '', api: async path => { paths.push(path); return { ok: !!saved[path] || path === '/api/kit/app/spec', status: saved[path] ? 200 : 404, json: async () => saved[path] || {} } } }
}

test('the Deck kit loads its saved deck at the project id', async () => {
  const paths = []
  const st = await deckKit.prepare({ project: { id: 'p-deck', name: 'Pitch' }, studio: {}, sw: sw(paths) })
  assert.ok(paths.includes('/api/kit/deck/p-deck'), paths.join(' '))
  assert.ok(!paths.some(p => p.includes('object')), paths.join(' '))
  assert.equal(st.deck.title, 'Pitch')
})

test('the App kit loads its saved kit at the project id; an id passed as it is still works', async () => {
  const paths = []
  const st = await appKit.prepare({ project: { id: 'p-app', name: 'Tracker' }, studio: {}, sw: sw(paths) })
  assert.ok(paths.includes('/api/kit/app/p-app'), paths.join(' '))
  assert.equal(st.kit.title, 'Tracker')
  const again = []
  await deckKit.prepare({ project: 'p-deck', studio: {}, sw: sw(again) })
  assert.ok(!again.some(p => p.includes('object')))
})
