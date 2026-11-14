// node --test tests/studioask.test.mjs
// The chat leads a website's Studio (docs/decisions/0020-ask-before-build.md; engine/askfirst.mjs studioTurn,
// server/studio.mjs POST /api/studio/:pid/ask, web/scaffold.js). Before a build Hermia asks what the person has not
// said, one question at a time, each answered by typing: which pages (or "you choose"), then pictures. "Skip all,
// just build" takes the recommended defaults and says what it picked. The owner's own phrasings are the cases.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { studioTurn, studioOpen, readPages, readPictures, readYouChoose, readSkipAll, readBuild, pickedLine, STUDIO_ASK_TEXT, GO_TEXT } from '../engine/askfirst.mjs'
import { startStudio } from '../scripts/studio-child.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const turn = (said, asked, state = {}, more = {}) => studioTurn({ said, asked, state, defaults: { pictures: 'painted' }, ...more })

test('what is open, in order: the pages, then the pictures; one question at a time', () => {
  assert.deepEqual(studioOpen({}), ['pages', 'pictures'])
  assert.deepEqual(studioOpen({ pages: ['Home'] }), ['pictures'])
  assert.deepEqual(studioOpen({ pagesBy: 'crew' }), ['pictures'])
  assert.deepEqual(studioOpen({ pages: ['Home'], pictures: 'stock' }), [])
  // a skipped Plan, or a project that is built already, is not asked its pages
  assert.deepEqual(studioOpen({}, { planSkipped: true }), ['pictures'])
  assert.deepEqual(studioOpen({}, { built: true }), ['pictures'])
  assert.deepEqual(studioOpen({ pictures: 'nope' }), ['pages', 'pictures'])
  // with nothing said, the turn is the next question, and nothing is set
  const first = turn('', null)
  assert.deepEqual([first.read, first.next, first.text, first.build], [false, 'pages', STUDIO_ASK_TEXT.pages, false])
  assert.deepEqual(first.set, {})
  // each question is one line, names its typed answers and offers "you choose"
  for (const q of Object.values(STUDIO_ASK_TEXT)) { assert.match(q, /you choose/); assert.ok(q.length < 80 && !q.includes('\n')) }
})

test('pages: names typed any way set the Studio\'s pages; "you choose" leaves them to the crew', () => {
  // the owner: a typed "Home, Work, Contact" sets the pages
  const t = turn('Home, Work, Contact', 'pages')
  assert.equal(t.read, true)
  assert.deepEqual(t.set, { pages: ['Home', 'Work', 'Contact'], pagesBy: null, pageCount: null })
  assert.equal(t.next, 'pictures')
  assert.equal(t.text, `Pages: Home, Work, Contact. ${STUDIO_ASK_TEXT.pictures}`)
  for (const [said, pages] of [
    ['home work and contact', ['Home', 'Work', 'Contact']],
    ['home work contact', ['Home', 'Work', 'Contact']],
    ['home/about/contact', ['Home', 'About', 'Contact']],
    ['i want 5 pages: home, menu, about, visit and contact', ['Home', 'Menu', 'About', 'Visit', 'Contact']],
    ['a home page, an about page and a contact page', ['Home', 'About', 'Contact']],
    ['pages: Home, Our story', ['Home', 'Our story']],
    ['just a landing page', ['Landing']],
    ['Home', ['Home']],
    ['Gallery, Photos, Contact', ['Gallery', 'Photos', 'Contact']],
    ['home, Home, HOME, about', ['Home', 'About']]
  ]) assert.deepEqual(turn(said, 'pages').set.pages, pages, said)
  // how many, with no names: the count goes to the crew
  for (const [said, n] of [['3 pages', 3], ['3', 3], ['three', 3], ['about 5 pages', 5], ['one page', 1], ['40 pages', 12]]) {
    const c = turn(said, 'pages')
    assert.deepEqual(c.set, { pagesBy: 'crew', pageCount: n, pages: null }, said)
  }
  assert.match(turn('3 pages', 'pages').text, /^3 pages, the crew picks which\. /)
  // you choose, in the words people use
  for (const said of ['you choose', 'u choose', 'You choose.', 'idk you decide', 'up to you', 'whatever', 'surprise me', 'not sure', "i don't care", 'dont know', 'the crew decides', 'your call', 'whatever you think']) {
    assert.equal(readYouChoose(said), true, said)
    const c = turn(said, 'pages')
    assert.deepEqual(c.set, { pagesBy: 'crew', pageCount: null, pages: null }, said)
    assert.match(c.text, /^The crew picks the pages\. /, said)
  }
  // never more than twelve pages
  assert.equal(turn(Array.from({ length: 20 }, (_, i) => `Page${i}`).join(', '), 'pages').set.pages.length, 12)
})

test('a line that is not an answer is left for the planner, and sets nothing', () => {
  for (const said of ['what do you suggest?', 'make it feel calm and warm', 'A tea shop in Kyoto, with a menu, and a map', 'can you change the colours', 'how many should it have?'])
    for (const asked of ['pages', 'pictures', null]) {
      const t = turn(said, asked)
      assert.equal(t.read, false, `${asked}: ${said}`)
      assert.deepEqual(t.set, {})
      assert.equal(t.build, false)
    }
  // a comma list is pages only while the pages question is open, or when the line says so
  assert.equal(readPages('Home, Work, Contact'), null)
  assert.deepEqual(readPages('Home, Work, Contact', { asked: true }), { pages: ['Home', 'Work', 'Contact'] })
  assert.deepEqual(readPages('pages: Home, Work, Contact'), { pages: ['Home', 'Work', 'Contact'] })
  assert.equal(turn('Home, Work, Contact', 'pictures').read, false)
  assert.equal(turn('Home, Work, Contact', null).read, false)
  // talk about the pages is not a list of them
  for (const said of ['the pages are too long', 'pages should be more colourful', 'make the pages shorter', 'pages are too long and boring'])
    for (const asked of ['pictures', null]) assert.equal(turn(said, asked).read, false, said)
  assert.deepEqual(turn('3 pages', null).set, { pagesBy: 'crew', pageCount: 3, pages: null })
  assert.deepEqual(turn('pages: Home, Work', 'pictures').set.pages, ['Home', 'Work'])
  // a built project keeps its pages: they are not set from the chat
  assert.equal(turn('pages: Home, Work', null, {}, { built: true }).read, false)
})

test('pictures: painted, stock photos or drawn, typed; "you choose" takes what Setup recommends', () => {
  for (const [said, mode] of [
    ['painted', 'painted'], ['Painted.', 'painted'], ['the painted ones', 'painted'], ['ai images', 'painted'], ['paint them', 'painted'],
    ['stock', 'stock'], ['stock photos', 'stock'], ['real photos please', 'stock'], ['use photos', 'stock'], ['photography', 'stock'],
    ['drawn', 'drawn'], ['illustrations', 'drawn'], ['draw them', 'drawn'], ['no photos', 'drawn'], ['svg', 'drawn']
  ]) {
    assert.equal(readPictures(said), mode, said)
    const t = turn(said, 'pictures', { pagesBy: 'crew' })
    assert.deepEqual(t.set, { pictures: mode }, said)
    assert.equal(t.next, null)
  }
  // two named, or a question, is not an answer
  for (const said of ['painted or stock?', 'painted or stock', 'what is the difference?', 'make the hero bigger']) assert.equal(turn(said, 'pictures').read, false, said)
  // you choose: Setup's recommendation, whatever it is
  for (const dflt of ['painted', 'stock', 'drawn']) assert.deepEqual(turn('you choose', 'pictures', { pagesBy: 'crew' }, { defaults: { pictures: dflt } }).set, { pictures: dflt })
  assert.equal(turn('up to you', 'pictures', {}, { defaults: {} }).set.pictures, 'painted')
  // out of turn, a pictures answer is read only when the whole line is the choice
  assert.deepEqual(turn('stock photos', 'pages').set, { pictures: 'stock' })
  assert.equal(turn('stock photos', 'pages').next, 'pages')
  assert.deepEqual(turn('use stock photos', null).set, { pictures: 'stock' })
  assert.equal(turn('photos of tea, please, and a map', null).read, false)
  assert.equal(readPictures('Gallery, Photos, Contact', { only: true }), null)
  // the last answer says what to do next, in one line
  assert.equal(turn('drawn', 'pictures', { pages: ['Home'] }).text, 'Pictures: drawn. Say "build" when you are ready.')
})

test('"skip all, just build" at any point: the recommended defaults, said in one line, and the build starts', () => {
  for (const said of ['skip all, just build', 'skip all', 'skip everything', 'just build it', 'just generate based on my prompt', 'no questions, build it now', 'stop asking', "don't ask, you choose everything", 'just make it']) {
    assert.equal(readSkipAll(said), true, said)
    for (const asked of ['pages', 'pictures', null]) {
      const t = turn(said, asked, {}, { defaults: { pictures: 'drawn' } })
      assert.deepEqual([t.read, t.build, t.next], [true, true, null], `${asked}: ${said}`)
      assert.deepEqual(t.set, { pagesBy: 'crew', pictures: 'drawn' })
      assert.equal(t.text, 'Building it now: the crew picks the look and the pages, pictures drawn.')
    }
  }
  // what the person already said is kept, and named
  const kept = turn('skip all', 'pictures', { pages: ['Home', 'Work'] })
  assert.deepEqual(kept.set, { pictures: 'painted' })
  assert.equal(kept.text, 'Building it now: the crew picks the look, pages Home, Work, pictures painted.')
  assert.equal(pickedLine({ pageCount: 3, pagesBy: 'crew', pictures: 'stock' }, { look: true }), '3 pages, the crew picks which, pictures stock photos')
  assert.equal(pickedLine({ pictures: 'drawn' }, { built: true, look: true }), 'pictures drawn')
  // plain words are not a skip: a line for the planner never starts a build, whatever question is open
  for (const said of ['skip the hero', 'Home, Work', 'a site that just works', 'just make the hero bigger', 'just do a darker version', "don't ask me about fonts", 'use the logo from my prompt', 'just make it one page', 'just make it pop', 'build it now with a dark hero', 'can you just build it?', 'no questions on the contact page']) {
    assert.equal(readSkipAll(said), false, said)
    for (const asked of ['pages', 'pictures', null]) for (const built of [false, true]) assert.equal(turn(said, asked, {}, { built }).build, false, `${asked}: ${said}`)
  }
  // the question before a new website says what Skip all picks, too
  assert.match(GO_TEXT.all, /^Building it now: the crew picks the look and the pages/)
})

test('"build" is the Build press: what is open is asked first, then it builds from the answers', () => {
  for (const said of ['build', 'Build it', 'go', 'go ahead', "let's build", 'make it', 'ok build it please']) assert.equal(readBuild(said), true, said)
  for (const said of ['build a hero with a map', 'go to the pricing page', 'make it warmer']) assert.equal(readBuild(said), false, said)
  let state = {}
  let t = turn('build', null, state)
  assert.deepEqual([t.read, t.build, t.building, t.next, t.text], [true, false, true, 'pages', STUDIO_ASK_TEXT.pages])
  t = turn('Home, Work, Contact', 'pages', state, { building: true })
  state = { ...state, ...t.set }
  assert.deepEqual([t.build, t.building, t.next], [false, true, 'pictures'])
  t = turn('stock photos', 'pictures', state, { building: true })
  assert.deepEqual([t.build, t.building, t.next], [true, false, null])
  assert.equal(t.text, 'Building it now: the crew picks the look, pages Home, Work, Contact, pictures stock photos.')
  // with everything said, "build" builds
  assert.equal(turn('build', null, { pagesBy: 'crew', pictures: 'drawn' }).build, true)
  // the Build press with nothing typed: the next question, or the build
  assert.deepEqual([turn('', null, {}, { building: true }).build, turn('', null, {}, { building: true }).next], [false, 'pages'])
  assert.equal(turn('', null, { pagesBy: 'crew', pictures: 'drawn' }, { building: true }).build, true)
})

// ---------- over HTTP: the answers land on the Studio's own state and in its chat
async function startServer() {
  const data = mkdtempSync(join(tmpdir(), 'swarm-studioask-'))
  const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: data, SWARM_RUNS_DIR: join(data, 'runs'), SWARM_NO_REPLACE: '1', HERMES_HOME: join(data, 'hermes') }
  for (const k of ['SWARM_PORT', 'SWARM_BASE_URL', 'SWARM_API_KEY', 'SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH']) delete env[k]
  // on a port of its own, which it says once it listens (scripts/studio-child.mjs)
  const { child, base } = await startStudio({ env })
  const call = (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-swarm-token': 't' }, body: body ? JSON.stringify(body) : undefined })
  return { call, stop: () => { child.kill(); rmSync(data, { recursive: true, force: true }) } }
}

test('/api/studio/:pid/ask: typed answers set the pages and the pictures, and stay in the chat', { timeout: 60000 }, async () => {
  const s = await startServer()
  try {
    const made = await (await s.call('/api/studio', { kind: 'site', idea: 'A site for a plant shop' })).json()
    const pid = made.project.id
    const ask = async body => { const r = await s.call(`/api/studio/${pid}/ask`, body); assert.equal(r.status, 200); return r.json() }
    // what to ask first
    let j = await ask({})
    assert.deepEqual([j.ask.read, j.ask.next, j.ask.text], [false, 'pages', STUDIO_ASK_TEXT.pages])
    assert.equal(j.studio.kit.pages, undefined)
    // not an answer: nothing changes
    j = await ask({ said: 'what do you suggest?', asked: 'pages' })
    assert.equal(j.ask.read, false)
    assert.deepEqual(j.studio.kit, {})
    // the pages, typed
    j = await ask({ said: 'Home, Work, Contact', asked: 'pages' })
    assert.deepEqual(j.studio.kit.pages, ['Home', 'Work', 'Contact'])
    assert.equal(j.ask.next, 'pictures')
    // the pictures, typed: the same kit state the board's Pictures card sets
    j = await ask({ said: 'stock photos', asked: 'pictures', building: true })
    assert.equal(j.studio.kit.pictures, 'stock')
    assert.deepEqual([j.ask.next, j.ask.build], [null, true])
    assert.match(j.ask.text, /^Building it now: .*pages Home, Work, Contact, pictures stock photos\.$/)
    // the answers and the planner's lines are the chat's turns
    const chat = await (await s.call(`/api/chats/${made.chat}`)).json()
    const said = chat.turns.map(t => `${t.who}: ${t.text}`)
    assert.ok(said.includes('person: Home, Work, Contact') && said.includes('person: stock photos'), said.join(' | '))
    assert.ok(said.some(x => x.startsWith('planner: Pages: Home, Work, Contact.')))
    assert.ok(!said.includes('person: what do you suggest?'), 'a line left for the planner is not recorded here')
    // "you choose" drops the names; skip all on a fresh Studio takes the defaults and says so
    j = await ask({ said: 'actually you choose', asked: 'pages' })
    assert.deepEqual([j.studio.kit.pages, j.studio.kit.pagesBy], [undefined, 'crew'])
    const other = await (await s.call('/api/studio', { kind: 'site', idea: 'A bakery' })).json()
    const r = await (await s.call(`/api/studio/${other.project.id}/ask`, { said: 'skip all, just build' })).json()
    assert.equal(r.ask.build, true)
    assert.equal(r.studio.kit.pagesBy, 'crew')
    assert.ok(['painted', 'stock', 'drawn'].includes(r.studio.kit.pictures))
    assert.match(r.ask.text, /^Building it now: the crew picks the look and the pages, pictures (painted|stock photos|drawn)\.$/)
    // another kind is not asked a website's questions
    const app = await (await s.call('/api/studio', { kind: 'app', idea: 'A habit tracker' })).json()
    const a = await (await s.call(`/api/studio/${app.project.id}/ask`, { building: true })).json()
    assert.deepEqual([a.ask.next, a.ask.build], [null, true])
    assert.equal((await s.call('/api/studio/nope/ask', {})).status, 404)
  } finally { s.stop() }
})

test('the Studio and its chat: the question is asked in the chat, typed answers go to the server, and the kit sends them', async () => {
  const read = f => readFileSync(join(root, f), 'utf8')
  const scaffold = read('web/scaffold.js'), talk = read('web/canvas/talk.js')
  // Build asks what is open first, in the chat, and waits; the answer goes on to the build
  assert.match(scaffold, /const j = await post\(at\('\/ask'\), \{ building: true \}\)/)
  assert.match(scaffold, /A\.wantsBuild = true\n\s+A\.asking = next/)
  assert.match(scaffold, /post\(at\('\/ask'\), \{ said: text, asked: A\.asking, building: A\.wantsBuild \}\)/)
  assert.match(scaffold, /if \(a\.set\?\.pictures\) post\('\/api\/setup', \{ pictures: a\.set\.pictures \}\)/, 'a typed pictures answer is Setup\'s too, as the card\'s is')
  assert.match(scaffold, /if \(a\.build\) setTimeout\(\(\) => build\(\), 0\)/)
  // an answer the Studio took is Hermia's reply: the planner model is not asked as well
  assert.ok(talk.indexOf('took = talk.heard?.(text)') > 0 && talk.indexOf('took = talk.heard?.(text)') < talk.indexOf("api('/api/discuss'"))
  assert.match(talk, /if \(typeof reply === 'string' && reply\) \{[^\n]*return void botMsg\(reply\) \}/)
  // no row of reply buttons for these questions (decision 0015), and no new surface
  assert.doesNotMatch(scaffold, /data-pick|talk-opts/)
  // the kit: named pages, a count for the crew, or nothing
  const { siteKit } = await import('../web/kit-site.js')
  const sent = []
  const ctx = state => ({ state, studio: { idea: 'a tea shop', steps: { plan: 'empty' } }, project: { id: 'p1' }, chat: 'c1', sw: { submit: async b => { sent.push(b); return 'r1' } } })
  await siteKit.build({}, ctx({ pages: ['Home', 'Work', 'Contact'] }))
  assert.equal(sent.at(-1), 'a tea shop\n\nPages: Home, Work, Contact.')
  await siteKit.build({}, ctx({ pagesBy: 'crew', pageCount: 3 }))
  assert.equal(sent.at(-1), 'a tea shop\n\nPages: 3, the crew picks which.')
  await siteKit.build({}, ctx({ pagesBy: 'crew' }))
  assert.equal(sent.at(-1), 'a tea shop', 'you choose: no Pages line in the brief')
  // the brand story's pages are a suggestion: "you choose" does not send them as the person's
  const branded = state => ({ ...ctx(state), brand: { story: { pages: ['Home', 'Menu', 'Visit'] } } })
  await siteKit.build({}, branded({ pagesBy: 'crew' }))
  assert.equal(sent.at(-1), 'a tea shop')
  assert.deepEqual(siteKit.lock(branded({ pagesBy: 'crew' })), {})
  await siteKit.build({}, branded({ pagesBy: 'crew', pageCount: 4 }))
  assert.equal(sent.at(-1), 'a tea shop\n\nPages: 4, the crew picks which.')
  await siteKit.build({}, branded({}))
  assert.match(sent.at(-1), /Pages: Home, Menu, Visit\.$/)
})
