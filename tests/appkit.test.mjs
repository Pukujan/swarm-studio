import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { draftKit, cleanKit, editKit, askConnect, connectsOf, readKit, kitLeft, kitDone, kitWords, kitPlan, kitProposal, kitChecks, kitMessages, haveOf } from '../engine/appkit.mjs'
import { planBrief } from '../engine/advisor.mjs'

const OWNER = 'full stack saas app for ticket booking with email sign-in and an admin for booking orders, members and operations'

test('the owner\'s brief drafts members and an admin, sign-up to checkout, and the admin screens', () => {
  const k = draftKit(OWNER)
  assert.deepEqual(k.users.map(u => u.name), ['Member', 'Admin'])
  const names = k.screens.map(s => s.name)
  for (const n of ['Sign up', 'Sign in', 'Home', 'Events', 'Checkout', 'My bookings', 'Admin', 'Bookings', 'Members', 'Operations']) assert.ok(names.includes(n), n)
  assert.deepEqual(k.screens.find(s => s.id === 'sign-up').next, ['home'])
  assert.deepEqual(k.screens.find(s => s.id === 'admin').next, ['bookings', 'members', 'operations'])
  assert.equal(k.screens.find(s => s.id === 'members').path, '/admin/members')
  assert.ok(k.data.some(d => d.name === 'Booking' && d.fields.includes('seats')))
  // "email sign-in" is chosen; payments and email are left for the person
  assert.equal(k.connects.find(c => c.kind === 'signin').choice, 'email')
  assert.deepEqual(kitLeft(k), ['payments', 'email'])
  assert.equal(kitDone(k), false)
})

test('"i need an air booking api or something?" gets an answer and a choice, not a build', () => {
  const k = draftKit(OWNER)
  const a = askConnect('i need an air booking api or something?', k)
  assert.match(a.say, /Duffel or Amadeus/)
  assert.deepEqual(a.options.map(o => o.id), ['api-flights:duffel', 'api-flights:amadeus', 'api-flights:mock'])
  const c = a.kit.connects.find(x => x.id === 'api-flights')
  assert.equal(c.choice, null)
  assert.ok(kitLeft(a.kit).includes('api-flights'))
  // asking again does not add it twice
  assert.equal(askConnect('which flights api?', a.kit).kit.connects.filter(x => x.id === 'api-flights').length, 1)
  assert.equal(askConnect('make the buttons bigger', k), null)
})

test('a connection is ready, needs a key, or is not chosen', () => {
  let k = draftKit(OWNER)
  k = editKit(k, { op: 'set', what: 'connect', id: 'payments', value: { choice: 'stripe' } })
  k = editKit(k, { op: 'set', what: 'connect', id: 'email', value: { choice: 'outbox' } })
  const without = Object.fromEntries(connectsOf(k, []).map(c => [c.id, c.state]))
  assert.deepEqual(without, { signin: 'ready', payments: 'key', email: 'ready' })
  assert.deepEqual(connectsOf(k, []).find(c => c.id === 'payments').needs, ['STRIPE_SECRET_KEY'])
  assert.equal(connectsOf(k, ['STRIPE_SECRET_KEY']).find(c => c.id === 'payments').state, 'ready')
  assert.equal(kitDone(k), true)
  // an option that does not exist is no choice
  assert.equal(editKit(k, { op: 'set', what: 'connect', id: 'email', value: { choice: 'carrier-pigeon' } }).connects.find(c => c.id === 'email').choice, null)
})

test('names only: haveOf lists env names, a live Stripe key does not count', () => {
  assert.deepEqual(haveOf({ STRIPE_SECRET_KEY: 'sk_test_x', RESEND_API_KEY: 're_x', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }), ['STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'supabase'])
  assert.deepEqual(haveOf({ STRIPE_SECRET_KEY: 'sk_live_x' }), [])
  assert.deepEqual(haveOf({}, { supabase: true }), ['supabase'])
})

test('screens are added, removed, moved and renamed on the board, and the arrows follow', () => {
  let k = draftKit(OWNER)
  k = editKit(k, { op: 'add', what: 'screen', after: 'event', value: { name: 'Seat map', purpose: 'pick seats' } })
  assert.ok(k.screens.find(s => s.id === 'event').next.includes('seat-map'))
  assert.equal(k.screens[k.screens.findIndex(s => s.id === 'event') + 1].id, 'seat-map')
  k = editKit(k, { op: 'set', what: 'screen', id: 'seat-map', value: { name: 'Seats' } })
  assert.ok(k.screens.find(s => s.id === 'event').next.includes('seats'))
  k = editKit(k, { op: 'remove', what: 'screen', id: 'seats' })
  assert.ok(!k.screens.find(s => s.id === 'event').next.includes('seats'))
  const first = k.screens[0].id
  k = editKit(k, { op: 'move', what: 'screen', id: first, by: 1 })
  assert.equal(k.screens[1].id, first)
  k = editKit(k, { op: 'add', what: 'screen', value: { name: 'Home' } })
  assert.ok(k.screens.some(s => s.name === 'Home 2'))
  k = editKit(k, { op: 'set', what: 'data', id: 'event', value: { fields: 'name, date, venue' } })
  assert.deepEqual(k.data.find(d => d.id === 'event').fields, ['name', 'date', 'venue'])
  assert.throws(() => editKit(k, { op: 'remove', what: 'screen', id: 'nope' }), /no such part/)
  k = editKit(k, { op: 'start', value: 'signup' })
  assert.equal(k.start, 'signup')
})

test('a planner reply is cleaned, and never undoes what the person chose', () => {
  let before = editKit(draftKit(OWNER), { op: 'set', what: 'connect', id: 'payments', value: { choice: 'demo' } })
  const reply = `Here it is: ${JSON.stringify({
    title: 'Gatehouse', say: 'Payments and email are open.',
    users: [{ name: 'Member', does: 'books' }],
    screens: [{ name: 'Home', path: '/', next: ['Events'] }, { name: 'Events', path: '/events', next: ['Nowhere'] }, { name: '' }],
    data: [{ name: 'Booking', fields: 'member, seats' }],
    connects: [{ kind: 'payments', choice: null }, { kind: 'api', name: 'Flights' }, { kind: 'teleport' }]
  })}`
  const out = readKit(reply, before)
  assert.equal(out.say, 'Payments and email are open.')
  assert.deepEqual(out.kit.screens.map(s => [s.id, s.next]), [['home', ['events']], ['events', []]])
  assert.equal(out.kit.connects.find(c => c.id === 'payments').choice, 'demo')
  assert.ok(out.kit.connects.some(c => c.id === 'api-flights'))
  // the person's sign-in choice survives a reply that dropped it
  assert.equal(out.kit.connects.find(c => c.id === 'signin').choice, 'email')
  assert.equal(readKit('not json', before), null)
  const msgs = kitMessages(OWNER, [{ who: 'person', text: 'add a waitlist' }], before)
  assert.equal(msgs[0].role, 'system')
  assert.equal(msgs.at(-1).content, 'add a waitlist')
})

test('the locked kit becomes the app engine\'s plan: screens, flow, connections, where to start', () => {
  let k = editKit(draftKit(OWNER), { op: 'set', what: 'connect', id: 'payments', value: { choice: 'stripe' } })
  k = editKit(k, { op: 'set', what: 'connect', id: 'email', value: { choice: 'outbox' } })
  k = editKit(k, { op: 'start', value: 'signup' })
  const brief = planBrief(kitPlan(k, []))
  assert.match(brief, /locked this app plan/)
  assert.match(brief, /- Members at \/admin\/members \(for Admin\)/)
  assert.match(brief, /- Sign up → Home/)
  assert.match(brief, /Payments \(Stripe\): Payments through Stripe Checkout in test mode/)
  assert.match(brief, /Build the sign-up flow first/)
  // an advisor plan (no kit) reads as before
  assert.match(planBrief({ screens: [{ name: 'Inbox', path: '/admin/inbox', what: 'x' }] }), /approved this app plan/)
  const words = kitWords(k, [])
  assert.match(words, /Payments: Stripe \(needs a key\)/)
  assert.match(words, /Start with: the sign-up flow/)
  const p = kitProposal(k)
  assert.equal(p.credits, 0)
  assert.equal(p.items[0].what, 'The sign-up flow')
})

test('the reviewer checks the built app against the locked kit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'appkit-'))
  try {
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'x', 'i.js'), '"/admin/members"')
    writeFileSync(join(dir, 'src', 'App.tsx'), `const r = ["/sign-up", "/events"]; // signIn\ntype Booking = {}; const outbox = []`)
    let k = cleanKit({ screens: [{ name: 'Home', path: '/' }, { name: 'Sign up', path: '/sign-up' }, { name: 'Events', path: '/events' }, { name: 'Members', path: '/admin/members' }], data: [{ name: 'Booking', fields: ['seats'] }, { name: 'Venue', fields: ['name'] }], connects: [{ kind: 'signin', choice: 'email' }, { kind: 'email', choice: 'outbox' }, { kind: 'payments', choice: 'stripe' }, { kind: 'storage' }] })
    const r = Object.fromEntries(kitChecks(k, dir).map(c => [c.part, c.ok]))
    assert.deepEqual(r, { 'screen:home': true, 'screen:sign-up': true, 'screen:events': true, 'screen:members': false, 'data:booking': true, 'data:venue': false, 'connect:signin': true, 'connect:email': true, 'connect:payments': false, 'connect:storage': false })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('anything that comes in is bounded', () => {
  const k = cleanKit({ screens: Array.from({ length: 40 }, (_, i) => ({ name: `S${i}`.repeat(30) })), users: 'nope', data: [{ name: 'X', fields: Array(30).fill('f') }], start: 'everything' })
  assert.equal(k.screens.length, 16)
  assert.ok(k.screens.every(s => s.name.length <= 40))
  assert.deepEqual(k.users, [])
  assert.deepEqual(k.data[0].fields, ['f'])
  assert.equal(k.start, 'screens')
})
