// A link's look (engine/sitelook.mjs, decision 0022): measured from the rendered page, written as style words
// without the site's names, kept on the reference with where it came from, and never placed in a build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { tokensOf, motionOf, plainLook, describeLook, lookBrief, lookMessages, walkSite } from '../engine/sitelook.mjs'
import { refStore } from '../engine/refs.mjs'
import { refRoutes } from '../server/refs.mjs'
import { puppeteer } from '../engine/pageshots.mjs'
import { findChrome } from '../engine/seo.mjs'

const measured = {
  page: '#0f0f0f', fills: ['#0f0f0f', '#1a1a1a', '#c6f432'], inks: ['#f2efe8', '#c6f432', '#8f8b82'], fonts: ['Big Display', 'Body Serif', 'Mono Label'], radius: ['0'],
  texts: [
    { f: 'Big Display', size: 112, weight: 800, upper: true, track: 0, n: 12, tag: 'h1' },
    { f: 'Body Serif', size: 18, weight: 400, upper: false, track: 0, n: 300, tag: 'p' },
    ...[1, 2, 3].map(() => ({ f: 'Mono Label', size: 11, weight: 400, upper: true, track: 0.12, n: 8, tag: 'span' })),
  ],
  big: { f: 'Big Display', size: 112, weight: 800, upper: true },
  anims: [{ kind: 'CSSAnimation', name: 'drift', ms: 6000, easing: 'ease', loops: true }], moves: [{ ms: 200, easing: 'ease-out' }],
  canvases: [{ w: 1280, h: 800, top: 0, gl: true }], libs: [],
}
const walk = { url: 'https://www.cool-studio.com/', host: 'cool-studio.com', title: 'Cool Studio — Portfolio', pages: [{ url: 'https://www.cool-studio.com/', shots: [Buffer.from('x')], measured }, { url: 'https://www.cool-studio.com/work', shots: [], measured }] }
walk.tokens = tokensOf(walk.pages)
walk.motion = motionOf(walk.pages)

test('tokens come from what the browser drew: background, text, one accent, the fonts by role', () => {
  const t = walk.tokens
  assert.equal(t.bg, '#0f0f0f'); assert.equal(t.text, '#f2efe8'); assert.equal(t.accent, '#c6f432'); assert.equal(t.dark, true)
  assert.equal(t.fonts.display.name, 'Big Display'); assert.equal(t.fonts.display.upper, true)
  assert.equal(t.fonts.body.name, 'Body Serif'); assert.equal(t.fonts.body.kind, 'serif')
  assert.equal(t.fonts.label.kind, 'mono'); assert.ok(t.fonts.label.tracking >= 0.05)
  assert.equal(t.radius, '0px'); assert.equal(t.sizes.biggest, 112); assert.equal(t.sizes.body, 18)
  assert.equal(tokensOf([]), null)
})

test('motion is counted, and the same 3D canvas on every page is one piece', () => {
  assert.equal(walk.motion.loops, 2); assert.equal(walk.motion.hovers, 2)
  assert.equal(walk.motion.threeD.length, 1)
})

test('with no model the look is plain words, and 3D gets a flat stand-in', async () => {
  const w = await describeLook(walk)
  assert.equal(w.by, 'measured')
  assert.match(w.prompt, /dark/); assert.match(w.prompt, /#c6f432/)
  assert.match(w.threeD, /flat stand-in/)
  assert.equal(plainLook(null, walk.motion), null)
})

test('a model look leans on what the person wants and never keeps the site\'s names', async () => {
  let sent = null
  const chat = async messages => { sent = messages; return JSON.stringify({ prompt: 'Like Cool Studio at cool-studio.com: huge condensed uppercase, a lime glow on black.', type: 'condensed uppercase', motion: 'slow drift', mood: 'dark, sharp', threeD: 'a soft lime radial glow', left: 'the chat box' }) }
  const w = await describeLook(walk, { want: 'the type and the glow', chat })
  assert.equal(w.by, 'model')
  assert.doesNotMatch(w.prompt, /cool studio|cool-studio/i)
  assert.match(w.prompt, /lime glow/)
  assert.match(sent[1].content[0].text, /the type and the glow/)
  assert.equal(sent[1].content.filter(c => c.type === 'image_url').length, 1)
  assert.match(sent[0].content, /never name the site/i)
  // a model that answers nonsense falls back to the measured words
  assert.equal((await describeLook(walk, { chat: async () => 'no json here' })).by, 'measured')
  assert.equal(lookMessages({ tokens: walk.tokens, motion: walk.motion }).length, 2)
})

test('the brief traces the look to its reference, says what the owner wants, and forbids copying', async () => {
  const words = await describeLook(walk)
  const b = lookBrief({ id: 'rabc12', use: 'the type and the glow', look: { state: 'ready', tokens: walk.tokens, words, from: { host: 'cool-studio.com', source: 'chat' } } })
  assert.match(b, /reference rabc12/); assert.match(b, /given in the chat/); assert.match(b, /the owner wants: "the type and the glow"/)
  assert.match(b, /never use that site's words, names, logo, pictures or font files/)
  assert.match(b, /closest font you can load/)
  assert.equal(lookBrief({ id: 'r1', look: { state: 'walking' } }), '')
})

const store = () => {
  const projectsDir = mkdtempSync(join(tmpdir(), 'look-'))
  mkdirSync(join(projectsDir, 'p1'))
  return refStore({ projectsDir, known: pid => pid === 'p1' })
}

test('a link keeps its look and shots; the shots are served but never listed as pictures to place', async () => {
  const s = store()
  const l = s.addLink('p1', { url: 'https://www.cool-studio.com/', use: 'the type and the glow', source: 'chat', from: 'c123' })
  assert.equal(l.use, 'the type and the glow'); assert.equal(l.from, 'c123')
  s.setLook('p1', l.id, { state: 'walking', from: { host: 'cool-studio.com' } })
  assert.match(s.brief('p1'), /Links the owner gave as references:\n- https:\/\/www\.cool-studio\.com\//)
  const words = await describeLook(walk)
  const r = s.setLook('p1', l.id, { state: 'ready', tokens: walk.tokens, words, from: { host: 'cool-studio.com', source: 'chat' } }, [Buffer.from([0xff, 0xd8, 0xff]), Buffer.from([0xff, 0xd8, 0xff])])
  assert.deepEqual(r.look.shots, [`/ref/p1/look-${l.id}-0.jpg`, `/ref/p1/look-${l.id}-1.jpg`])
  assert.ok(s.file('p1', `look-${l.id}-0.jpg`))
  const brief = s.brief('p1')
  assert.match(brief, /A look to learn from \(reference r/)
  assert.doesNotMatch(brief, /look-r[0-9a-z]+-0\.jpg/)
  assert.doesNotMatch(brief, /reference pictures/)
  s.remove('p1', l.id)
  assert.equal(s.file('p1', `look-${l.id}-0.jpg`), null)
  const f = s.addFile('p1', { name: 'a.png' }, Buffer.alloc(30))
  assert.throws(() => s.setLook('p1', f.id, { state: 'ready' }), /only a link/)
})

test('POST …/refs/link starts the walk; …/:id/look walks again with a new note', async () => {
  const s = store(), walked = []
  const walk = (pid, r) => { walked.push([pid, r.id, r.use]); return s.setLook(pid, r.id, { state: 'walking' }) }
  const h = refRoutes({ refs: s, walk })
  const srv = http.createServer((req, res) => { if (!h(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}/api/projects/p1/refs`
  try {
    const a = await (await fetch(`${base}/link`, { method: 'POST', body: JSON.stringify({ url: 'https://example.com', use: 'the colours' }) })).json()
    assert.equal(a.ref.look.state, 'walking'); assert.deepEqual(walked[0], ['p1', a.ref.id, 'the colours'])
    const b = await (await fetch(`${base}/${a.ref.id}/look`, { method: 'POST', body: JSON.stringify({ use: 'only the type' }) })).json()
    assert.equal(b.ref.use, 'only the type'); assert.equal(walked[1][2], 'only the type')
    const none = refRoutes({ refs: s })
    const srv2 = http.createServer((req, res) => { if (!none(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
    await new Promise(r => srv2.listen(0, r))
    const r2 = await fetch(`http://127.0.0.1:${srv2.address().port}/api/projects/p1/refs/${a.ref.id}/look`, { method: 'POST', body: '{}' })
    assert.equal(r2.status, 503)
    srv2.close()
  } finally { srv.close() }
})

test('the walk refuses the machine\'s own and private addresses', async () => {
  await assert.rejects(walkSite('http://127.0.0.1:4319/'), /only/)
  await assert.rejects(walkSite('http://localhost/'), /only public/)
  await assert.rejects(walkSite('https://intranet.example/', { lookup: async () => [{ address: '10.0.0.5' }] }), /only public/)
  await assert.rejects(walkSite('file:///etc/passwd'), /not a link/)
})

// a browser that draws nothing: enough of puppeteer's page for the walk (engine/pageshots.mjs settle included)
const fakeBrowser = (seen, height = 1600) => async () => ({
  newPage: async () => ({
    setViewport: async () => {}, setRequestInterception: async () => {}, on: () => {}, goto: async () => {}, waitForNetworkIdle: async () => {},
    evaluate: async x => (typeof x !== 'string' ? undefined : /scrollHeight$/.test(x) ? height : structuredClone(seen)),
    screenshot: async () => Buffer.from([0xff, 0xd8, 0xff]), url: () => 'http://127.0.0.1:9/', close: async () => {}
  }),
  close: async () => {}
})
test('the walk says what it is doing, step by step, and a step that throws does not stop it', async () => {
  const steps = []
  const first = { ...measured, nav: ['http://127.0.0.1:9/work'], title: 'Cool' }
  const w = await walkSite('http://127.0.0.1:9/', { launch: fakeBrowser(first), allowPrivate: true, pages: 2, shots: 2, onStep: t => steps.push(t) })
  assert.equal(w.pages.length, 2)
  assert.deepEqual(steps, ['Opening 127.0.0.1', 'Scrolling page 1 of 2', 'Reading colours and type', 'Opening page 2 of 2', 'Scrolling page 2 of 2', 'Reading colours and type'])
  // a short page is never scrolled, so it says no scrolling
  const short = []
  await walkSite('http://127.0.0.1:9/', { launch: fakeBrowser({ ...measured, nav: [], title: '' }, 600), allowPrivate: true, onStep: t => short.push(t) })
  assert.deepEqual(short, ['Opening 127.0.0.1', 'Reading colours and type'])
  const quiet = await walkSite('http://127.0.0.1:9/', { launch: fakeBrowser({ ...measured, nav: [], title: '' }, 600), allowPrivate: true, onStep: () => { throw new Error('store gone') } })
  assert.equal(quiet.pages.length, 1)
  assert.ok(quiet.tokens)
})

// the real thing, when this machine has the browser the video tools install
const dataDir = join(homedir(), '.hermes', 'swarm-studio')
const canWalk = !!(puppeteer(dataDir) && findChrome())
test('a local page is walked in a real browser: shots, colours, fonts, motion and a 3D canvas', { skip: !canWalk && 'no browser here' }, async () => {
  const page = `<!doctype html><html><head><style>
    body{margin:0;background:#101010;color:#f0ede6;font-family:Georgia,serif}
    h1{font:800 96px/1 Impact,sans-serif;text-transform:uppercase;margin:40px}
    p{font-size:18px;margin:40px} .tag{font:11px monospace;letter-spacing:2px;text-transform:uppercase;margin:0 40px}
    .btn{display:inline-block;margin:40px;padding:12px 20px;background:#c6f432;color:#101010;border-radius:999px;transition:transform .3s ease-out}
    .spin{width:60px;height:60px;margin:40px;background:#c6f432;animation:spin 4s linear infinite}@keyframes spin{to{transform:rotate(1turn)}}
    section{height:900px}</style></head><body>
    <h1>Studio</h1><div class="tag">one</div><div class="tag">two</div><div class="tag">three</div>
    <p>Words about the work, long enough to be the body text of this page.</p><a class="btn" href="/work">Work</a>
    <div class="spin"></div><canvas id="c" width="400" height="300"></canvas><section></section>
    <script>document.getElementById('c').getContext('webgl')</script></body></html>`
  const srv = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page))
  await new Promise(r => srv.listen(0, r))
  try {
    const w = await walkSite(`http://127.0.0.1:${srv.address().port}/`, { dataDir, pages: 2, shots: 2, allowPrivate: true })
    assert.equal(w.pages.length, 2)
    assert.ok(w.pages[0].shots.length >= 1 && w.pages[0].shots[0][0] === 0xff)
    assert.equal(w.tokens.bg, '#101010'); assert.equal(w.tokens.accent, '#c6f432')
    assert.equal(w.tokens.fonts.label.kind, 'mono'); assert.equal(w.tokens.fonts.display.upper, true)
    assert.ok(w.motion.animations >= 1); assert.ok(w.motion.hovers >= 1)
    assert.equal(w.motion.threeD.length, 1)
  } finally { srv.close() }
})
