// A follow-up inside an open project: the next version keeps everything already
// built (theme, art style, pages, sections, edits, pictures) and the crew builds
// only what the message asks for: new pages, or changes to named sections.
import { PAGE_TYPES } from './pagetype.mjs'

// The brief a build was started with, without what later versions or uploads added
export const baseBrief = brief => String(brief || '').split('\n\nThe owner uploaded these pictures.')[0].split('\n\nFor this version: ')[0].trim()

// The events that rebuild a finished run as it stands now, in their order: the theme,
// art style, pages and section plans, the newest finished HTML of each section (a fix
// or a restore wins over the first build), edits and the newest picture per slot.
// Order matters: a class edit restyles the sections finished before it, and a fix was
// written from the edited section, so the events keep their original positions.
const CARRY = new Set(['pagetype', 'theme', 'art', 'page', 'layer:plan', 'layer:done', 'edit', 'image'])
const OMIT = new Set(['type', 't', 'run', 'agent', 'ms', 'done', 'planned'])
export function carryEvents(events) {
  const last = new Map()
  events.forEach((e, i) => {
    if (e.type === 'layer:done' && e.html) last.set(`${e.page}/${e.layer}`, i)
    if (e.type === 'image' && e.src) last.set(`img:${e.page}/${e.layer}/${e.gen}`, i)
  })
  const out = []
  events.forEach((e, i) => {
    if (!CARRY.has(e.type)) return
    if (e.type === 'layer:done' && last.get(`${e.page}/${e.layer}`) !== i) return
    if (e.type === 'image' && last.get(`img:${e.page}/${e.layer}/${e.gen}`) !== i) return
    const data = Object.fromEntries(Object.entries(e).filter(([k]) => !OMIT.has(k)))
    if (e.type === 'layer:done') data.kept = true
    out.push({ type: e.type, data })
  })
  return out
}

// What a follow-up starts from: the previous version's plan (with each section's
// current HTML) and the events that put it on a canvas. Null when it isn't a site.
export function extendBase(events, savedPlan = null) {
  if (!Array.isArray(events)) return null
  const start = events.find(e => e.type === 'run:start') || {}
  if (start.kind === 'game') return null
  const theme = events.find(e => e.type === 'theme')
  const pages = events.filter(e => e.type === 'page')
  if (!theme || !pages.length) return null
  const carry = carryEvents(events)
  const html = new Map(carry.filter(c => c.type === 'layer:done').map(c => [`${c.data.page}/${c.data.layer}`, c.data.html]))
  const content = new Map()
  for (const l of [...(savedPlan?.shared || []), ...(savedPlan?.pages || []).flatMap(p => p.layers || [])]) content.set(`${l.page}/${l.id}`, l.content || '')
  const layer = e => ({ id: e.id, page: e.page, role: e.role, links: e.links || [], height: e.height || 360, content: content.get(`${e.page}/${e.id}`) || '', html: html.get(`${e.page}/${e.id}`) || '' })
  const plans = events.filter(e => e.type === 'layer:plan')
  return {
    brief: baseBrief(start.brief),
    pageType: events.findLast(e => e.type === 'pagetype')?.key || savedPlan?.pageType || '',
    theme: Object.fromEntries(Object.entries(theme).filter(([k]) => !['t', 'run'].includes(k))),
    art: events.findLast(e => e.type === 'art') || null,
    pages: pages.map((p, i) => ({
      id: p.id, title: p.title, purpose: p.purpose || '', index: i,
      sections: plans.filter(l => l.page === p.id).map(l => l.role).join(', '),
      layers: plans.filter(l => l.page === p.id).map(layer)
    })),
    shared: plans.filter(l => l.page === '*').map(layer),
    carry
  }
}

export const EXTEND_SYSTEM = `You are the lead designer of a design swarm. A website is already built and the owner has asked for more. You plan ONLY what they ask for; everything already built stays exactly as it is, and builders work from what you write in parallel, so be specific.

Output JSON Lines ONLY: one JSON object per line, no prose, no markdown fences, no blank lines. Then stop.

For each NEW page the request needs (usually 1 to 4; as many as it names, no more):
{"type":"page","id":"<new kebab-id, not one of the existing ids>","title":"<Page title>","purpose":"<one sentence>","sections":"<4 to 6 section roles in order, comma separated>"}

Only if the request asks to change something already on an existing page, one line per section to change:
{"type":"change","page":"<existing page id>","layer":"<existing section id>","ask":"<exactly what to change in that section>"}

Rules:
- A section named without its page ("the hero", "the headline") is the one on the first page.
- Never re-plan, repeat or rename an existing page. Never plan the navigation or footer: the navigation is updated for you so every new page is linked.
- New pages belong to the same site: same product, same voice, the same page type and theme. Give each one a memorable, unusual section.
- If the request is about something the site doesn't cover yet ("add more about X"), that is a new page about X. Put two related asks on one page only when they are small.
- Real, specific copy ideas for the product; no lorem ipsum, no placeholders.`

export function extendPlannerMessages({ base, ask }) {
  const type = PAGE_TYPES[base.pageType]
  const nav = base.shared.find(l => l.id === 'nav' || l.role === 'navigation')
  return [
    { role: 'system', content: EXTEND_SYSTEM },
    {
      role: 'user',
      content: [
        `Brief: ${base.brief}`,
        `Theme "${base.theme?.name || ''}": ${base.theme?.direction || ''}`,
        type ? `Page type: ${type.name}. Voice: ${type.voice}` : '',
        `Navigation now: ${nav?.content || base.pages.map(p => p.title).join(', ')}`,
        `Existing pages (keep them all as they are):\n${base.pages.map(p => `- ${p.id} "${p.title}": ${p.purpose}${p.layers.length ? ` Sections: ${p.layers.map(l => `${l.id} (${l.role})`).join(', ')}` : ''}`).join('\n')}`,
        `The owner asks: ${ask}`
      ].filter(Boolean).join('\n\n')
    }
  ]
}

// The navigation's rewrite once new pages exist: every page linked, nothing else changed
export function navAsk(pages, added) {
  return `Add a link for each new page: ${added.map(p => `"${p.title}" (data-goto="${p.id}")`).join(', ')}. Every page of the site must be in the navigation, in this order: ${pages.map(p => `${p.title} → data-goto="${p.id}"`).join(', ')}. Keep the brand, the look, the button and every existing link as they are; if the links no longer fit on one row, make them wrap or tighten the spacing.`
}

// Pictures carried over are copied into the new version's folder (kept-<n>), so its
// export, video and publish find them as its own; every src that pointed at them follows.
export function rehomeImages(base, runsDir, dir, id, { existsSync, mkdirSync, copyFileSync, join }) {
  const moved = new Map()
  let n = 0
  for (const c of base.carry) {
    if (c.type !== 'image') continue
    const m = /^\/img\/([\w-]{1,64})\/([\w.-]+?)\.(png|jpe?g|webp)$/.exec(c.data.src || '')
    if (!m) continue
    if (!moved.has(c.data.src)) {
      const file = join(runsDir, m[1], 'img', `${m[2]}.${m[3]}`)
      if (!existsSync(file) || n >= 999) continue
      const name = `kept-${++n}.${m[3]}`
      mkdirSync(join(dir, 'img'), { recursive: true })
      copyFileSync(file, join(dir, 'img', name))
      moved.set(c.data.src, `/img/${id}/${name}`)
    }
    c.data = { ...c.data, src: moved.get(c.data.src) }
  }
  for (const c of base.carry) if (c.type === 'layer:done' && c.data.html) c.data = { ...c.data, html: c.data.html.replace(/\/img\/[\w-]{1,64}\/[\w.-]+\.(?:png|jpe?g|webp)/g, s => moved.get(s) || s) }
  for (const l of [...base.shared, ...base.pages.flatMap(p => p.layers)]) l.html = l.html.replace(/\/img\/[\w-]{1,64}\/[\w.-]+\.(?:png|jpe?g|webp)/g, s => moved.get(s) || s)
  return moved.size
}

// A message sent inside an open project (from: the version on screen) is that project's next
// turn. It extends the version on screen; when that version has nothing to extend (its build
// failed, or no page finished), the project's newest version that does; and when none does, it
// is built from the project's own brief plus the message, so "continue the work" stays the same
// product instead of a new one made from those three words. versions: the project's runs, newest
// first. read(id) gives { events, plan } or null.
export function followUp({ ask, from, versions = [], read }) {
  const ids = [...new Set([from, ...versions].filter(Boolean))]
  const runs = ids.map(id => ({ id, ...(read(id) || {}) })).filter(r => Array.isArray(r.events))
  for (const r of runs) {
    const base = extendBase(r.events, r.plan || null)
    if (base) return { from: r.id, base, brief: `${base.brief}\n\nFor this version: ${ask}` }
  }
  // the project's idea: its first site brief (a game's brief is not a site's)
  const first = runs.map(r => r.events.find(e => e.type === 'run:start')).filter(s => s && s.kind !== 'game' && s.brief).at(-1)
  const idea = first ? baseBrief(first.brief) : ''
  if (!idea || idea === String(ask).trim()) return null
  return { from: null, base: null, brief: `${idea}\n\nFor this version: ${ask}` }
}
