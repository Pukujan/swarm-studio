// The chat's modes (web/chatmode.js): the typed switch, and where a message goes per mode and state.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readMode, modeRoute, modeWord, isYes, CHAT_MODES, MODE_LINE, MODE_PLACEHOLDER, CHANGE_PLACEHOLDER, chatMode, setChatMode, modeSend, mountChatMode } from '../web/chatmode.js'
import { chipMenuKey, builderModels, realModel, NO_MODEL_NAME } from '../web/composer.js'

// the send button is an arrow: what it sends to is its accessible name
const sendFake = () => ({ label: 'Send: Build', setAttribute(k, v) { if (k === 'aria-label') this.label = v } })

test('a typed switch is the whole message, or a slash with the rest to send', () => {
  assert.deepEqual(CHAT_MODES, ['ask', 'plan', 'build', 'fix'])
  assert.deepEqual(CHAT_MODES.map(modeWord), ['Ask', 'Plan', 'Build', 'Fix'])
  assert.deepEqual(readMode('/ask'), { mode: 'ask', rest: '' })
  assert.deepEqual(readMode('/ask how many pages are there?'), { mode: 'ask', rest: 'how many pages are there?' })
  assert.deepEqual(readMode('/PLAN a booking flow\nwith two steps'), { mode: 'plan', rest: 'a booking flow\nwith two steps' })
  assert.deepEqual(readMode('/build a bakery site'), { mode: 'build', rest: 'a bakery site' })
  assert.deepEqual(readMode('/fix'), { mode: 'fix', rest: '' })
  for (const [said, mode] of [['switch to ask mode', 'ask'], ['plan mode', 'plan'], ['Build mode.', 'build'], ['fix mode', 'fix'], ['please switch to fix mode', 'fix'], ['switch to plan', 'plan'], ['go back to build mode', 'build'], ['change to the ask mode', 'ask'], ['set the chat to plan mode!', 'plan']])
    assert.deepEqual(readMode(said), { mode, rest: '' }, said)
  // /fix with words is the section rewrite it always was, never a switch
  assert.equal(readMode('/fix make the hero darker'), null)
  // briefs that only mention a mode are briefs
  for (const brief of ['add a dark mode', 'fix mode toggle bug', 'build mode selector for the app', 'plan mode for the pricing page', 'ask mode', 'the ask mode is broken', 'ask', 'plan', 'build', 'fix', 'switch to dark mode', '/asking', '/planet game', '/builder', 'a bakery site', '/app', ''].filter(b => b !== 'ask mode'))
    assert.equal(readMode(brief), null, brief)
  assert.deepEqual([isYes('yes'), isYes('Ok.'), isYes('do it'), isYes('yes but later'), isYes('no'), isYes('')], [true, true, true, false, false, false])
})

test('where a message goes, per mode and state', () => {
  const r = (mode, s = {}) => modeRoute({ mode, text: 'what is this?', ...s })
  // Build is the chat's own routing, in every state
  for (const s of [{}, { run: 'r' }, { run: 'r', app: true, working: true }, { talking: true }]) assert.equal(r('build', s), 'build')
  // Ask: a built app or game is read by dyad; while it builds the crew answers; a website or nothing built, the planner
  assert.equal(r('ask', { run: 'r', app: true }), 'app')
  assert.equal(r('ask', { run: 'r', app: true, working: true }), 'crew')
  assert.equal(r('ask', { run: 'r' }), 'planner')
  assert.equal(r('ask'), 'planner')
  // an open talk does not swallow a question in Ask
  assert.equal(r('ask', { run: 'r', talking: true }), 'planner')
  // Plan: a talk starts, or the open one takes the words; for apps and games too (dyad's plan mode is not used)
  assert.equal(r('plan'), 'talk')
  assert.equal(r('plan', { run: 'r', app: true }), 'talk')
  assert.equal(r('plan', { run: 'r', app: true, working: true }), 'talk')
  assert.equal(r('plan', { talking: true }), 'say')
  // Fix: the doctor; a typed yes takes the step it offered, and only then
  assert.equal(r('fix', { run: 'r' }), 'doctor')
  assert.equal(modeRoute({ mode: 'fix', text: 'yes', offered: true }), 'yes')
  assert.equal(modeRoute({ mode: 'fix', text: 'yes' }), 'doctor')
  assert.equal(modeRoute({ mode: 'fix', text: 'yes, and why?', offered: true }), 'doctor')
  assert.equal(modeRoute(), 'build')
})

// the chat with stand-in parts: what each mode calls, and that Build and code-made sends are left alone
const fake = (over = {}) => {
  const calls = []
  const item = () => ({ classList: { add() {} }, querySelector: () => null, append() {}, remove() {} })
  const h = {
    box: { value: '' }, form: { requestSubmit: () => calls.push(['submit', h.box.value]) },
    feed: (a, text, kind) => calls.push(['feed', text, kind]), quiet: () => {}, botMsg: (text, working) => { calls.push([working ? 'wait' : 'bot', text]); return item() },
    api: async (path, o) => { calls.push(['api', path, JSON.parse(o.body)]); return { ok: true, status: 200, json: async () => over.reply?.(path) || { answer: 'It has two pages.', reply: 'Two pages.' } } },
    run: () => over.run ?? null, runNow: () => over.run ?? null, site: () => !!over.site, kind: () => 'site', chat: () => null,
    app: () => over.appv || { run: null }, appAsk: async t => calls.push(['appAsk', t]), talkStart: o => calls.push(['talkStart', o.text, o.kind, o.from, o.blank]),
    next: v => calls.push(['next', v]), hermesReady: async () => null, hermesSays: () => {}, media: () => null, setup: a => calls.push(['setup', a]), resume: r => calls.push(['resume', r])
  }
  mountChatMode({ select: { value: 'build', hidden: false, addEventListener() {} }, button: sendFake(), talking: () => !!over.talking })
  setChatMode('build')
  return { h, calls, send: text => { h.box.value = text; return modeSend(h) } }
}

test('Build mode and slash commands are left to the chat; the switch changes the send button', async () => {
  const c = fake({ run: 'r1', site: true })
  assert.equal(await c.send('add a pricing page'), false)
  assert.equal(await c.send('/review'), false)
  assert.equal(await c.send('/fix make the hero darker'), false)
  assert.deepEqual(c.calls, [])
  assert.equal(c.h.box.value, '/fix make the hero darker')
  assert.equal(await c.send('ask mode'), true)
  assert.deepEqual([chatMode.now, chatMode.button.label, chatMode.select.value, c.h.box.value], ['ask', 'Send: Ask', 'ask', ''])
  // a slash command still runs in any mode
  assert.equal(await c.send('/review'), false)
  // /build with a brief: the mode is Build and the brief is left in the box for the chat to send
  assert.equal(await c.send('/build a bakery site'), false)
  assert.deepEqual([chatMode.now, chatMode.button.label, c.h.box.value], ['build', 'Send: Build', 'a bakery site'])
  // while a talk has the box the button says Send, whatever the mode, and gets its word back after
  const t = fake({ talking: true })
  setChatMode('plan')
  assert.equal(chatMode.button.label, 'Send')
})

test('Ask: a website asks the planner and leaves nothing open; a built app asks dyad; a building one, the crew', async () => {
  const site = fake({ run: 'r1', site: true })
  assert.equal(await site.send('/ask how many pages?'), true)
  assert.deepEqual(site.calls.filter(c => c[0] === 'api'), [['api', '/api/discuss', { ask: true, said: [{ who: 'you', text: 'how many pages?' }], kind: 'site', from: 'r1' }]])
  assert.deepEqual(site.calls.filter(c => c[0] === 'wait' || c[0] === 'bot'), [['wait', 'Answering'], ['bot', 'Two pages.']])
  assert.ok(!site.calls.some(c => c[0] === 'talkStart' || c[0] === 'submit' || c[0] === 'appAsk'))
  // the next question carries the first and its answer
  await site.send('and which is the home page?')
  assert.equal(site.calls.findLast(c => c[0] === 'api')[2].said.length, 3)
  // nothing built: still the planner
  const empty = fake()
  setChatMode('ask')
  chatMode.asked = []
  assert.equal(await empty.send('what can you make?'), true)
  assert.deepEqual(empty.calls.find(c => c[0] === 'api').slice(1), ['/api/discuss', { ask: true, said: [{ who: 'you', text: 'what can you make?' }], kind: 'site' }])
  const app = fake({ run: 'r2', appv: { run: 'r2', hasApp: true, state: 'done' } })
  setChatMode('ask')
  assert.equal(await app.send('where is the login route?'), true)
  assert.deepEqual(app.calls.filter(c => c[0] === 'api'), [['api', '/api/runs/r2/app/ask', { text: 'where is the login route?' }]])
  assert.deepEqual(app.calls.filter(c => c[0] === 'wait' || c[0] === 'bot'), [['wait', 'Reading the app'], ['bot', 'It has two pages.']])
  const busy = fake({ run: 'r2', appv: { run: 'r2', hasApp: false, state: 'working' } })
  setChatMode('ask')
  assert.equal(await busy.send('what are you on?'), true)
  assert.deepEqual(busy.calls, [['appAsk', 'what are you on?']])
})

test('Plan starts the planner\'s talk and builds nothing; an open talk takes the words itself', async () => {
  const site = fake({ run: 'r1', site: true })
  assert.equal(await site.send('/plan a members area'), true)
  assert.deepEqual(site.calls.filter(c => c[0] !== 'feed'), [['talkStart', 'a members area', 'site', 'r1', false]])
  const app = fake({ run: 'r2', appv: { run: 'r2', hasApp: true, state: 'done' } })
  setChatMode('plan')
  await app.send('add bookings')
  assert.deepEqual(app.calls, [['talkStart', 'add bookings', 'app', 'r2', undefined]])
  const none = fake()
  setChatMode('plan')
  await none.send('a site for my bakery')
  assert.deepEqual(none.calls, [['talkStart', 'a site for my bakery', 'site', null, true]])
  const talking = fake({ talking: true })
  setChatMode('plan')
  assert.equal(await talking.send('and a blog'), false)
  assert.deepEqual(talking.calls, [])
})

test('Fix asks the doctor, shows its steps as buttons, and a typed yes takes the first', async () => {
  const acts = [{ id: 'setup:pictures', kind: 'setup', row: 'pictures', part: 'pictures', group: 'every', label: 'Open Setup: Pictures' }]
  const c = fake({ run: 'r1', reply: () => ({ reply: 'Pictures are out of quota.', actions: acts }) })
  global.document = { createElement: () => ({ append() {}, remove() {}, set className(v) {}, set textContent(v) {} }) }
  try {
    assert.equal(await c.send('/fix'), true)
    assert.equal(chatMode.button.label, 'Send: Fix')
    assert.equal(await c.send('why did the picture fail?'), true)
    assert.deepEqual(c.calls.filter(x => x[0] === 'api'), [['api', '/api/doctor', { text: 'why did the picture fail?', run: 'r1' }]])
    assert.deepEqual(c.calls.filter(x => x[0] === 'wait' || x[0] === 'bot'), [['wait', 'Checking the Studio'], ['bot', 'Pictures are out of quota.']])
    assert.equal(await c.send('yes'), true)
    assert.deepEqual(c.calls.at(-1), ['setup', ['pictures']])
    // the offer is spent: another yes is a question for the doctor again
    await c.send('yes')
    assert.equal(c.calls.filter(x => x[0] === 'api').length, 2)
    // a part in the Parts list opens on its group and row
    const parts = fake({ reply: () => ({ reply: 'Godot is missing.', actions: [{ kind: 'setup', row: 'parts', group: 'game', part: 'godot', label: 'Open Setup: Godot 4' }] }) })
    setChatMode('fix')
    await parts.send('godot?'); await parts.send('ok')
    assert.deepEqual(parts.calls.at(-1), ['setup', ['parts', 'game', 'godot']])
  } finally { delete global.document; setChatMode('build') }
})

test('the page has one row: mode, agents, model, send; names only, and the files load in order', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  const row = html.match(/<form id="brief-form"[\s\S]*?<div class="row">([\s\S]*?)<\/div>/)[1]
  assert.deepEqual([...row.matchAll(/<(?:button|select)[^>]* id="([\w-]+)"|<button type="(submit)"/g)].map(m => m[1] || m[2]), ['chat-mode', 'agents-btn', 'agents', 'build-model', 'submit'])
  const sel = row.match(/<button type="button" id="chat-mode"[^>]*>([\s\S]*?)<\/button>/)
  assert.match(sel[0], /value="build"/)
  // its accessible name holds the word it shows
  assert.match(sel[0], /aria-label="Mode: Build"/)
  assert.equal(sel[1], '<span class="t">Build</span>')
  // every chip opens a menu; the count's own select is kept only as the value the build reads
  for (const id of ['chat-mode', 'agents-btn', 'build-model']) assert.match(row.match(new RegExp(`<button type="button" id="${id}"[^>]*>`))[0], /aria-haspopup="menu" aria-expanded="false"/)
  assert.match(row, /<select id="agents" hidden /)
  // the send button is an arrow with a name, so the row never says Build twice
  const send = row.match(/<button type="submit"[^>]*>([\s\S]*?)<\/button>/)
  assert.match(send[0], /aria-label="Send: Build"/)
  assert.doesNotMatch(send[1].replace(/<svg[\s\S]*<\/svg>/, ''), /\S/)
  // a role's name is never shown as a model
  assert.doesNotMatch(row, />\s*(worker|planner)\s*</i)
  assert.doesNotMatch(row, /title=|data-tip/)
  const page = readFileSync(new URL('../server/page.mjs', import.meta.url), 'utf8')
  const list = page.match(/joinModules\(webDir, \['route\.js'[^\]]*\]/)[0]
  assert.ok(list.indexOf("'chatmode.js'") > list.indexOf("'icons.js'") && list.indexOf("'chatmode.js'") < list.indexOf("'canvas/loop.js'"))
  assert.ok(list.indexOf("'composer.js'") > 0 && list.indexOf("'composer.js'") < list.indexOf("'chatmode.js'"))
  assert.equal(page.split("'composer.js'").length, 2, 'listed once')
})

test('every mode has one short plain line, and the slash list says the same', () => {
  assert.deepEqual(Object.keys(MODE_LINE), CHAT_MODES)
  for (const m of CHAT_MODES) {
    const words = MODE_LINE[m].split(/\s+/).length
    assert.ok(words >= 4 && words <= 9, `${m}: ${words} words`)
    assert.match(MODE_LINE[m], /\.$/)
  }
  // Fix is about the Studio's own parts, not the project (docs/specs/46-chat-modes.md "Fix")
  assert.match(MODE_LINE.fix, /the Studio/)
  assert.match(MODE_LINE.ask, /Changes nothing/)
  const loop = readFileSync(new URL('../web/canvas/loop.js', import.meta.url), 'utf8')
  for (const m of ['ask', 'plan', 'build']) assert.ok(loop.includes(`['${m}', `) && loop.includes(`MODE_LINE.${m}]`), m)
  assert.match(loop, /\['fix', '\[what to change\]', `\$\{MODE_LINE\.fix\} With words: /)
  const css = readFileSync(new URL('../web/canvas.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css.match(/\.chip-pop[^\n]*/g).join('\n'), /animation|transition/)
})

test('the open menu: arrows go round, Home and End jump, other keys are left alone', () => {
  assert.equal(chipMenuKey('ArrowDown', 0, 4), 1)
  assert.equal(chipMenuKey('ArrowDown', 3, 4), 0)
  assert.equal(chipMenuKey('ArrowUp', 0, 4), 3)
  assert.equal(chipMenuKey('ArrowUp', -1, 4), 2)
  assert.equal(chipMenuKey('Home', 2, 4), 0)
  assert.equal(chipMenuKey('End', 1, 4), 3)
  assert.equal(chipMenuKey('Enter', 1, 4), -1)
  assert.equal(chipMenuKey('a', 1, 4), -1)
  assert.equal(chipMenuKey('ArrowDown', 0, 0), -1)
})

test('the mode button is painted with the mode: its value, its word and its name', () => {
  const attrs = {}, word = { textContent: 'Build' }
  const button = { value: 'build', hidden: false, addEventListener() {}, querySelector: q => (q === '.t' ? word : null), setAttribute: (k, v) => { attrs[k] = v } }
  mountChatMode({ select: button, button: sendFake(), talking: () => false })
  try {
    setChatMode('fix')
    assert.deepEqual([button.value, word.textContent, attrs['aria-label'], chatMode.button.label], ['fix', 'Fix', 'Mode: Fix', 'Send: Fix'])
    // a hosted studio has no switch
    const off = { value: 'build', hidden: false, addEventListener() { throw new Error('not wired') } }
    mountChatMode({ select: off, button: sendFake(), talking: () => false, off: true })
    assert.equal(off.hidden, true)
  } finally { mountChatMode({ select: null, button: null, talking: () => false }); setChatMode('build') }
})

test('the box says what the mode will do, the room keeps its words in Build, and agents is off where nothing is built', () => {
  const box = { placeholder: 'Describe a product' }, agents = { disabled: false }
  let talking = false
  mountChatMode({ select: { value: 'build', hidden: false }, button: sendFake(), talking: () => talking, box, agents })
  try {
    setChatMode('ask')
    assert.deepEqual([box.placeholder, agents.disabled], [MODE_PLACEHOLDER.ask, true])
    setChatMode('plan')
    assert.deepEqual([box.placeholder, agents.disabled], [MODE_PLACEHOLDER.plan, false])
    // a room writes its own while Fix is on: it is kept for Build
    setChatMode('fix')
    box.placeholder = 'Change the app'
    setChatMode('fix')
    assert.deepEqual([box.placeholder, agents.disabled], [MODE_PLACEHOLDER.fix, true])
    setChatMode('build')
    assert.deepEqual([box.placeholder, agents.disabled], ['Change the app', false])
    // a talk's own placeholder is left alone
    setChatMode('plan'); talking = true; box.placeholder = 'Tell Hermia…'; setChatMode('ask')
    assert.equal(box.placeholder, 'Tell Hermia…')
    for (const p of Object.values(MODE_PLACEHOLDER)) assert.ok(p.split(/\s+/).length <= 6, p)
    // Build over an open build: sending changes it
    talking = false
    let built = false
    const b2 = { placeholder: 'Describe a product. The swarm designs and builds its site.' }
    mountChatMode({ select: { value: 'build', hidden: false }, button: sendFake(), talking: () => false, box: b2, built: () => built })
    setChatMode('build')
    assert.match(b2.placeholder, /^Describe a product/)
    built = true; setChatMode('ask'); setChatMode('build')
    assert.equal(b2.placeholder, CHANGE_PLACEHOLDER)
    built = false; setChatMode('build')
    assert.match(b2.placeholder, /^Describe a product/)
  } finally { mountChatMode({ select: null, button: null, talking: () => false }); setChatMode('build') }
})

test('the model chip: real names only, never a role name; the planner only when it is another model', () => {
  for (const m of ['worker', 'planner', 'reviewer', 'Worker', 'worker:gpt-9', 'off', '', null, undefined, 7]) assert.equal(realModel(m), '', String(m))
  assert.equal(realModel(' nous/hermes-4 '), 'nous/hermes-4')
  const names = r => r.items.map(i => i.name)
  // under Hermes with nothing picked: the server only knows the role names; the slot's real name shows
  let r = builderModels({ picked: null, base: 'worker', slot: 'anthropic/claude-sonnet-5', plannerBase: 'planner', plannerSlot: 'anthropic/claude-sonnet-5', recent: [] })
  assert.deepEqual([r.now, r.name, names(r)], ['', 'claude-sonnet-5', ['claude-sonnet-5', 'Other…']])
  // the planner runs on another model: it is offered, by its own name
  r = builderModels({ base: 'worker', slot: 'a/builder-1', plannerBase: 'planner', plannerSlot: 'b/thinker-2', recent: ['worker', 'planner', 'c/old-3'] })
  assert.deepEqual(names(r), ['builder-1', 'old-3', 'thinker-2', 'Other…'])
  // the real name cannot be known: one plain name, nothing that reads as a mode or a role
  r = builderModels({ base: 'worker', plannerBase: 'planner', plannerPicked: 'planner' })
  assert.deepEqual([r.name, names(r)], [NO_MODEL_NAME, [NO_MODEL_NAME, 'Other…']])
  assert.doesNotMatch(names(r).join(' '), /worker|planner|build/i)
  // a pick is what the chip says, and is marked in the list; Other… is an action, not a choice
  r = builderModels({ picked: 'x/fast-1', base: 'cb/deepseek-v4.1-flash', plannerBase: 'cb/deepseek-v4.1-flash', recent: ['x/fast-1'] })
  assert.deepEqual([r.now, r.name, names(r)], ['x/fast-1', 'fast-1', ['deepseek-v4.1-flash', 'fast-1', 'Other…']])
  assert.deepEqual(r.items.map(i => i.radio !== false), [true, true, false])
  assert.deepEqual(builderModels().items.map(i => i.value), ['', '__other'])
})
