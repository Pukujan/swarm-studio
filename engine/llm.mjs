// Streaming chat client for any OpenAI-compatible endpoint (InferHub, OpenRouter, ...).
// Zero dependencies: Node's fetch + SSE parsing. Every call reports timing so the
// engine and the speed test measure the same thing. Every call is also traced
// (engine/trace.mjs) when a run is listening.

import { traceCall } from './trace.mjs'

export function providerFromEnv(env = process.env) {
  const baseUrl = env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1'
  const apiKey = env.SWARM_API_KEY || env.HERMES_CUSTOM_INFERHUB_API_KEY
  if (!apiKey) throw new Error('No API key: set SWARM_API_KEY (or HERMES_CUSTOM_INFERHUB_API_KEY)')
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

/**
 * Stream one chat completion. Calls onDelta(text) for every content chunk.
 * Resolves with { text, ttftMs, totalMs, outputTokens, tokPerSec, usage }.
 */
export async function streamChat(provider, opts) {
  const { messages, maxTokens = 2048, temperature = 0.7, trace } = opts
  // a route with no capacity hands over to the same model on another route
  const routes = routesFor(provider, opts.model)
  for (let i = 0; i < routes.length; i++) {
    const model = routes[i], started = performance.now()
    try {
      const res = await chat(provider, { ...opts, model }, started)
      traceCall({ label: trace, provider, model, messages, maxTokens, temperature, started, res })
      // a metered provider (the hosted studio's spending cap) hears every call's usage
      provider?.onUsage?.({ model, usage: res.usage, inputChars: JSON.stringify(messages).length, outputChars: res.text.length })
      if (model !== opts.model) busy.set(opts.model, { route: model, until: Date.now() + 5 * 60e3 })
      return res
    } catch (error) {
      traceCall({ label: trace, provider, model, messages, maxTokens, temperature, started, error })
      const full = /HTTP (503|429|502)|no_capacity|exhausted|cooldown|upstream/i.test(String(error.message)), missing = /HTTP 404/.test(String(error.message))
      if (opts.signal?.aborted || i === routes.length - 1 || !(full || (missing && i > 0))) throw error
    }
  }
}

// InferHub serves one model on several routes (cb/x, ali/x, x…). When the asked
// route is full, the others are tried in turn; one that worked is used first for a while.
const busy = new Map()
// A route that took a call and then sent nothing (a full route can queue instead of
// answering 429) goes to the back of the list for a while.
const stalled = new Map()
export function markStalled(provider, model) {
  for (const route of routesFor(provider, model).slice(0, 1)) stalled.set(route, Date.now() + 5 * 60e3)
}
function routesFor(provider, model) {
  if (!/inferhub/.test(provider?.baseUrl || '') || !model) return [model]
  const bare = model.replace(/^[a-z]+\//, '')
  const list = [model, bare, `ali/${bare}`, `alitp/${bare}`, `ocg/${bare}`, `cb/${bare}`]
  const hot = busy.get(model)
  if (hot && hot.until > Date.now()) list.unshift(hot.route)
  const cold = r => (stalled.get(r) ?? 0) > Date.now()
  const routes = [...new Set(list)]
  return [...routes.filter(r => !cold(r)), ...routes.filter(cold)].slice(0, 5)
}

async function chat(provider, { model, messages, maxTokens = 2048, temperature = 0.7, extra = {}, signal, onDelta }, started) {
  const send = withExtra => fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...(withExtra ? extra : {})
    })
  })
  // Hints like "no reasoning" are not part of every provider's API. A provider
  // that rejects them gets plain requests from then on.
  let res = await send(Object.keys(extra).length > 0 && !provider.plain)
  if ((res.status === 400 || res.status === 422) && Object.keys(extra).length && !provider.plain) {
    await res.text().catch(() => '')
    provider.plain = true
    res = await send(false)
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(`${model}: HTTP ${res.status} ${body.slice(0, 300)}`)
  }

  let text = ''
  let ttftMs = null
  let firstReasoningMs = null
  let reasoningChars = 0
  let usage = null
  let buffer = ''
  const decoder = new TextDecoder()

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let event
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }
      if (event.usage) usage = event.usage
      const d = event.choices?.[0]?.delta || {}
      const thought = d.reasoning_content || d.reasoning
      if (thought) {
        if (firstReasoningMs === null) firstReasoningMs = performance.now() - started
        reasoningChars += thought.length
      }
      const delta = d.content
      if (delta) {
        if (ttftMs === null) ttftMs = performance.now() - started
        text += delta
        onDelta?.(delta)
      }
    }
  }

  const totalMs = performance.now() - started
  // Visible tokens only: completion_tokens often includes hidden reasoning.
  const visibleTokens = Math.round(text.length / 4)
  const genMs = Math.max(1, totalMs - (ttftMs ?? totalMs))
  return {
    text,
    ttftMs,
    totalMs,
    firstReasoningMs,
    reasoningChars,
    outputTokens: usage?.completion_tokens ?? visibleTokens,
    visibleTokens,
    tokPerSec: (visibleTokens / genMs) * 1000,
    usage
  }
}
