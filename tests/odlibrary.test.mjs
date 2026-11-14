// Open Design's library (decision 0016 point 1b and 3, issue #447): every skill, design template, plugin skill and
// prompt template, pinned with its licence; chosen the way Open Design chooses (the person picks a template, the
// sitemap planner names skills from a short catalogue, builders get none of it); and the look in Open Design's
// order (the request, then the project, then the default).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMMIT } from '../scripts/import-od-systems.mjs'
import { entries, entryOf, textOf, shortlist, catalogueLines, skillTexts, templateText, templates, promptTemplateFor, templateHint } from '../engine/odlibrary.mjs'
import { requestedBrand } from '../engine/brand.mjs'
import { SITEMAP_SYSTEM, workerMessages, pagePlannerMessages } from '../engine/prompts.mjs'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('the whole library is pinned at the commit, every entry with its licence', () => {
  const lib = JSON.parse(read('engine/opendesign/library.json'))
  assert.equal(lib.source.commit, COMMIT)
  const n = k => entries(k).length
  assert.deepEqual([n('skill'), n('template'), n('plugin-skill'), n('prompt-template')], [169, 115, 272, 106])
  for (const e of entries()) {
    assert.ok(e.licence && e.name && e.line && e.path, e.id)
    if (e.licenceFile) assert.ok(textOf(`licence:${e.licenceFile}`).length > 100, e.licenceFile)
    assert.ok(textOf(e.id), `${e.id} has its text`)
  }
  assert.match(read('engine/opendesign/NOTICE'), /library\.json/)
})

test('the sitemap planner sees a short catalogue that fits the brief, or none', () => {
  const list = shortlist('A SaaS landing page with a pricing page for an AI coding agent')
  assert.ok(list.length > 0 && list.length <= 8)
  assert.ok(list.every(e => e.kind === 'skill' || e.kind === 'plugin-skill'))
  assert.ok(list.some(e => /pricing|landing/i.test(`${e.name} ${e.line}`)))
  assert.deepEqual(shortlist('Harbour Lights, a ferry timetable for an island town'), [])
  assert.match(catalogueLines(list.slice(0, 1)), /^\S+: .+ \((skill|plugin-skill)\)\. /)
  assert.match(SITEMAP_SYSTEM, /"type":"skills","ids"/)
})

test("only the chosen skills' text goes to the page planners, at most two and shortened; builders get none", () => {
  const ids = shortlist('A SaaS landing page with a pricing page for an AI coding agent').map(e => e.id)
  const text = skillTexts([...ids, 'skill:not-there', 'template:aster-atelier'])
  assert.equal((text.match(/^Skill "/gm) || []).length, Math.min(2, ids.length))
  assert.ok(text.length < 2 * 3700)
  const page = { id: 'home', title: 'Home', purpose: 'p', sections: 'hero', layers: [{ id: 'home-hero', role: 'hero' }] }
  const plan = { pages: [page], shared: [] }
  const planner = pagePlannerMessages({ brief: 'b', theme: {}, plan, page, skills: text })[1].content
  assert.ok(planner.includes(text.slice(0, 200)))
  const builder = JSON.stringify(workerMessages({ theme: {}, plan: { ...plan, skills: ids }, page, layer: { ...page.layers[0], page: 'home', content: '' } }))
  assert.ok(!builder.includes('Skill "'))
})

test('the person picks a design template; the planners follow it', () => {
  const list = templates()
  assert.equal(list.length, 115)
  const t = templateText(list[0].id)
  assert.match(t, /^The person picked the design template "/)
  assert.equal(templateText('skill:ad-creative'), '')
  assert.equal(templateText('nothing'), '')
  assert.match(read('engine/run.mjs'), /template: picked/)
  assert.match(read('server/server.mjs'), /\/api\/library\/templates/)
})

test("a prompt template joins a picture's or a clip's prompt only when it fits well, and never fights a photo style", () => {
  assert.equal(promptTemplateFor('image', 'a quiet bakery counter at dawn'), null)
  const t = promptTemplateFor('image', 'anime martial arts battle in a dojo')
  assert.equal(t?.id, entryOf(t?.id)?.id)
  assert.doesNotMatch(t.prompt, /\{argument/)
  assert.match(templateHint('image', 'anime martial arts battle in a dojo'), /^In the manner of Open Design's "/)
  assert.equal(templateHint('image', 'anime martial arts battle in a dojo', { photo: true }), '')
})

test('the look comes from the request, then the project, then the default', () => {
  const asked = requestedBrand('od-airbnb', 'a holiday flat')
  assert.equal(asked.theme.system.slug, 'od-airbnb')
  assert.match(asked.brief, /locked/)
  assert.equal(requestedBrand('od-nothing'), null)
  assert.equal(requestedBrand(undefined), null)
  assert.match(read('server/server.mjs'), /requestedBrand\(input\.system, String\(input\.brief\)\) \|\| lockedBrand\(chats, chatId\) \|\| \(pid \? lockedBrand\(studios\.brands, pid\) : null\)/)
})
