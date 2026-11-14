// The chat's modes (web/chatmode.js): the typed switch, and where a message goes per mode and state.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readMode, modeRoute, modeWord, isYes, CHAT_MODES, chatMode, setChatMode, modeSend, mountChatMode } from '../web/chatmode.js'
import { CANVAS_MODULES } from '../server/page.mjs'

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
  mountChatMode({ select: { value: 'build', hidden: false, addEventListener() {} }, button: { textContent: 'Build' }, talking: () => !!over.talking })
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
  assert.deepEqual([chatMode.now, chatMode.button.textContent, chatMode.select.value, c.h.box.value], ['ask', 'Ask', 'ask', ''])
  // a slash command still runs in any mode
  assert.equal(await c.send('/review'), false)
  // /build with a brief: the mode is Build and the brief is left in the box for the chat to send
  assert.equal(await c.send('/build a bakery site'), false)
  assert.deepEqual([chatMode.now, chatMode.button.textContent, c.h.box.value], ['build', 'Build', 'a bakery site'])
  // while a talk has the box the button says Send, whatever the mode, and gets its word back after
  const t = fake({ talking: true })
  setChatMode('plan')
  assert.equal(chatMode.button.textContent, 'Send')
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
    assert.equal(chatMode.button.textContent, 'Fix')
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

test('the page has the switch, names only, and loads the mode file before the chat', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  const sel = html.match(/<select id="chat-mode"[^>]*>([\s\S]*?)<\/select>/)
  assert.ok(sel, 'the mode select is in the chat box')
  assert.deepEqual([...sel[1].matchAll(/<option value="(\w+)"( selected)?>(\w+)<\/option>/g)].map(m => [m[1], m[3], !!m[2]]), [['ask', 'Ask', false], ['plan', 'Plan', false], ['build', 'Build', true], ['fix', 'Fix', false]])
  assert.doesNotMatch(sel[0], /title=|data-tip/)
  const list = CANVAS_MODULES
  assert.ok(list.includes('chatmode.js') && list.indexOf('chatmode.js') > list.indexOf('icons.js') && list.indexOf('chatmode.js') < list.indexOf('canvas/loop.js'))
})
