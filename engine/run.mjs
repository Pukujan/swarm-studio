// One swarm run: a streamed plan feeds a task queue that a fixed pool of agents
// drains in parallel. Layers start the moment the planner finishes writing them.
// Everything that happens is emitted as an event; the canvas only draws events.

import { markStalled, streamChat } from './llm.mjs'
import { SITEMAP_SYSTEM, pagePlannerMessages, workerMessages } from './prompts.mjs'
import { PAGE_TYPES, pickPageType, lookBrief } from './pagetype.mjs'
import { tidyFragment } from './tidy.mjs'
import { fixSection } from './review.mjs'
import { extendPlannerMessages, navAsk } from './extend.mjs'

const NO_THINKING = { reasoning_effort: 'none', reasoning: { enabled: false } }

export const AGENT_NAMES = [
  // the crew: little alien workers with short, easy star-ish names
  'Pip', 'Mochi', 'Lumi', 'Nova', 'Zuzu', 'Bean', 'Kiki', 'Tofu', 'Pebble', 'Juno', 'Comet', 'Dot',
  'Orbi', 'Twinkle', 'Bloop', 'Sprout', 'Nim', 'Puff', 'Gizmo', 'Luma', 'Taro', 'Echo', 'Bix', 'Vela'
]
const AGENT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#4D96FF', '#FF8FAB', '#C77DFF', '#FF9F1C',
  '#2EC4B6', '#E76F51', '#90BE6D', '#F9C74F', '#43AA8B', '#F3722C', '#577590', '#F94144',
  '#9B5DE5', '#00BBF9', '#00F5D4', '#FEE440', '#F15BB5', '#8AC926', '#1982C4', '#FF595E'
]

class TaskQueue {
  constructor() {
    this.items = []
    this.waiters = []
    this.closed = false
  }
  push(task) {
    const waiter = this.waiters.shift()
    if (waiter) waiter(task)
    else this.items.push(task)
  }
  close() {
    this.closed = true
    for (const w of this.waiters.splice(0)) w(null)
  }
  next() {
    if (this.items.length) return Promise.resolve(this.items.shift())
    if (this.closed) return Promise.resolve(null)
    return new Promise(resolve => this.waiters.push(resolve))
  }
}

/**
 * Pull complete JSON objects out of a growing text stream, whatever the layout:
 * one per line, several per line, pretty-printed, inside a fence or an array.
 */
function lineParser(onObject) {
  let buffer = ''
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  let i = 0
  return {
    push(text) {
      buffer += text
      for (; i < buffer.length; i++) {
        const c = buffer[i]
        if (inString) {
          if (escaped) escaped = false
          else if (c === '\\') escaped = true
          else if (c === '"') inString = false
        } else if (c === '"') {
          if (depth > 0) inString = true
        } else if (c === '{') {
          if (depth++ === 0) start = i
        } else if (c === '}' && depth > 0) {
          if (--depth === 0) {
            try {
              onObject(JSON.parse(buffer.slice(start, i + 1)))
            } catch {
              /* a malformed plan object is skipped, not fatal */
            }
            buffer = buffer.slice(i + 1)
            i = -1
          }
        }
      }
    },
    end() {}
  }
}

const SAY_RE = /<!--\s*say:\s*([\s\S]*?)-->/g

export async function runSwarm({ provider, workerProvider = provider, brief, agents = 16, plannerModel, workerModel, images = false, maxPages = 0, maxSections = 0, recent = [], pageType = '', base = null, ask = '', emit, signal }) {
  const t0 = performance.now()
  const elapsed = () => Math.round(performance.now() - t0)
  // one page type per build, away from the last builds' types and colours
  // a follow-up (base: the project's last version) keeps that version's page type, theme and pages
  const type = PAGE_TYPES[base?.pageType] ? base.pageType : PAGE_TYPES[pageType] ? pageType : pickPageType(brief, recent.map(r => r.type).filter(Boolean))
  const plan = base
    ? { theme: base.theme, pages: base.pages.map(p => ({ ...p, layers: p.layers.map(l => ({ ...l })) })), shared: base.shared.map(l => ({ ...l })), pageType: type }
    : { theme: null, pages: [], shared: [], pageType: type }
  const kept = plan.pages.length
  const added = [], changed = []
  const queue = new TaskQueue()
  const stats = { planned: 0, done: 0, failed: 0 }

  const pool = Array.from({ length: Math.min(agents, AGENT_NAMES.length) }, (_, i) => ({
    id: `a${i}`,
    name: AGENT_NAMES[i],
    color: AGENT_COLORS[i]
  }))

  emit('run:start', { brief, agents: pool, plannerModel, workerModel, ...(base ? { extend: true, ask, kept } : {}) })
  // the last version as it stands, put back on the canvas as it was: nothing is rebuilt
  if (base) for (const c of base.carry) emit(c.type, c.data)
  else emit('pagetype', { key: type, name: PAGE_TYPES[type].name })

  // --- planning: a quick sitemap pass, then one planner per page in parallel.
  // Page planners start a beat apart so pages come to life one after another.
  // Every layer is dispatched the moment its JSON line is complete.
  const STAGGER_MS = 1500
  const pagePlanners = []

  function addLayer(obj, fallbackPage) {
    if (obj.type !== 'layer' || !obj.id) return
    const layer = { ...obj, links: Array.isArray(obj.links) ? obj.links : [] }
    if (layer.page === '*') {
      if (plan.shared.some(l => l.id === layer.id)) return
      plan.shared.push(layer)
    } else {
      const page = plan.pages.find(p => p.id === (fallbackPage || layer.page))
      if (!page || page.layers.some(l => l.id === layer.id)) return
      // a capped build (the hosted studio) keeps the first sections of each page
      if (maxSections && page.layers.length >= maxSections) return
      layer.page = page.id
      page.layers.push(layer)
    }
    stats.planned++
    emit('layer:plan', { page: layer.page, id: layer.id, role: layer.role, height: layer.height || 360, links: layer.links })
    queue.push({ kind: 'build', layer })
  }

  function planPage(page, attempt = 1) {
    const parser = lineParser(obj => addLayer(obj, page.id))
    return new Promise(r => setTimeout(r, attempt === 1 ? (page.index - kept) * STAGGER_MS : 0))
      .then(() => {
        emit('page:planning', { page: page.id })
        return streamChat(provider, {
          trace: { kind: 'plan', page: page.id },
          model: plannerModel,
          messages: pagePlannerMessages({ brief, theme: plan.theme, plan, page }),
          maxTokens: 3000,
          temperature: 0.8,
          extra: NO_THINKING,
          signal,
          onDelta: d => {
            emit('plan:delta', { page: page.id, text: d })
            parser.push(d)
          }
        })
      })
      .then(() => {
        parser.end()
        if (!page.layers.length && attempt < 2) {
          emit('error', { where: `planner:${page.id}`, message: 'no layers parsed, replanning' })
          return planPage(page, attempt + 1)
        }
        emit('page:planned', { page: page.id, layers: page.layers.length, ms: elapsed() })
      })
      .catch(err => emit('error', { where: `planner:${page.id}`, message: String(err.message || err) }))
  }

  const onSitemap = obj => {
    if (obj.type === 'theme') {
      plan.theme = obj
      emit('theme', obj)
    } else if (obj.type === 'page' && obj.id && !plan.pages.some(p => p.id === obj.id) && !(maxPages && plan.pages.length >= maxPages)) {
      const page = { ...obj, index: plan.pages.length, layers: [] }
      plan.pages.push(page)
      emit('page', { id: page.id, title: page.title, purpose: page.purpose, index: page.index })
    } else {
      addLayer(obj)
    }
  }

  // The sitemap is the one call everything waits on. A provider that stalls (no
  // text for 20s) or returns nothing usable gets one more try.
  async function sitemap(attempt = 0) {
    const parser = lineParser(onSitemap)
    const stall = new AbortController()
    const onAbort = () => stall.abort()
    signal?.addEventListener('abort', onAbort)
    let timer = setTimeout(() => stall.abort(), 20000)
    try {
      await streamChat(provider, {
        trace: { kind: 'sitemap' },
        model: plannerModel,
        messages: [
          { role: 'system', content: SITEMAP_SYSTEM },
          { role: 'user', content: `Brief: ${brief}\n\n${lookBrief(type, recent)}` }
        ],
        maxTokens: 2000,
        temperature: 0.8,
        extra: NO_THINKING,
        signal: stall.signal,
        onDelta: d => {
          clearTimeout(timer)
          timer = setTimeout(() => stall.abort(), 20000)
          emit('plan:delta', { text: d })
          parser.push(d)
        }
      })
      parser.end()
    } catch (err) {
      // a stall sends the retry to another route of the same model
      if (stall.signal.aborted && !signal?.aborted) markStalled(provider, plannerModel)
      if (signal?.aborted || attempt) throw err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    if (!plan.pages.length && !attempt && !signal?.aborted) {
      emit('error', { where: 'planner', message: 'the site plan came back empty, trying once more' })
      return sitemap(1)
    }
  }

  // A follow-up: the planner sees the existing sitemap and the request, and plans only
  // new pages (and changes to named sections). The navigation is rewritten to link them.
  async function extendPlan() {
    const parser = lineParser(obj => {
      if (obj.type === 'page' && obj.id && !plan.pages.some(p => p.id === obj.id || p.title === obj.title) && added.length < 6) {
        const page = { id: String(obj.id), title: obj.title || obj.id, purpose: obj.purpose || '', sections: obj.sections || '', index: plan.pages.length, layers: [] }
        plan.pages.push(page)
        added.push(page)
        emit('page', { id: page.id, title: page.title, purpose: page.purpose, index: page.index, added: true })
      } else if (obj.type === 'change' && obj.ask) {
        const page = plan.pages.find(p => p.id === obj.page && p.index < kept)
        const layer = page?.layers.find(l => l.id === obj.layer) || plan.shared.find(l => l.id === obj.layer)
        if (!layer?.html || changed.some(c => c.layer === layer)) return
        changed.push({ layer, ask: String(obj.ask) })
      }
    })
    await streamChat(provider, {
      trace: { kind: 'sitemap' },
      model: plannerModel,
      messages: extendPlannerMessages({ base: { ...base, pages: plan.pages.slice(0, kept) }, ask }),
      maxTokens: 1500,
      temperature: 0.7,
      extra: NO_THINKING,
      signal,
      onDelta: d => {
        emit('plan:delta', { text: d })
        parser.push(d)
      }
    })
    parser.end()
    const nav = plan.shared.find(l => l.id === 'nav' || l.role === 'navigation')
    if (added.length && nav?.html && !changed.some(c => c.layer === nav)) changed.push({ layer: nav, ask: navAsk(plan.pages, added) })
    if (!added.length && !changed.length) emit('error', { where: 'planner', message: 'nothing to add from that message: name a page or a section' })
    for (const c of changed) {
      stats.planned++
      queue.push({ kind: 'fix', layer: c.layer, ask: c.ask })
    }
  }

  const planning = (base ? extendPlan() : sitemap())
    .then(() => {
      emit('sitemap:done', { ms: elapsed(), pages: plan.pages.length })
      // page planners need the whole page list (for links), so they start here
      for (const page of plan.pages.slice(kept)) pagePlanners.push(planPage(page))
      return Promise.all(pagePlanners)
    })
    .then(() => emit('plan:done', { ms: elapsed(), pages: plan.pages.length, layers: stats.planned }))
    .catch(err => {
      emit('error', { where: 'planner', message: String(err.message || err) })
    })
    .finally(() => queue.close())

  // --- workers: each agent loops over the queue until the plan is finished and drained
  async function work(agent) {
    for (;;) {
      const task = await queue.next()
      if (!task) break
      await (task.kind === 'fix' ? fixLayer(agent, task.layer, task.ask) : buildLayer(agent, task.layer))
    }
    emit('agent:idle', { agent: agent.id, reason: 'done' })
  }

  async function buildLayer(agent, layer) {
    const page = plan.pages.find(p => p.id === layer.page) || { id: '*', title: 'All pages', layers: [] }
    emit('agent:assign', { agent: agent.id, page: layer.page, layer: layer.id, role: layer.role })
    const started = performance.now()
    let text = ''
    let saidCount = 0
    try {
      await streamChat(workerProvider, {
        trace: { kind: 'build', agent: agent.id, page: layer.page, layer: layer.id },
        model: workerModel,
        messages: workerMessages({ theme: plan.theme || {}, plan, page, layer, images }),
        // most sections take under 2000; a map or a big drawing needs more, and cut short it breaks
        maxTokens: 8000,
        extra: NO_THINKING,
        signal,
        onDelta: d => {
          text += d
          emit('layer:delta', { page: layer.page, layer: layer.id, agent: agent.id, text: d })
          const says = [...text.matchAll(SAY_RE)]
          for (; saidCount < says.length; saidCount++) {
            emit('agent:say', { agent: agent.id, layer: layer.id, text: says[saidCount][1].trim() })
          }
        }
      })
      stats.done++
      // a builder sometimes writes a sentence before its markup, or runs out of
      // room mid-grid; an unclosed div pulls every later section into it
      text = tidyFragment(text)
      layer.html = text
      emit('layer:done', {
        page: layer.page,
        layer: layer.id,
        agent: agent.id,
        ms: Math.round(performance.now() - started),
        done: stats.done,
        planned: stats.planned,
        html: text
      })
    } catch (err) {
      stats.failed++
      emit('layer:failed', { page: layer.page, layer: layer.id, agent: agent.id, message: String(err.message || err) })
    }
  }

  // a finished section rewritten for a follow-up (the /fix path): cleared, streamed back,
  // and on failure the old section returns
  async function fixLayer(agent, layer, comment) {
    const page = layer.page
    const started = performance.now()
    emit('agent:assign', { agent: agent.id, page, layer: layer.id, role: layer.role, fixing: true })
    emit('layer:reset', { page, layer: layer.id, agent: agent.id })
    try {
      const html = await fixSection({
        provider: workerProvider, model: workerModel, theme: plan.theme || {}, html: layer.html, role: layer.role || layer.id, comment, images,
        signal, onDelta: d => emit('layer:delta', { page, layer: layer.id, agent: agent.id, text: d })
      })
      stats.done++
      layer.html = tidyFragment(html)
      emit('layer:done', { page, layer: layer.id, agent: agent.id, ms: Math.round(performance.now() - started), done: stats.done, planned: stats.planned, html: layer.html, fixed: true })
    } catch (err) {
      stats.failed++
      emit('layer:failed', { page, layer: layer.id, agent: agent.id, message: String(err.message || err), keep: layer.html })
    }
  }

  await Promise.all([planning, ...pool.map(work)])
  const result = { ms: elapsed(), ...stats, pages: plan.pages.length, ...(base ? { extend: true, kept, added: added.map(p => ({ id: p.id, title: p.title })), changed: changed.map(c => c.layer.id) } : {}) }
  emit('run:done', result)
  return { plan, result }
}
