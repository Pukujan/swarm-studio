// The Deck kit's routes (docs/specs/35-open-design.md section 7, engine/deck.mjs). Nothing here is posted or
// published; an export writes files into the project's own folder, from the person's press.
//   GET  /api/kit/deck/looks                         -> { looks, source }  every look, for the Theme section
//   POST /api/kit/deck/draft { brief, story?, beats?, run?, frames?, chat?, project?, quick? }
//                                                    -> { deck, looks, say }  the planner's slides, or the outline;
//                                                    run: that build's story beats (spec 39) start the outline
//   POST /api/kit/deck/render { deck, chat?, project?, slide? } -> { html }  the deck, or one still slide
//   GET  /api/kit/deck/:pid, POST /api/kit/deck/:pid { deck, looks? }  the project's deck as it stands
//   POST /api/kit/deck/:pid/export { format: 'html' | 'pdf', chat? } -> { file, url }  written into the project
//   GET  /api/kit/deck/:pid/deck.html | deck.pdf     the exported file
// The brand is read, never changed: the project's brand.json (spec 37) first, then the chat's brand sheet.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DECK_LOOKS, DECK_SOURCE, cleanDeck, deckHtml, deckPdf, draftDeck, suggestLooks } from '../engine/deck.mjs'
import { CHAT_ID } from '../engine/chats.mjs'
import { readStory } from '../engine/story.mjs'

const PID = /^[\w-]{1,64}$/

// model() -> (messages -> text) or null, through Hermes like the brand sheet's; pdf(html, dst) is replaceable in tests
export function deckRoutes({ dataDir, runsDir = join(dataDir, 'runs'), chats = null, model = () => null, pdf = deckPdf }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 5e5) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  const dir = pid => join(dataDir, 'projects', pid)
  const readJson = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
  const brandOf = ({ project, chat } = {}) => {
    if (PID.test(String(project || ''))) { const b = readJson(join(dir(project), 'brand.json')); if (b) return b }
    if (chats && CHAT_ID.test(String(chat || ''))) return chats.get(chat)?.brand || null
    return null
  }
  const save = (pid, deck, looks) => {
    mkdirSync(dir(pid), { recursive: true })
    const f = join(dir(pid), 'kit-deck.json')
    writeFileSync(`${f}.tmp`, JSON.stringify({ deck, looks: (Array.isArray(looks) ? looks : []).filter(x => DECK_LOOKS.some(t => t.slug === x)).slice(0, 3), at: Date.now() }))
    renameSync(`${f}.tmp`, f)
  }
  const looks = DECK_LOOKS.map(({ slug, name, feel, shape, colours }) => ({ slug, name, feel, shape, colours }))

  // sync like the other route sets: true when the request is ours (it is then answered), false otherwise
  return function routes(req, res, url) {
    if (!url.pathname.startsWith('/api/kit/deck/')) return false
    handle(req, res, url.pathname)
    return true
  }

  async function handle(req, res, p) {
    try {
      if (p === '/api/kit/deck/looks' && req.method === 'GET') return json(res, 200, { looks, source: DECK_SOURCE }), true
      if (p === '/api/kit/deck/draft' && req.method === 'POST') {
        const b = await body(req)
        const brief = String(b.brief || '').slice(0, 3000)
        const brand = brandOf(b)
        const story = b.story || brand?.story || {}
        if (!brief.trim() && !story.what) return json(res, 400, { error: 'say what the deck is about' }), true
        const frames = Array.isArray(b.frames) ? b.frames : []
        const told = /^[\w-]{1,64}$/.test(String(b.run || '')) ? readStory(join(runsDir, b.run))?.beats || [] : []
        const beats = told.length ? told : Array.isArray(b.beats) ? b.beats : []
        const deck = cleanDeck(await draftDeck({ brief, story, beats, frames, voice: brand?.voice, chat: b.quick ? null : model() }))
        const say = `${deck.slides.length} slides, from ${beats.length ? 'the story' : 'the brief'}.`
        return json(res, 200, { deck, looks: suggestLooks(`${brief} ${story.what || ''}`), say }), true
      }
      if (p === '/api/kit/deck/render' && req.method === 'POST') {
        const b = await body(req)
        const deck = cleanDeck(b.deck)
        const only = Number.isInteger(b.slide) && b.slide >= 0 && b.slide < deck.slides.length ? b.slide : null
        return json(res, 200, { html: deckHtml(deck, { brand: brandOf(b), only }) }), true
      }
      const m = /^\/api\/kit\/deck\/([\w-]{1,64})(?:\/(export|deck\.html|deck\.pdf))?$/.exec(p)
      if (!m) return json(res, 404, { error: 'not found' }), true
      const [, pid, what] = m
      if (!what && req.method === 'GET') return json(res, 200, readJson(join(dir(pid), 'kit-deck.json')) || { deck: null }), true
      if (!what && (req.method === 'POST' || req.method === 'PUT')) { const b = await body(req); const deck = cleanDeck(b.deck); save(pid, deck, b.looks); return json(res, 200, { deck }), true }
      if (what === 'export' && req.method === 'POST') {
        const b = await body(req)
        const saved = readJson(join(dir(pid), 'kit-deck.json'))
        if (!saved?.deck) return json(res, 409, { error: 'no deck in this project yet' }), true
        const format = b.format === 'pdf' ? 'pdf' : 'html'
        const html = deckHtml(cleanDeck(saved.deck), { brand: brandOf({ project: pid, chat: b.chat }) })
        const out = join(dir(pid), 'deck')
        mkdirSync(out, { recursive: true })
        const file = join(out, `deck.${format}`)
        if (format === 'html') writeFileSync(file, html)
        else if (!pdf(html, file)) return json(res, 503, { error: 'no Chrome here to print the PDF' }), true
        return json(res, 200, { file: `deck.${format}`, url: `/api/kit/deck/${pid}/deck.${format}` }), true
      }
      if (what && what !== 'export' && req.method === 'GET') {
        const f = join(dir(pid), 'deck', what)
        if (!existsSync(f)) return json(res, 404, { error: 'not exported yet' }), true
        // the exported deck runs its own present-mode script: it is shown on its own, never inside the studio page,
        // and sandboxed like every generated page (Nous catalog review, point 4): an opaque origin, not the studio's
        res.writeHead(200, { 'content-type': what.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8', 'content-security-policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https: data:; frame-ancestors 'self'" }).end(readFileSync(f))
        return true
      }
      return json(res, 405, { error: 'method not allowed' })
    } catch (err) {
      json(res, err.status || 500, { error: err.message })
    }
  }
}
