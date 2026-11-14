// Ask mode's answers (engine/ask.mjs for a website or nothing built; engine/appjob.mjs askPrompt and
// engine/appbuild.mjs for a built app, through dyad's own ask mode) and the headless runner's --mode.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { answerOnly, ASK_PROMPT } from '../engine/ask.mjs'
import { engineArgs, ENGINE_MODES, sourceStamp, runEngine } from '../engine/appbuild.mjs'
import { askPrompt, appJobs } from '../engine/appjob.mjs'
import { claimsDoing } from '../engine/honest.mjs'

const scripted = replies => { const seen = []; return { seen, chat: async m => { seen.push(m); return replies.shift() } } }
const said = text => [{ who: 'you', text }]

test('Ask answers only: the prompt offers no build, and the project and Studio state are what it answers from', async () => {
  const p = ASK_PROMPT('site', 'Pages: Home, Menu.', 'Setup parts: 16 of 23 working.')
  assert.match(p, /Ask mode/)
  assert.match(p, /Do not offer to build, plan or change anything/)
  assert.match(p, /cannot install, restart, update or change anything/)
  assert.match(p, /Pages: Home, Menu\./)
  assert.match(p, /16 of 23 working/)
  assert.match(ASK_PROMPT('game'), /Nothing is built in this chat yet/)
  const m = scripted(['It has **two** pages: Home and Menu.'])
  assert.deepEqual(await answerOnly({ said: said('how many pages?'), chat: m.chat, project: 'Pages: Home, Menu.' }), { reply: 'It has two pages: Home and Menu.' })
  assert.equal(m.seen[0].at(-1).content, 'how many pages?')
  // earlier questions in the session stay in view
  const two = scripted(['Menu has the price list.'])
  await answerOnly({ said: [{ who: 'you', text: 'how many pages?' }, { who: 'hermia', text: 'Two.' }, { who: 'you', text: 'and which has prices?' }], chat: two.chat })
  assert.deepEqual(two.seen[0].map(x => x.role), ['system', 'user', 'assistant', 'user'])
})

test('Ask never turns into a build, and never says it will install something', async () => {
  // the planner's talk answers "build" with a brief in JSON; in Ask that is not an answer: asked again in words
  const m = scripted(['{"build": true, "brief": "A bakery site"}', 'A bakery site would have a menu and an order form.'])
  assert.equal((await answerOnly({ said: said('what would a bakery site have?'), chat: m.chat })).reply, 'A bakery site would have a menu and an order form.')
  await assert.rejects(answerOnly({ said: said('hi'), chat: async () => '{"build": true, "brief": "x"}' }), /did not answer/)
  await assert.rejects(answerOnly({ said: [], chat: async () => 'x' }), /ask something first/)
  // the Pillow exchange, asked of the planner
  const lie = scripted(['Yes, I\'ll install Pillow now.', 'Sure, installing it now.'])
  const r = await answerOnly({ said: said('can u install pillow then?'), chat: lie.chat })
  assert.equal(claimsDoing(r.reply, true), false)
  assert.match(r.reply, /cannot install, restart or change anything/)
})

test('the engine\'s arguments: a build is as before, ask is one read-only turn', () => {
  const base = { promptFile: 'p.md', workspace: '/w/app', model: 'm', gateway: 'http://g/v1', dataDir: '/w/.engine/data-m' }
  // a build passes no --mode, so a runner bundled before the flag existed still takes it
  assert.deepEqual(engineArgs({ ...base, turns: 6 }), ['--prompt', 'p.md', '--workspace', '/w/app', '--model', 'm', '--gateway', 'http://g/v1', '--turns', '6', '--user-data-dir', '/w/.engine/data-m', '--json', '--view-render'])
  assert.deepEqual(engineArgs({ ...base, turns: 6, mode: 'ask' }), ['--prompt', 'p.md', '--workspace', '/w/app', '--model', 'm', '--gateway', 'http://g/v1', '--turns', '1', '--user-data-dir', '/w/.engine/data-m', '--json', '--mode', 'ask'])
  assert.ok(engineArgs({ ...base, mode: 'plan' }).includes('plan'))
  assert.ok(!engineArgs({ ...base, viewRender: false }).includes('--view-render'))
  assert.throws(() => engineArgs({ ...base, mode: 'agent' }), /no engine mode/)
  assert.deepEqual(ENGINE_MODES, ['local-agent', 'build', 'ask', 'plan'])
  assert.match(askPrompt('  what pages are there? '), /^what pages are there\?\n\n\(Answer the question asked/)
  assert.match(askPrompt('x'), /you change nothing/)
})

test('the bundle\'s stamp follows dyad\'s source, so a changed runner is bundled again', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-stamp-'))
  mkdirSync(join(dir, 'src', 'aba'), { recursive: true })
  writeFileSync(join(dir, 'src', 'aba', 'headless_cli.ts'), 'a')
  writeFileSync(join(dir, 'vite.aba-headless.config.mts'), 'c')
  const one = sourceStamp(dir)
  assert.equal(sourceStamp(dir), one)
  writeFileSync(join(dir, 'src', 'aba', 'headless_cli.ts'), 'b')
  const two = sourceStamp(dir)
  assert.notEqual(two, one)
  writeFileSync(join(dir, 'src', 'aba', 'headless_args.ts'), 'a')
  assert.notEqual(sourceStamp(dir), two)
  // the same files under another folder give the same stamp: it is about the source, not where it is installed
  const other = mkdtempSync(join(tmpdir(), 'swarm-stamp-'))
  mkdirSync(join(other, 'src', 'aba'), { recursive: true })
  writeFileSync(join(other, 'src', 'aba', 'headless_cli.ts'), 'a')
  writeFileSync(join(other, 'vite.aba-headless.config.mts'), 'c')
  assert.equal(sourceStamp(other), one)
})

test('an app is asked only when there is one, never while it builds, and a question never seeds or installs', async () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-askapp-'))
  const events = { building: [{ type: 'app:start', t: Date.now(), pid: process.ppid }], built: [{ type: 'app:start', t: 1 }, { type: 'app:done', t: 2 }], none: [] }
  const a = appJobs({ runsDir, record: () => {}, broadcast: () => {}, readEvents: id => events[id] || [], provider: () => ({ baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k' }), modelFor: () => 'm', sweepEvery: 1e9 })
  try {
    await assert.rejects(a.ask('built', '  '), /ask something/)
    // another Studio is building it (its start is the last word, and that process, here the test's parent, is alive)
    await assert.rejects(a.ask('building', 'what is it doing?'), e => e.busy === true)
    // nothing built, or no engine on this machine: no answer from dyad, and the reason; nothing was created
    const r = await a.ask('none', 'what is this?')
    assert.equal(r.answer, '')
    assert.match(r.why, /not installed yet|no app is built yet/)
    await assert.rejects(runEngine({ workspace: join(runsDir, 'none', 'app'), prompt: 'q', provider: { baseUrl: 'x' }, model: 'm', mode: 'ask' }), /no app here yet/)
  } finally { await a.close?.() }
})

// dyad/src/aba/headless_args.ts has no imports, so node loads it as it is (it strips the types)
test('the headless runner\'s --mode: four modes, local-agent by default, and ask or plan never wipe or seed', async () => {
  const { parseArgs, talkOnly, cleanAnswer, CHAT_MODES, USAGE } = await import('../dyad/src/aba/headless_args.ts')
  assert.deepEqual([...CHAT_MODES], ['build', 'ask', 'local-agent', 'plan'])
  assert.equal(parseArgs(['--prompt', 'p', '--workspace', 'w']).mode, 'local-agent')
  for (const m of CHAT_MODES) assert.equal(parseArgs(['--workspace', 'w', '--mode', m]).mode, m)
  assert.throws(() => parseArgs(['--mode', 'agent']), /--mode must be one of build, ask, local-agent, plan, got "agent"/)
  assert.throws(() => parseArgs(['--mode']), /--mode requires a value/)
  assert.throws(() => parseArgs(['--mode', '--json']), /--mode requires a value/)
  // ask and plan read an app that is there: --out would wipe it, a scaffold would seed it
  assert.throws(() => parseArgs(['--mode', 'ask', '--out', 'o']), /use --workspace, not --out/)
  assert.throws(() => parseArgs(['--out', 'o', '--mode', 'plan']), /use --workspace, not --out/)
  assert.throws(() => parseArgs(['--mode', 'ask', '--workspace', 'w', '--scaffold', 's']), /takes no --scaffold/)
  assert.equal(parseArgs(['--mode', 'build', '--out', 'o']).out, 'o')
  assert.deepEqual([talkOnly('ask'), talkOnly('plan'), talkOnly('build'), talkOnly('local-agent')], [true, true, false, false])
  // the other flags are as they were
  const a = parseArgs(['--prompt', 'p', '--workspace', 'w', '--model', 'm', '--gateway', 'g', '--turns', '3', '--json', '--view-render'])
  assert.deepEqual([a.turns, a.json, a.viewRender, a.egressGuard, a.smoke], [3, true, true, true, false])
  assert.throws(() => parseArgs(['--nope']), /unknown argument: --nope/)
  assert.match(USAGE, /--mode <mode>/)
  // the answer is the assistant's words, without dyad's own tags or its thinking
  assert.equal(cleanAnswer('<think>look first</think>It has one page.\n<dyad-read path="src/App.tsx"></dyad-read>\n\n\n<dyad-status title="Read">done</dyad-status>Index is the only route.'), 'It has one page.\n\nIndex is the only route.')
  assert.equal(cleanAnswer(null), '')
})
