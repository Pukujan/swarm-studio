// A project's References store (docs/specs/29-chats-references-marks.md, "References"): one store per
// project at projects/<pid>/refs/, an index and the files.
//
//   refs/index.json   [{ id, kind, name, file, url, w, h, source, use, read, from, added, removed }]
//   refs/<file>
//
// A link can carry a `look` (engine/sitelook.mjs, decision 0022): the site walked in a browser, its shots
// (refs/look-<id>-<n>.jpg), the measured tokens, the style words and `from` (where and how the person gave it).
// The shots are for the person to see; they are never placed in a build.
//
// kind: image, video, audio, file or link. source: upload, chat, feed, link, plan or film. `use` is what
// it is for ("hero mood", "the menu"); `removed` keeps the time it was removed, so undo brings it back.
// The project's uploads (projects/<pid>/uploads) are references too, with source `upload`: `all()`
// lists them beside the store, so every door (the crew's brief, Home › Assets) reads one list.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, extname } from 'node:path'
import { lookBrief } from './sitelook.mjs'

const PID = /^[\w-]{1,64}$/
const REF_ID = /^r[0-9a-z]{4,16}$/
const FILE = /^[\w][\w .()+-]{0,118}\.[a-z0-9]{1,8}$/i
export const REF_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' }
const SOURCES = new Set(['upload', 'chat', 'feed', 'link', 'plan', 'film'])
const kindOf = name => { const t = REF_TYPES[extname(name).slice(1).toLowerCase()] || ''; return t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : 'file' }
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// a picture's size from its header (PNG, JPEG, GIF); null when it cannot tell
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  if (buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
      i += 2 + len
    }
  }
  return null
}

// projectsDir: where projects/<pid> live; uploadsOf(pid): the project's uploads (server/projects.mjs);
// known(pid): true for a project that exists
export function refStore({ projectsDir, uploadsOf = () => [], known = () => true }) {
  const dir = pid => join(projectsDir, pid, 'refs')
  const ok = pid => PID.test(String(pid || '')) && known(pid)
  const read = pid => { try { return JSON.parse(readFileSync(join(dir(pid), 'index.json'), 'utf8')) } catch { return [] } }
  const write = (pid, list) => { mkdirSync(dir(pid), { recursive: true }); const f = join(dir(pid), 'index.json'); writeFileSync(`${f}.tmp`, JSON.stringify(list, null, 1)); renameSync(`${f}.tmp`, f) }
  const view = (pid, r) => ({ ...r, src: r.file ? `/ref/${pid}/${encodeURIComponent(r.file)}` : null, ...(r.look ? { look: { ...r.look, shots: (r.look.shots || []).map(f => `/ref/${pid}/${encodeURIComponent(f)}`) } } : {}) })
  const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const need = pid => { if (!ok(pid)) throw Object.assign(new Error('no such project'), { status: 404 }) }
  const meta = input => ({
    source: SOURCES.has(input.source) ? input.source : 'upload',
    use: clip(input.use, 300), from: clip(input.from, 64), read: clip(input.read, 400)
  })

  // the live references, oldest first; with removed: the removed ones too
  function list(pid, { removed = false } = {}) {
    if (!ok(pid)) return []
    return read(pid).filter(r => removed || !r.removed).map(r => view(pid, r))
  }
  function addFile(pid, input = {}, buf) {
    need(pid)
    let name = clip(String(input.name || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, ''), 120)
    if (!FILE.test(name)) name = `reference-${Date.now()}${extname(name) || '.bin'}`
    if (!REF_TYPES[extname(name).slice(1).toLowerCase()]) throw Object.assign(new Error('a picture, clip, sound, PDF or text file'), { status: 400 })
    mkdirSync(dir(pid), { recursive: true })
    const stem = name.replace(/\.[^.]+$/, ''), ext = extname(name)
    let file = name
    for (let i = 2; existsSync(join(dir(pid), file)); i++) file = `${stem} (${i})${ext}`
    writeFileSync(join(dir(pid), file), buf)
    const kind = kindOf(file), size = kind === 'image' ? imageSize(buf) : null
    const r = { id: newId(), kind, name: file, file, url: null, w: size?.w || null, h: size?.h || null, ...meta(input), added: Date.now(), removed: null }
    write(pid, [...read(pid), r])
    return view(pid, r)
  }
  function addLink(pid, input = {}) {
    need(pid)
    let u
    try { u = new URL(String(input.url || '').trim()) } catch { throw Object.assign(new Error('that is not a link'), { status: 400 }) }
    if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('that is not a link'), { status: 400 })
    const r = { id: newId(), kind: 'link', name: clip(input.name, 80) || u.hostname.replace(/^www\./, ''), file: null, url: u.href.slice(0, 1000), w: null, h: null, ...meta({ ...input, source: input.source || 'link' }), added: Date.now(), removed: null }
    write(pid, [...read(pid), r])
    return view(pid, r)
  }
  function change(pid, id, fn) {
    need(pid)
    if (!REF_ID.test(String(id || ''))) throw Object.assign(new Error('no such reference'), { status: 404 })
    const all = read(pid), r = all.find(x => x.id === id)
    if (!r) throw Object.assign(new Error('no such reference'), { status: 404 })
    fn(r)
    write(pid, all)
    return view(pid, r)
  }
  const remove = (pid, id) => change(pid, id, r => { r.removed = Date.now() })
  const restore = (pid, id) => change(pid, id, r => { r.removed = null })
  const setUse = (pid, id, use) => change(pid, id, r => { r.use = clip(use, 300) })
  // a link's look: the walk's state, words and tokens; shots (Buffers) are kept as files beside the index
  function setLook(pid, id, look, shots = []) {
    return change(pid, id, r => {
      if (r.kind !== 'link') throw Object.assign(new Error('only a link has a look'), { status: 400 })
      const names = shots.slice(0, 9).map((buf, i) => { const f = `look-${id}-${i}.jpg`; mkdirSync(dir(pid), { recursive: true }); writeFileSync(join(dir(pid), f), buf); return f })
      r.look = { ...look, shots: names.length ? names : look.state === 'walking' ? (r.look?.shots || []) : [] }
    })
  }

  // the store and the uploads as one list (the uploads with source upload), for every door
  function all(pid) {
    const ups = (uploadsOf(pid) || []).map(u => ({ id: `up:${u.name}`, kind: kindOf(u.name), name: u.name, file: null, src: u.src, url: null, source: 'upload', use: '', from: '', added: u.t || 0 }))
    return [...ups, ...list(pid)]
  }
  // a file for /ref/<pid>/<file>
  function file(pid, name) {
    const n = decodeURIComponent(String(name || ''))
    if (!PID.test(String(pid || '')) || !FILE.test(n)) return null
    const p = join(dir(pid), n)
    return existsSync(p) && read(pid).some(r => !r.removed && (r.file === n || r.look?.shots?.includes(n))) ? { file: p, type: REF_TYPES[extname(n).slice(1).toLowerCase()] || 'application/octet-stream' } : null
  }
  // what the crew's brief says about the store (the uploads are listed apart, as before)
  function brief(pid) {
    const live = list(pid)
    const pics = live.filter(r => r.kind === 'image')
    const links = live.filter(r => r.kind === 'link')
    const out = []
    if (pics.length) out.push(`The owner's reference pictures. Match their look; place one as it is (<img src="…">, no data-gen) only where its use says so:\n${pics.slice(0, 12).map(r => `- ${r.name}${r.use ? ` (for ${r.use})` : ''}: ${r.src}`).join('\n')}`)
    const looks = links.map(r => lookBrief(r)).filter(Boolean)
    const plain = links.filter(r => !lookBrief(r))
    if (looks.length) out.push(...looks.slice(0, 3))
    if (plain.length) out.push(`Links the owner gave as references:\n${plain.slice(0, 8).map(r => `- ${r.url}${r.use ? ` (for ${r.use})` : ''}`).join('\n')}`)
    return out.join('\n\n')
  }
  // "use this for the hero": the line the crew is sent, like a comment on that section
  function useText(r, section) {
    const what = r.kind === 'link' ? `the reference link ${r.url}` : `the reference picture "${r.name}" (${r.src})`
    return clip(`Use ${what} for ${section}.${r.kind === 'image' ? ' Place it as it is (<img src="…">, no data-gen) or match its look, whichever fits the section.' : ' Match its look and feel.'} Keep everything else.`, 600)
  }

  return { list, all, addFile, addLink, remove, restore, setUse, setLook, file, brief, useText, dir }
}
