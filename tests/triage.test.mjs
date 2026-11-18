// Reading what Build mode is asked (web/triage.js, docs/specs/49-read-the-ask.md). The owner, 2026-11-16: "its
// supposed to help address complex user request fix issues do multiple things as well ... so build mode is
// contraint to building the whatever they are building right now". The sentences below are the ones that were
// fired off as fresh builds: "the mocks look turn-based" from the Rank Juggler session (EVIDENCE.md failure 2),
// "i want more visual polish more lighting", and a request in three parts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readAsk, askRoute, partButtons, heardOf, targetOf, clausesOf, isAgree, TRIAGE_KINDS } from '../web/triage.js'
import { CANVAS_MODULES } from '../server/page.mjs'

const built = { hasBuild: true, kind: 'game' }
const kinds = (t, ctx = built) => readAsk(t, ctx).kind
const whats = (t, ctx = built) => readAsk(t, ctx).parts.map(p => p.what)

// ---------- a complaint is a change, never a fresh build
test('a complaint about the build is a change, not a fresh build', () => {
  for (const said of ['the mocks look turn-based', 'theyre not being repainted', 'i need better mocks please', 'the look is flat', 'not feeling the lighting', 'it feels flat', 'the copy needs tightening', 'i cant test the game live', 'more visual polish', 'brighter'])
    assert.equal(kinds(said), 'change', said)
  // and aimed at the part it names, so the chat can say back which part
  assert.equal(readAsk('the mocks look turn-based', built).parts[0].target, 'mocks')
  assert.equal(readAsk('not feeling the lighting', built).parts[0].target, 'lighting')
  // a build's complaint needs nothing built yet to read: the words say it is about what is here
  assert.equal(kinds('the mocks look turn-based', {}), 'change')
  // a change is said first: it runs nothing until the person says so
  const read = readAsk('the mocks look turn-based', built)
  assert.equal(read.needsConfirmation, true)
  assert.equal(askRoute(read), 'say')
  assert.match(read.heard, /^A change to the mock screens, not a new build: the mocks look turn-based\.$/)
})

// ---------- several things, in order
test('several things asked are split into ordered parts, never one brief', () => {
  const read = readAsk('redo the mocks, then fix the look, then add lighting at assembly', built)
  assert.equal(read.kind, 'multi')
  assert.deepEqual(read.parts.map(p => [p.what, p.target]), [['redo the mocks', 'mocks'], ['fix the look', 'look'], ['add lighting at assembly', 'lighting']])
  assert.equal(read.heard, 'Three things, in order: redo the mocks, then fix the look, then add lighting at assembly.')
  assert.equal(askRoute(read), 'say')
  // "and" between two asks is two parts; listed numbers are two parts; "first... then" names two
  assert.deepEqual(whats('redo the mocks and repaint the sheets'), ['redo the mocks', 'repaint the sheets'])
  assert.deepEqual(whats('1) redo the mocks 2) fix the look'), ['1) redo the mocks', '2) fix the look'])
  assert.deepEqual(whats('first the mocks, then the lighting'), ['the mocks', 'the lighting'])
  // one thing asked once is one change, in its own words
  assert.deepEqual(whats('i want more lighting and a bit more polish'), ['i want more lighting and a bit more polish'])
})

// ---------- a product described is a build, and builds at once
test('a product described is a build, run as ever', () => {
  for (const said of ['make a bakery site with a menu and bookings', 'A game where you dodge falling pianos', 'a bakery in Lisbon', 'a dark mode toggle for a shop app']) {
    const read = readAsk(said, built)
    assert.equal(read.kind, 'build', said)
    assert.equal(read.needsConfirmation, false, said)
    assert.equal(askRoute(read), 'build', said)
  }
})

// ---------- a question changes nothing
test('a question is not read as a change', () => {
  for (const said of ['what is this?', 'why is the board empty', 'can u install pillow then?', 'how many mocks are left'])
    assert.equal(kinds(said), 'question', said)
  // a question leaves the words to the chat's own routing: Ask mode answers it
  assert.equal(askRoute(readAsk('what is this?', built)), 'pass')
  // "can you make the hero darker" is the question form of an ask of this build
  assert.equal(kinds('can you make the hero darker'), 'change')
})

// ---------- answers, never briefs
test('a yes, a go or a filler is an answer, never a brief', () => {
  for (const said of ['ok', 'yes', 'do it', 'do it pls', 'go ahead', 'sure.'])
    assert.equal(kinds(said), 'unclear', said)
  assert.equal(isAgree('do it pls'), true)
  assert.equal(isAgree('a bakery site'), false)
  // "build it" is the person saying build: the chat's own routing runs it
  assert.equal(kinds('build it'), 'build')
  // "do it" once read as go words and locked a roster with nobody asked (EVIDENCE.md failure 5): never a build
  assert.notEqual(askRoute(readAsk('do it', built)), 'build')
})

// ---------- words it will not guess about: it asks
test('words this file cannot read are asked about, never turned into a fresh build', () => {
  for (const said of ['no rebuild the mocks first', 'i gave the hero a cape', 'not sure about it']) {
    const read = readAsk(said, built)
    assert.equal(read.kind, 'unclear', said)
    assert.equal(read.needsConfirmation, true, said)
    assert.equal(read.unclear, true, said)
    assert.equal(askRoute(read), 'say', said)
    assert.equal(read.heard, '', said)
  }
  // no planner: an ask it cannot name leaves the part as the person said it
  assert.deepEqual(whats('no rebuild the mocks first'), ['no rebuild the mocks first'])
})

// ---------- the planner is the fallback, and only for words that were not decisive
test('the planner is asked only when the words were not decisive', () => {
  const asked = []
  const planner = (text) => { asked.push(text); return { kind: 'change', parts: [{ what: 'the mocks, painted again', target: 'mocks' }] } }
  // a decisive sentence never reaches it
  for (const said of ['the mocks look turn-based', 'redo the mocks, then fix the look, then add lighting at assembly', 'make a bakery site', 'what is this?'])
    readAsk(said, built, planner)
  assert.deepEqual(asked, [])
  // an ask it cannot name does, and what it says back is used
  const read = readAsk('no rebuild the mocks first', built, planner)
  assert.deepEqual(asked, ['no rebuild the mocks first'])
  assert.equal(read.kind, 'change')
  assert.deepEqual(read.parts, [{ what: 'the mocks, painted again', target: 'mocks' }])
  // a planner that says nothing leaves it unclear: still no build
  assert.equal(kinds('no rebuild the mocks first', (t, c) => readAsk(t, c)), 'unclear')
})

// ---------- what a send made in code, and a slash, are
test('a send that already said what it does is not read', () => {
  assert.equal(askRoute(readAsk('redo the mocks', { ...built, fresh: true })), 'pass')
  assert.equal(askRoute(readAsk('/fix make the hero darker', built)), 'pass')
  assert.equal(askRoute(readAsk('the mocks look turn-based', { ...built, preview: true })), 'pass')
  assert.equal(askRoute(readAsk('', built)), 'pass')
})

// ---------- the buttons: the parts, in the person's words
test('the buttons are the parts themselves, never a canned reply', () => {
  const read = readAsk('redo the mocks, then fix the look, then add lighting at assembly', built)
  const buttons = partButtons(read.parts)
  assert.deepEqual(buttons.map(b => b.label), ['redo the mocks', 'fix the look', 'add lighting at assembly'])
  assert.deepEqual(buttons.map(b => b.id), ['part:0', 'part:1', 'part:2'])
  // a button's words are the part exactly, so pressing one can be typed
  for (const b of buttons) assert.equal(b.what, read.parts[Number(b.id.slice(5))].what)
})

test('the names are the plan\'s own stages, and any other name is still a part', () => {
  assert.deepEqual(TRIAGE_KINDS.slice(0, 4), ['mocks', 'sheets', 'backdrops', 'sprites'])
  assert.equal(targetOf('the mock screens look turn-based'), 'mocks')
  assert.equal(targetOf('more visual polish'), 'look')
  assert.equal(targetOf('add lighting at assembly'), 'lighting')
  // a name this file does not know is still read as the words, with no target
  assert.equal(targetOf('the quest markers'), '')
  assert.deepEqual(clausesOf('redo the mocks, then fix the look'), ['redo the mocks', 'fix the look'])
  assert.match(heardOf('multi', [{ what: 'a', target: '' }, { what: 'b', target: '' }]), /^Two things, in order: a, then b\.$/)
})

// ---------- the send path says it in the chat, and runs it only when the person says so
test('Build mode says what it understood, and runs it only when the person says so', () => {
  const loop = readFileSync(new URL('../web/canvas/loop.js', import.meta.url), 'utf8')
  // read before anything is sent: the whole box's words, with the state that decides what "here" is
  assert.match(loop, /const read = readAsk\(brief, triageCtx\(\)\)/)
  // a change or a list of parts says so in one plain line, then offers the parts as buttons
  assert.match(loop, /const line = read\.kind === 'multi' \? read\.heard : `I would \$\{read\.parts\[0\]\.what/)
  assert.match(loop, /for \(const p of partButtons\(read\.parts\)\) add\(p\.label, \(\) => again\(p\.what\)\)/)
  assert.match(loop, /add\('Do all of that', \(\) => again\(brief\), true\)/)
  assert.match(loop, /add\('Make the change', \(\) => again\(brief\), true\)/)
  // every button feeds its own words back through the box, so what a button does can be typed
  assert.match(loop, /const again = what => \{ els\.brief\.value = what; els\.form\.requestSubmit\(\) \}/)
  // nothing is posted until a press: the read returns the chat before /api/run
  const at = s => loop.indexOf(s)
  assert.ok(at('const read = readAsk(brief, triageCtx())') > at('if (!nextRoute && await modeSend(modeHelp)) return'))
  assert.ok(at('return saidBack(read, brief)') < at("await api('/api/run'"))
  // a build, and a send made in code (a Build button, a project's dock), go on as ever
  assert.match(loop, /if \(askRoute\(read\) === 'say' && !\(read\.kind === 'question' && route === 'new'\)\)/)
  assert.match(loop, /preview: \/\^\\\/\[a-z\?\]\/i\.test\(els\.brief\.value\.trim\(\)\) \|\| !!ov/)
  // and the module is on the page, so the browser has it
  assert.ok(CANVAS_MODULES.includes('triage.js'))
})
