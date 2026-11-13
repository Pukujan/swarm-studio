// The Studio's routes (docs/specs/37-studio-first.md, engine/studio.mjs, engine/assetstore.mjs).
//   POST /api/studio { kind, idea, mode?, depth?, steps?, start? }  -> { project, chat, studio }  a project with no runs yet
//        (an empty idea is fine: the chat's first words become it, through /idea)
//   POST /api/studio/:pid/idea { idea }                -> the studio  the idea, once, while it is empty
//   GET  /api/studio/:pid                                  -> { project, studio, brand, refs, assets }
//   POST /api/studio/:pid/step { step, state }             -> the same
//   POST /api/studio/:pid/depth { depth }                  -> the same
//   POST /api/studio/:pid/mode { mode }                    -> the same (studio, scaffold or takes; spec 42)
//   POST /api/studio/:pid/kit { data }                     -> the same  the kit's own state, merged
// The project's Assets ("use this as given"; References are "like this"):
//   GET    /api/projects/:pid/assets                       -> { assets }
//   POST   /api/projects/:pid/assets?name=&role=  (bytes)  -> { asset, assets }  an upload
//   POST   /api/projects/:pid/assets { ref }               -> { asset, assets, refs }  a reference, moved over (Use as given)
//   POST   /api/projects/:pid/assets/:id/reference         -> { ref, assets, refs }  moved to the References (Use as reference)
//   POST   /api/projects/:pid/assets/:id/role { role }     -> { asset, assets }
//   POST   /api/projects/:pid/assets/:id/restore           -> { asset, assets }
//   DELETE /api/projects/:pid/assets/:id                   -> { asset, assets }  kept as removed, so undo works
//   GET    /asset/:pid/:file                               the file (sandboxed, like /ref/)
import { createReadStream, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STUDIO_KINDS, STEPS } from '../engine/studio.mjs'
import { projectName } from '../engine/naming.mjs'

// "A website for a tiny ramen bar" is named for the ramen bar, not "Website"
const nameOf = idea => projectName({ brief: String(idea).replace(/^\s*(?:make|build|create)?\s*(?:me\s+)?(?:an?\s+)?(?:\w+\s+)?(?:website|site|app|game|film|video|deck|brand|logo)\s+(?:for|about|of)\s+/i, '') })

const CHAT_KIND = { site: 'site', app: 'app', game: 'game', video: 'film', deck: 'site', brand: 'site' }

// studios: engine/studio.mjs; assets: engine/assetstore.mjs; refs: engine/refs.mjs; projects: server/projects.mjs; chats: engine/chats.mjs
export function studioRoutes({ studios, assets, refs, projects, chats }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const fail = (res, err) => json(res, err.status || 400, { error: String(err.message || err) })
  const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })
  const raw = (req, max) => new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', c => { n += c.length; if (n > max) { req.destroy(); reject(bad('too big', 413)) } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
  const jsonBody = req => raw(req, 2e4).then(b => { try { return JSON.parse(b.toString() || '{}') } catch { return {} } })

  // everything the scaffold draws, in one answer
  function whole(pid) {
    const p = projects.get(pid)
    const studio = studios.get(pid)
    if (!p || !studio) throw bad('no such studio', 404)
    return {
      project: { id: pid, name: p.name, title: p.title, head: p.head },
      studio,
      brand: studios.brands.get(pid)?.brand || null,
      refs: refs.list(pid),
      assets: assets.list(pid)
    }
  }

  async function make(input) {
    const kind = STUDIO_KINDS.includes(input.kind) ? input.kind : 'site'
    const idea = String(input.idea || '').trim().slice(0, 4000)
    const pid = projects.makeStudio({ name: idea ? nameOf(idea) : 'New project', kind })
    const chat = chats.create({ kind: CHAT_KIND[kind], text: idea, project: pid })
    const steps = Array.isArray(input.steps) ? input.steps.filter(s => STEPS.includes(s)) : STEPS
    studios.make(pid, { kind, idea, mode: input.mode, depth: input.depth, chat: chat.id, steps: steps.length ? steps : STEPS, start: input.start })
    return { ...whole(pid), chat: chat.id }
  }

  // the chat's first words, when the Studio was opened with an empty box: the idea, and the project's name
  function setIdea(pid, text) {
    const idea = String(text || '').trim().slice(0, 4000)
    if (!idea) throw bad('say what it is')
    let set = false
    studios.update(pid, s => { if (!s.idea) { s.idea = idea; set = true } })
    if (set && projects.get(pid)?.name === 'New project') projects.op({ op: 'rename', id: pid, title: nameOf(idea) })
  }

  // a reference moved over to the assets, or an asset to the references: one action, the other store keeps it as removed
  function refToAsset(pid, id) {
    const r = refs.list(pid).find(x => x.id === id)
    if (!r || !r.file) throw bad('that reference has no file', 404)
    const asset = assets.addCopy(pid, { name: r.name, source: 'upload', w: r.w, h: r.h }, join(refs.dir(pid), r.file))
    refs.remove(pid, id)
    return { asset, assets: assets.list(pid), refs: refs.list(pid) }
  }
  function assetToRef(pid, id) {
    const at = assets.path(pid, id)
    if (!at) throw bad('no such asset', 404)
    const ref = refs.addFile(pid, { name: at.asset.name, source: 'upload' }, readFileSync(at.file))
    assets.remove(pid, id)
    return { ref, assets: assets.list(pid), refs: refs.list(pid) }
  }

  return function handle(req, res, url) {
    const file = url.pathname.match(/^\/asset\/([\w-]{1,64})\/([^/]{1,400})$/)
    if (file) {
      const f = assets.file(file[1], file[2])
      if (!f) { res.writeHead(404).end('not found'); return true }
      res.writeHead(200, { 'content-type': f.type, 'cache-control': 'no-cache', 'access-control-allow-origin': '*', 'content-security-policy': 'sandbox' })
      createReadStream(f.file).pipe(res)
      return true
    }

    if (url.pathname === '/api/studio') {
      if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
      jsonBody(req).then(make).then(v => json(res, 200, v)).catch(err => fail(res, err))
      return true
    }
    const sm = url.pathname.match(/^\/api\/studio\/([\w-]{1,64})(?:\/(step|depth|mode|kit|idea))?$/)
    if (sm) {
      const [, pid, op] = sm
      if (req.method === 'GET' && !op) { try { json(res, 200, whole(pid)) } catch (err) { fail(res, err) } return true }
      if (req.method !== 'POST' || !op) { json(res, 405, { error: 'GET or POST' }); return true }
      jsonBody(req).then(input => {
        if (op === 'step') studios.step(pid, String(input.step || ''), String(input.state || ''))
        else if (op === 'kit') studios.kit(pid, input.data)
        else if (op === 'idea') setIdea(pid, input.idea)
        else if (op === 'mode') studios.mode(pid, String(input.mode || ''))
        else studios.depth(pid, String(input.depth || ''))
        json(res, 200, whole(pid))
      }).catch(err => fail(res, err))
      return true
    }

    const am = url.pathname.match(/^\/api\/projects\/([\w-]{1,64})\/assets(?:\/(a[0-9a-z]{4,16})(?:\/(reference|role|restore))?)?$/)
    if (!am) return false
    const [, pid, id, op] = am
    const out = asset => ({ asset, assets: assets.list(pid) })
    if (req.method === 'GET' && !id) { json(res, 200, { assets: assets.list(pid) }); return true }
    if (req.method === 'DELETE' && id && !op) { try { json(res, 200, out(assets.remove(pid, id))) } catch (err) { fail(res, err) } return true }
    if (req.method !== 'POST') { json(res, 405, { error: 'GET, POST or DELETE' }); return true }
    if (!id) {
      // a reference moved over (JSON { ref }), else the bytes of an upload
      if (/json/.test(req.headers['content-type'] || '')) {
        jsonBody(req).then(input => json(res, 200, refToAsset(pid, String(input.ref || '')))).catch(err => fail(res, err))
        return true
      }
      raw(req, 60e6).then(buf => json(res, 200, out(assets.addFile(pid, { name: url.searchParams.get('name'), role: url.searchParams.get('role'), source: url.searchParams.get('source') || 'upload' }, buf)))).catch(err => fail(res, err))
      return true
    }
    jsonBody(req).then(input => {
      if (op === 'reference') return json(res, 200, assetToRef(pid, id))
      if (op === 'restore') return json(res, 200, out(assets.restore(pid, id)))
      if (op === 'role') return json(res, 200, out(assets.setRole(pid, id, String(input.role || ''))))
      throw bad('no such action', 404)
    }).catch(err => fail(res, err))
    return true
  }
}
