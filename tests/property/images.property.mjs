// Property tests for the image service's size ladder (decision 0019 point 4, issue #463; engine/images.mjs): random
// requests against the ladder, and random pictures against the 4096 px cap and the store by content hash. The
// picture library is a stand-in that reports any size and records each resize, so the rules run without the real
// binary (tests/images.test.mjs runs them against it where it is installed). 1000 cases each; fast-check shrinks a
// failure to the smallest case.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CAP, LADDER, makeImages, rung } from '../../engine/images.mjs'

const fc = createRequire(new URL('../../tools/dev/package.json', import.meta.url))('fast-check')
const RUNS = 1000

test('the ladder: a request gets the next step up, never a smaller one, never past the picture, else the original', () => {
  const asked = fc.oneof(fc.double({ min: -10, max: 6000, noNaN: true }), fc.integer({ min: 1, max: 5000 }), fc.constantFrom(0, NaN, Infinity, -1, '256', 'x', null))
  const width = fc.oneof(fc.integer({ min: 1, max: 9000 }), fc.constant(Infinity))
  fc.assert(fc.property(asked, width, (w, pic) => {
    const out = rung(w, pic), n = Number(w)
    if (!Number.isFinite(n) || n <= 0) return assert.equal(out, 0, 'nothing sensible asked: the original')
    if (out === 0) {
      // the original: past the top of the ladder, or the next step would be the picture's own width or wider
      const next = LADDER.find(s => s >= n)
      assert.ok(!next || next >= pic, `the original for ${n} on a ${pic} px picture, though ${next} would do`)
      return
    }
    assert.ok(LADDER.includes(out), `${out} is a step`)
    assert.ok(out >= n, `never smaller than asked (${out} for ${n})`)
    assert.ok(out < pic, `never as wide as the picture or wider (${out} for a ${pic} px picture)`)
    assert.ok(!LADDER.some(s => s >= n && s < out), `the next step up, not a later one (${out} for ${n})`)
  }), { numRuns: RUNS })
})

// A stand-in for @napi-rs/image: a "picture" is a PNG signature then its width and height (4 bytes each) and any
// bytes; every resize is recorded and its output is a picture of that size, so a stored file can be read back.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const picture = (w, h, extra = []) => { const b = Buffer.alloc(16 + extra.length); Buffer.from(PNG).copy(b); b.writeUInt32BE(w, 8); b.writeUInt32BE(h, 12); Buffer.from(extra).copy(b, 16); return b }
const dims = buf => ({ width: buf.readUInt32BE(8), height: buf.readUInt32BE(12) })
function standIn() {
  const resized = []
  class Transformer {
    constructor(buf) { this.buf = buf; this.size = null }
    async metadata() { return dims(this.buf) }
    resize(w, h) { this.size = [w, h]; resized.push([w, h]); return this }
    async png() { return picture(...this.size) }
    async jpeg() { return picture(...this.size) }
    async webp() { return picture(...this.size) }
    async rawPixels() { const [w, h] = this.size; return Buffer.alloc(w * h * 4) }
  }
  return { tools: { Transformer, thumbhash: { rgbaToThumbHash: () => new Uint8Array(24) } }, resized }
}

test('the cap: a side over 4096 px is scaled down to 4096 on import, keeping its shape; anything smaller is kept as it is', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'images-prop-'))
  const lib = standIn()
  const images = makeImages({ dataDir: dir, tools: () => lib.tools })
  try {
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 0, max: 2 ** 31 }), async (W, H, salt) => {
      // the salt makes each case its own picture, so the store's dedup does not answer from an earlier case
      const meta = await images.add(picture(W, H, [salt & 255, (salt >> 8) & 255, (salt >> 16) & 255, salt >>> 24]))
      assert.ok(meta, 'a PNG is taken')
      const big = Math.max(W, H)
      if (big <= CAP) { assert.deepEqual([meta.w, meta.h], [W, H], 'a picture within the cap is kept at its size'); return }
      assert.equal(Math.max(meta.w, meta.h), CAP, `the longer side is ${CAP} (${W}×${H} → ${meta.w}×${meta.h})`)
      // its shape: the shorter side is the original's scaled the same way, to the nearest pixel
      const k = CAP / big
      assert.ok(Math.abs(Math.min(meta.w, meta.h) - Math.min(W, H) * k) <= 1, `${W}×${H} → ${meta.w}×${meta.h} keeps its shape`)
    }), { numRuns: RUNS })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the store: the same bytes are kept once, under one hash, however often they are added; other bytes get another', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'images-prop-'))
  const images = makeImages({ dataDir: dir, tools: () => standIn().tools })
  // the files the store holds for one hash: its picture (and its sizes and data, never a second copy)
  const kept = hash => readdirSync(join(dir, 'images', hash.slice(0, 2))).filter(f => f === `${hash}.png`).length
  try {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 64 }), fc.uint8Array({ minLength: 0, maxLength: 64 }), fc.integer({ min: 2, max: 5 }), async (a, b, times) => {
      const one = picture(32, 16, [...a]), other = picture(32, 16, [...b])
      const metas = await Promise.all(Array.from({ length: times }, () => images.add(Buffer.from(one))))
      assert.ok(metas.every(m => m.hash === metas[0].hash), 'the same bytes, one hash')
      const theOther = await images.add(other)
      if (Buffer.compare(one, other) === 0) assert.equal(theOther.hash, metas[0].hash)
      else assert.notEqual(theOther.hash, metas[0].hash, 'other bytes, another hash')
      // each picture is one file under its hash, however many times it was added
      assert.equal(kept(metas[0].hash), 1, `${times} adds of the same bytes, one file`)
      assert.equal(kept(theOther.hash), 1)
    }), { numRuns: RUNS })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
