// The planner conversation's routes (docs/specs/27-plan-conversation.md, engine/talkplan.mjs).
// A talk is a chat (engine/chats.mjs, spec 29 §Store): nothing is built, painted or paid for while it
// is Open. Locking a game chat makes its plan (or re-plans the one it has) and opens the Plan board.
//   GET  /api/talk                       -> { chats }  the loose chats, newest first
//   POST /api/talk { kind, said }        -> { chat, turn }  a new chat and the planner's first turn
//   GET  /api/talk/:id                   -> { chat, draft? }  draft: a game chat's plan as it stands
//   POST /api/talk/:id { said?, pick? }  -> { chat, turn, draft? }  pick is a chip's id ("art:2d", "talk")
//   POST /api/talk/:id/lock              -> { chat, plan? }  a game gets its plan; a site or app its brief
//   POST /api/talk/:id/unlock { key? }   -> { chat }
import { chatStore, CHAT_ID } from '../engine/chats.mjs'
import { say, lock, unlock, planInput, draftOf } from '../engine/talkplan.mjs'
import { planView } from '../engine/plan.mjs'

// model() -> (messages -> text) or null; env() -> { godot }; plans.fromTalk(input, planId) -> plan view
export function talkRoutes({ dataDir, model = () => null, env = () => ({}), plans = null }) {
  const chats = chatStore(dataDir)
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = (req, cap = 1e5) => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > cap) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  const fail = (res, err) => json(res, err.status || 400, { error: String(err.message || err) })
  // a game chat carries its plan as it stands, so the board beside the chat takes shape while they talk
  const withDraft = out => out.chat?.kind === 'game' ? { ...out, draft: planView(draftOf(out.chat, env())) } : out
  const turnOf = (id, input) => chats.update(id, async chat => {
    const turn = await say(chat, { said: String(input.said || '').slice(0, 4000), pick: String(input.pick || '').slice(0, 120) }, { model: model(), env: env() })
    return { chat, turn }
  }).then(withDraft)

  async function lockChat(id) {
    const spec = await chats.update(id, chat => lock(chat, { env: env() }))
    const chat = chats.get(id)
    if (chat.kind !== 'game' || !plans) return { chat, spec }
    const plan = await plans.fromTalk(planInput(chat), chat.plan)
    return { chat: await chats.update(id, c => { c.plan = plan.id }), plan }
  }

  const routes = function handle(req, res, url) {
    if (url.pathname === '/api/talk') {
      if (req.method === 'GET') { json(res, 200, { chats: chats.listLoose() }); return true }
      if (req.method !== 'POST') { json(res, 405, { error: 'GET or POST' }); return true }
      body(req).then(async input => {
        const chat = chats.create({ kind: input.kind })
        json(res, 200, await turnOf(chat.id, input))
      }).catch(err => fail(res, err))
      return true
    }
    const m = url.pathname.match(/^\/api\/talk\/([^/]+)(?:\/(lock|unlock))?$/)
    if (!m) return false
    if (!CHAT_ID.test(m[1])) { json(res, 404, { error: 'no such chat' }); return true }
    if (req.method === 'GET' && !m[2]) { const chat = chats.get(m[1]); json(res, chat ? 200 : 404, chat ? withDraft({ chat }) : { error: 'no such chat' }); return true }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    body(req).then(async input => {
      if (m[2] === 'lock' || input.pick === 'lock') return json(res, 200, await lockChat(m[1]))
      if (m[2] === 'unlock') return json(res, 200, withDraft({ chat: await chats.update(m[1], c => { unlock(c, String(input.key || '')) }) }))
      json(res, 200, await turnOf(m[1], input))
    }).catch(err => fail(res, err))
    return true
  }
  routes.chats = chats
  return routes
}
