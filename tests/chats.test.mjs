// Chats (spec 29 §Store): a store of their own, apart from builds; a chat moves into its project on build.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chatStore, titleFrom, isDir } from '../engine/chats.mjs'

const fresh = (t = { v: 1_800_000_000_000 }) => { const dataDir = mkdtempSync(join(tmpdir(), 'chats-')); return { dataDir, t, s: chatStore({ dataDir, now: () => t.v }) } }

test('a chat is made loose, outside runs and projects, and keeps what was said', async () => {
  const { dataDir, s } = fresh()
  const c = s.create({ kind: 'site', text: "a tea shop site for Leaf & Kettle, don't build yet" })
  assert.match(c.id, /^c-[0-9a-f]{10}$/)
  assert.ok(existsSync(join(dataDir, 'chats', c.id, 'chat.json')))
  assert.ok(!existsSync(join(dataDir, 'runs')))
  assert.equal(c.category, 'Design')
  assert.equal(c.state, 'open')
  assert.equal(c.title, 'A tea shop site for Leaf & Kettle')
  await s.say(c.id, { who: 'hermia', text: 'Who is it for?' })
  const back = s.get(c.id)
  assert.deepEqual(back.turns.map(t => [t.id, t.who]), [['t1', 'person'], ['t2', 'planner']])
  assert.deepEqual(s.listLoose().map(r => r.id), [c.id])
})

test('rename, move to another group, delete to the trash', async () => {
  const { dataDir, s } = fresh()
  const c = s.create({ kind: 'game', text: 'a tiny ant game' })
  assert.equal(c.category, 'Game')
  await s.rename(c.id, 'Army of ants')
  await s.setCategory(c.id, 'Design')
  const r = s.get(c.id)
  assert.equal(r.title, 'Army of ants')
  assert.equal(r.categoryBy, 'person')
  await assert.rejects(() => s.setCategory(c.id, 'Music'))
  await s.remove(c.id)
  assert.equal(s.get(c.id), null)
  assert.equal(readdirSync(join(dataDir, 'chats', '.trash')).length, 1)
  assert.deepEqual(s.listLoose(), [])
})

test('building moves the chat into its project, where it is grouped by category', async () => {
  const { dataDir, s } = fresh()
  const c = s.create({ kind: 'app', text: 'a booking app' })
  // the run has no project yet: the chat waits, loose, until it has one
  await s.built(c.id, { run: '2026-11-11T01-02-03-004Z', brief: 'A booking app for a barber' })
  assert.ok(existsSync(join(dataDir, 'chats', c.id)))
  await s.settle(run => (run === '2026-11-11T01-02-03-004Z' ? 'P1' : null))
  assert.ok(!existsSync(join(dataDir, 'chats', c.id)))
  assert.ok(isDir(join(dataDir, 'projects', 'P1', 'chats', c.id)))
  const r = s.get(c.id)
  assert.equal(r.project, 'P1')
  assert.equal(r.state, 'locked')
  assert.equal(r.spec.brief, 'A booking app for a barber')
  assert.deepEqual(s.listLoose(), [], 'a chat in a project is not loose')
  const d = s.create({ kind: 'site', text: 'its site', project: 'P1' })
  assert.deepEqual(s.forProject('P1').groups.map(g => [g.name, g.chats.map(x => x.id)]), [['Design', [d.id]], ['App', [c.id]]])
  assert.equal(s.forMessage('P1', 'site').id, d.id, "a project's next site message joins its newest Design chat")
})

test('clean-up: an empty loose chat a day old goes; one with words stays', async () => {
  const { s, t } = fresh()
  const empty = s.create({ kind: 'site' })
  const said = s.create({ kind: 'site', text: 'hello' })
  t.v += 2 * 864e5
  s.cleanup()
  assert.equal(s.get(empty.id), null)
  assert.ok(s.get(said.id))
})

test('old game plans become loose game chats once; the plan files stay', async () => {
  const { s } = fresh()
  const plans = [
    { id: 'p-3fa117afac', title: 'New game', idea: 'a tiny game called army of ants. you lead the colony', created: '2026-11-09T10:00:00Z' },
    { id: 'p-aaaaaaaaaa', title: 'Rooftop Signal', idea: 'rooftop runner' },
    { id: 'p-bbbbbbbbbb', title: 'Built one', idea: 'x', build: { run: 'r1' } }
  ]
  const made = s.importPlans(plans)
  assert.equal(made.length, 2)
  assert.deepEqual(s.importPlans(plans), [], 'done once')
  const ants = s.listLoose().map(r => s.get(r.id)).find(c => c.plan === 'p-3fa117afac')
  assert.equal(ants.kind, 'game')
  assert.equal(ants.title, 'Army of Ants')
  assert.equal(ants.turns[0].text, plans[0].idea)
})

test('titleFrom keeps a short first sentence and cuts a long one at a word', async () => {
  assert.equal(titleFrom(''), '')
  assert.equal(titleFrom('tea shop. more words here'), 'Tea shop')
  const long = titleFrom('a very long description of a website for a bakery that sells sourdough and pastries')
  assert.ok(long.length <= 49 && long.endsWith('…'))
})

// The person, 2026-11-16: "i cant see my old chat where i asked it to fix something". The chat was
// there all along (a loose "New game", 20 turns), but the Chats popover on a build asks for that
// project's chats, and a project's list holds only its own: an empty list hid every loose chat.
test('the Chats popover lists only this project chats', () => {
  const src = readFileSync(new URL('../web/canvas/talk.js', import.meta.url), 'utf8')
  // The person, 2026-11-16: "this is supposed to show recent chat logs only from this project not others".
  // Two earlier attempts went the other way — first hiding every loose chat, then listing all of them — and
  // the second filled this build's picker with other builds: two rows both named "Rooftop Signal".
  assert.equal(src.includes("if (pid && !groupOf.length)"), false, 'no fallback gated on an empty project list')
  assert.equal(src.includes("api('/api/chats').then(r => r.json())"), false, 'the loose list is not merged in')
  assert.match(src, /filter\(c => !c\.project \|\| c\.project === pid\)/, 'rows are kept only for this project')
  assert.match(src, /\.filter\(g => g\.chats\.length\)/, 'a group left with no rows is dropped')
  // the rows scroll, the New chat button does not
  assert.match(src, /chats-pop-scroll/, 'the rows live in a scrolling box')
  const css = readFileSync(new URL('../web/canvas.css', import.meta.url), 'utf8')
  assert.match(css, /\.chats-pop-scroll \{[^}]*overflow-y: auto/, 'and it scrolls')
})

// The person, 2026-11-16: "i cant seem to send images and screenshots for changes ... it doesnt get sent".
// The chip was taken only on the plain send (`brief ? [] : links.take('ref')`), so pressing Build — the
// button that carries a brief — threw the picture away and the crew never saw it.
test('a picture attached to a turn is sent with it, whichever button sends the turn', () => {
  const src = readFileSync(new URL('../web/canvas/talk.js', import.meta.url), 'utf8')
  assert.equal(src.includes("brief ? [] : links.take('ref')"), false, 'the brief path no longer drops the chips')
  assert.match(src, /const media = links\.take\('ref'\)/, 'the chips are taken on every send')
  // and they reach the server: talkSend posts them as refs, which the discuss route reads
  assert.match(src, /media\.length \? \{ refs: media\.map\(m => m\.key\) \}/, 'the refs are posted with the turn')
})
