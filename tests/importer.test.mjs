// What you have (decision 0015): what a dropped file or a given site says, read and filled into the walk
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { textOf, findIn } from '../engine/importer.mjs'
import { refStore } from '../engine/refs.mjs'
import { refRoutes } from '../server/refs.mjs'
import { brandRoutes } from '../server/brand.mjs'
import { studioStore } from '../engine/studio.mjs'

// a one-page PDF with these lines of Helvetica text, its offsets computed
function tinyPdf(lines) {
  const esc = s => s.replace(/[\\()]/g, m => '\\' + m)
  const content = `BT /F1 18 Tf 72 720 Td ${lines.map((l, i) => `${i ? '0 -24 Td ' : ''}(${esc(l)}) Tj`).join(' ')} ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const dir = () => mkdtempSync(join(tmpdir(), 'importer-'))

test('a PDF, a text file and a site are read; a picture has nothing to read', async () => {
  const d = dir()
  writeFileSync(join(d, 'brief.pdf'), tinyPdf(['Moss and Tide Bakery', 'Sourdough for the harbour town, baked before dawn.']))
  const pdf = await textOf({ kind: 'file', name: 'brief.pdf' }, { file: join(d, 'brief.pdf') })
  assert.match(pdf.text, /Moss and Tide Bakery\s+Sourdough for the harbour town/)
  writeFileSync(join(d, 'notes.md'), '# A tea room\nFor walkers on the coast path.')
  assert.match((await textOf({ kind: 'file', name: 'notes.md' }, { file: join(d, 'notes.md') })).text, /tea room/)
  assert.deepEqual(await textOf({ kind: 'image', name: 'shop.png' }, { file: join(d, 'notes.md') }), { note: 'nothing to read in it' })
  const site = await textOf({ kind: 'link', url: 'https://tea.example' }, { page: async () => ({ title: 'Tea on the Path', description: 'A tea room for walkers', text: '' }) })
  assert.equal(site.text, 'Tea on the Path\nA tea room for walkers')
  assert.match((await textOf({ kind: 'link', url: 'https://x.example' }, { page: async () => ({}) })).note, /no words/)
})

test('without a model the first words fill in, and nothing is guessed', async () => {
  const f = await findIn('Moss and Tide Bakery\nSourdough for the harbour town, baked before dawn.')
  assert.equal(f.what, 'Moss and Tide Bakery')
  assert.equal(f.idea, 'Moss and Tide Bakery Sourdough for the harbour town, baked before dawn.')
  assert.equal(f.who, ''); assert.deepEqual(f.pages, []); assert.equal(f.by, 'words')
  assert.equal(await findIn('   '), null)
})

test('without a model, lines that say what they are are still read: "Pages:" and "For:" (#543)', async () => {
  const f = await findIn('Cedar Cafe brand brief\nA small cafe by the river.\nFor: locals, cyclists, families on weekends.\nPages: Home, Menu, Visit us and Events.')
  assert.deepEqual(f.pages, ['Home', 'Menu', 'Visit us', 'Events'])
  assert.equal(f.who, 'locals, cyclists, families on weekends')
  // a page list in a sentence is not a labelled line: nothing is guessed from it
  assert.deepEqual((await findIn('A cafe site with a home page and a menu')).pages, [])
})

test('with a model its fields are kept, clipped, and a broken answer falls back to the words', async () => {
  const chat = async messages => { assert.match(messages[0].content, /Return JSON only/); return 'Sure: {"idea":"A bakery site","what":"A harbour bakery","who":"Early commuters","pages":["Home","Bread","Visit us", ""]}' }
  const f = await findIn('Moss and Tide Bakery', { chat })
  assert.deepEqual({ ...f }, { idea: 'A bakery site', what: 'A harbour bakery', who: 'Early commuters', pages: ['Home', 'Bread', 'Visit us'], by: 'model' })
  const g = await findIn('Moss and Tide Bakery', { chat: async () => 'no JSON here' })
  assert.equal(g.by, 'words'); assert.equal(g.what, 'Moss and Tide Bakery')
})

test('a file is read wherever it is given; a link only when brought to the first step; a picture never (#543)', async () => {
  const projectsDir = dir()
  mkdirSync(join(projectsDir, 'p1'))
  const refs = refStore({ projectsDir, known: pid => pid === 'p1' })
  const read = []
  const route = refRoutes({ refs, read: (pid, r) => { read.push(r.name); return refs.setFound(pid, r.id, { state: 'reading' }) } })
  const srv = http.createServer((req, res) => { if (!route(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const u = `http://127.0.0.1:${srv.address().port}`
  try {
    let r = await fetch(`${u}/api/projects/p1/refs?name=brief.pdf&source=import`, { method: 'POST', body: tinyPdf(['A']) }).then(r => r.json())
    assert.equal(r.ref.source, 'import'); assert.deepEqual(r.ref.found, { state: 'reading' })
    r = await fetch(`${u}/api/projects/p1/refs/link`, { method: 'POST', body: JSON.stringify({ url: 'https://tea.example', source: 'import' }) }).then(r => r.json())
    assert.equal(r.ref.found.state, 'reading')
    // a PDF dropped on References in the current Studio is read too: its words reach the crew's brief
    r = await fetch(`${u}/api/projects/p1/refs?name=other.pdf`, { method: 'POST', body: tinyPdf(['B']) }).then(r => r.json())
    assert.equal(r.ref.found?.state, 'reading', 'a file given as a reference is read')
    // a picture has no words, and a link added as a reference is walked for its look, not read
    r = await fetch(`${u}/api/projects/p1/refs?name=shot.png`, { method: 'POST', body: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }).then(r => r.json())
    assert.equal(r.ref.found, undefined, 'a picture is not read')
    r = await fetch(`${u}/api/projects/p1/refs/link`, { method: 'POST', body: JSON.stringify({ url: 'https://cafe.example' }) }).then(r => r.json())
    assert.equal(r.ref.found, undefined, 'a link from Add link is walked, not read')
    assert.deepEqual(read, ['brief.pdf', 'tea.example', 'other.pdf'])
  } finally { srv.close() }
})

test("the story it found fills only the sheet's empty fields, and a sheet already made is never made again", async () => {
  const projectsDir = dir()
  mkdirSync(join(projectsDir, 'p1'))
  const studios = studioStore({ projectsDir })
  const brands = brandRoutes({ chats: null, projectBrands: studios.brands })
  const found = { what: 'A harbour bakery', who: 'Early commuters', pages: ['Home', 'Bread'] }
  let v = await brands.story('p1', 'Moss and Tide Bakery', found)
  assert.equal(v.brand.brief, 'Moss and Tide Bakery', 'no sheet yet: one is made for the idea')
  assert.equal(v.brand.story.who, 'Early commuters'); assert.deepEqual(v.brand.story.pages, ['Home', 'Bread'])
  await studios.brands.update('p1', rec => { rec.brand.story.who = 'Fishermen'; rec.brand.pick.palette = 'mine' })
  v = await brands.story('p1', 'Something else entirely', { ...found, who: 'Tourists' })
  assert.equal(v.brand.story.who, 'Fishermen', "the person's words stay")
  assert.equal(v.brand.brief, 'Moss and Tide Bakery'); assert.equal(v.brand.pick.palette, 'mine')
  assert.equal(await brands.story('nope', 'x', found), null)
})
