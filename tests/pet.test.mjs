// Hermia's cursor (web/pet.js, docs/specs/41-pet-cursor.md): every event has lines from rules, short and never a
// question; the brain spaces bubbles about 20 s apart, makes one reaction of a burst, never says the same line
// twice in a row and never repeats the chat.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PET_LINES, PET_ORDER, PET_MAX, PET_GAP, PET_BUSY, PET_NOT, petBrain, petSpot } from '../web/pet.js'

const SAMPLES = {
  step: [{ step: 'brand' }, { step: 'references' }, { step: 'assets' }, { step: 'plan' }, { step: 'proposal' }, { step: 'nowhere' }, {}],
  file: [{ name: 'brief.pdf', type: 'application/pdf' }, { name: 'logo.png', type: 'image/png' }, { name: 'shot.jpg', type: 'image/jpeg' },
    { name: 'clip.mp4', type: 'video/mp4' }, { name: 'song.mp3', type: 'audio/mpeg' }, { name: 'Inter.woff2', type: 'font/woff2' },
    { name: 'a-very-long-spreadsheet-name-that-goes-on-and-on.xlsx', type: '' }, { name: 'x.zip', count: 4 }],
  link: [{ url: 'https://www.pinterest.com/pin/123' }, { url: 'https://dribbble.com/shots/1' }, { url: 'https://youtu.be/abc' },
    { url: 'https://www.figma.com/file/x' }, { url: 'https://instagram.com/p/1' }, { url: 'https://github.com/a/b' },
    { url: 'https://an-extremely-long-hostname-for-a-site.example.com/x' }, { url: 'www.example.org/page' }, { url: 'not a url' }],
  pick: [{ name: 'Playful community' }, { name: 'A palette with a really long name that would never fit in a bubble' }, {}],
  skip: [{ step: 'references' }],
  brief: [{ idea: 'a community site for rats and their owners' }, { idea: 'a site' }, { idea: '' }],
  back: [{ ms: 45000 }, { ms: 20 * 60000 }],
  built: [{ pages: 4 }, { pages: 1 }, {}]
}

test('every event in the table has lines, and the order names them all', () => {
  assert.deepEqual(Object.keys(PET_LINES).sort(), [...PET_ORDER].sort())
  for (const kind of PET_ORDER) assert.ok(SAMPLES[kind], `no samples for ${kind}`)
})

test('lines are short, several per event, and never a question', () => {
  for (const [kind, samples] of Object.entries(SAMPLES)) {
    for (const d of samples) {
      const ls = PET_LINES[kind](d)
      assert.ok(ls.length >= 2, `${kind} ${JSON.stringify(d)}: only ${ls.length} line`)
      for (const l of ls) {
        assert.ok(l.length <= PET_MAX, `${kind}: "${l}" is ${l.length} characters`)
        assert.ok(!l.includes('?'), `${kind}: "${l}" asks a question`)
        assert.ok(!/click|press|tap|open the|go to/i.test(l), `${kind}: "${l}" reads like an instruction`)
      }
    }
  }
})

test('the lines say what the screen knows', () => {
  assert.ok(PET_LINES.step({ step: 'brand' }).includes('ooh, the fun part'))
  assert.ok(PET_LINES.file({ name: 'brief.pdf', type: 'application/pdf' }).includes('a PDF! reading it'))
  assert.ok(PET_LINES.file({ name: 'logo.png', type: 'image/png' }).includes('nice logo'))
  assert.ok(PET_LINES.link({ url: 'https://www.pinterest.com/pin/1' }).includes('pinterest, my favourite rabbit hole'))
  assert.ok(PET_LINES.pick({ name: 'Playful community' }).includes('Playful community, good call'))
  assert.ok(PET_LINES.skip({}).includes('fine, we\'ll wing it'))
  assert.ok(PET_LINES.brief({ idea: 'a site for rats' }).includes('rats!! love that'))
  assert.ok(PET_LINES.back({ ms: 40000 }).includes('oh hi, I kept your spot'))
  assert.ok(PET_LINES.built({ pages: 4 }).includes('all 4 pages up'))
  assert.ok(PET_LINES.built({ pages: 1 }).includes('all 1 page up'))
})

// a clock the test moves by hand
const clock = (t = 1_000_000) => ({ now: () => t, add: ms => { t += ms } })

test('at most one bubble every ~20 seconds', () => {
  const c = clock()
  const b = petBrain({ now: c.now, random: () => 0 })
  assert.ok(b.take([{ kind: 'step', data: { step: 'brand' } }]))
  c.add(5000)
  assert.equal(b.take([{ kind: 'file', data: { name: 'logo.png' } }]), null)
  c.add(PET_GAP - 5001)
  assert.equal(b.take([{ kind: 'file', data: { name: 'logo.png' } }]), null)
  c.add(1)
  assert.ok(b.take([{ kind: 'file', data: { name: 'logo.png' } }]))
})

test('a burst makes one reaction: the biggest moment in it', () => {
  const c = clock()
  const b = petBrain({ now: c.now, random: () => 0 })
  const burst = [{ kind: 'step', data: { step: 'assets' } }, { kind: 'file', data: { name: 'a.zip', count: 3 } }, { kind: 'back', data: { ms: 40000 } }]
  assert.equal(b.take(burst), '3 files! reading them')
  // the rest of the burst is gone, not queued for later
  c.add(1000)
  assert.equal(b.take(burst), null)
  c.add(PET_GAP)
  assert.equal(b.take([{ kind: 'built', data: { pages: 2 } }, ...burst]), 'all 2 pages up')
})

test('the same line never comes twice in a row, whatever the dice', () => {
  for (const r of [0, 0.34, 0.5, 0.67, 0.999]) {
    const c = clock()
    const b = petBrain({ now: c.now, random: () => r })
    let prev = ''
    for (let i = 0; i < 12; i++) {
      const line = b.take([{ kind: 'skip', data: {} }])
      assert.ok(line, 'a line every time the gap has passed')
      assert.notEqual(line, prev)
      prev = line
      c.add(PET_GAP)
    }
  }
})

test('never a line the chat already said', () => {
  const c = clock()
  const chat = new Set(['Fine, we’ll wing it!', 'Skipping, no worries.'])
  const b = petBrain({ now: c.now, random: () => 0, chat: () => chat })
  assert.equal(b.take([{ kind: 'skip', data: {} }]), 'we can come back to it')
  // with every line of an event said, she stays quiet and the gap is not spent
  chat.add('we can come back to it')
  c.add(PET_GAP)
  assert.equal(b.take([{ kind: 'skip', data: {} }]), null)
  assert.ok(b.take([{ kind: 'step', data: { step: 'brand' } }]))
})

test('an unknown event or an empty burst says nothing', () => {
  const b = petBrain({ now: () => 5e6 })
  assert.equal(b.take([]), null)
  assert.equal(b.take([{ kind: 'whistle', data: {} }]), null)
  assert.deepEqual(b.lines('whistle'), [])
})

// slow things (the owner, 2026-11-13): a skeleton, and her working on it
test('she works inside a placeholder, near its top left, never off the screen', () => {
  const [x, y] = petSpot({ left: 300, top: 200, width: 400, height: 300 }, 1440, 900)
  assert.ok(x > 300 && x < 700 && y > 200 && y < 500, `${x},${y} is not on the placeholder`)
  assert.deepEqual(petSpot({ left: 20, top: 100, width: 100, height: 60 }, 1440, 900), [50, 124])
  // a placeholder past the edge: she stays on screen, below the top bar
  const [ex, ey] = petSpot({ left: 1430, top: 0, width: 400, height: 40 }, 1440, 900)
  assert.ok(ex <= 1400 && ey >= 56)
})

test('the placeholders she finds are the shared skeleton pattern and the aria-busy marker', () => {
  for (const s of ['.wait-in', '[aria-busy="true"]', '.ab .sk:not(.over)']) assert.ok(PET_BUSY.includes(s), `${s} missing`)
  // where a crew cursor already paints, the chat, and dialogs above her are not hers
  for (const s of ['.pt', '.pl-work', '.side', '.ui-overlay']) assert.ok(PET_NOT.includes(s), `${s} missing`)
})
