import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFindings, padBox, isPolish, spread, parseWhere, parseGone, lookMessages, fixPrompt, polishPrompt, contactSheet, beforeAfter, closeUp } from '../engine/slicecheck.mjs'

test('the bots\' findings are read, capped and cleaned', () => {
  const text = 'Here: {"findings":[{"frame":9,"what":"  trail has a hard box edge  ","box":[0.4,0.5,0.1,0.1],"fix":"fade the trail","obvious":true},{"frame":2,"what":"title text spills out of its card","box":"x","fix":"wrap it"},{"what":""}]}'
  const f = parseFindings(text)
  assert.equal(f.length, 2)
  assert.equal(f[0].frame, 6)
  assert.equal(f[0].what, 'trail has a hard box edge')
  assert.equal(f[0].obvious, true)
  assert.equal(f[1].box, null)
  assert.equal(f[1].obvious, false)
  assert.equal(parseFindings('no json'), null)
  assert.deepEqual(parseFindings('{"findings":[]}'), [])
})

test('a close-up box is padded, kept inside the frame and never tiny', () => {
  const b = padBox([0.95, 0.95, 0.04, 0.04])
  assert.ok(b[0] + b[2] <= 1 && b[1] + b[3] <= 1)
  assert.ok(b[2] >= 0.2 && b[3] >= 0.2)
  assert.equal(padBox([0, 0, 0.001, 0.5]), null)
  assert.equal(padBox('nope'), null)
})

test('"looks rough" is a polish pass; a new idea is a change for the next slice', () => {
  for (const t of ['some of the FX look rough', 'the trail has hard edges', 'can you polish the ult', 'clean up the HUD']) assert.ok(isPolish(t), t)
  for (const t of ['add a night stage', 'give her sound effects', 'the ult is missing the portrait cut-in']) assert.ok(!isPolish(t), t)
})

test('six frames spread past the loading screen', () => {
  const frames = Array.from({ length: 40 }, (_, i) => ({ file: `f${i}`, t: i / 2 }))
  const six = spread(frames, 6)
  assert.equal(six.length, 6)
  assert.ok(six[0].t >= 2)
  assert.equal(six.at(-1).file, 'f39')
  assert.equal(spread(frames.slice(0, 3)).length, 3)
})

test('where and gone replies', () => {
  assert.deepEqual(parseWhere('{"frame":3,"box":[0.1,0.1,0.3,0.3]}').frame, 3)
  assert.equal(parseWhere('{"frame":0}'), null)
  assert.equal(parseGone('{"gone":true}'), true)
  assert.equal(parseGone('{"gone":"yes"}'), false)
})

test('the prompts carry the frames and the bugs', () => {
  const m = lookMessages({ title: 'Lokee', slice: 'Rooms', image: 'data:image/jpeg;base64,AA' })
  assert.equal(m[1].content[1].image_url.url, 'data:image/jpeg;base64,AA')
  assert.match(m[1].content[0].text, /hard rectangular edge/)
  assert.match(fixPrompt([{ what: 'box behind trail', fix: 'fade it' }]), /1\. box behind trail\. Fix: fade it/)
  assert.match(polishPrompt(['FX look rough'], { godot: true }), /ports\/godot/)
})

let ff = false
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ff = true } catch {}
test('contact sheet, close-up and before/after are cut with ffmpeg', { skip: !ff && 'no ffmpeg' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slicecheck-'))
  try {
    const files = []
    for (let i = 0; i < 6; i++) {
      const f = join(dir, `f${i}.jpg`)
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x${(i * 30 + 40).toString(16)}2030:s=640x400`, '-frames:v', '1', f])
      files.push(f)
    }
    assert.ok(await contactSheet(files, join(dir, 'sheet.jpg')))
    assert.ok(existsSync(join(dir, 'sheet.jpg')))
    assert.ok(await closeUp(files[2], join(dir, 'close.jpg'), [0.4, 0.4, 0.1, 0.1]))
    assert.ok(await beforeAfter(files[0], files[5], join(dir, 'ba.jpg'), [0.1, 0.1, 0.5, 0.5]))
    assert.ok(existsSync(join(dir, 'ba.jpg')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the look picked on the mood board wins over the brief', async () => {
  const { styleGuide } = await import('../engine/artdirect.mjs')
  assert.equal(styleGuide({ brief: 'a pixel art game', style: 'gouache' }).style, 'gouache')
  assert.equal(styleGuide({ brief: 'a pixel art game', style: 'nope' }).style, 'pixel')
  assert.equal(styleGuide({ brief: 'a pixel art game', style: 'photo' }).style, 'pixel')
})

test('a live peek\'s note is one short line', async () => {
  const { parseNote, peekMessages } = await import('../engine/slicecheck.mjs')
  assert.equal(parseNote('ok {"note":"  Mika runs now;   lanterns are grey boxes "}'), 'Mika runs now; lanterns are grey boxes')
  assert.equal(parseNote('nothing'), '')
  assert.match(peekMessages({ slice: 'Rooms', image: 'data:x', before: 'old' })[1].content[0].text, /Last look you said: "old"/)
})
