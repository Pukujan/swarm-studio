// Model calls go to Hermes (Nous catalog review, point 2): the studio's planner, builders, reviewer and app
// engine call the studio's own /llm/v1 with a key that opens only that, and each call is forwarded to the
// newest Hermes bridge, which answers with ctx.llm. No provider key is in this process.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hermesLlm, roleModel, WAITING } from '../engine/hermesllm.mjs'
import { hermesBridge } from '../engine/bridge.mjs'
import { streamChat } from '../engine/llm.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
// what bridge.py sends for stream:true: one delta, the finish, usage, [DONE]
const SSE = text => ['data: ' + JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text } }] }),
  'data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), 'data: [DONE]', ''].join('\n\n')

async function studio({ fetcher, attach = true, pollMs = 20 }) {
  const bridge = hermesBridge({ fetcher })
  if (attach) bridge.attach({ url: 'http://127.0.0.1:5999', token: 'bridge-token-0123456789' })
  const events = []
  let port = 0
  const llm = hermesLlm({ bridge, port: () => port, broadcast: e => events.push(e), pollMs })
  const server = createServer((req, res) => { if (!llm.handle(req, res)) res.writeHead(404).end() })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  port = server.address().port
  return { bridge, llm, events, server, close: () => new Promise(r => server.close(r)) }
}

test('a builder call goes through /llm/v1 to the bridge, with the role as the model, and streams back', async () => {
  const seen = []
  const fetcher = async (url, init) => {
    seen.push({ url, auth: init.headers.authorization, timeout: init.headers['x-swarm-timeout'], body: JSON.parse(init.body) })
    return new Response(SSE('<section>hi</section>'), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const s = await studio({ fetcher })
  try {
    const p = s.llm.provider()
    assert.match(p.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/llm\/v1$/)
    assert.equal(p.hermes, true)
    const res = await streamChat(p, { model: roleModel('worker', 'cb/x'), messages: [{ role: 'user', content: 'go' }], maxTokens: 50, extra: { reasoning_effort: 'none' } })
    assert.equal(res.text, '<section>hi</section>')
    assert.equal(res.usage.total_tokens, 5)
    assert.equal(seen[0].url, 'http://127.0.0.1:5999/v1/chat/completions')
    assert.equal(seen[0].auth, 'Bearer bridge-token-0123456789', 'the bridge token stays in the server')
    assert.equal(seen[0].body.model, 'worker:cb/x')
    assert.equal(seen[0].body.reasoning_effort, undefined, 'ctx.llm takes no provider hints')
    assert.equal(seen[0].timeout, '300000')
  } finally { await s.close() }
})

test('only the studio key opens /llm/v1, and never from a web page', async () => {
  const s = await studio({ fetcher: async () => new Response('{}') })
  try {
    const { baseUrl, apiKey } = s.llm.provider()
    const post = headers => fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' }).then(r => r.status)
    assert.equal(await post({}), 401)
    assert.equal(await post({ authorization: 'Bearer nope' }), 401)
    assert.equal(await post({ authorization: `Bearer ${apiKey}`, origin: 'https://evil.example' }), 401)
    assert.equal((await fetch(`${baseUrl}/images/generations`, { method: 'POST', headers: { authorization: `Bearer ${apiKey}` } })).status, 404)
  } finally { await s.close() }
})

test('with Hermes closed a call waits and the canvas is told; when a bridge attaches it goes on', async () => {
  const s = await studio({ fetcher: async () => new Response(SSE('later'), { headers: { 'content-type': 'text/event-stream' } }), attach: false })
  try {
    const call = streamChat(s.llm.provider(), { model: 'planner', messages: [] })
    await new Promise(r => setTimeout(r, 120))
    assert.deepEqual(s.events, [{ type: 'hermes:waiting', message: WAITING }])
    assert.equal(s.llm.waiting(), true)
    s.bridge.attach({ url: 'http://127.0.0.1:5999', token: 'bridge-token-0123456789' })
    assert.equal((await call).text, 'later')
    assert.deepEqual(s.events.at(-1), { type: 'hermes:back' })
    assert.equal(s.llm.waiting(), false)
  } finally { await s.close() }
})

test('a wait longer than the call\'s own timeout ends with the reason', async () => {
  const s = await studio({ fetcher: async () => new Response('{}'), attach: false })
  try {
    const { baseUrl, apiKey } = s.llm.provider()
    const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'x-swarm-timeout': '60' }, body: '{}' })
    assert.equal(res.status, 503)
    assert.match((await res.json()).error.message, /hermes swarm/)
  } finally { await s.close() }
})

test('the server and the app engine hold no provider key: their key is the studio\'s own /llm/v1 key', () => {
  const server = readFileSync(`${root}server/server.mjs`, 'utf8')
  assert.doesNotMatch(server, /HERMES_CUSTOM_INFERHUB_API_KEY|setModels|models: given/)
  assert.match(server, /if \(llm\.handle\(req, res\)\) return/)
  assert.match(server, /if \(!apiKey\) return \{ \.\.\.llm\.provider\(\)/)
  const app = readFileSync(`${root}engine/appbuild.mjs`, 'utf8')
  assert.match(app, /'--gateway', provider\.baseUrl/)
  assert.match(app, /ABA_API_KEY: provider\.apiKey/)
})

test('the app engine loads no .env (it would find Hermes\'s own $HERMES_HOME/.env above an installed plugin)', async () => {
  const { NO_ENV_FILE } = await import('../engine/appbuild.mjs')
  const { existsSync } = await import('node:fs')
  assert.equal(existsSync(NO_ENV_FILE), false)
  const app = readFileSync(`${root}engine/appbuild.mjs`, 'utf8')
  assert.match(app, /ABA_ENV_FILE: NO_ENV_FILE/)
  // the engine honours it: an ABA_ENV_FILE that is not a file means no .env at all
  const cfg = readFileSync(`${root}dyad/src/lib/aba_model_config.ts`, 'utf8')
  assert.match(cfg, /if \(explicit\) return existsSync\(explicit\) \? explicit : undefined;/)
})
