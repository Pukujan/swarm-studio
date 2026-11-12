// The story's routes (docs/specs/37-story.md, engine/story.mjs, engine/storycards.mjs).
//   GET  /api/runs/:id/story                  -> { story, cards, types } (404 before one is written)
//   POST /api/runs/:id/story { type? }        -> written (again) from the build, cards drawn
//   POST /api/runs/:id/story/edit { op, ... } -> reword | picture | move | order | type; cards redrawn
//   GET  /story/<id>/<shape>-<beat>.jpg      -> one card (open like /img/, so an <img> can show it)
//   GET  /story/<id>/screens/<page>-<desktop|phone>.jpg -> a page shot a beat may use
// Nothing here posts anything: the cards go to the Feed only through Post to Feed, and to a network
// only when the person presses Post on their own connected account.
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { storyFacts, writeStory, readStory, saveStory, editStory, picturesOf, STORY_TYPES } from '../engine/story.mjs'
import { drawCards, SHAPES } from '../engine/storycards.mjs'

const RUN_ID = /^[\w.-]{1,80}$/

// runsDir, dataDir; readEvents(id); brandOf(id) -> the chat's brand record or null;
// chat() -> (messages -> text) or null; shots(id) -> [{ page, desktop, phone }] as data URLs (a fresh
// export's page shots), or [] when there is no browser
export function storyRoutes({ runsDir, dataDir, readEvents, brandOf = () => null, chat = () => null, shots = async () => [], pitchOf = async () => '' }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 5e4) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  const busy = new Map()
  const once = (id, fn) => { const p = (busy.get(id) || Promise.resolve()).then(fn, fn); busy.set(id, p.catch(() => {})); return p }

  // the pitch is a model call: only when writing and the brand does not already say what it is, once per build
  const pitches = new Map()
  const factsOf = async (id, { pitch = true } = {}) => {
    const events = readEvents(id) || [], brand = brandOf(id)
    const f = storyFacts(events, id, { brand })
    if (!pitch || f.what) return f
    if (!pitches.has(id)) pitches.set(id, await pitchOf(id).catch(() => ''))
    return storyFacts(events, id, { brand, pitch: pitches.get(id) })
  }

  // the page shots a story's screens use, kept as files so a redraw does not shoot the site again
  async function screensOf(id, story) {
    const dir = join(runsDir, id, 'story', 'screens')
    const want = [...new Set(story.beats.filter(b => b.picture?.kind === 'screen').map(b => b.picture.page))]
    const have = p => existsSync(join(dir, `${p}-desktop.jpg`)) || existsSync(join(dir, `${p}-phone.jpg`))
    if (want.some(p => !have(p))) {
      mkdirSync(dir, { recursive: true })
      for (const s of await shots(id).catch(() => [])) {
        for (const k of ['desktop', 'phone']) {
          const m = /^data:image\/\w+;base64,(.+)$/.exec(s[k] || '')
          if (m && /^[\w-]{1,60}$/.test(s.page)) writeFileSync(join(dir, `${s.page}-${k}.jpg`), Buffer.from(m[1], 'base64'))
        }
      }
    }
    const out = {}
    for (const p of want) {
      const f = k => (existsSync(join(dir, `${p}-${k}.jpg`)) ? `file://${join(dir, `${p}-${k}.jpg`)}` : null)
      out[p] = { desktop: f('desktop'), phone: f('phone') }
    }
    return out
  }

  async function draw(id, story) {
    const runDir = join(runsDir, id)
    const r = await drawCards(story, { outDir: join(runDir, 'story'), runDir, screens: await screensOf(id, story), dataDir })
    return r
  }
  // the pictures a beat can swap to: the build's own art and its pages (a page shot once there is one)
  const choices = async id => {
    const pics = picturesOf(await factsOf(id, { pitch: false }))
    const shot = p => existsSync(join(runsDir, id, 'story', 'screens', `${p}-desktop.jpg`)) ? `/story/${id}/screens/${p}-desktop.jpg` : null
    return pics.all.map(p => (p.kind === 'screen' ? { kind: 'screen', page: p.page, src: null, name: p.title, thumb: shot(p.page) } : { kind: 'image', src: p.src, page: null, thumb: p.src }))
  }
  const view = async (id, story, cards) => ({ story, cards: cards || cardsOn(id, story), types: Object.entries(STORY_TYPES).map(([id, t]) => ({ id, label: t.label })), shapes: SHAPES, pictures: await choices(id) })
  const cardsOn = (id, story) => Object.fromEntries(Object.keys(SHAPES).map(s => [s, story.beats.map(b => `${s}-${b.id}.jpg`).filter(f => existsSync(join(runsDir, id, 'story', f)))]))

  // the cards and page shots, open like /img/ (a build's pictures are not secret; the API is)
  function file(req, res, url) {
    const m = url.pathname.match(/^\/story\/([\w.-]{1,80})\/((?:screens\/[\w-]{1,60}-(?:desktop|phone)|(?:tall|wide|square)-b\d{1,2})\.jpg)$/)
    if (!m || req.method !== 'GET') return false
    const f = join(runsDir, m[1], 'story', m[2])
    if (!existsSync(f)) { json(res, 404, { error: 'no such card' }); return true }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-cache' })
    createReadStream(f).pipe(res)
    return true
  }

  async function handle(req, res, url) {
    const m = url.pathname.match(/^\/api\/runs\/([^/]+)\/story(?:\/(edit))?$/)
    if (!m || !RUN_ID.test(m[1])) return false
    const [, id, sub] = m
    const runDir = join(runsDir, id)
    if (!existsSync(join(runDir, 'events.jsonl'))) { json(res, 404, { error: 'no such build' }); return true }
    if (req.method === 'GET' && !sub) {
      const story = readStory(runDir)
      json(res, story ? 200 : 404, story ? await view(id, story) : { error: 'no story yet', pictures: await choices(id) })
      return true
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    const input = await body(req)
    try {
      const out = await once(id, async () => {
        const f = await factsOf(id, { pitch: !sub || input.op === 'type' })
        let story
        if (!sub) {
          const talk = chat()
          story = (await writeStory(f, { type: input.type || null, chat: talk })).story
        } else {
          const now = readStory(runDir)
          if (!now) throw Object.assign(new Error('no story yet'), { status: 404 })
          story = editStory(now, f, input)
        }
        const { fixes, ...keep } = story
        saveStory(runDir, keep)
        const r = await draw(id, keep)
        return { ...(await view(id, keep, r.cards)), fixes: fixes || [], drawn: r.drawn, by: r.by }
      })
      json(res, 200, out)
    } catch (err) { json(res, err.status || 400, { error: String(err.message || err) }) }
    return true
  }
  return { handle, file }
}

export { readStory }
export const storyCardsDir = (runsDir, id) => join(runsDir, id, 'story')
export const readCard = (runsDir, id, name) => { try { return readFileSync(join(runsDir, id, 'story', name)) } catch { return null } }
