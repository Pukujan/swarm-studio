// Open Design's library in Swarm (decision 0016 point 1b, issue #447): its skills, design templates, plugin
// skills and prompt templates (engine/opendesign/library.json, imported by scripts/import-od-library.mjs),
// chosen the way Open Design chooses them:
//
//   templates         the person picks one (a build request's `template`); the planners follow it
//   skills            the sitemap planner reads a short catalogue matched to the brief (name, one line, kind)
//                     and names the ones the build needs; only the chosen skills' text goes to the page planners.
//                     Builders never get a skill file: they get the plan, and the theme's distilled rules
//   prompt templates  the picture and film briefs: the one that fits what is asked, picked the same way
//
// The catalogue is small and read once; the texts (gzipped) only when one is chosen.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

let lib = null, texts = null
const load = () => lib ??= (() => { try { return JSON.parse(readFileSync(new URL('./opendesign/library.json', import.meta.url), 'utf8')).entries } catch { return [] } })()
const textsOf = () => texts ??= (() => { try { return JSON.parse(gunzipSync(readFileSync(new URL('./opendesign/library-texts.json.gz', import.meta.url))).toString('utf8')) } catch { return {} } })()

export const entries = kind => load().filter(e => !kind || e.kind === kind)
export const entryOf = id => load().find(e => e.id === id) || null
export const textOf = id => textsOf()[id] || ''

// the words that say what something is about (four letters or more, a few common ones left out)
const STOP = new Set('with that this from your have will what when where which their there about into make made using used like just more most them they then than also very each some such only page site website build design create'.split(' '))
const words = s => new Set((String(s || '').toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter(w => !STOP.has(w)))

// how well an entry fits a brief: its triggers count most, then its name, then its line and category
export function fit(entry, brief) {
  const want = words(brief), text = String(brief || '').toLowerCase()
  let s = 0
  for (const t of entry.triggers || []) if (t.length > 3 && text.includes(t.toLowerCase())) s += 3
  for (const w of words(entry.name)) if (want.has(w)) s += 2
  for (const w of words(`${entry.line} ${entry.category}`)) if (want.has(w)) s += 1
  return s
}

// the short catalogue the sitemap planner reads: the skills (and plugin skills) that fit the brief at all, best
// first, at most n. Nothing fits, nothing is shown, so a build the library has nothing for costs nothing
export function shortlist(brief, { n = 8, min = 4 } = {}) {
  return load().filter(e => e.kind === 'skill' || e.kind === 'plugin-skill')
    .map(e => [fit(e, brief), e]).filter(([s]) => s >= min).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, e]) => e)
}
export const catalogueLines = list => list.map(e => `${e.id}: ${e.name} (${e.kind}). ${e.line}`).join('\n')

// what the page planners are given for the chosen skills, and for the person's template: the text itself,
// shortened, never more than two skills
const SKILL_CHARS = 3500, TEMPLATE_CHARS = 4000
const body = (id, n) => { const t = textOf(id).replace(/^---\n[\s\S]*?\n---\n?/, '').trim(); return t.length > n ? `${t.slice(0, n)}…` : t }
export function skillTexts(ids = []) {
  return ids.map(entryOf).filter(e => e && (e.kind === 'skill' || e.kind === 'plugin-skill')).slice(0, 2)
    .map(e => `Skill "${e.name}" (Open Design, ${e.licence}):\n${body(e.id, SKILL_CHARS)}`).join('\n\n')
}
export function templateText(id) {
  const e = entryOf(id)
  return e?.kind === 'template' ? `The person picked the design template "${e.name}" (Open Design, ${e.licence}): ${e.line}\n${body(e.id, TEMPLATE_CHARS)}` : ''
}
// the templates a person can pick from, as a list for the Studio
export const templates = () => entries('template').map(({ id, name, line, category, licence }) => ({ id, name, line, category, licence }))

// a picture or film brief's prompt template: the one that fits the words best, with its arguments at their
// defaults, or none when nothing fits well enough (the brief stays as the art director wrote it)
export function promptTemplateFor(surface, brief, { min = 4 } = {}) {
  const best = load().filter(e => e.kind === 'prompt-template' && e.surface === surface).map(e => [fit(e, brief), e]).sort((a, b) => b[0] - a[0])[0]
  if (!best || best[0] < min) return null
  let t = {}
  try { t = JSON.parse(textOf(best[1].id)) } catch {}
  const prompt = String(t.prompt || '').replace(/\{argument name="[^"]*" default="([^"]*)"\}/g, '$1').replace(/\{argument[^}]*\}/g, '')
  return prompt ? { id: best[1].id, name: best[1].name, prompt, aspect: t.aspect || '' } : null
}

// one sentence from the prompt template that fits a picture or a clip strongly, to add to its prompt: the
// template's way of putting it, not its subject; none when nothing fits that well
// photo: the picture's style is photography, so only a template that is itself photographic may join it
export function templateHint(surface, text, { min = 6, photo = false } = {}) {
  const t = promptTemplateFor(surface, text, { min })
  if (!t || (photo && !/\bphoto(graph\w*)?\b|realistic|cinematic|35mm|film still/i.test(t.prompt))) return ''
  const first = t.prompt.replace(/^\s*(scene|shot \d+)\s*:\s*/i, '').split(/(?<=[.!?])\s/)[0].slice(0, 220)
  return first ? `In the manner of Open Design's "${t.name}" prompt: ${first}` : ''
}
