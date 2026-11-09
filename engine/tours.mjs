// Visitor tours: one model call writes 3-4 people who use the finished site, each
// as a script of steps over elements that really exist on its pages. The canvas
// plays them back with a cursor and thought bubbles. The model only sees an
// inventory of each page (links and where they go, buttons, inputs, headings),
// and every step is checked against it, so a tour never clicks something that
// isn't there or arrives on a page by magic.

import { streamChat } from './llm.mjs'

const ACTIONS = new Set(['look', 'hover', 'click', 'type'])

function prompt(brief, pages) {
  const inventory = pages.map(p => [
    `PAGE ${p.id} "${p.title}"`,
    ...p.items.map(i => `  ${i.id} ${i.kind}${i.goto ? ` -> ${i.goto}` : ''}: ${i.text}`)
  ].join('\n')).join('\n\n')
  return [
    {
      role: 'system',
      content: `You write short role-play scripts of real people visiting a website, for a demo where a cursor acts them out.

Return JSON only:
{"tours":[{"name":"first name","who":"age, one detail of their life","emoji":"one emoji","goal":"what they came for, under 10 words","steps":[{"page":"page id","do":"look|hover|click|type","el":"element id","text":"only for type","think":["...","...","..."]}],"end":"how it ends, under 12 words"}]}

Rules:
- 3 or 4 visitors with different intents. Usually: one who wants to buy, book or sign up and gets as far as the site allows; one who is unsure, compares, then goes to contact and decides to call or write; one who reads about the company or people behind it. Fit them to this site.
- 6 to 10 steps each. Start on the first page. Use only element ids listed for the page the visitor is on.
- To change page, "click" an element whose "->" names the next page; the next step is on that page. Nothing else changes page.
- "type" only on inputs, with realistic text. "look" for headings and things they read. "hover" when they hesitate over something.
- "think" is their inner voice: 2 or 3 phrasings of the same thought, the way a person mutters while browsing, first person, casual, under 9 words each. Hesitation, small reactions, half-sentences are good ("hm, pricey… wait, is that per month?", "okay that's per month, fine").
- If the site can't do something (no cart, no booking), the visitor notices and does what the site does offer.`
    },
    { role: 'user', content: `The site: ${brief}\n\n${inventory}` }
  ]
}

function parse(text) {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON in the tour script')
  return JSON.parse(text.slice(start, end + 1))
}

// Keep each tour to steps a visitor could really take, in order.
export function checkTours(raw, pages) {
  const byPage = new Map(pages.map(p => [p.id, new Map(p.items.map(i => [i.id, i]))]))
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
  const tours = []
  for (const t of raw.tours || []) {
    let page = pages[0].id
    const steps = []
    for (const s of t.steps || []) {
      const item = byPage.get(page)?.get(s.el)
      if (!item || !ACTIONS.has(s.do)) continue
      const think = (Array.isArray(s.think) ? s.think : [s.think]).map(x => clip(x, 70)).filter(Boolean).slice(0, 3)
      steps.push({ page, do: s.do === 'type' && item.kind !== 'input' ? 'look' : s.do, el: s.el, text: s.do === 'type' ? clip(s.text, 60) : undefined, think })
      if (s.do === 'click' && item.goto && byPage.has(item.goto)) page = item.goto
    }
    if (steps.length >= 3) tours.push({ name: clip(t.name, 20) || 'Visitor', who: clip(t.who, 50), emoji: clip(t.emoji, 4) || '🙂', goal: clip(t.goal, 70), end: clip(t.end, 90), steps: steps.slice(0, 12) })
  }
  return tours.slice(0, 4)
}

export async function writeTours({ provider, model, brief, pages, signal }) {
  const res = await streamChat(provider, {
    trace: { kind: 'tours' },
    model,
    messages: prompt(brief, pages),
    maxTokens: 3500,
    temperature: 0.8,
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } },
    signal
  })
  const tours = checkTours(parse(res.text), pages)
  if (!tours.length) throw new Error('the tour script had no usable steps')
  return { tours, ms: Math.round(res.totalMs) }
}
