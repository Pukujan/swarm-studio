// A trace of every model call, kept with the run in trace.jsonl: who asked
// (the planner, a builder, the reviewer), for which section, the messages sent,
// the raw text that came back, tokens, time and any error. Hermes traces its own
// agent loop, but the swarm calls models straight from this server, so without
// this nobody can see why an agent did what it did.
//
// The run and the labels travel with the async work (AsyncLocalStorage), so a
// call site only says what it knows: traced({ kind: 'fix', layer }, () => ...).
// With HERMES_LANGFUSE_* (or LANGFUSE_*) keys set, each call also goes to Langfuse,
// into the same project as the Hermes traces.

import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const store = new AsyncLocalStorage()
const MAX = 60000 // chars kept per message and per answer

export const traced = (labels, fn) => store.run({ ...store.getStore(), ...labels }, fn)
export const traceFile = dir => join(dir, 'trace.jsonl')

// Pictures (a screenshot for the reviewer) become a note of their size, not base64.
function clean(content) {
  if (typeof content === 'string') return content.length > MAX ? `${content.slice(0, MAX)}… [${content.length - MAX} more chars]` : content
  if (Array.isArray(content)) return content.map(p => p?.type === 'image_url' ? { type: 'image', kb: Math.round(String(p.image_url?.url || '').length * 0.75 / 1024) } : p?.type === 'text' ? { type: 'text', text: clean(p.text) } : p)
  return content
}

let seq = 0
export function traceCall({ label = {}, provider, model, messages, maxTokens, temperature, started, res, error }) {
  const ctx = { ...store.getStore(), ...label }
  const { dir, sink, ...labels } = ctx
  if (!dir && !sink) return
  const rec = {
    id: `${Date.now().toString(36)}-${(seq++).toString(36)}`,
    t: Date.now(),
    ...labels,
    model,
    host: (() => { try { return new URL(provider.baseUrl).host } catch { return '' } })(),
    ok: !error,
    ms: Math.round(performance.now() - started),
    ttftMs: res?.ttftMs != null ? Math.round(res.ttftMs) : null,
    tokens: { in: res?.usage?.prompt_tokens ?? null, out: res?.outputTokens ?? null },
    reasoningChars: res?.reasoningChars || 0,
    maxTokens, temperature,
    messages: messages.map(m => ({ role: m.role, content: clean(m.content) })),
    output: res ? clean(res.text) : '',
    error: error ? String(error.message || error).slice(0, 500) : undefined
  }
  if (dir) try { appendFileSync(traceFile(dir), JSON.stringify(rec) + '\n') } catch {}
  sink?.(rec)
  langfuse(rec)
}

// The calls of a run, newest last. Light by default: no messages or output.
export function readTrace(dir, { full = false } = {}) {
  const f = traceFile(dir)
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => {
    try {
      const r = JSON.parse(l)
      if (full) return r
      const { messages, output, ...rest } = r
      return { ...rest, chars: { in: messages.reduce((n, m) => n + JSON.stringify(m.content).length, 0), out: output.length }, preview: output.replace(/\s+/g, ' ').slice(0, 140) }
    } catch { return null }
  }).filter(Boolean)
}

// ---------- Langfuse: one trace per model call, grouped by run as the session.

const env = k => process.env[`HERMES_LANGFUSE_${k}`] || process.env[`LANGFUSE_${k}`]
let pending = [], timer = null
function langfuse(rec) {
  const pk = env('PUBLIC_KEY'), sk = env('SECRET_KEY')
  if (!pk || !sk) return
  const rate = Number(env('SAMPLE_RATE') ?? 1)
  if (Math.random() >= rate) return
  const cap = Number(env('MAX_CHARS') || 12000)
  const cut = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > cap ? `${s.slice(0, cap)}…` : v }
  const traceId = randomUUID(), at = new Date(rec.t - rec.ms).toISOString(), end = new Date(rec.t).toISOString()
  const name = ['swarm', rec.kind, rec.layer || rec.page].filter(Boolean).join(':')
  const meta = { agent: rec.agent, page: rec.page, layer: rec.layer, host: rec.host, ttftMs: rec.ttftMs }
  pending.push(
    { id: randomUUID(), type: 'trace-create', timestamp: end, body: { id: traceId, name, sessionId: rec.run, timestamp: at, tags: ['swarm-studio', rec.kind].filter(Boolean), metadata: meta, environment: env('ENV'), release: env('RELEASE') } },
    { id: randomUUID(), type: 'generation-create', timestamp: end, body: {
      id: randomUUID(), traceId, name, model: rec.model, startTime: at, endTime: end,
      completionStartTime: rec.ttftMs != null ? new Date(rec.t - rec.ms + rec.ttftMs).toISOString() : undefined,
      input: rec.messages.map(m => ({ role: m.role, content: cut(m.content) })), output: cut(rec.output),
      modelParameters: { max_tokens: rec.maxTokens, temperature: rec.temperature },
      usage: { input: rec.tokens.in ?? undefined, output: rec.tokens.out ?? undefined },
      level: rec.ok ? 'DEFAULT' : 'ERROR', statusMessage: rec.error, metadata: meta
    } }
  )
  timer ??= setTimeout(flush, 2000)
}
function flush() {
  timer = null
  const batch = pending.splice(0)
  if (!batch.length) return
  const base = (env('BASE_URL') || env('HOST') || 'https://cloud.langfuse.com').replace(/\/$/, '')
  fetch(`${base}/api/public/ingestion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${env('PUBLIC_KEY')}:${env('SECRET_KEY')}`).toString('base64')}` },
    body: JSON.stringify({ batch }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => {})
}
