// A project's Assets store (docs/specs/37-studio-first.md, "References and Assets: two stores"): what the
// crew puts in as it is, never redrawn or recoloured (a logo, product photos, a game's starter pack).
// References (engine/refs.mjs) are "like this"; assets are "use this as given". (engine/assets.mjs is
// something else: a build's own pictures, for the code wall.)
//
//   assets/index.json   [{ id, kind, name, file, w, h, source, role, added, removed }]
//   assets/<file>
//
// role: logo, product, photo, font, pack or other. source: upload, chat, feed or pack. `removed` keeps
// the time it was removed, so undo brings it back.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { imageSize } from './refs.mjs'

const PID = /^[\w-]{1,64}$/
export const ASSET_ID = /^a[0-9a-z]{4,16}$/
const FILE = /^[\w][\w .()+-]{0,118}\.[a-z0-9]{1,8}$/i
export const ASSET_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf' }
export const ROLES = ['logo', 'product', 'photo', 'font', 'pack', 'other']
const SOURCES = new Set(['upload', 'chat', 'feed', 'pack'])
const typeOf = name => ASSET_TYPES[extname(name).slice(1).toLowerCase()] || ''
const kindOf = name => { const t = typeOf(name); return t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : t.startsWith('font/') ? 'font' : 'file' }
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
// a role from the file when none is given: a font is a font, a name with "logo" in it a logo
const guessRole = name => (kindOf(name) === 'font' ? 'font' : /logo|mark|icon/i.test(name) ? 'logo' : kindOf(name) === 'image' ? 'photo' : 'other')

// a starter pack's provenance (spec 37, the game's starter): where it came from, kept with it
const PACK_SOURCES = ['ours', 'pinned', 'brought']
function packOf(p = {}) {
  return {
    id: clip(p.id, 64) || null, source: PACK_SOURCES.includes(p.source) ? p.source : 'brought', version: clip(p.version, 32) || null,
    licence: clip(p.licence, 64) || null, credits: clip(p.credits, 400) || null,
    sha256: /^[0-9a-f]{64}$/.test(String(p.sha256 || '')) ? p.sha256 : null, url: /^https:\/\//.test(String(p.url || '')) ? clip(p.url, 400) : null,
    engines: Array.isArray(p.engines) ? p.engines.map(e => clip(e, 16)).filter(Boolean).slice(0, 4) : [], native: !!p.native
  }
}

// projectsDir: where projects/<pid> live; known(pid): true for a project that exists
export function assetStore({ projectsDir, known = () => true }) {
  const dir = pid => join(projectsDir, pid, 'assets')
  const ok = pid => PID.test(String(pid || '')) && known(pid)
  const read = pid => { try { return JSON.parse(readFileSync(join(dir(pid), 'index.json'), 'utf8')) } catch { return [] } }
  const write = (pid, list) => { mkdirSync(dir(pid), { recursive: true }); const f = join(dir(pid), 'index.json'); writeFileSync(`${f}.tmp`, JSON.stringify(list, null, 1)); renameSync(`${f}.tmp`, f) }
  const view = (pid, a) => ({ ...a, src: `/asset/${pid}/${encodeURIComponent(a.file)}` })
  const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const need = pid => { if (!ok(pid)) throw Object.assign(new Error('no such project'), { status: 404 }) }
  const freeName = (pid, name) => {
    const stem = name.replace(/\.[^.]+$/, ''), ext = extname(name)
    let file = name
    for (let i = 2; existsSync(join(dir(pid), file)); i++) file = `${stem} (${i})${ext}`
    return file
  }
  const cleanName = given => {
    let name = clip(String(given || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, ''), 120)
    if (!FILE.test(name)) name = `asset-${Date.now()}${extname(name) || '.bin'}`
    if (!typeOf(name)) throw Object.assign(new Error('a picture, clip, sound, font or PDF'), { status: 400 })
    return name
  }
  const record = (file, input, size) => ({
    id: newId(), kind: kindOf(file), name: file, file, w: size?.w || null, h: size?.h || null,
    source: SOURCES.has(input.source) ? input.source : 'upload',
    role: ROLES.includes(input.role) ? input.role : guessRole(file),
    added: Date.now(), removed: null,
    ...(input.role === 'pack' && input.pack ? { pack: packOf(input.pack) } : {})
  })

  // the live assets, oldest first; with removed: the removed ones too
  function list(pid, { removed = false } = {}) {
    if (!ok(pid)) return []
    return read(pid).filter(a => removed || !a.removed).map(a => view(pid, a))
  }
  function addFile(pid, input = {}, buf) {
    need(pid)
    mkdirSync(dir(pid), { recursive: true })
    const file = freeName(pid, cleanName(input.name))
    writeFileSync(join(dir(pid), file), buf)
    const a = record(file, input, kindOf(file) === 'image' ? imageSize(buf) : null)
    write(pid, [...read(pid), a])
    return view(pid, a)
  }
  // a file another store holds (a reference moved over): copied in
  function addCopy(pid, input = {}, from) {
    need(pid)
    if (!from || !existsSync(from)) throw Object.assign(new Error('that file is gone'), { status: 404 })
    mkdirSync(dir(pid), { recursive: true })
    const file = freeName(pid, cleanName(input.name))
    copyFileSync(from, join(dir(pid), file))
    const a = record(file, input, input.w ? { w: input.w, h: input.h } : null)
    write(pid, [...read(pid), a])
    return view(pid, a)
  }
  function change(pid, id, fn) {
    need(pid)
    if (!ASSET_ID.test(String(id || ''))) throw Object.assign(new Error('no such asset'), { status: 404 })
    const all = read(pid), a = all.find(x => x.id === id)
    if (!a) throw Object.assign(new Error('no such asset'), { status: 404 })
    fn(a)
    write(pid, all)
    return view(pid, a)
  }
  const remove = (pid, id) => change(pid, id, a => { a.removed = Date.now() })
  const restore = (pid, id) => change(pid, id, a => { a.removed = null })
  const setRole = (pid, id, role) => change(pid, id, a => { if (!ROLES.includes(role)) throw Object.assign(new Error('no such role'), { status: 400 }); a.role = role })
  // one asset's file on disk, live or removed (to move it to the References)
  function path(pid, id) {
    if (!ok(pid) || !ASSET_ID.test(String(id || ''))) return null
    const a = read(pid).find(x => x.id === id)
    return a ? { file: join(dir(pid), a.file), asset: a } : null
  }
  // a file for /asset/<pid>/<file>
  function file(pid, name) {
    const n = decodeURIComponent(String(name || ''))
    if (!PID.test(String(pid || '')) || !FILE.test(n)) return null
    const p = join(dir(pid), n)
    return existsSync(p) && read(pid).some(a => a.file === n && !a.removed) ? { file: p, type: typeOf(n) || 'application/octet-stream' } : null
  }
  // what the crew's brief says: these go in as they are
  function brief(pid) {
    const live = list(pid).filter(a => a.kind === 'image')
    if (!live.length) return ''
    return `The owner's assets. Place each as it is (<img src="…">, no data-gen), never redrawn, recoloured or cropped into something else:\n${live.slice(0, 16).map(a => `- ${a.name} (${a.role}): ${a.src}`).join('\n')}`
  }
  return { list, addFile, addCopy, remove, restore, setRole, path, file, brief, dir }
}
