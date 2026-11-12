// The App kit's routes (docs/specs/37-studio-first.md, engine/appkit.mjs). Nothing here builds: a build
// starts only from the person's press, through /api/auto with the locked kit.
//   POST /api/kit/app/draft { brief, said?, kit?, quick? } -> { kit, say, left, connects }  the planner's kit, or
//                                                    the brief's own words (at once with quick, or when no planner answers)
//   POST /api/kit/app/say { kit, said }          -> { kit, say, options?, connect?, left, connects }
//   POST /api/kit/app/edit { kit, op }           -> { kit, left, connects }  one edit from the board
//   POST /api/kit/app/spec { kit }               -> { words, plan, proposal, left }  for the proposal and Lock
//   GET  /api/kit/app/connections                -> { have }  names only, never a key
//   GET  /api/kit/app/:pid, PUT /api/kit/app/:pid { kit }  the project's kit as it stands
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanKit, draftKit, editKit, kitMessages, readKit, askConnect, connectsOf, kitLeft, kitWords, kitPlan, kitProposal, haveOf } from '../engine/appkit.mjs'

const PID = /^[\w-]{1,64}$/

// model() -> (messages -> text) or null, through Hermes like the talk's; supabase() -> true when signed in
export function appKitRoutes({ dataDir, model = () => null, supabase = async () => false }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 2e5) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  // Hermes's connector list can take seconds when cold: the last answer is kept for a minute, and a
  // request waits at most 1.5 s for a fresh one (Supabase counts as not connected until it answers)
  let signed = { at: 0, value: false, asking: null }
  const supabaseNow = () => {
    if (Date.now() - signed.at < 60e3) return Promise.resolve(signed.value)
    signed.asking ||= Promise.resolve().then(supabase).catch(() => false).then(v => { signed = { at: Date.now(), value: !!v, asking: null }; return !!v })
    return Promise.race([signed.asking, new Promise(r => setTimeout(() => r(signed.value), 1500))])
  }
  const have = async () => haveOf(process.env, { supabase: await supabaseNow() })
  const view = async (kit, extra = {}) => ({ kit, left: kitLeft(kit), connects: connectsOf(kit, await have()), ...extra })
  const file = pid => join(dataDir, 'projects', pid, 'kit-app.json')

  async function draft(input) {
    const brief = String(input.brief || '').slice(0, 2000)
    if (!brief.trim()) throw Object.assign(new Error('say what the app is'), { status: 400 })
    const before = input.kit ? cleanKit(input.kit) : null
    const m = input.quick ? null : model()
    if (m) {
      try {
        const out = readKit(await m(kitMessages(brief, Array.isArray(input.said) ? input.said : [], before)), before)
        if (out) return view({ ...out.kit, brief }, { say: out.say })
      } catch (err) { console.error(`app kit: the planner did not answer: ${String(err.message || err).slice(0, 160)}`) }
    }
    return view(before || draftKit(brief), { say: '' })
  }

  async function sayTo(input) {
    const kit = cleanKit(input.kit)
    const said = String(input.said || '').slice(0, 2000)
    // a picked chip: "api-flights:duffel"
    const pick = said.match(/^([\w-]+):([\w-]+)$/)
    if (pick && kit.connects.some(c => c.id === pick[1])) return view(editKit(kit, { op: 'set', what: 'connect', id: pick[1], value: { choice: pick[2] } }), { say: '' })
    // "do I need an air booking api?" gets an answer and a choice, never a build
    const asked = askConnect(said, kit)
    if (asked) return view(asked.kit, { say: asked.say, options: asked.options, connect: asked.connect })
    const m = model()
    if (!m) return view(kit, { say: '' })
    const out = readKit(await m(kitMessages(kit.brief, [...(Array.isArray(input.said_before) ? input.said_before : []), { who: 'person', text: said }], kit)), kit)
    return out ? view(out.kit, { say: out.say }) : view(kit, { say: '' })
  }

  const routes = function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/kit/app')) return false
    const fail = err => json(res, err.status || 400, { error: String(err.message || err) })
    if (url.pathname === '/api/kit/app/connections' && req.method === 'GET') { have().then(h => json(res, 200, { have: h }), fail); return true }
    const m = url.pathname.match(/^\/api\/kit\/app\/([\w-]+)$/)
    if (!m) { json(res, 404, { error: 'no such route' }); return true }
    const what = m[1]
    if (['draft', 'say', 'edit', 'spec'].includes(what)) {
      if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
      body(req).then(async input => {
        if (what === 'draft') return json(res, 200, await draft(input))
        if (what === 'say') return json(res, 200, await sayTo(input))
        if (what === 'edit') return json(res, 200, await view(editKit(input.kit, input.op || {})))
        const kit = cleanKit(input.kit), h = await have()
        json(res, 200, { words: kitWords(kit, h), plan: kitPlan(kit, h), proposal: kitProposal(kit), left: kitLeft(kit) })
      }).catch(fail)
      return true
    }
    // the project's kit as it stands
    if (!PID.test(what)) { json(res, 404, { error: 'no such project' }); return true }
    if (!existsSync(join(dataDir, 'projects', what))) { json(res, 404, { error: 'no such project' }); return true }
    if (req.method === 'GET') {
      let kit = null
      try { kit = cleanKit(JSON.parse(readFileSync(file(what), 'utf8'))) } catch {}
      if (!kit) { json(res, 200, { kit: null }); return true }
      view(kit).then(v => json(res, 200, v), fail)
      return true
    }
    if (req.method !== 'PUT') { json(res, 405, { error: 'GET or PUT' }); return true }
    body(req).then(async input => {
      const kit = cleanKit(input.kit)
      mkdirSync(join(dataDir, 'projects', what), { recursive: true })
      const tmp = `${file(what)}.tmp`
      writeFileSync(tmp, JSON.stringify(kit, null, 1))
      renameSync(tmp, file(what))
      json(res, 200, await view(kit))
    }).catch(fail)
    return true
  }
  return routes
}
