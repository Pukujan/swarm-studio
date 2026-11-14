// The app build wall's Map (spec 44, engine/appmap.mjs): either plan shape becomes the same kind of Mermaid text,
// the same text for the same plan, with the person's words never breaking it
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planMap } from '../engine/appmap.mjs'

const advisor = {
  summary: 'A climbing gym\'s members and classes',
  roles: [{ name: 'member', can: 'book' }],
  data: [{ name: 'Members', fields: ['name', 'email'] }, { name: 'Classes', fields: ['title', 'when'] }, { name: 'Bookings', fields: ['member', 'class_id', 'paid'] }],
  screens: [{ name: 'Home', path: '/', for: 'everyone', what: 'the timetable' }, { name: 'Book a class', path: '/book' }, { name: 'Admin', path: '/admin' }]
}
// kitPlan's shape: the advisor's plus the flow
const kit = { ...advisor, flow: ['Home → Book a class', 'Book a class -> Admin', 'Home → Nowhere'], kit: true }

test('a kit plan is a flowchart of its screens with the ways between them', () => {
  const m = planMap(kit)
  assert.match(m.flow, /^flowchart LR\n/)
  assert.match(m.flow, /s_home\["Home<br\/><small>\/<\/small>"\]/)
  assert.match(m.flow, /s_book_a_class\["Book a class<br\/><small>\/book<\/small>"\]/)
  assert.match(m.flow, /s_home --> s_book_a_class/)
  assert.match(m.flow, /s_book_a_class --> s_admin/)
  assert.doesNotMatch(m.flow, /Nowhere/, 'a way to a screen the plan does not have is left out')
  assert.deepEqual(m.screens.map(s => s.id), ['s_home', 's_book_a_class', 's_admin'])
  assert.equal(m.note, undefined)
})

test('the advisor\'s plan has no ways between screens, and the Map says so', () => {
  const m = planMap(advisor)
  assert.doesNotMatch(m.flow, /-->/)
  assert.equal(m.note, 'the plan names no ways between its screens')
})

test('an App kit\'s own screens[].next are its ways too', () => {
  const m = planMap({ screens: [{ id: 'home', name: 'Home', path: '/', next: ['events'] }, { id: 'events', name: 'Events', path: '/events', next: [] }], data: [] })
  assert.match(m.flow, /s_home --> s_events/)
  assert.equal(m.er, '')
})

test('the data is an ER diagram; a field named after another table is drawn as a relation', () => {
  const { er } = planMap(advisor)
  assert.match(er, /^erDiagram\n/)
  assert.match(er, /E_members\["Members"\] \{\n {4}string name\n {4}string email\n {2}\}/)
  assert.match(er, /E_bookings \}o--\|\| E_members : "member"/)
  assert.match(er, /E_bookings \}o--\|\| E_classes : "class_id"/)
  assert.doesNotMatch(er, /E_members \}o--/, 'no relation where no field names another table')
})

test('the same plan is the same text and version; another plan another version', () => {
  assert.deepEqual(planMap(kit), planMap(JSON.parse(JSON.stringify(kit))))
  assert.notEqual(planMap(kit).version, planMap({ ...kit, screens: kit.screens.slice(1) }).version)
})

test('the person\'s words never break the diagram', () => {
  const m = planMap({ screens: [{ name: 'Say "hi" <script>[x]', path: '/a"b' }, { name: 'Say "hi" <script>[x]' }], data: [{ name: 'A"B{', fields: ['x y', '"q"', ''] }] })
  // each label sits in one pair of quotes, with nothing of the person's that Mermaid reads as syntax inside it
  const lines = [...m.flow.split('\n'), ...m.er.split('\n')].filter(l => l.includes('"'))
  assert.ok(lines.length >= 3)
  for (const line of lines) {
    assert.equal(line.split('"').length, 3, line)
    const label = line.split('"')[1].replaceAll('<br/><small>', '').replaceAll('</small>', '')
    assert.doesNotMatch(label, /[<>{}[\]"]/, line)
  }
  assert.equal(new Set(m.screens.map(s => s.id)).size, 2, 'two screens with one name get two ids')
  assert.match(m.er, /string x_y/)
})

test('no plan is an empty map, not an error', () => {
  const m = planMap(null)
  assert.equal(m.flow, 'flowchart LR')
  assert.equal(m.er, '')
  assert.deepEqual(m.screens, [])
})
