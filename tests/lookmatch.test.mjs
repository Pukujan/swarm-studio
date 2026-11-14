// The visual match check (engine/lookmatch.mjs, decision 0022): style is compared, not layout or content; the
// result is a pair and the top differences; a difference reaches the crew only when the person presses Fix.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { compareTokens, scoreOf, colourGap, judgeMatch, matchMessages, MATCH_RULES, walkBuild, fixText } from '../engine/lookmatch.mjs'
import { refStore } from '../engine/refs.mjs'
import { refRoutes } from '../server/refs.mjs'
import { puppeteer } from '../engine/pageshots.mjs'
import { findChrome } from '../engine/seo.mjs'

const ref = { bg: '#0f0f0f', text: '#f2efe8', accent: '#c6f432', dark: true, radius: '0px', sizes: { biggest: 112 },
  fonts: { display: { name: 'Big', kind: 'display sans', weight: 800, upper: true }, body: { name: 'Serif', kind: 'serif' }, label: { kind: 'mono', upper: true, tracking: 0.1 } } }
const same = structuredClone(ref)
const off = { bg: '#f5f6f8', text: '#111111', accent: '#2f4fe0', dark: false, radius: '8px', sizes: { biggest: 48 },
  fonts: { display: { name: 'Lora', kind: 'serif', weight: 400, upper: false }, body: { name: 'Inter', kind: 'sans' }, label: null } }

test('the same style scores 100 with no differences; colours are gapped 0 to 1', () => {
  assert.deepEqual(compareTokens(ref, same), [])
  assert.equal(scoreOf([]), 100)
  assert.equal(colourGap('#000000', '#000000'), 0)
  assert.ok(Math.abs(colourGap('#000000', '#ffffff') - 1) < 0.01)
  assert.deepEqual(compareTokens(null, off), [])
})

test('a different style is named part by part, biggest first, each with an instruction', () => {
  const d = compareTokens(ref, off, { animations: 30 }, { animations: 0 })
  const parts = d.map(x => x.part)
  assert.equal(parts[0], 'Background')
  for (const p of ['Accent', 'Headings', 'Body text', 'Labels', 'Corners', 'Scale', 'Motion']) assert.ok(parts.includes(p), p)
  for (const x of d) { assert.ok(x.say && x.fix); assert.ok(x.weight > 0) }
  assert.ok(d.every((x, i) => !i || d[i - 1].weight >= x.weight))
  assert.ok(scoreOf(d) < 30)
  assert.match(d.find(x => x.part === 'Background').fix, /#0f0f0f/)
})

test('the rules ask for style only, never the same layout, words or pictures', () => {
  assert.match(MATCH_RULES, /Judge only style/)
  assert.match(MATCH_RULES, /Do NOT ask for the same layout, the same sections, the same words or the same pictures/)
  const m = matchMessages({ ref: [Buffer.from('a')], ours: [Buffer.from('b'), Buffer.from('c')], want: 'the type', measured: [{ say: 'headings are serif' }] })
  assert.equal(m[1].content.filter(c => c.type === 'image_url').length, 3)
  assert.match(m[1].content[0].text, /the type/); assert.match(m[1].content[0].text, /headings are serif/)
})

const ours = { tokens: off, motion: { animations: 0 }, pages: [{ shots: [Buffer.from('x')] }] }
test('with no model the measured top three stand; a model answer is capped at three and scrubbed of names', async () => {
  const plain = await judgeMatch({ ref: { tokens: ref, motion: { animations: 30 }, shots: [Buffer.from('r')] }, ours })
  assert.equal(plain.by, 'measured'); assert.equal(plain.diffs.length, 3); assert.equal(plain.diffs[0].part, 'Background')
  const chat = async () => JSON.stringify({ score: 41, close: 'calm spacing', diffs: [1, 2, 3, 4].map(i => ({ part: `Part ${i}`, say: `not like cool-studio.com yet ${i}`, fix: `Do thing ${i}` })) })
  const m = await judgeMatch({ ref: { tokens: ref, shots: [Buffer.from('r')] }, ours, avoid: ['cool-studio.com'], chat })
  assert.equal(m.by, 'model'); assert.equal(m.score, 41); assert.equal(m.diffs.length, 3)
  assert.doesNotMatch(JSON.stringify(m), /cool-studio/)
  // nonsense, or no shots to show: the measured result
  assert.equal((await judgeMatch({ ref: { tokens: ref, shots: [Buffer.from('r')] }, ours, chat: async () => 'nope' })).by, 'measured')
  assert.equal((await judgeMatch({ ref: { tokens: ref, shots: [] }, ours, chat })).by, 'measured')
})

test('the fix line asks for style only and keeps layout, words and pictures', () => {
  const t = fixText({ fix: 'Change the accent colour to #c6f432 on every page.' }, 'cool-studio.com')
  assert.match(t, /^Style fix/); assert.match(t, /#c6f432/); assert.match(t, /keep the layout, the words and the pictures/)
})

const store = () => {
  const projectsDir = mkdtempSync(join(tmpdir(), 'match-'))
  mkdirSync(join(projectsDir, 'p1'))
  return refStore({ projectsDir, known: pid => pid === 'p1' })
}
const jpg = Buffer.from([0xff, 0xd8, 0xff])

test('a match is kept on the look with its shots; a new walk keeps it, a new look clears it', () => {
  const s = store()
  const l = s.addLink('p1', { url: 'https://example.com' })
  assert.throws(() => s.setMatch('p1', l.id, { state: 'checking' }), /no look/)
  s.setLook('p1', l.id, { state: 'ready', tokens: ref }, [jpg])
  const r = s.setMatch('p1', l.id, { state: 'ready', score: 62, diffs: [{ part: 'Accent', say: 'x', fix: 'y' }] }, [jpg])
  assert.deepEqual(r.look.match.ours, [`/ref/p1/match-${l.id}-0.jpg`])
  assert.ok(s.file('p1', `match-${l.id}-0.jpg`))
  assert.doesNotMatch(s.brief('p1'), /match-/)
  assert.equal(s.setLook('p1', l.id, { state: 'walking' }).look.match.score, 62)
  assert.equal(s.setLook('p1', l.id, { state: 'ready', tokens: ref }, [jpg]).look.match, undefined)
})

test('…/match needs a ready look and a build; …/fix sends one difference to the crew, only when asked', async () => {
  const s = store(), sent = [], started = []
  let head = null
  const h = refRoutes({ refs: s, head: () => head, comment: async (run, input) => { sent.push([run, input.text]) }, fixText,
    match: (pid, r, run) => { started.push(run); return s.setMatch(pid, r.id, { state: 'checking', run }) } })
  const srv = http.createServer((req, res) => { if (!h(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}/api/projects/p1/refs`
  const post = (path, body = {}) => fetch(`${base}/${path}`, { method: 'POST', body: JSON.stringify(body) })
  try {
    const l = s.addLink('p1', { url: 'https://example.com' })
    assert.equal((await post(`${l.id}/match`)).status, 400)
    s.setLook('p1', l.id, { state: 'ready', tokens: ref, from: { host: 'example.com' } }, [jpg])
    assert.equal((await post(`${l.id}/match`)).status, 409)
    head = 'run1'
    const a = await (await post(`${l.id}/match`)).json()
    assert.equal(a.ref.look.match.state, 'checking'); assert.deepEqual(started, ['run1'])
    assert.equal(sent.length, 0)
    s.setMatch('p1', l.id, { state: 'ready', score: 50, diffs: [{ part: 'Accent', say: 'accent is blue', fix: 'Change the accent colour to #c6f432 on every page.' }] })
    assert.equal(sent.length, 0)
    assert.equal((await post(`${l.id}/fix`, { i: 4 })).status, 400)
    const f = await (await post(`${l.id}/fix`, { i: 0 })).json()
    assert.equal(f.sent, true)
    assert.equal(sent[0][0], 'run1'); assert.match(sent[0][1], /Style fix.*#c6f432.*keep the layout/)
  } finally { srv.close() }
})

const dataDir = join(homedir(), '.hermes', 'swarm-studio')
const canWalk = !!(puppeteer(dataDir) && findChrome())
test('the build\'s own exported pages are walked from disk and measured', { skip: !canWalk && 'no browser here' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-'))
  const page = (bg, h) => `<!doctype html><html><head><style>body{margin:0;background:${bg};color:#111;font-family:Georgia,serif}h1{font:700 60px Georgia,serif;margin:40px}p{font-size:18px;margin:40px}a{display:inline-block;margin:40px;padding:10px 16px;background:#2f4fe0;color:#fff;border-radius:8px}</style></head><body><h1>${h}</h1><p>Some words about the work that make a body paragraph.</p><a href="about.html">About</a></body></html>`
  writeFileSync(join(dir, 'index.html'), page('#f5f6f8', 'Selected works'))
  writeFileSync(join(dir, 'about.html'), page('#f5f6f8', 'About'))
  const w = await walkBuild({ htmlDir: dir, files: ['index.html', 'about.html', 'missing.html'], dataDir })
  assert.equal(w.pages.length, 2)
  assert.equal(w.tokens.bg, '#f5f6f8'); assert.equal(w.tokens.accent, '#2f4fe0'); assert.equal(w.tokens.fonts.display.kind, 'serif')
  assert.ok(w.pages[0].shots[0][0] === 0xff)
  const d = compareTokens(ref, w.tokens)
  assert.equal(d[0].part, 'Background')
  assert.equal((await walkBuild({ htmlDir: dir, files: ['nope.html'], dataDir })).note, 'nothing built yet')
})
