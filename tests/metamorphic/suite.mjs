// The relations, run on a recording (recorded/<brief>.json, or one record.mjs live just made): what CI's
// metamorphic tests and the nightly live job both check.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandTheme } from '../../engine/brand.mjs'
import { brandColourOnly, describe, keepsCopy, lintStable, renameKeepsOthers, sameSitemap } from './relations.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const BRIEFS = JSON.parse(readFileSync(join(HERE, 'briefs.json'), 'utf8')).briefs
export const briefOf = id => BRIEFS.find(b => b.id === id)

// a recording as the build's events: the start, the brand's theme, the pages, the home page's built sections
export function eventsOf(rec) {
  const brief = briefOf(rec.id), built = new Map(rec.sections.map(s => [s.id, s.html]))
  return [
    { type: 'run:start', brief: brief.wordings[0], title: rec.plan.pages[0]?.title },
    { type: 'theme', ...brandTheme(brief.brand), by: 'brand' },
    ...rec.plan.pages.map(p => ({ type: 'page', ...p })),
    ...rec.plan.home.filter(l => built.has(l.id)).map(l => ({ ...l, type: 'layer:plan' })),
    ...rec.plan.home.filter(l => built.has(l.id)).map(l => ({ type: 'layer:done', page: l.page, layer: l.id, html: built.get(l.id) }))
  ]
}

export const relations = {
  'brand colour': rec => brandColourOnly({ name: rec.id, brand: briefOf(rec.id).brand, accent: briefOf(rec.id).accent, events: eventsOf(rec) }),
  rename: rec => rec.plan.pages.flatMap(p => renameKeepsOthers({ name: rec.id, events: eventsOf(rec), page: p.id, title: `${p.title} (renamed)` })),
  sitemap: rec => sameSitemap({ brief: rec.id, named: briefOf(rec.id).named, wordings: rec.sitemaps }),
  rework: rec => rec.sections.flatMap(s => keepsCopy({ name: rec.id, section: s.id, content: s.content, before: s.html, after: s.after })),
  linter: rec => rec.sections.flatMap(s => [['built', s.html], ['reworked', s.after]].flatMap(([k, html]) => lintStable({ name: rec.id, section: `${s.id} (${k})`, html, content: s.content })))
}

export async function checkAll(recs) {
  const out = []
  for (const rec of recs) for (const fn of Object.values(relations)) out.push(...await fn(rec))
  return describe(out)
}
