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
  const started = performance.now()
  const { model, messages, maxTokens = 2048, temperature = 0.7, trace } = opts
  try {
    const res = await chat(provider, opts, started)
    traceCall({ label: trace, provider, model, messages, maxTokens, temperature, started, res })
    return res
  } catch (error) {
    traceCall({ label: trace, provider, model, messages, maxTokens, temperature, started, error })
    throw error
  }
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
