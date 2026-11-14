// Playing a section out. Through Hermes a model call does not stream (docs/engines/hermes-and-connections.md,
// "ctx.llm does not stream"): the whole section arrives as one delta, so on the canvas the agent sat on
// "planning…" and the finished section popped in, with none of the typing, drawing and linking that a streamed
// build shows. A pacer takes what arrives and hands it on in small pieces over a short time, so the canvas
// animates the same either way. A real stream's small deltas pass straight through.
//
//   const p = pacer(text => emit('layer:delta', { …, text }), { signal })
//   onDelta: p.push   …   await p.done()   before layer:done
export const PACE = { big: 400, tick: 40, maxMs: 3200, piece: 28 }

export function pacer(send, { signal = null, big = PACE.big, tick = PACE.tick, maxMs = PACE.maxMs, piece = PACE.piece, wait = (fn, ms) => setTimeout(fn, ms) } = {}) {
  let queue = '', size = piece, timer = null, idle = []
  const settle = () => { const w = idle; idle = []; for (const r of w) r() }
  const step = () => {
    timer = null
    // stopped: no show, hand over the rest at once
    if (signal?.aborted) { if (queue) send(queue); queue = ''; return settle() }
    if (!queue) return settle()
    // never cut inside a tag or an entity when a nearby boundary exists
    let n = Math.min(size, queue.length)
    const gt = queue.indexOf('>', n - 1)
    if (queue.lastIndexOf('<', n - 1) > queue.lastIndexOf('>', n - 1) && gt !== -1 && gt - n < 200) n = gt + 1
    send(queue.slice(0, n))
    queue = queue.slice(n)
    if (queue) timer = wait(step, tick); else settle()
  }
  return {
    push(d) {
      const text = String(d ?? '')
      if (!text) return
      if (!queue && text.length <= big) return send(text)
      queue += text
      // the whole of it within maxMs, however long it is
      size = Math.max(piece, Math.ceil(queue.length / (maxMs / tick)))
      if (!timer) timer = wait(step, tick)
    },
    // resolves once everything pushed has been handed on
    done() { return queue || timer ? new Promise(r => idle.push(r)) : Promise.resolve() },
  }
}
