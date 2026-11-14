// The brand sheet's routes (docs/specs/31-brand-sheet.md, engine/brand.mjs). The sheet is the chat
// record's `brand` field (engine/chats.mjs); every write goes through the store's per-chat queue.
//   POST /api/brand { chat?, brief, kind }            -> { chat, brand }  options made (a chat is made when none)
//   GET  /api/brand/:chat                             -> { chat, brand, theme }
//   POST /api/brand/:chat/pick { part, id | words }   -> { chat, brand, theme }  words: one more option, picked
//   POST /api/brand/:chat/pick { part: 'pack', id, parts? } -> a pack fills the sheet (or only the parts named)
//   POST /api/brand/:chat/pick { part: 'look', look, host } -> a reference's look as the picked palette and type
//   POST /api/brand/:chat/edit { part, id, values }   -> { chat, brand, theme }  an option's colours, fonts or the story
//   POST /api/brand/:chat/lock | /unlock              -> { chat, brand, theme }
// One brand per project (docs/specs/37-studio-first.md): the same routes answer for a project's
// brand.json, with `chat` in the answer being the project's id:
//   GET  /api/projects/:pid/brand                     POST /api/projects/:pid/brand { brief, kind }
//   POST /api/projects/:pid/brand/pick | edit | lock | unlock
import { CHAT_ID } from '../engine/chats.mjs'
import { brandOptions, brandTheme, brandBrief, fixPalette, paletteFromWords } from '../engine/brand.mjs'
import { packCards, applyPack, packOf, PARTS } from '../engine/brandpacks.mjs'
import { brandFromLook } from '../engine/sitelook.mjs'

const HEXC = /^#[0-9a-f]{6}$/i
const FONT = /^[A-Za-z][\w ]{1,38}$/

// chats: the shared store; model() -> (messages -> text) or null; projectBrands: engine/studio.mjs's
// `brands` (get(pid) -> { id, brand }, update(pid, fn)), or none
export function brandRoutes({ chats, model = () => null, projectBrands = null }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 5e4) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  // the pack cards are made per view from the brief (data and the shipped photo library: no model call)
  const view = chat => ({ chat: chat.id, brand: chat.brand || null, theme: chat.brand ? brandTheme(chat.brand) : null, packs: chat.brand ? packCards(chat.brand.brief, chat.brand.suggest, chat.brand.pack) : [] })
  const bad = msg => Object.assign(new Error(msg), { status: 400 })
  // the store a call writes to (`S`): the chats, or the projects' brand.json (records are both { id, brand })
  // any change to a locked sheet opens it again
  const change = (id, fn, S = chats) => S.update(id, chat => {
    if (!chat.brand) throw bad('no brand sheet yet')
    fn(chat.brand, chat)
    chat.brand.lockedAt = null
  }).then(view)

  async function make(input) {
    const brief = String(input.brief || '').trim().slice(0, 4000)
    if (!brief) throw bad('a brief is needed')
    let id = typeof input.chat === 'string' && CHAT_ID.test(input.chat) && chats.get(input.chat) ? input.chat : null
    if (!id) id = chats.create({ kind: input.kind === 'app' ? 'app' : 'site', text: brief }).id
    return fill(chats, id, brief)
  }
  // options for a brief, into a record of the store; the same brief keeps the sheet, a new brief makes
  // new options, and what was locked stays only until then
  async function fill(store, id, brief) {
    const have = store.get(id)?.brand
    if (have && have.brief === brief) return view(store.get(id))
    const opts = await brandOptions({ brief, chat: model() })
    return store.update(id, chat => {
      chat.brand = { brief, story: opts.story, palettes: opts.palettes, types: opts.types, suggest: opts.suggest || [], pick: { palette: opts.palettes[0]?.id || null, type: opts.types[0]?.id || null }, radius: '12px', made: Date.now(), lockedAt: null }
      // what the person chose themselves stays through a new brief: a reference's look (Use this look) and
      // options made from their own words, still picked
      const kept = { p: (have?.palettes || []).filter(x => x.by === 'look' || x.by === 'person'), t: (have?.types || []).filter(x => x.by === 'look' || x.by === 'person') }
      if (kept.p.length) { chat.brand.palettes.unshift(...kept.p); if (kept.p.some(x => x.id === have.pick?.palette)) chat.brand.pick.palette = have.pick.palette }
      if (kept.t.length) { chat.brand.types.unshift(...kept.t); if (kept.t.some(x => x.id === have.pick?.type)) chat.brand.pick.type = have.pick.type }
      if (kept.p.length && have.radius) chat.brand.radius = have.radius
    }).then(view)
  }

  function pick(id, input, S = chats) {
    if (input.part === 'pack') {
      if (!packOf(String(input.id || ''))) throw bad('no such pack')
      const parts = Array.isArray(input.parts) ? input.parts.filter(p => PARTS.includes(p)) : PARTS
      if (!parts.length) throw bad('name a part')
      return change(id, b => { applyPack(b, input.id, parts) }, S)
    }
    // "Use this look" on a reference link (decision 0022): its measured colours and type become one palette and
    // one type on the sheet, picked; the person can still change either. Its own font files are never used.
    if (input.part === 'look') {
      const made = brandFromLook(input.look, String(input.host || '').replace(/[^\w.-]/g, '').slice(0, 60))
      if (!made) throw bad('that look has no colours yet')
      return change(id, b => {
        b.palettes = (b.palettes || []).filter(x => x.id !== 'plook'); b.types = (b.types || []).filter(x => x.id !== 'tlook')
        b.palettes.unshift({ ...fixPalette(made.palette), id: 'plook', by: 'look' })
        b.types.unshift({ ...made.type, id: 'tlook', by: 'look' })
        b.pick = { ...(b.pick || {}), palette: 'plook', type: 'tlook' }
        if (made.radius) b.radius = made.radius
      }, S)
    }
    const part = input.part === 'type' ? 'type' : input.part === 'palette' ? 'palette' : null
    if (!part) throw bad('part is palette, type or pack')
    const words = String(input.words || '').trim().slice(0, 300)
    return change(id, b => {
      const list = part === 'palette' ? b.palettes : b.types
      if (words) {
        let opt = null
        if (part === 'palette') { const p = paletteFromWords(words, words.slice(0, 40)); if (!p) throw bad('name a colour or two'); opt = p }
        else {
          // "Fraunces and Inter", "Fraunces / Inter", or one family for both
          const [h, bd] = words.split(/\s*(?:\/|,|\band\b|\bwith\b|\+)\s*/i).map(x => x.trim()).filter(Boolean)
          if (!FONT.test(h || '')) throw bad('name a font')
          opt = { name: words.slice(0, 30), heading: h, body: FONT.test(bd || '') ? bd : h }
        }
        opt.id = `${part === 'palette' ? 'p' : 't'}w${list.filter(x => /w\d+$/.test(x.id)).length + 1}`
        opt.by = 'person'
        list.push(opt)
        b.pick[part] = opt.id
        return
      }
      if (!list.some(x => x.id === input.id)) throw bad('no such option')
      b.pick[part] = input.id
    }, S)
  }

  function edit(id, input, S = chats) {
    const v = input.values || {}
    return change(id, b => {
      if (input.part === 'story') {
        const s = b.story || (b.story = { what: '', who: '', pages: [] })
        if (typeof v.what === 'string') s.what = v.what.slice(0, 200)
        if (typeof v.who === 'string') s.who = v.who.slice(0, 200)
        if (v.pages != null) s.pages = (Array.isArray(v.pages) ? v.pages : String(v.pages).split(',')).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 8)
        return
      }
      const list = input.part === 'type' ? b.types : input.part === 'palette' ? b.palettes : null
      const o = list?.find(x => x.id === input.id)
      if (!o) throw bad('no such option')
      if (input.part === 'palette') {
        const next = { ...o }
        for (const k of ['bg', 'text', 'accent', 'link']) if (HEXC.test(String(v[k] || ''))) next[k] = String(v[k]).toLowerCase()
        Object.assign(o, fixPalette(next))
      } else for (const k of ['heading', 'body']) if (FONT.test(String(v[k] || ''))) o[k] = String(v[k]).trim()
      b.pick[input.part] = o.id
    }, S)
  }

  const lock = (id, S = chats) => S.update(id, chat => {
    if (!brandTheme(chat.brand)) throw bad('pick a palette and a type first')
    chat.brand.lockedAt = Date.now()
  }).then(view)
  const unlock = (id, S = chats) => S.update(id, chat => { if (chat.brand) chat.brand.lockedAt = null }).then(view)
  const op = (what, id, input, S = chats) => (what === 'pick' ? pick(id, input, S) : what === 'edit' ? edit(id, input, S) : what === 'lock' ? lock(id, S) : unlock(id, S))

  const routes = function handle(req, res, url) {
    if (url.pathname === '/api/brand') {
      if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
      body(req).then(make).then(v => json(res, 200, v)).catch(err => json(res, err.status || 502, { error: String(err.message || err) }))
      return true
    }
    const pm = projectBrands && url.pathname.match(/^\/api\/projects\/([\w-]{1,64})\/brand(?:\/(pick|edit|lock|unlock))?$/)
    if (pm) {
      const rec = projectBrands.get(pm[1])
      if (!rec) { json(res, 404, { error: 'no such project' }); return true }
      if (req.method === 'GET' && !pm[2]) { json(res, 200, view(rec)); return true }
      if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
      body(req).then(input => {
        if (!pm[2]) {
          const brief = String(input.brief || '').trim().slice(0, 4000)
          // A project with no idea yet still gets a sheet to pick from: the built-in palettes and pairings, with
          // no model call. (It opened blank with "a brief is needed".) Once there is an idea, the sheet is made for it.
          if (!brief) {
            if (rec.brand) return view(rec)
            return brandOptions({ brief: '', chat: null }).then(opts => projectBrands.update(pm[1], chat => { chat.brand = { brief: '', story: { ...opts.story, pages: [] }, palettes: opts.palettes, types: opts.types, suggest: opts.suggest || [], pick: { palette: opts.palettes[0]?.id || null, type: opts.types[0]?.id || null }, radius: '12px', made: Date.now(), lockedAt: null } })).then(view)
          }
          return fill(projectBrands, pm[1], brief)
        }
        // "Use this look" on a project with no sheet yet: one is made from the built-in options, with no model
        // call, and the look goes on top of it. It names no pages, so the project's own page list stands
        if (pm[2] === 'pick' && input.part === 'look' && !rec.brand) {
          const brief = String(input.brief || '').trim().slice(0, 4000) || 'A website'
          return brandOptions({ brief, chat: null }).then(opts => projectBrands.update(pm[1], chat => { chat.brand = { brief, story: { ...opts.story, pages: [] }, palettes: opts.palettes, types: opts.types, suggest: opts.suggest || [], pick: { palette: opts.palettes[0]?.id || null, type: opts.types[0]?.id || null }, radius: '12px', made: Date.now(), lockedAt: null } }))
            .then(() => op('pick', pm[1], input, projectBrands))
        }
        return op(pm[2], pm[1], input, projectBrands)
      }).then(v => json(res, 200, v)).catch(err => json(res, err.status || 400, { error: String(err.message || err) }))
      return true
    }
    const m = url.pathname.match(/^\/api\/brand\/([^/]+)(?:\/(pick|edit|lock|unlock))?$/)
    if (!m) return false
    if (!CHAT_ID.test(m[1]) || !chats.get(m[1])) { json(res, 404, { error: 'no such chat' }); return true }
    if (req.method === 'GET' && !m[2]) { json(res, 200, view(chats.get(m[1]))); return true }
    if (req.method !== 'POST' || !m[2]) { json(res, 405, { error: 'POST' }); return true }
    body(req).then(input => op(m[2], m[1], input))
      .then(v => json(res, 200, v)).catch(err => json(res, err.status || 400, { error: String(err.message || err) }))
    return true
  }
  return routes
}

// the locked sheet of a chat (or of a project, with its brands store), as runSwarm takes it; null when
// there is none or it is open
export function lockedBrand(chats, id) {
  const b = id && chats?.get(id)?.brand
  const theme = b?.lockedAt ? brandTheme(b) : null
  return theme ? { theme, brief: brandBrief(b) } : null
}
