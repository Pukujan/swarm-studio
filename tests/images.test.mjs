// The image service (engine/images.mjs): one store by content hash, the 4096 px cap, the size ladder and a
// ThumbHash for each picture. CI installs engine/imagetools first (on Linux, Windows and macOS), so these run
// there against the real prebuilt binary; elsewhere, without it, the tests that need pixels are skipped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CAP, LADDER, imageTools, makeImages, rung, sniff, withSrcset } from '../engine/images.mjs'

const tools = await imageTools(mkdtempSync(join(tmpdir(), 'imgtools-')), { install: false })
const need = tools ? {} : { skip: process.env.CI ? false : 'engine/imagetools is not installed (npm ci --prefix engine/imagetools --ignore-scripts)' }

// a picture of w × h: a red-to-blue sweep, so the preview has something to say
async function picture(w, h, kind = 'png') {
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; px[i] = 255 * x / w; px[i + 2] = 255 * y / h; px[i + 3] = 255 }
  const t = tools.Transformer.fromRgbaPixels(px, w, h)
  return kind === 'jpeg' ? t.jpeg(85) : t.png()
}
const store = () => makeImages({ dataDir: mkdtempSync(join(tmpdir(), 'images-')), tools: () => tools })
const size = async (images, file) => (await new tools.Transformer(readFileSync(file)).metadata())

test('the ladder: each request takes the next step up, and the original past the top or past the picture', () => {
  assert.deepEqual(LADDER, [64, 128, 256, 512, 1024, 2048])
  assert.equal(rung(256), 256)
  assert.equal(rung(300), 512)
  assert.equal(rung(1), 64)
  assert.equal(rung(4000), 0)
  assert.equal(rung(512, 400), 0)
  assert.equal(rung('nope'), 0)
  assert.equal(rung(-5), 0)
})

test('a picture is known by its bytes, never its name', () => {
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'png')
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
  assert.equal(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'webp')
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
})

test('the same picture is stored once, however often and wherever it is added', need, async () => {
  const images = store(), buf = await picture(300, 200)
  const a = await images.add(buf)
  const b = await images.add(Buffer.from(buf))
  assert.equal(a.hash, b.hash)
  assert.match(a.hash, /^[a-f0-9]{32}$/)
  // two files with the same bytes, in two builds, move in as one
  const dir = mkdtempSync(join(tmpdir(), 'runs-'))
  writeFileSync(join(dir, 'a.png'), buf); writeFileSync(join(dir, 'b.png'), buf)
  assert.equal((await images.addFile(join(dir, 'a.png'))).hash, a.hash)
  assert.equal((await images.addFile(join(dir, 'b.png'))).hash, a.hash)
  const kept = readdirSync(join(images.dir, a.hash.slice(0, 2))).filter(f => f.startsWith(a.hash))
  assert.deepEqual(kept.sort(), [`${a.hash}.json`, `${a.hash}.png`])
  const other = await images.add(await picture(301, 200))
  assert.notEqual(other.hash, a.hash)
})

test('anything over 4096 px is scaled down on import, keeping its shape; the original file is untouched', need, async () => {
  const images = store(), buf = await picture(5000, 2500, 'jpeg')
  const m = await images.add(buf)
  assert.deepEqual([m.w, m.h], [CAP, 2048])
  const stored = await size(images, (await images.sized(m.hash)).file)
  assert.deepEqual([stored.width, stored.height], [CAP, 2048])
  const small = await images.add(await picture(800, 600))
  assert.deepEqual([small.w, small.h], [800, 600])
})

test('a size is made the first time it is asked for, then served from the cache; past the picture, the original', need, async () => {
  const images = store(), m = await images.add(await picture(1200, 600))
  const s = await images.sized(m.hash, 300)
  assert.equal(s.type, 'image/webp')
  assert.match(s.file, new RegExp(`${m.hash}-512\\.webp$`))
  const got = await size(images, s.file)
  assert.deepEqual([got.width, got.height], [512, 256])
  utimesSync(s.file, new Date(0), new Date(0))
  const again = await images.sized(m.hash, 512)
  assert.equal(again.file, s.file)
  assert.equal(readdirSync(join(images.dir, m.hash.slice(0, 2))).filter(f => f.endsWith('.webp')).length, 1)
  // 2048 is wider than the picture: its own file, not a blown-up copy
  assert.match((await images.sized(m.hash, 2048)).file, /\.png$/)
  assert.match((await images.sized(m.hash)).file, /\.png$/)
  assert.equal(await images.sized('../../etc/passwd', 64), null)
  assert.equal(await images.sized('0'.repeat(32), 64), null)
})

test('each picture gets a ThumbHash of about 30 bytes that decodes back to its shape', need, async () => {
  const images = store(), m = await images.add(await picture(400, 200))
  const th = Buffer.from(m.th, 'base64')
  assert.ok(th.length >= 5 && th.length <= 40, `${th.length} bytes`)
  const ratio = tools.thumbhash.thumbHashToApproximateAspectRatio(th)
  assert.ok(Math.abs(ratio - 2) < 0.3, String(ratio))
  // and it is what the board data reads once the picture has been served
  const dir = mkdtempSync(join(tmpdir(), 'runs-')), file = join(dir, '1.png')
  writeFileSync(file, await picture(400, 200))
  assert.equal(images.lookup(file), null)
  await images.addFile(file)
  assert.equal(images.lookup(file).th, m.th)
})

test('without the libraries a picture is kept and served as it is', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'images-'))
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  const none = makeImages({ dataDir, tools: () => null })
  const m = await none.add(buf)
  assert.equal(m.w, null)
  const s = await none.sized(m.hash, 256)
  assert.equal(s.type, 'image/png')
  assert.ok(existsSync(s.file))
  assert.equal(readFileSync(s.file).length, buf.length)
})

test('generated pages ask for their pictures on the ladder; nothing else in them changes', () => {
  const page = '<main><img src="/img/r-1/3.webp" alt="Tea"><img src="/img/0123456789abcdef0123456789abcdef" sizes="50vw"/><img src="https://x.test/a.png"><img src="/img/r-1/4.png" srcset="/a 1x"></main>'
  const out = withSrcset(page)
  assert.match(out, /<img src="\/img\/r-1\/3\.webp" alt="Tea" srcset="\/img\/r-1\/3\.webp\?w=64 64w, [^"]*\?w=2048 2048w" sizes="100vw">/)
  assert.match(out, /<img src="\/img\/0123456789abcdef0123456789abcdef" sizes="50vw" srcset="[^"]+" \/>/)
  assert.ok(out.includes('<img src="https://x.test/a.png">'))
  assert.ok(out.includes('<img src="/img/r-1/4.png" srcset="/a 1x">'))
  assert.equal(withSrcset('<p>no pictures</p>'), '<p>no pictures</p>')
})
