// A headless build has nobody to answer dyad's own questions (docs/engines/dyad.md, Limits): the tools that
// wait for a person in dyad's window are switched off for the runner, and a model that calls one anyway
// is told so and goes on. The first test needs no engine; the second runs the real runner against a
// stand-in gateway that scripts the model's replies, and is skipped where the engine is not bundled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dyadDir, engineFresh, runEngine, noResult, logTail, stepOf, ALONE } from '../engine/appbuild.mjs'

const toolsDir = join(dyadDir, 'src', 'pro', 'main', 'ipc', 'handlers', 'local_agent', 'tools')

// dyad/src/aba/headless_args.ts has no imports, so node loads it as it is (it strips the types)
test('every dyad tool that waits for a person is off in a headless run', async () => {
  const { HEADLESS_OFF_TOOLS } = await import('../dyad/src/aba/headless_args.ts')
  // a tool waits for a person when it parks a request in dyad's user-input registry
  const waits = readdirSync(toolsDir).filter(f => f.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(f))
    .filter(f => /userInputRegistry\s*\.\s*park\(/.test(readFileSync(join(toolsDir, f), 'utf8')))
    .map(f => /^\s*name: "([a-z_]+)"/m.exec(readFileSync(join(toolsDir, f), 'utf8'))?.[1] || f).sort()
  assert.deepEqual(waits, ['add_integration', 'exit_plan', 'generate_test_assertions', 'planning_questionnaire', 'suggest_plugin'])
  assert.deepEqual([...HEADLESS_OFF_TOOLS].sort(), waits, 'a new tool that waits for a person must be added to HEADLESS_OFF_TOOLS (dyad/src/aba/headless_args.ts)')
  // the boot hands the list to dyad as "never" consents, which is what removes a tool from a turn
  const boot = readFileSync(join(dyadDir, 'src', 'aba', 'headless.ts'), 'utf8')
  assert.match(boot, /HEADLESS_OFF_TOOLS\.map\(\(name\) => \[name, "never"\]\)/)
  const defs = readFileSync(join(toolsDir, '..', 'tool_definitions.ts'), 'utf8')
  assert.match(defs, /if \(getAgentToolConsent\(tool\.name\) === "never"\) \{\s*return false;/)
})

test('an engine that ends with no result is said in plain words, without the lines every run prints', () => {
  assert.equal(noResult(), 'The app engine stopped before it finished')
  assert.equal(noResult('Error: no such model'), 'The app engine stopped before it finished: Error: no such model')
  const log = join(mkdtempSync(join(tmpdir(), 'swarm-log-')), 'engine.log')
  // what the run of 2026-11-14 left in its log: two lines every run prints, and no error of its own
  writeFileSync(log, '\n===== old\nError: an older run\n===== now\n  error: Error: ABA egress guard: refused a request to "127.0.0.1:9" (allowed: 127.0.0.1:55288)\n09:25 (system_prompt) › Error reading AI_RULES.md, fallback to default AI rules: Error: ENOENT: no such file\n')
  assert.equal(logTail(log), '')
  writeFileSync(log, '\n===== now\n  error: Error: ABA egress guard: refused a request to "127.0.0.1:9" (allowed: x)\nError: HTTP 429 usage limit\n')
  assert.equal(logTail(log), 'Error: HTTP 429 usage limit')
  assert.equal(logTail(join(tmpdir(), 'no-such-engine.log')), '')
})

test('a turn that ended on a tool nobody can answer is seen, and the runner says so and goes on', async () => {
  const { offToolStop, nobodyHere } = await import('../dyad/src/aba/headless_args.ts')
  // what dyad keeps of a refused call (seen in the chat's own rows after a run with the stand-in gateway)
  const refused = name => `<dyad-status title="Tool &quot;${name}&quot; failed" state="error">\nModel tried to call unavailable tool '${name}'. Available tools: write_file, read_file.\n</dyad-status>\n`
  assert.equal(offToolStop(refused('planning_questionnaire') + refused('add_integration')), 'add_integration')
  assert.equal(offToolStop(refused('exit_plan')), 'exit_plan')
  // the model went on by itself after the refusal, or another tool failed, or nothing was said: no extra turn
  assert.equal(offToolStop(refused('add_integration') + 'I will keep the data in a server-side store.'), null)
  assert.equal(offToolStop(refused('add_integration') + '<dyad-write path="a.ts">x</dyad-write>'), null)
  assert.equal(offToolStop(refused('write_file')), null)
  for (const nothing of ['', null, undefined, 'Done.']) assert.equal(offToolStop(nothing), null)
  assert.match(nobodyHere('add_integration'), /^Nobody is here to answer: .*`add_integration` is not available\. Do not call it again\. Decide for yourself/)
  // the Studio shows it as a step of the build, and says the same at the end of every build prompt
  assert.deepEqual(stepOf('[aba-headless] add_integration needs a person; going on without one'), { kind: 'think', text: 'nobody to ask: deciding alone' })
  assert.match(ALONE, /Nobody is here to answer questions.*`planning_questionnaire`, `add_integration`, `suggest_plugin` and `exit_plan`.*Decide for yourself/)
})

// An OpenAI-style gateway that plays a script instead of a model: each request that offers tools gets the
// next reply (the last one again when they run out). A reply is words, or { tool, args } for a tool call.
async function gateway(script) {
  const seen = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) return res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not here"}')
      const ask = JSON.parse(body || '{}')
      const results = (ask.messages || []).filter(m => m.role === 'tool')
      // a side request (a title, a summary) has no tools: it gets words
      const text = m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      const reply = ask.tools?.length ? (script.length > 1 ? script.shift() : script[0]) : 'ok'
      seen.push({ users: (ask.messages || []).filter(m => m.role === 'user').map(text), tools: (ask.tools || []).map(t => t.function?.name), system: (ask.messages || []).filter(m => m.role === 'system').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n'), results: results.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) })
      const delta = typeof reply === 'string' ? { role: 'assistant', content: reply }
        : { role: 'assistant', tool_calls: [{ index: 0, id: `call_${results.length}`, type: 'function', function: { name: reply.tool, arguments: JSON.stringify(reply.args || {}) } }] }
      const finish = typeof reply === 'string' ? 'stop' : 'tool_calls'
      const chunk = (d, f = null) => ({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: ask.model, choices: [{ index: 0, delta: d, finish_reason: f }] })
      if (!ask.stream) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: ask.model, choices: [{ index: 0, message: delta, finish_reason: finish }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }))
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const c of [chunk(delta), chunk({}, finish), { ...chunk({}), choices: [], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }]) res.write(`data: ${JSON.stringify(c)}\n\n`)
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { seen, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise(r => server.close(r)) }
}

// The smallest app the runner will gate: a build script that passes, its packages "installed", one commit.
function tinyApp() {
  const root = mkdtempSync(join(tmpdir(), 'swarm-asks-')), app = join(root, 'app')
  mkdirSync(join(app, 'node_modules'), { recursive: true })
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'tiny', private: true, scripts: { build: 'node -e ""' } }))
  writeFileSync(join(app, '.gitignore'), 'node_modules\n')
  const g = (...a) => execFileSync('git', a, { cwd: app, stdio: 'ignore' })
  g('init', '-q'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@localhost', 'commit', '-qm', 'init')
  return app
}

const skip = engineFresh() ? false : 'the app engine is not bundled from this source here (a first app build, or setupEngine(), bundles it)'
// the runner is stopped if it ever waits again: runEngine waits for the engine to close, and a test timeout would not close it
const within = ms => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) } }
const OFF = ['planning_questionnaire', 'add_integration', 'suggest_plugin', 'exit_plan', 'generate_test_assertions']

test('a build whose model calls planning_questionnaire or add_integration goes on and ends with a result', { skip, timeout: 240000 }, async () => {
  const gw = await gateway([
    { tool: 'planning_questionnaire', args: { questions: [{ type: 'text', question: 'Which colours?' }] } },
    // dyad ends the turn on this call, refused or not: the runner starts the next one itself
    { tool: 'add_integration', args: {} },
    { tool: 'write_file', args: { path: 'NOTES.md', content: 'decided alone\n', description: 'notes' } },
    'Built it without asking.'
  ])
  const limit = within(90000)
  try {
    const steps = []
    const r = await runEngine({ workspace: tinyApp(), prompt: 'Make a small page.', provider: { baseUrl: gw.baseUrl, apiKey: 'k' }, model: 'stub', turns: 1, viewRender: false, onStep: s => steps.push(s.text), signal: limit.signal })
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.equal(r.gatesPassed, true)
    assert.ok(r.files.includes('NOTES.md'), `the build went on past both calls and wrote its file: ${JSON.stringify(r.files)}`)
    assert.equal(r.turns, 2)
    const turns = gw.seen.filter(s => s.tools.length)
    assert.equal(turns.length, 4)
    for (const t of turns) for (const name of OFF) assert.ok(!t.tools.includes(name), `${name} was offered`)
    assert.ok(turns[0].tools.includes('write_file'))
    assert.ok(turns[0].users.at(-1).endsWith(ALONE))
    // dyad's prompt has a branch that ends the turn when the questionnaire is off and a blueprint is due: not taken
    assert.doesNotMatch(turns[0].system, /disabled in Settings/)
    // what the model was told when it called a tool it was not given, and after the turn dyad ended there
    assert.match(turns[1].results.at(-1), /unavailable tool 'planning_questionnaire'/)
    assert.match(turns[2].users.at(-1), /^Nobody is here to answer: .*`add_integration` is not available/)
    assert.ok(steps.includes('nobody to ask: deciding alone'), steps.join(' | '))
  } finally { limit.done(); await gw.close() }
})

test('dyad\'s plan mode headless: a questionnaire call no longer ends the run without a result', { skip, timeout: 240000 }, async () => {
  const gw = await gateway([
    { tool: 'planning_questionnaire', args: { questions: [{ type: 'text', question: 'Which colours?' }] } },
    'The plan: one page with a heading.'
  ])
  const limit = within(90000)
  try {
    const r = await runEngine({ workspace: tinyApp(), prompt: 'Plan a small page.', provider: { baseUrl: gw.baseUrl, apiKey: 'k' }, model: 'stub', mode: 'plan', signal: limit.signal })
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.equal(r.answer, 'The plan: one page with a heading.')
    const turns = gw.seen.filter(s => s.tools.length)
    assert.ok(turns[0].tools.includes('write_plan'))
    for (const name of OFF) assert.ok(!turns[0].tools.includes(name), `${name} was offered`)
  } finally { limit.done(); await gw.close() }
})
