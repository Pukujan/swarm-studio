// A small build's events, in the engine's shape, for the Design deck's stories and tests (the same build the
// walkthrough's throwaway Studio saves, scripts/walkthrough-fixtures.mjs site()): three pages, a nav and a footer
// on every page, two sections each, two agents. `at` cuts it where a story wants it: planned, mid-build, done or
// stopped.
import type { DeckEvent } from './model'

export const RUN = '2026-11-01T11-00-00-000Z'
const T = Date.parse('2026-11-01T11:00:00Z')
const BRIEF = 'Alpha Tea, a tea subscription for night-shift workers, with gift boxes'
const PAGES: [string, string][] = [['home', 'Alpha Tea'], ['plans', 'Plans'], ['gifts', 'Gift boxes']]

const html = (title: string, i: number) =>
  `<section class="px-16 py-20 ${i % 2 ? 'bg-[var(--card)]' : ''}"><h${i ? 2 : 1} class="mb-4 text-5xl font-semibold">${title}</h${i ? 2 : 1}><p class="max-w-xl text-lg opacity-80">${BRIEF}</p></section>`

export type Cut = 'planned' | 'building' | 'done' | 'stopped' | 'failed'

export function deckEvents(at: Cut = 'done'): DeckEvent[] {
  const run = RUN
  const ev: DeckEvent[] = [{ type: 'run:start', t: T, run, brief: BRIEF, agents: [{ id: 'a0', name: 'Pip' }, { id: 'a1', name: 'Mochi' }] }]
  ev.push({ type: 'theme', t: T + 10, run, name: 'Night shift', vars: { '--background': '#14110f', '--foreground': '#f3ede4', '--primary': '#d9a441', '--primary-foreground': '#111111', '--card': '#1d1915', '--accent': '#e8c27a', '--link': '#e8c27a' }, fonts: { heading: 'Fraunces', body: 'Inter' }, radius: '12px' })
  PAGES.forEach(([id, title], index) => ev.push({ type: 'page', t: T + 20 + index, run, id, title, index }))
  const layers: [string, string, string][] = [['*', 'nav', 'nav'], ...PAGES.flatMap(([id]) => [[id, 'hero', 'hero'], [id, 'features', 'features']] as [string, string, string][]), ['*', 'footer', 'footer']]
  layers.forEach(([page, id, role], i) => ev.push({ type: 'layer:plan', t: T + 30 + i, run, page, id, role, height: role === 'hero' ? 640 : 360 }))
  ev.push({ type: 'plan:done', t: T + 60, run, pages: PAGES.length, layers: layers.length })
  if (at === 'planned') return ev
  const cut = at === 'done' || at === 'failed' ? layers.length : 4
  layers.slice(0, cut + 2).forEach(([page, id, role], i) => {
    const agent = `a${i % 2}`, title = page === '*' ? role : `${PAGES.find(p => p[0] === page)?.[1]}: ${role}`
    ev.push({ type: 'agent:assign', t: T + 100 + i * 10, run, agent, page, layer: id, role })
    // the last two are caught half way: one written in part, one only just picked up
    if (i === cut) { ev.push({ type: 'layer:delta', t: T + 200 + i * 400, run, agent, page, layer: id, text: html(title, i).slice(0, 120) }); return }
    if (i === cut + 1) return
    if (at === 'failed' && i === 3) { ev.push({ type: 'layer:failed', t: T + 600 + i * 400, run, agent, page, layer: id, message: 'the model stopped answering' }); return }
    ev.push({ type: 'layer:done', t: T + 600 + i * 400, run, agent, page, layer: id, ms: 400, done: i + 1, planned: layers.length, html: html(title, i) })
  })
  if (at === 'done' || at === 'failed') ev.push({ type: 'run:done', t: T + 10000, run, ms: 10000, planned: layers.length, done: at === 'failed' ? layers.length - 1 : layers.length, failed: at === 'failed' ? 1 : 0, pages: PAGES.length })
  if (at === 'stopped') ev.push({ type: 'run:stopped', t: T + 5000, run, reason: { code: 'stopped' } })
  return ev
}
