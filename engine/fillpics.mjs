// Empty picture slots in a built app. The crew paints a handful of pictures per
// build, and an app's own turns often add more <img data-gen="..."> slots than
// were painted. Left alone those ship as grey boxes. After a build, each slot
// that has no picture gets the best matching stand-in photo (the stock library,
// pictures from earlier builds, Pexels or Openverse), copied into public/img/stock/
// and listed with its credit in public/img/stock/CREDITS.md.
// A slot whose src is set dynamically (data-gen={...}) is left to the app.
// Designers may add only one real picture per section, so the other picture
// frames in a grid come out as empty boxes (a div with an aspect ratio and
// nothing inside). Those become slots too: their prompt is the section's own
// picture prompt plus the card's title.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CODE = /\.(tsx|jsx|html|vue|svelte)$/
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.output', '.nitro', 'public'])

function codeFiles(dir, out = []) {
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (SKIP.has(n)) continue
    const f = join(dir, n)
    let s
    try { s = statSync(f) } catch { continue }
    if (s.isDirectory()) codeFiles(f, out)
    else if (CODE.test(n) && s.size < 400000) out.push(f)
  }
  return out
}

// <img ... data-gen="..." ...> with no src, an empty src, or the export's grey placeholder
const IMG = /<img\b[^>]*?>/g
const genOf = tag => (tag.match(/\sdata-gen="([^"]+)"/) || [])[1] || null
const isEmpty = tag => {
  const m = tag.match(/\ssrc=(?:"([^"]*)"|\{)/)
  if (!m) return true
  if (m[0].endsWith('{')) return false
  return !m[1] || m[1].startsWith('data:image/svg+xml')
}

// an empty frame: <div className="... aspect-[3/4] ..."></div> (or class=, in an exported site's HTML)
const FRAME = /<div (className|class)="([^"]*\baspect-(?:\[[^\]]+\]|square|video)[^"]*)"\s*>\s*<\/div>/g
const clean = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/["<>{}]/g, '').replace(/\s+/g, ' ').trim()

// framesToSlots(text) -> text: every empty frame gets an <img data-gen> filling it
export function framesToSlots(text) {
  if (!FRAME.test(text)) return text
  FRAME.lastIndex = 0
  const theme = (text.match(/\sdata-gen="([^"]+)"/) || [])[1] || ''
  return text.replace(FRAME, (m, attr, cls, at) => {
    // the card's title: the first bit of text after the frame
    const after = text.slice(at + m.length, at + m.length + 800).split(/<[^>]+>/).map(clean).filter(Boolean).slice(0, 2).join(' ').split(' ').slice(0, 10).join(' ')
    const gen = clean(`${theme ? theme.split(',')[0] : ''}${theme && after ? ', ' : ''}${after}`).slice(0, 200)
    if (!gen) return m
    return `<div ${attr}="${cls}"><img data-gen="${gen}" alt="${clean(after).slice(0, 80)}" ${attr}="w-full h-full object-cover" /></div>`
  })
}

// slots(dir) -> [{ file, gen }]: the picture slots still empty
export function emptySlots(appDir, root = 'src') {
  const out = []
  for (const file of codeFiles(root ? join(appDir, root) : appDir)) {
    const text = readFileSync(file, 'utf8')
    for (const tag of text.match(IMG) || []) { const gen = genOf(tag); if (gen && isEmpty(tag)) out.push({ file, gen }) }
  }
  return out
}

// fillPictures(appDir, { pick, bytesOf, run }) -> { filled, left }
// pick({ q, run, avoid }) is standins().pick; bytesOf(url) returns the photo's bytes (or null).
// An app's code is in src/ and its photos are served from /img/stock/ out of public/; an
// exported static site (fillSite) has its pages at the top and the photos beside them.
export async function fillPictures(appDir, { pick, bytesOf, run = null, step = () => {}, root = 'src', out = join('public', 'img', 'stock'), prefix = '/img/stock/' }) {
  for (const file of codeFiles(root ? join(appDir, root) : appDir)) {
    const text = readFileSync(file, 'utf8'), next = framesToSlots(text)
    if (next !== text) writeFileSync(file, next)
  }
  const slots = emptySlots(appDir, root)
  if (!slots.length) return { filled: 0, left: 0 }
  const outDir = join(appDir, out)
  const credits = new Map()
  const chosen = new Map() // gen -> local path, so the same prompt gets the same photo
  const avoid = new Set()
  for (const { gen } of slots) {
    if (chosen.has(gen)) continue
    let photo = null
    try { photo = await pick({ q: gen, run, avoid }) } catch {}
    // every match already used on this build: a repeat beats an empty box
    if (!photo?.url && avoid.size) try { photo = await pick({ q: gen, run }) } catch {}
    if (!photo?.url) continue
    let bytes = null
    try { bytes = await bytesOf(photo.publicUrl && !photo.url.startsWith('/') ? photo.publicUrl : photo.url) } catch {}
    if (!bytes?.length) continue
    avoid.add(photo.url)
    const ext = /\.png(\?|$)/i.test(photo.url) ? 'png' : /\.webp(\?|$)/i.test(photo.url) ? 'webp' : 'jpg'
    const name = `${createHash('sha1').update(photo.url).digest('hex').slice(0, 12)}.${ext}`
    mkdirSync(outDir, { recursive: true })
    if (!existsSync(join(outDir, name))) writeFileSync(join(outDir, name), bytes)
    chosen.set(gen, `${prefix}${name}`)
    credits.set(name, { credit: photo.credit || (photo.source === 'own' ? 'Painted for an earlier Swarm Studio build' : 'Stock photo'), page: photo.page || null })
  }
  // write the srcs in, file by file
  const byFile = new Map()
  for (const s of slots) byFile.set(s.file, true)
  let filled = 0
  for (const file of byFile.keys()) {
    const text = readFileSync(file, 'utf8')
    const next = text.replace(IMG, tag => {
      const gen = genOf(tag)
      if (!gen || !isEmpty(tag) || !chosen.has(gen)) return tag
      filled++
      const bare = tag.replace(/\ssrc="[^"]*"/, '')
      return bare.replace(/^<img\b/, `<img src="${chosen.get(gen)}" data-standin="stock"`)
    })
    if (next !== text) writeFileSync(file, next)
  }
  if (credits.size) {
    const file = join(outDir, 'CREDITS.md')
    let had = ''
    try { had = readFileSync(file, 'utf8') } catch {}
    const lines = [...credits].filter(([n]) => !had.includes(`${n}:`)).map(([n, c]) => `- ${n}: ${c.credit}${c.page ? ` (${c.page})` : ''}`)
    if (lines.length) writeFileSync(file, `${had || '# Stand-in photos\n\nPicture slots the crew did not paint show these photos until real pictures replace them.\n\n'}${lines.join('\n')}\n`)
  }
  const left = slots.length - filled
  if (filled) step({ kind: 'setup', text: `filled ${filled} empty picture slot${filled === 1 ? '' : 's'} with stand-in photos${left ? `; ${left} still empty` : ''}` })
  return { filled, left }
}

// An exported site: its static pages (html/, relative links so it works under any
// path, like <owner>.github.io/<repo>/) and its React copy (react/, an app layout)
// get the same stand-ins as an app, so no published site ships grey boxes.
export async function fillSite(exportDir, opts) {
  const html = await fillPictures(join(exportDir, 'html'), { ...opts, root: '', out: join('img', 'stock'), prefix: 'img/stock/' })
  const react = existsSync(join(exportDir, 'react', 'src')) ? await fillPictures(join(exportDir, 'react'), opts) : { filled: 0, left: 0 }
  return { filled: html.filled + react.filled, left: html.left + react.left }
}

// ---------- a website built with stock photos (Setup's Pictures: Stock photos)
// Its picture slots are filled as the painted ones are, so the photos are the build's own: files in
// runs/<id>/img and an `image` event each, which the pages, their snapshots, the Overview, an export and a film
// all read. Before, a stock photo was only laid over the slot on the classic Overview and nothing was saved: the
// new Studio showed empty frames, and a photographer's site and its film had no photos (owner, 2026-11-19: "why
// are stock pictures failing too?"). The same shape as the painters' queue (server/server.mjs imageQueue):
// add(layer:done event), start() once the layout is done, drop(), stop(), busy().
//   pick({ q, w, h, run, avoid }) is standins().pick; bytesOf(url) the photo's bytes, or null
// A slot no photo fits is left as it was (an export still tries it again, fillSite above); nothing fails.
const KIND = b => (b[0] === 0xff && b[1] === 0xd8 ? '.jpg' : b[0] === 0x89 && b[1] === 0x50 ? '.png' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? '.webp' : '')
const SIZE = { square: [1024, 1024], portrait: [900, 1200], landscape: [1600, 1000] }
export function stockQueue({ run, dir, emit, pick, bytesOf, max = 8 }) {
  const jobs = [], avoid = new Set()
  let n = 0, held = true, active = 0, off = false
  const fill = async job => {
    const [w, h] = SIZE[job.aspect]
    let photo = null
    try { photo = await pick({ q: job.gen, w, h, run, avoid }) } catch {}
    if (!photo?.url) return
    avoid.add(photo.url)
    let bytes = null
    for (const u of [photo.url, photo.publicUrl].filter(Boolean)) { try { bytes = await bytesOf(u) } catch {} if (bytes?.length) break }
    const ext = bytes?.length ? KIND(bytes) : ''
    if (!ext || off) return
    mkdirSync(join(dir, 'img'), { recursive: true })
    writeFileSync(join(dir, 'img', `${job.n}${ext}`), bytes)
    emit('image', { page: job.page, layer: job.layer, gen: job.gen, src: `/img/${run}/${job.n}${ext}`, stock: true, model: 'stock photo', ...(photo.credit ? { credit: String(photo.credit).slice(0, 200) } : {}), ...(photo.page ? { from: String(photo.page).slice(0, 300) } : {}) })
  }
  const pump = () => {
    while (!held && !off && active < 2 && jobs.length) {
      active++
      fill(jobs.shift()).catch(() => {}).finally(() => { active--; pump() })
    }
  }
  const add = e => {
    for (const m of String(e.html || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"[^>]*>/g)) {
      if (n >= max || /\bsrc=/.test(m[0])) continue
      const box = String(e.html).slice(Math.max(0, m.index - 400), m.index)
      const aspect = /aspect-(square|\[1\/1\])/.test(box) ? 'square' : /aspect-\[(3\/4|2\/3|4\/5|9\/16)\]/.test(box) ? 'portrait' : 'landscape'
      jobs.push({ n: ++n, page: e.page, layer: e.layer, gen: m[1], aspect })
    }
    pump()
  }
  add.start = () => { held = false; pump() }
  add.drop = () => { if (held) jobs.length = 0 }
  add.stop = () => { off = true; jobs.length = 0 }
  add.busy = () => !held && !off && (active > 0 || jobs.length > 0)
  return add
}
