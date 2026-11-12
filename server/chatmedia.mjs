// Media in a chat, served (engine/chatmedia.mjs, docs/specs/29-chats-references-marks.md "Media in and out"):
//   POST /api/chats/:id/media?name=&kind=&from=   (bytes) -> { chat, ref }   id `new` makes the chat first
//   GET  /chatmedia/:id/:file                      the file, sandboxed like /up/
// A picture is read by the vision model on the way in; a clip or a sound by the media reader
// (engine/mediareader.mjs, docs/specs/32-media-reader.md), which says what it saw and heard.
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { CHAT_ID } from '../engine/chats.mjs'
import { MEDIA_TYPES, MEDIA_MAX, MEDIA_FILE, mediaKind, mediaName } from '../engine/chatmedia.mjs'

// chats: the chat store; projectOf(run): a build's project; see(dataUrl): the vision model's words for a
// picture, or null when there is none; read(file, kind): the media reader's read of a clip or a sound
export function chatMediaRoutes({ chats, projectOf = () => null, see = null, read: readClip = null }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = (req, max) => new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', c => { n += c.length; if (n > max) { req.destroy(); reject(Object.assign(new Error('too big'), { status: 413 })) } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

  return function handle(req, res, url) {
    const file = url.pathname.match(/^\/chatmedia\/(c-[0-9a-f]{10})\/([^/]{1,200})$/)
    if (file && req.method === 'GET') {
      const name = decodeURIComponent(file[2]), d = chats.locate(file[1]), c = d && chats.get(file[1])
      const p = d && MEDIA_FILE.test(name) && join(d, 'media', name)
      if (!p || !existsSync(p) || !(c.refs || []).some(r => r.file === name)) { res.writeHead(404).end('not found'); return true }
      res.writeHead(200, { 'content-type': MEDIA_TYPES[extname(name).slice(1).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-security-policy': 'sandbox' })
      createReadStream(p).pipe(res)
      return true
    }
    const m = url.pathname.match(/^\/api\/chats\/(c-[0-9a-f]{10}|new)\/media$/)
    if (!m) return false
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    const q = url.searchParams
    const name = mediaName(q.get('name'))
    const kind = mediaKind(name)
    if (!kind) { json(res, 400, { error: 'a picture, a clip or a sound' }); return true }
    body(req, MEDIA_MAX[kind]).then(async buf => {
      if (!buf.length) throw Object.assign(new Error('the file was empty'), { status: 400 })
      let id = m[1]
      if (id === 'new') {
        const from = q.get('from')
        id = chats.create({ kind: ['site', 'app', 'film', 'game'].includes(q.get('kind')) ? q.get('kind') : 'site', project: from ? projectOf(from) : null }).id
      } else if (!chats.get(id)) throw Object.assign(new Error('no such chat'), { status: 404 })
      const dir = join(chats.locate(id), 'media')
      mkdirSync(dir, { recursive: true })
      const stem = name.replace(/\.[^.]+$/, ''), ext = extname(name)
      let f = name
      for (let i = 2; existsSync(join(dir, f)); i++) f = `${stem} (${i})${ext}`
      writeFileSync(join(dir, f), buf)
      // only the model the person chose sees or hears it: the vision model for a picture, the media pick
      // (or frames to the vision model) for a clip or a sound
      let read = { by: 'none', text: '' }
      if (kind === 'image') {
        if (buf.length > 5e6) read = { by: 'none', text: 'too big to send to the vision model' }
        else if (see) {
          const mime = MEDIA_TYPES[ext.slice(1).toLowerCase()]
          const text = await see(`data:${mime};base64,${buf.toString('base64')}`).catch(() => null)
          read = text ? { by: 'vision', text: String(text).replace(/\s+/g, ' ').trim().slice(0, 600) } : { by: 'none', text: 'the vision model did not answer' }
        } else read = { by: 'none', text: 'no vision model is set' }
      } else if (readClip) {
        const r = await readClip(join(dir, f), kind).catch(err => ({ by: 'none', says: `not read: ${String(err.message || err).slice(0, 100)}` }))
        read = { by: r.by, text: r.by === 'none' ? '' : String(r.text || '').slice(0, 900), says: r.says, saw: r.saw || 'none', heard: r.heard || 'none', model: r.model || null, seconds: r.seconds ?? null }
      } else read = { by: 'none', text: '', says: 'not read: nothing here can watch or listen' }
      const ref = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, name: f, file: f, url: null, src: `/chatmedia/${id}/${encodeURIComponent(f)}`, read, at: Date.now() }
      await chats.update(id, c => { c.refs = [...(c.refs || []), ref].slice(-60) })
      json(res, 200, { chat: id, ref })
    }).catch(err => json(res, err.status || 400, { error: String(err.message || err) }))
    return true
  }
}

export { CHAT_ID }
