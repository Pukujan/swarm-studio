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

// an empty frame: <div className="... aspect-[3/4] ..."></div>
const FRAME = /<div className="([^"]*\baspect-(?:\[[^\]]+\]|square|video)[^"]*)"\s*>\s*<\/div>/g
const clean = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/["<>{}]/g, '').replace(/\s+/g, ' ').trim()

// framesToSlots(text) -> text: every empty frame gets an <img data-gen> filling it
export function framesToSlots(text) {
  if (!FRAME.test(text)) return text
  FRAME.lastIndex = 0
  const theme = (text.match(/\sdata-gen="([^"]+)"/) || [])[1] || ''
  return text.replace(FRAME, (m, cls, at) => {
    // the card's title: the first bit of text after the frame
    const after = text.slice(at + m.length, at + m.length + 800).split(/<[^>]+>/).map(clean).filter(Boolean).slice(0, 2).join(' ').split(' ').slice(0, 10).join(' ')
    const gen = clean(`${theme ? theme.split(',')[0] : ''}${theme && after ? ', ' : ''}${after}`).slice(0, 200)
    if (!gen) return m
    return `<div className="${cls}"><img data-gen="${gen}" alt="${clean(after).slice(0, 80)}" className="w-full h-full object-cover" /></div>`
  })
}

// slots(dir) -> [{ file, gen }]: the picture slots still empty
export function emptySlots(appDir) {
  const out = []
  for (const file of codeFiles(join(appDir, 'src'))) {
    const text = readFileSync(file, 'utf8')
    for (const tag of text.match(IMG) || []) { const gen = genOf(tag); if (gen && isEmpty(tag)) out.push({ file, gen }) }
  }
  return out
}

// fillPictures(appDir, { pick, bytesOf, run }) -> { filled, left }
// pick({ q, run, avoid }) is standins().pick; bytesOf(url) returns the photo's bytes (or null).
export async function fillPictures(appDir, { pick, bytesOf, run = null, step = () => {} }) {
  for (const file of codeFiles(join(appDir, 'src'))) {
    const text = readFileSync(file, 'utf8'), next = framesToSlots(text)
    if (next !== text) writeFileSync(file, next)
  }
  const slots = emptySlots(appDir)
  if (!slots.length) return { filled: 0, left: 0 }
  const outDir = join(appDir, 'public', 'img', 'stock')
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
    chosen.set(gen, `/img/stock/${name}`)
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
