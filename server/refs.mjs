// A project's References store, served (engine/refs.mjs, docs/specs/29-chats-references-marks.md):
//   GET  /api/projects/:pid/refs                       -> { refs }
//   POST /api/projects/:pid/refs?name=&use=  (bytes)   -> { ref, refs }   a file
//   POST /api/projects/:pid/refs/link { url, use? }    -> { ref, refs }   a link
//   POST /api/projects/:pid/refs/:id/remove | restore  -> { ref, refs }   undo brings a removed one back
//   POST /api/projects/:pid/refs/:id/use { use, send } -> { ref, refs, sent }  send: tell the crew, like a comment
//   GET  /ref/:pid/:file                               the file (open like /up/: the crew's pages use it)
import { createReadStream } from 'node:fs'

// refs: the store; head(pid): the project's newest run id or null; comment(run, { text }): the crew's comment route
export function refRoutes({ refs, head = () => null, comment = null }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const fail = (res, err) => json(res, err.status || 400, { error: String(err.message || err) })
  const body = (req, max) => new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', c => { n += c.length; if (n > max) { req.destroy(); reject(Object.assign(new Error('too big'), { status: 413 })) } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
  const jsonBody = req => body(req, 2e4).then(b => { try { return JSON.parse(b.toString() || '{}') } catch { return {} } })

  return function handle(req, res, url) {
    const file = url.pathname.match(/^\/ref\/([\w-]{1,64})\/([^/]{1,400})$/)
    if (file) {
      const f = refs.file(file[1], file[2])
      if (!f) { res.writeHead(404).end('not found'); return true }
      res.writeHead(200, { 'content-type': f.type, 'cache-control': 'no-cache', 'access-control-allow-origin': '*', 'content-security-policy': 'sandbox' })
      createReadStream(f.file).pipe(res)
      return true
    }
    const m = url.pathname.match(/^\/api\/projects\/([\w-]{1,64})\/refs(?:\/(link)|\/(r[0-9a-z]{4,16})\/(remove|restore|use))?$/)
    if (!m) return false
    const [, pid, link, id, op] = m
    const out = ref => ({ ref, refs: refs.list(pid) })
    if (req.method === 'GET' && !link && !id) { json(res, 200, { refs: refs.list(pid) }); return true }
    if (req.method !== 'POST') { json(res, 405, { error: 'GET or POST' }); return true }
    if (!link && !id) {
      body(req, 60e6).then(buf => json(res, 200, out(refs.addFile(pid, { name: url.searchParams.get('name'), use: url.searchParams.get('use'), source: url.searchParams.get('source') || 'upload' }, buf)))).catch(err => fail(res, err))
      return true
    }
    if (link) { jsonBody(req).then(input => json(res, 200, out(refs.addLink(pid, input)))).catch(err => fail(res, err)); return true }
    jsonBody(req).then(async input => {
      if (op === 'remove') return json(res, 200, out(refs.remove(pid, id)))
      if (op === 'restore') return json(res, 200, out(refs.restore(pid, id)))
      const use = String(input.use || '').trim()
      if (!use) throw Object.assign(new Error('say which part it is for'), { status: 400 })
      const r = refs.setUse(pid, id, use)
      let sent = false
      if (input.send && comment) {
        const run = head(pid)
        if (!run) throw Object.assign(new Error('build the project first'), { status: 409 })
        await comment(run, { text: refs.useText(r, use) })
        sent = true
      }
      json(res, 200, { ...out(r), sent })
    }).catch(err => fail(res, err))
    return true
  }
}
