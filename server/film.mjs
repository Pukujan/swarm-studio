// Films with no website (docs/specs/40-video-kit.md): a project's brand, References and Assets become a
// film run, and the film job (server.mjs videoNow) cuts it with the same director, music cut and critic.
//   POST /api/projects/:pid/film { kit?, story?, shapes? }  -> { run, state }   the Video kit's Build press
//   GET|PUT /api/kit/video/:pid { kit }                     the Video kit's draft (projects/<pid>/kit-video.json)
// The run is a folder like any build's: events.jsonl starts with run:start { kind: 'film' } and a
// film:source event (what engine/filmkit.mjs brandSource made, its files copied into the run's img/).
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, extname, basename, resolve as resolvePath, sep } from 'node:path'
import { brandSource, checkKit, checkStory } from '../engine/filmkit.mjs'
import { brandTheme } from '../engine/brand.mjs'

const PID = /^[\w-]{1,64}$/
const PIC = /\.(png|jpe?g|webp|gif)$/i, CLIP = /\.(mp4|webm|mov)$/i, SOUND = /\.(mp3|wav|m4a|ogg|aac)$/i

// The project's References and Assets as one list of { id, kind, file, about, given }: References are
// "like this", Assets are "use as given" (spec 37); the Assets store may not exist yet.
export function projectItems({ projectsDir, refs, pid }) {
  if (!PID.test(String(pid || ''))) return []
  const out = []
  for (const r of refs?.list?.(pid) || []) {
    const f = r.file && refs.file(pid, r.file)
    if (f) out.push({ id: r.id, kind: r.kind, file: f.file, about: r.read?.text || r.use || r.name || '', given: false })
  }
  let assets = []
  try { assets = JSON.parse(readFileSync(join(projectsDir, pid, 'assets', 'index.json'), 'utf8')) } catch {}
  for (const a of Array.isArray(assets) ? assets : []) {
    if (a?.removed || !a?.file || basename(String(a.file)) !== String(a.file)) continue
    const file = join(projectsDir, pid, 'assets', a.file)
    if (existsSync(file)) out.push({ id: a.id, kind: a.kind || (PIC.test(a.file) ? 'image' : CLIP.test(a.file) ? 'video' : SOUND.test(a.file) ? 'audio' : 'file'), file, about: a.name || a.role || '', given: true, role: a.role })
  }
  return out
}

// The project's brand (spec 37: projects/<pid>/brand.json, spec 31's shape), or null
export function projectBrand({ projectsDir, pid }) {
  try { return JSON.parse(readFileSync(join(projectsDir, pid, 'brand.json'), 'utf8')) } catch { return null }
}

// A file inside `root` named by a relative path, or null (never outside it)
export function inside(root, rel) {
  if (!rel || typeof rel !== 'string' || rel.includes('\0')) return null
  const r = resolvePath(root), f = resolvePath(root, rel)
  return f.startsWith(r + sep) && existsSync(f) ? f : null
}

// The film run's c, rebuilt from its film:source event and the files in its img/ folder
export function filmSourceOf(events = [], runDir) {
  const src = events.findLast?.(e => e.type === 'film:source')
  if (!src?.c) return null
  const c = src.c
  const keep = (list, folder) => (list || []).map(x => ({ ...x, file: join(runDir, folder, basename(String(x.file || ''))) })).filter(x => existsSync(x.file))
  return { ...c, images: keep(c.images, 'img'), clips: keep(c.clips, 'img') }
}

// makeRun(pid, events) -> run id (a new run folder with these events, claimed by the project)
// startFilm(run, input) -> the film job ({ state, … })
export function filmRoutes({ projectsDir, refs, known = () => true, makeRun, startFilm }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 2e5) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  return function handle(req, res, url) {
    const d = url.pathname.match(/^\/api\/kit\/video\/([\w-]{1,64})$/)
    if (d) {
      const pid = d[1], file = join(projectsDir, pid, 'kit-video.json')
      if (!known(pid)) { json(res, 404, { error: 'no such project' }); return true }
      if (req.method === 'GET') { let kit = null; try { kit = checkKit(JSON.parse(readFileSync(file, 'utf8'))) } catch {} json(res, 200, { kit }); return true }
      if (req.method !== 'PUT' && req.method !== 'POST') { json(res, 405, { error: 'GET or PUT' }); return true }
      body(req).then(input => {
        const kit = checkKit(input.kit || {})
        mkdirSync(join(projectsDir, pid), { recursive: true })
        writeFileSync(file, JSON.stringify(kit, null, 2))
        json(res, 200, { kit })
      }).catch(err => json(res, 400, { error: String(err.message || err) }))
      return true
    }
    const m = url.pathname.match(/^\/api\/projects\/([\w-]{1,64})\/film$/)
    if (!m) return false
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    const pid = m[1]
    if (!known(pid)) { json(res, 404, { error: 'no such project' }); return true }
    body(req).then(async input => {
      const kit = input.kit ? checkKit(input.kit) : null
      const story = input.story ? checkStory(input.story) : null
      if (!kit && !story) return json(res, 400, { error: 'a kit or a story' })
      const brand = projectBrand({ projectsDir, pid })
      const theme = brand ? brandTheme(brand) : null
      const items = projectItems({ projectsDir, refs, pid })
      const pics = items.filter(x => x.kind === 'image' && PIC.test(x.file)), vids = items.filter(x => x.kind === 'video' && CLIP.test(x.file))
      const name = String(story?.title || brand?.story?.name || brand?.name || input.name || 'Our film').slice(0, 60)
      const c = brandSource({ name, brief: brand?.story?.what || input.idea || '', theme, story: brand?.story || {}, pictures: pics, clips: vids })
      // the music reference: a dropped track named by its id, used as the score
      const music = kit?.music.file ? items.find(x => x.id === kit.music.file && SOUND.test(x.file)) : null
      const t = Date.now()
      const run = makeRun(pid, [
        { type: 'run:start', t, kind: 'film', brief: c.brief, title: name, project: pid },
        ...(theme ? [{ type: 'theme', t, ...theme }] : []),
        { type: 'film:source', t, c: { ...c, images: c.images.map((x, i) => ({ ...x, file: `k${i + 1}${extname(x.file)}` })), clips: c.clips.map((x, i) => ({ ...x, file: `v${i + 1}${extname(x.file)}` })) }, kit, story, music: music ? `music${extname(music.file)}` : null }
      ], dir => {
        mkdirSync(join(dir, 'img'), { recursive: true })
        c.images.forEach((x, i) => copyFileSync(x.file, join(dir, 'img', `k${i + 1}${extname(x.file)}`)))
        c.clips.forEach((x, i) => copyFileSync(x.file, join(dir, 'img', `v${i + 1}${extname(x.file)}`)))
        if (music) { mkdirSync(join(dir, 'video'), { recursive: true }); copyFileSync(music.file, join(dir, 'video', `music${extname(music.file)}`)) }
        if (story) writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2))
      })
      const shapes = Array.isArray(input.shapes) ? input.shapes : story ? ['wide', 'tall', 'square'] : [kit.shape]
      const job = await startFilm(run, { kit, story: story ? true : undefined, shapes, music: input.music, voice: input.voice })
      json(res, 200, { run, ...job })
    }).catch(err => json(res, err.status || 400, { error: String(err.message || err) }))
    return true
  }
}
