// The planner conversation's routes (docs/specs/27-plan-conversation.md, engine/talkplan.mjs).
// A talk is a chat (engine/chats.mjs, spec 29 §Store): nothing is built, painted or paid for while it
// is Open. Locking a game chat makes its plan (or re-plans the one it has) and opens the Plan board.
//   GET  /api/talk                       -> { chats }  the loose chats, newest first
//   POST /api/talk { kind, said }        -> { chat, turn }  a new chat and the planner's first turn
//   GET  /api/talk/:id                   -> { chat, draft?, starts? }  draft: a game chat's plan as it stands;
//                                           starts: a locked one's parts to work on next (startsOf)
//   POST /api/talk/:id { said?, pick?, again?, brief?, soft? } -> { chat, turn, draft?, plan?, failed? }  failed: why the planner's model
//                                           did not answer this turn ({code, message, action}); again: the same words
//                                           after such a turn, which is taken back first. brief: the brief as it stands in
//                                           its box, with a pick on it; soft: typed words that are taken only when they
//                                           answer the brief's question (turn: null otherwise). pick is a chip's id ("art:2d", "talk",
//                                           "lock", "do:paint"); plan: the plan an action changed (the board shows it)
//   POST /api/talk/:id/lock              -> the same as the pick "lock"
//   POST /api/talk/:id/unlock { key? }   -> { chat }
//   GET  /api/talk/plan/:planId          -> { chat, draft?, step? }  the plan's own chat (one is made for a plan with none)
//
// A game chat with a plan is one state with that plan (owner, 2026-11-14): its Lock is the Plan board's Lock (the
// gate, at the price the board shows), and every option whose label is an action runs it through the board's own
// routes (plans.act): lock, paint a sheet, pick on a sheet, paint, switch the engine. "lock", "do it" and "go" run
// the next step's first option; "hero 1 is 4, hero 2 is 7" picks on the sheet that waits. Each answer says what
// really happened, then the one next step (engine/gamestep.mjs).
// "Install Godot 4" (or "install godot" typed) installs it: only that press or those words start it, the turn waits
// on it like a painting, and when it ends the chat gets one more turn that says what happened (settle).
import { chatStore, CHAT_ID } from '../engine/chats.mjs'
import { say, lock, unlock, planInput, draftOf, startsOf, wordsDecide, openQuestions } from '../engine/talkplan.mjs'
import { nextStep, planFacts, goWords, readPicks, pieces, lockLabel, godotOptions, installLine, sheetKinds, stepLineFor } from '../engine/gamestep.mjs'
import { planView, stageCount } from '../engine/plan.mjs'
import { starterSpec } from '../engine/starters.mjs'
import { pendingAsk, readAnswer } from '../engine/askfirst.mjs'
import { reasonFromTalk, reasonLine, isRaw } from '../engine/stopreason.mjs'

// model() -> (messages -> text) or null; env() -> { godot }; plans.fromTalk(input, planId) -> plan view;
// plans.act(id, sub, input) -> plan view (a Plan board action); godotCheck() looks for Godot 4 again -> boolean
// env() -> { godot, install }: install is godotInstall.state(); godotInstall.start() -> a promise of the install's
// end, { ok, version, note? } or { ok: false, why } (engine/godotinstall.mjs godotJob), or null: nothing to install with
// helpers() -> the chat's tool kit (engine/helpers.mjs, decision 0025 e), or null
// facts(chat) -> what is true of a website's or an app's build (engine/chatstep.mjs chatFacts), or null
// the order to install, and nothing longer: "install", "install it", "install godot 4", "yes, install it"
const INSTALL = /^\s*((ok(ay)?|yes|yeah|sure|please)[,!.\s]+)*(install|download)( it| godot( 4)?| the engine)?( now| please| for me)*[\s.!]*$/i
// "try again" is that order only right after an install failed (her last turn offered Try again)
const AGAIN = /^\s*(please\s+)?try( it)? again[\s.!]*$/i
// "check again", "I installed it", "it is installed now": the person says Godot is there, so the Studio looks
const LOOKED = /\b(check(ed)?( it)? again|look again|(i|i've|i have|already|just) (just |already )?installed|(it'?s|it is|is) (already |now )?installed)\b/i

// ---------- the person's words, read for the action they mean (owner, 2026-11-17; EVIDENCE.md failure 2)
// On the night of the Rank Juggler chat five messages in a row became no action at all, and the planner narrated
// them instead (turns 47 to 53): "i need better mocks please", "do it pls", "theyre not being repainted", "no
// rebuild the mocks first". The pick and chip guards were exact. The order was `goWords()`, a list that allows "do
// it" and stops at the courtesy "pls". Nothing read "mocks", so the one action the person kept asking for could not
// be reached in words at all, though its button was there. These read a message as three things and nothing more:
//   the order        "do it", "do it pls", "yes do that", "go ahead" — said politely, misspelled, or with other words
//   the parts        "better mocks", "repaint the backdrops", "redo the close-ups" — a part of the plan to paint again
//   the claim        "theyre not being repainted", "its not working", "that didnt happen" — something said NOT to have
//                    happened, which is a fact to check against the plan and answer with, never talk to narrate
// A part is a noun this app already uses for a kind of picture (engine/gamestep.mjs `pieces`, `planFacts` mocks and
// backdrops). Every one of them is painted by a route the Plan board already has (server/plans.mjs `act`), so a
// button made from them is a real button, and typed words reach the same route as the press does.
const PART_WORDS = [
  ['mock', 'mock', 'mocks', 'mockup', 'mockups', 'mock screen', 'mock screens', 'mock screenshot', 'mock screenshots', 'screen', 'screens', 'screenshot', 'screenshots'],
  ['backdrop', 'backdrop', 'backdrops', 'background', 'backgrounds', 'panorama', 'panoramas', 'sky', 'skybox', 'matte'],
  ['piece', 'close-up', 'close-ups', 'closeup', 'closeups', 'close up', 'close ups', 'sprite', 'sprites', 'character art', 'character', 'characters', 'cut-in', 'cut-ins', 'cutin', 'cutins', 'cut out', 'cut outs', 'cut-out', 'cut-outs', 'portrait', 'portraits', 'art']
]
// a word's boundary here is the ends of the message or a space or punctuation either side: a hyphen inside a word
// ("close-ups") is not one, and "arrow" is not "row"
const wordIn = (t, w) => new RegExp(`(?:^|[^a-z0-9-])${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=$|[^a-z0-9-])`).exec(t)
// an order: "do it", "do that", "go", "go ahead", "go on", "yes", "ok", "sure", "alright", "let's go", "start",
// "continue", "next", "lock it", "yes please", with the courtesy and the confirmation a person types around it
const COURTESY = /(?:^|\s)(?:pls|plz|please|thanks|thank you|for me)(?=\s|$)/g
const CONFIRM = /^(?:yes|yeah|yep|yup|sure|ok|okay|alright|right|ok then|then|now|and|so|well)$/i
const YES = /^(?:yes|yeah|yep|yup|sure|ok|okay|alright)$/i
const ORDERS = ['do it', 'do that', 'do this', 'go ahead', 'go on', 'go for it', 'go', 'lock', 'lock it', 'start', 'start it', 'continue', 'next', 'paint', 'paint it', 'let us go', 'lets go']
export function orderOf(text) {
  // the phrase a person types, its courtesies taken off: "do it pls", "ok do it", "yes, do that please"
  const t = String(text || '').toLowerCase().replace(/[!.,;:…?]+/g, ' ').replace(COURTESY, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  // "no" before the order is the person setting aside what was offered, not refusing the order after it ("no rebuild
  // the mocks first"); a message that is only "no" is a refusal, and stays talk
  const no = /^(?:no|nope|nah)\b/.test(t)
  const rest = (no ? t.replace(/^(?:no|nope|nah)\b/, ' ') : t).replace(/\s+/g, ' ').trim()
  if (!rest) return null
  // "yes" and "sure" are the confirmation, wherever they sit: "yes do that", "do it, ok". A message that is only one
  // of them is the order too ("yes", "ok", "sure"), as goWords already reads it — but "well" and "right" alone are not
  const said = rest.split(' ').filter(Boolean)
  const words = said.filter(w => !CONFIRM.test(w))
  if (!words.length) return said.every(w => YES.test(w)) ? 'yes' : null
  if (words.length > 3) return null
  const phrase = words.join(' ')
  for (const go of ORDERS) if (phrase === go) return go
  // "doit pls", "do itt": a typo that keeps the shape of the order
  if (/^do ?[it]+$/.test(words[0]) && words.length <= 2) return 'do it'
  return null
}
// a claim that what was asked has NOT happened: "theyre not being repainted", "it's not working", "that didnt
// happen", "nothing happened", "the mocks are not painted". It is checked against the plan's real state, never
// handed to the planner. The apostrophe is typed every way a keyboard has one: ' ´ ` and nothing.
const APOS = "['’`´]?"
const NOT_DONE = new RegExp(`(?:\\bnot\\b|\\bnever\\b|\\bn${APOS}t\\b|\\bdid ?n${APOS}o?t\\b|\\bhas ?n${APOS}o?t\\b|\\bhave ?n${APOS}o?t\\b|\\bis ?n${APOS}o?t\\b|\\bare ?n${APOS}o?t\\b|\\b(nothing|none|nobody|nowhere)\\b)`, 'i')
const CONTRACT = new RegExp(`\\b(did|does|do|is|are|was|were|has|have|had|would|could|should|wo|ca|ai)n${APOS}t\\b`, 'i')
const WORKING = /\b(work(ing|s|ed)?|happen(ing|ed|s)?|paint(ed|ing)?|re-?paint(ed|ing)?|draw(n|ing)?|re-?draw(n|ing)?|built|build(ing)?|rebuil(t|ding)?|made|done|started|running|finished|render(ed|ing)?|appear(ed|ing)?|show(n|ing)?|land(ed|ing)?|updated?|refresh(ed|ing)?)\b/i
const ASKED = /^\s*(?:why|what|how|when|who|which|does|did|do|is|are|should|can|could|would)\b/i
const ASSERTED = /^\s*(?:that|it|they|this|these|those|nothing|nobody|none)\b/i
export function claimOf(text) {
  const t = String(text || '').trim()
  if (!WORKING.test(t) || /\?\s*$/.test(t)) return null
  const denied = NOT_DONE.test(t) || CONTRACT.test(t) || /\b(no|not)\b/i.test(t)
  if (!denied) return null
  // "didnt you repaint them?" is argued about, not asserted; "that didnt happen" is asserted
  return ASKED.test(t) && !ASSERTED.test(t) ? null : 'notdone'
}
// the parts a message names, in the order it named them; whether it is an order, and a claim about something not done
export function readWords(text) {
  const t = String(text || '').toLowerCase()
  const parts = []
  for (const [part, ...words] of PART_WORDS) {
    const at = words.map(w => wordIn(t, w)).filter(Boolean).map(m => m.index)
    if (at.length) parts.push({ part, at: Math.min(...at) })
  }
  const named = [...new Map(parts.map(p => [p.part, p])).values()].sort((a, b) => a.at - b.at).map(p => p.part)
  // "no rebuild the mocks first" begins with a no and is still an order: the no is about what was offered, and the
  // order is the rest of the sentence, even when the verb itself carries it ("rebuild the mocks"). `again` is that
  // verb itself (rebuild, repaint, redo); `wish` is a wish ("i need better mocks"), which is answered and offered,
  // never run behind their back — the one line between a message that orders and a message that asks for something.
  // the verb that orders on its own: "rebuild the mocks", "repaint the backdrops", "redo the close-ups"
  const again = /\b(again|redo|rebuild|repaint|re-?do|re-?paint|re-?build|redraw|re-?draw|remake)\b/i.test(t)
  const wish = !again && /\b(more|better|cooler|new|another|different|improve|fresher|nicer)\b/i.test(t) && named.length > 0
  return { order: !!orderOf(text) || (again && named.length > 0), parts: named, claim: claimOf(text), again, wish }
}

// viaHermes() -> the planner's model is reached through Hermes (a broken connection is then Hermes away)
export function talkRoutes({ dataDir, model = () => null, env = () => ({}), plans = null, godotCheck = null, godotInstall = null, helpers = () => null, facts = null, viaHermes = () => false, appOf = () => null }) {
  // What the app engine says about this chat's build (issue #666). nextStep needs it to offer the build itself
  // instead of only "Read the plan", and to say why a build failed. Read fresh each turn, never cached here.
  const stepEnv = chat => ({ ...env(), app: appOf(chat.run || chat.plan || null) })
  // a game talk that joins a project takes its plan's art references there (engine/planrefs.mjs)
  const chats = chatStore({ dataDir, onMove: (chat, pid) => { if (chat?.plan) plans?.carry?.(chat.plan, pid) } })
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = (req, cap = 1e5) => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > cap) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  // A failure never goes back as it was thrown (engine/stopreason.mjs): `reason` is {code, message, action} in plain
  // words. A refusal this file words itself (it carries a status) keeps its words; anything else is read as a failed
  // call, and its own text stays in the server's log.
  const whyOf = err => {
    const text = String(err?.message || err)
    if (err?.status && !isRaw(text)) return { code: 'studio', message: `${text.charAt(0).toUpperCase()}${text.slice(1).replace(/\.$/, '')}.`, action: '' }
    console.warn('talk:', text.slice(0, 400))
    return reasonFromTalk(err, { viaHermes: viaHermes() })
  }
  const fail = (res, err) => { const reason = whyOf(err); json(res, err.status || 400, { error: reasonLine(reason), reason }) }
  // a game chat carries its plan as it stands, so the board beside the chat takes shape while they talk
  const withDraft = out => out.chat?.kind === 'game' ? { ...out, draft: planView(draftOf(out.chat, env())) } : out
  // a game chat with its plan: the real next step, from the plan file (engine/gamestep.mjs)
  const planOf = chat => chat?.kind === 'game' && chat.plan && plans?.get ? plans.get(chat.plan) : null
  const withStep = out => {
    const plan = planOf(out.chat)
    if (!plan) return out
    let step = nextStep(out.chat, plan, env())
    // an install just ended and nothing was said since: the step is the turn that says how it ended
    const last = out.chat.turns?.at(-1)
    // (only while it is still true: the success while its next step is still the plan's, the failure while the
    // Godot question is still open; the board or another chat may have moved things since)
    const holds = last?.settled === 'godot' && !step.wait && (last.text.startsWith('Nothing happened') ? step.options[0]?.id === 'do:godot' : last.text.endsWith(step.text))
    if (holds) step = { ...step, text: last.text, options: last.options || [] }
    return { ...out, step, starts: startsOf(plan) }
  }
  const turnOf = (id, input) => chats.update(id, async chat => {
    // the brief as the person left it in its box, when a pick on the brief answers the question before a build
    if (chat.kind !== 'game' && typeof input.brief === 'string' && input.brief.trim() && (String(input.pick || '').startsWith('go:') || input.soft === true) && pendingAsk(chat)) chat.ask = { ...(chat.ask || {}), brief: input.brief.trim().slice(0, 8000), at: Date.now() }
    // the planner's model, heard: a call that fails is caught inside the turn (engine/talkplan.mjs goes on with the
    // plan's own next step), so the failure is kept here and goes back beside the turn as `failed`, never in the chat file
    const ask = model()
    let failed = null
    // Try again after a turn whose model failed: that turn (the person's words and the step said without the
    // model) is taken back first, so the same words are in the chat once
    const words = String(input.said || '').slice(0, 4000)
    if (input.again === true && words && chat.turns.length >= 2 && chat.turns.at(-1).who === 'planner' && chat.turns.at(-2).who === 'person' && chat.turns.at(-2).text === words) chat.turns.splice(-2)
    const heard = ask && (async messages => { try { return await ask(messages) } catch (err) { failed = err; throw err } })
    const turn = await say(chat, { said: String(input.said || '').slice(0, 4000), pick: String(input.pick || '').slice(0, 120) }, { model: heard, env: env(), plan: planOf(chat), facts: chat.kind !== 'game' && facts ? await facts(chat) : null, helpers: helpers() ? { kit: helpers(), ctx: { project: chat.project || null, run: chat.run || null, plan: chat.plan || null, chat: chat.id } } : null })
    return failed ? { chat, turn, failed: whyOf(failed) } : { chat, turn }
  }).then(withDraft)

  // ---------- what a game chat's words or chip ask the server to do, or null for talk
  // Every action here is a route the Plan board already runs (server/plans.mjs act): the words are read for the
  // route they mean, never for a reply. A message that is not an order and names a part runs nothing by itself: it
  // is answered with the plan's real state and that part's own button offered (shownStep, below).
  function actionOf(chat, { said = '', pick = '' }) {
    if (chat.kind !== 'game' || !plans?.act) return null
    if (pick === 'lock' || pick.startsWith('do:')) return pick
    const plan = planOf(chat)
    if (!said) return null
    if (!plan) return orderOf(said) && chat.spec ? 'lock' : null
    const step = nextStep(chat, plan, stepEnv(chat))
    const ids = step.options.map(o => o.id)
    const words = readWords(said)
    const part = partOf(chat, plan, said)
    // A wish about a part ("i need better mocks please") and a claim about it ("theyre not being repainted") are
    // ANSWERED: 'do:answer' runs no route and paints nothing, and the turn that says the part's real state offers the
    // action their words imply. A plan not locked yet has no part painted, so nothing to answer with or offer: those
    // words stay talk. An order is below, and runs.
    if (plan.gate?.locked && (words.wish || claimOf(said)) && part && !step.install && !ids.includes('do:godot')) return 'do:answer'
    // the Godot question: "check again" looks, "install" installs. "go" and "yes" never start a download: the
    // question is asked again with its buttons. While it installs, a word about it gets the line it is at.
    if (step.install && /\b(install|godot)/i.test(said)) return 'do:next'
    if (ids.includes('do:godot') && LOOKED.test(said)) return 'do:godot:check'
    // the order, however it is said: "do it", "do it pls", "yes do that", "go ahead", "no rebuild the mocks first".
    // It runs the part they have been asking for (their own words for it, "i need better mocks please", or the
    // button they pressed), and only when there is none, the plan's own next step as "do it" always did.
    if (words.order) {
      if (ids[0] === 'do:godot') return 'do:next'
      // The part is already resolved by partOf (their own words, or the part they asked for just before), so nothing
      // is guessed again here: "go ahead" with no part said is the plan's own next step, and "do it pls" right after
      // "i need better mocks please" is the mocks. A part can only run where the plan is locked: before that, its
      // routes are the board's own, and the order is the plan's next step (its Lock).
      const asked = plan.gate?.locked && part ? repaintOf(plan, part) : null
      if (asked) return asked
      return ids[0] && (ids[0] === 'lock' || ids[0].startsWith('do:')) ? ids[0] : 'do:next'
    }
    if (step.sheet && readPicks(said, step.sheet, planFacts(plan).cast).length) return 'do:typed'
    const engine = wordsDecide(said).engine
    // "the browser is fine", while the Godot question is the open one — including WHILE IT INSTALLS, when the step
    // carries no options at all (its line is the install's progress, engine/gamestep.mjs `installLine`). The option
    // ids were the only guard, so mid-install the words fell through to the planner and were answered as talk
    // instead of choosing the browser (#644's leftover). `step.install` is that state; `settle` already gives way
    // when the person went on with the browser meanwhile (`chat.godot !== 'installing'`), so the choice sticks.
    if ((ids.includes('do:browser') || ids.includes('do:godot') || step.install) && engine === 'web') return 'do:browser'
    // only an order installs ("install", "install godot", "ok, install it", "try again"): a question, a "don't" or
    // the word Godot alone is talk
    const offered = [...chat.turns].reverse().find(t => t.who === 'planner')?.options || []
    if (ids.includes('do:godot') && (INSTALL.test(said) || (AGAIN.test(said) && offered.some(o => o.id === 'do:godot' && o.label === 'Try again')))) return 'do:godot'
    return null
  }

  // A part of the plan, painted again: the route that paints it (server/plans.mjs act), or null when the plan paints
  // it not at all (no backdrops, in a plan that has none). `mock`, `backdrop` and `piece` are the parts
  // engine/gamestep.mjs already names (`pieces`, `planFacts` mocks and backdrops), so a word the person types reaches
  // the same route the board's own button does.
  const PAINT = { mock: 'do:mocks', piece: 'do:paint', backdrop: 'do:backdrops' }
  function repaintOf(plan, part) {
    if (part === 'piece') return pieces(plan).total ? 'do:paint' : 'do:closeups'
    if (part === 'backdrop') return plan.shape?.backdrops === false ? null : 'do:backdrops'
    return PAINT[part] || null
  }
  // The part an action paints, back to the part's own name (do:mocks is the mock screens)
  const PART_OF = { 'do:mocks': 'mock', 'do:backdrops': 'backdrop', 'do:paint': 'piece', 'do:closeups': 'piece' }
  function partOf(chat, plan, said, action = '') {
    const w = readWords(said)
    for (const p of w.parts) if (stateOf(plan, p)) return p
    if (PART_OF[action]) return PART_OF[action]
    const claimed = !!claimOf(said)
    // A claim about no named part ("theyre not being repainted") is about what is on the board now, so the plan's own
    // step comes first: the part they would be looking at as they said it. Only then what they pressed or asked for
    // in the message just before — never the chat's first message, which is its idea ("pixelated characters and
    // fighters") and not something anybody is looking at.
    if (claimed) {
      const id = (nextStep(chat || {}, plan, env()).options || [])[0]?.id
      if (PART_OF[id]) return PART_OF[id]
    }
    // A bare order ("go ahead", "do it") with no part in its own words is the plan's own next step, as it always was.
    // The one thing that turns it to another part is a message just before that ASKED for a part ("i need better
    // mocks please", then "do it pls"): that is what the person is talking about. The chat's opening brief is not —
    // it is the idea ("pixelated characters and fighters"), and it never decides what "go ahead" means.
    const last = (chat?.turns || []).filter(t => t.who === 'person').at(-1)
    const b = readWords(String(last?.text || ''))
    const asking = /(need|want|please|pls|make|could|can|would|should)/i.test(String(last?.text || ''))
    if (asking && !b.order) for (const p of b.parts) if (stateOf(plan, p)) return p
    if (!claimed) return null
    // nothing left to paint: still the last part the plan paints, because the truth about it IS the answer
    return ['mock', 'backdrop', 'piece'].find(p => stateOf(plan, p)) || null
  }

  // ---------- the truth about a part of the plan, for the answer
  // "theyre not being repainted" (turn 51) has an answer in the plan file: how many mock screens are painted, what is
  // painting now, what is left. Saying that truth is what makes a claim checkable rather than a thing to argue with.
  // A part's own done, left and painting is wanted from engine/gamestep.mjs `planFacts` (a sibling stream is adding
  // `pictures` there); until it lands, this reads the plan's own lists. When it does, this is deleted, not kept.
  function stateOf(plan, part) {
    const done = e => e?.state === 'done'
    const mocks = plan.mocks || [], backs = plan.backdrops || []
    const stages = stageCount(plan)
    const per = Math.max(1, parseInt(plan.settings?.backdropsPerStage, 10) || 3)
    if (part === 'mock') {
      const total = (plan.art?.shots?.length ?? 5)
      const left = Math.max(0, total - mocks.filter(done).length)
      return { part, name: 'mock screens', what: 'the mock screens', total, done: mocks.filter(done).length, left, painting: mocks.filter(m => m.state === 'painting').length }
    }
    if (part === 'backdrop') {
      if (plan.shape?.backdrops === false) return null
      const total = stages * per
      return { part, name: 'backdrops', what: 'the backdrops', total, done: backs.filter(done).length, left: Math.max(0, total - backs.filter(done).length), painting: backs.filter(b => b.state === 'painting').length }
    }
    const p = pieces(plan)
    return { part: 'piece', name: p.what, what: `the ${p.what}`, total: p.total, done: p.done, left: Math.max(0, p.total - p.done), painting: p.painting.length }
  }
  // One sentence of the plan's real state for the part a message named, so the reply is a fact and not a narration.
  // claim: the person's own sentence was that it had NOT happened ("theyre not being repainted"): it is answered the
  // way it was asked, in their words, with what the plan file really says.
  function saidState(plan, part, { claim = false } = {}) {
    const s = stateOf(plan, part)
    if (!s) return `This game's plan has no ${part === 'backdrop' ? 'backdrops' : part === 'mock' ? 'mock screens' : 'pictures'} to paint.`
    if (!s.total) return `There are no ${s.name} in this plan to paint.`
    const paintingNow = s.painting ? ` ${s.painting === 1 ? 'One is' : `${s.painting} are`} painting now.` : ''
    if (claim) {
      if (s.done >= s.total && !s.painting) return `They are painted now: all ${s.done} ${s.name}.`
      return `They are not: ${s.done} of ${s.total} ${s.name} painted.${paintingNow}`
    }
    const cap = s.what[0].toUpperCase() + s.what.slice(1)
    if (!s.done) return `${cap}: nothing painted yet.${paintingNow}`
    return `${cap}: ${s.done} of ${s.total} painted${s.left ? `, ${s.left} not painted yet` : ''}.${paintingNow}`
  }
  // The button for a part, named by what it will really do to this plan, and running the route the board's own
  // button runs. The person's own word decides which is offered: "better mocks" is the mocks drawn again even when
  // the plan has nothing left to paint of them (engine/planart.mjs addMocks draws them all again); "paint the
  // mocks" is whatever the plan still has to paint.
  function offerOf(plan, part, again = false) {
    const s = stateOf(plan, part)
    const route = s && repaintOf(plan, part)
    if (!route) return null
    const many = n => part === 'backdrop' ? `${n} ${n === 1 ? 'backdrop' : 'backdrops'}` : `${n} ${n === 1 ? 'picture' : part === 'mock' ? 'mocks' : 'pictures'}`
    if (part === 'mock') return { id: route, label: again || !s.left ? `Repaint these ${many(s.done || s.total)}` : `Paint the mock screens · ${many(s.left)}`, why: '', made: [] }
    if (part === 'backdrop') return { id: route, label: again || !s.left ? 'Repaint the backdrops' : `Paint the backdrops · ${many(s.left)}`, why: '', made: [] }
    return { id: route, label: again || !s.left ? 'Repaint the close-ups' : `Paint · ${many(s.left)}`, why: '', made: [] }
  }

  // The plan locked, as the board's Lock does: the chat's decisions make the plan first when there is none (or they
  // changed since), then the gate locks at the price the board shows. Credits are spent only at a price the chat
  // showed in its last turn; a plan that costs pictures only locks at once.
  async function lockAll(chat, shown) {
    let plan = planOf(chat)
    let made = false
    if (!plan || chat.stale) {
      lock(chat, { env: env() })
      plan = await plans.fromTalk(planInput(chat), chat.plan)
      chat.plan = plan.id
      chat.stale = false
      if (chat.spec) chat.spec.starter = starterSpec(plan)
      made = true
    }
    if (plan.gate?.locked) return { plan, said: 'The plan was already locked.' }
    const pr = plan.price
    if (pr.credits && shown?.credits !== pr.credits) return { plan, said: `${made ? 'The plan is made. ' : ''}It costs ${pr.credits} Meshy credits${pr.images ? ` and ${pr.images} pictures` : ''}.`, ask: true }
    plan = await plans.act(plan.id, 'lock', { credits: pr.credits })
    chat.state = 'locked'
    chat.spec ||= { brief: plan.summary || '', open: [], art: [], engine: '', time: '', cost: null, lockedAt: null }
    chat.spec.lockedAt = Date.now()
    chat.spec.cost = { pictures: pr.images, credits: pr.credits }
    return { plan, said: `Locked at about ${pr.images} pictures${pr.credits ? ` and ${pr.credits} Meshy credits` : ', no credits'}.` }
  }

  // set one cell for one hero (or any pick on another sheet): the hero's old cell lets go first
  async function pickOn(plan, sheetId, cell, who) {
    const s = (plan.sheets || []).find(x => x.id === sheetId)
    if (!s) throw Object.assign(new Error('that sheet is gone'), { status: 404 })
    if (who) for (const [c, n] of Object.entries(s.notes || {})) if (n === who && Number(c) !== cell) plan = await plans.act(plan.id, 'pick', { sheet: sheetId, cell: Number(c), on: false })
    return plans.act(plan.id, 'pick', { sheet: sheetId, cell, on: true, ...(who ? { note: who } : {}) })
  }

  // run one action; returns what happened, in one sentence (or throws, and the answer says why nothing happened)
  async function perform(chat, action, said) {
    let plan = planOf(chat)
    const last = [...(chat.turns || [])].reverse().find(t => t.who === 'planner')
    if (action === 'lock') return lockAll(chat, last?.price)
    if (!plan) throw Object.assign(new Error('lock the plan first'), { status: 409 })
    if (action === 'do:next') return { plan, said: '' }
    // the answer to what they said, changing nothing: the plan as it stands is the whole of it (shownStep says it)
    if (action === 'do:answer') return { plan, said: '' }
    // Build the game (issue #666): the App room's own button, which the page runs (web/canvas/talk.js stepRun).
    // Nothing is built here, and the chat does not pretend it was: `act` is what tells the page to run it.
    if (action === 'do:app') return { plan, said: '', act: 'do:app' }
    if (action === 'do:godot' || action === 'do:godot:check') {
      // look first, both ways: a Godot the person installed themselves is used as it is
      const found = godotCheck ? !!godotCheck() : !!env().godot
      if (found) { chat.godot = 'install'; return { plan, said: 'Godot 4 is installed: the game builds as a Godot 4 project.' } }
      if (action === 'do:godot:check' || !godotInstall) return { plan, said: 'Godot 4 is still not on this computer.', godot: true }
      // the press is the yes: the install starts (or this chat joins the one running) and the turn waits on it
      const flight = godotInstall.start()
      // one that ends at once (no download for this kind of computer) is answered in this turn
      const quick = await Promise.race([flight, new Promise(r => setTimeout(r, 30, null))])
      if (quick) {
        const found = !!quick.ok && (godotCheck ? !!godotCheck() : true)
        if (found) chat.godot = 'install'
        return found ? { plan, said: installedLine(quick) } : { plan, said: failedLine(quick), godot: 'failed', route: quick.route }
      }
      chat.godot = 'installing'
      settle(chat.id, flight)
      return { plan, said: '' }
    }
    if (action === 'do:browser') {
      const wasLocked = !!plan.gate?.locked
      plan = await plans.act(plan.id, 'starter', { key: 'engine', value: 'web' })
      // the engine is not a price: a gate the switch reopened locks again at the same price
      if (wasLocked && !plan.gate?.locked && !plan.price.credits) plan = await plans.act(plan.id, 'lock', { credits: 0 })
      chat.godot = 'web'
      chat.decisions.engine = { value: 'web', why: 'Browser is fine', by: 'person', turn: chat.turns.at(-1)?.id || null }
      return { plan, said: 'The game builds for the browser.' }
    }
    if (action.startsWith('do:skip:')) { chat.skip = [...new Set([...(chat.skip || []), action.slice(8)])]; return { plan, said: '' } }
    if (action.startsWith('do:sheet:')) { plan = await plans.act(plan.id, 'sheet', { kind: action.slice(9) }); return { plan, said: '' } }
    if (action.startsWith('do:cell:')) {
      const [, , sheet, cell, ...who] = action.split(':')
      plan = await pickOn(plan, sheet, Number(cell), who.join(':') || null)
      return { plan, said: `Picked ${Number(cell) + 1}${who.length ? ` for ${who.join(':')}` : ''}.` }
    }
    if (action === 'do:typed') {
      const step = nextStep(chat, plan, stepEnv(chat))
      const got = readPicks(said, step.sheet, planFacts(plan).cast)
      for (const p of got) plan = await pickOn(plan, step.sheet.id, p.cell, p.who)
      return { plan, said: `Picked ${got.map(p => `${p.cell + 1}${p.who ? ` for ${p.who}` : ''}`).join(', ')}.` }
    }
    if (action === 'do:paint') { plan = await plans.act(plan.id, pieces(plan).sub, {}); return { plan, said: '' } }
    if (action === 'do:mocks') { plan = await plans.act(plan.id, 'mocks', {}); return { plan, said: '' } }
    if (action === 'do:backdrops') {
      if (!plan.style?.locked) plan = await plans.act(plan.id, 'style', { locked: true })
      plan = await plans.act(plan.id, 'backdrops', {})
      return { plan, said: '' }
    }
    throw Object.assign(new Error('no such action'), { status: 404 })
  }

  // When the install a chat waits on ends, the chat gets the turn that says what happened: installed, with the
  // version that ran and the plan's real next step, or "Nothing happened" with the reason and the way on.
  // The templates are the other half of a Web export, and a second, larger download (engine/godotinstall.mjs
  // installTemplates): the line says which of the two happened, because only one of them lets a game be played
  const installedLine = r => [r.note || '',
    `Godot ${r.version || 4} is installed: the game builds as a Godot 4 project.`,
    r.templates?.ok === false ? `Its Web export templates did not install (${r.templates.why}), so the game cannot be played yet: press Install Godot 4 again to get them.` : ''
  ].filter(Boolean).join(' ')
  const failedLine = r => `Nothing happened: ${String(r?.why || 'Godot is installed but the Studio cannot find it').replace(/\.$/, '')}.`
  const settling = new Set()
  function settle(id, flight) {
    if (settling.has(id)) return
    settling.add(id)
    Promise.resolve(flight).then(r => chats.update(id, chat => {
      const plan = planOf(chat)
      // the person went on with the browser meanwhile, or the plan is gone: nothing more to say here
      if (chat.godot !== 'installing' || !plan) return
      const found = !!r?.ok && (godotCheck ? !!godotCheck() : true)
      if (found) chat.godot = 'install'
      else delete chat.godot
      const step = nextStep(chat, plan, stepEnv(chat))
      const text = found ? `${installedLine(r)} ${step.text}` : failedLine(r)
      chat.turns.push({ id: `t${chat.turns.length + 1}`, who: 'planner', at: Date.now(), text, options: found ? step.options : godotOptions(true, r?.route), step: true, plan: plan.id, settled: 'godot', ...(found && step.wait ? { wait: true } : {}), ...(found && step.sheet ? { sheet: step.sheet } : {}), refs: [], marks: [], layers: [], made: [], reads: [] })
    })).catch(() => {}).finally(() => settling.delete(id))
  }

  // one action from the chat: the person's turn, what happened, and the next step, in one write
  const actTurn = (id, input, action) => chats.update(id, async chat => {
    const said = String(input.said || '').slice(0, 4000).trim()
    const pick = String(input.pick || '')
    const last = [...chat.turns].reverse().find(t => t.who === 'planner')
    const label = (last?.options || []).find(o => o.id === pick)?.label || (pick === 'lock' ? 'Lock' : '')
    const now = Date.now()
    chat.turns.push({ id: `t${chat.turns.length + 1}`, who: 'person', at: now, text: said || label || pick, ...(pick ? { pick } : {}), refs: [], marks: [], layers: [] })
    let out = null, why = ''
    try { out = await perform(chat, action, said) } catch (err) { why = isRaw(err.message || err) ? `Nothing happened. ${reasonLine(whyOf(err))}` : `Nothing happened: ${String(err.message || err).replace(/\.$/, '')}.` }
    const plan = out?.plan ? (plans.get(out.plan.id) || out.plan) : planOf(chat)
    const turn = { id: `t${chat.turns.length + 1}`, who: 'planner', at: now, text: '', refs: [], marks: [], layers: [], made: [], reads: [] }
    if (!plan) {
      // no plan could be made (a question is still open): it is asked, with its options
      const q = openQuestions(chat, env())[0]
      Object.assign(turn, q ? { text: `The plan is not made yet. ${q.text}`, options: q.options } : { text: why || 'The plan is not made yet: say what to change.' })
      chat.turns.push(turn)
      return { chat, turn }
    }
    let step = nextStep(chat, plan, stepEnv(chat))
    // the install this turn started ended in the instant since: the turn still waits, and the next look finds the
    // turn that says how it ended (settle)
    if (chat.godot === 'installing' && action.startsWith('do:godot') && !step.wait) step = { text: installLine(env().install?.state === 'installing' ? env().install : {}), options: [], wait: true, install: { pct: null } }
    if (out?.godot) step.options = godotOptions(out.godot === 'failed', out.route)
    if (out?.ask) step.options = [{ id: 'lock', label: lockLabel(plan.price), why: '', made: [] }, { id: 'talk', label: 'Keep talking', why: '', made: [] }]
    // What their own sentence is about: its real state, and its own button first, ahead of whatever the plan would
    // offer next. The button is the same route the board runs, so typed words and the press reach one plan (offerOf);
    // a painting step still offers nothing while it paints. One reading (partOf) decides this and the action above.
    const named = !out?.godot && !out?.ask ? partOf(chat, plan, said, action) : null
    const part = named && (action === 'do:answer' || repaintOf(plan, named)) ? named : null
    // the part's own button goes first: on an answer turn it is the whole offer (their sentence as an action), and on
    // a turn that ran something it is what they asked for ahead of what the plan would offer next
    if (part) {
      const offer = offerOf(plan, part, readWords(said).again || readWords(said).wish)
      if (offer && !step.install && (action === 'do:answer' || step.options.length)) step = { ...step, options: [offer, ...step.options.filter(o => o.id !== offer.id)] }
    }
    // the part's own state, in the reply: the whole of it on a turn that only answers, and otherwise a sentence before
    // the plan's next step — unless the step is itself about that part ("Painting the close-ups now"), where it would
    // only say the same thing twice
    const aboutPart = !!part && (action === 'do:answer' || (PART_OF[action] !== part && !step.wait))
    const saidPart = aboutPart && !out?.godot ? saidState(plan, part, { claim: !!claimOf(said) }) : ''
    // The step's line ends the reply, but not twice in a row (engine/gamestep.mjs stepLineFor): on the night it was
    // stapled onto nine replies alike ("Painting the backdrops now. It shows on the board as it lands.", turns 46 to
    // 54), even the one that said the mocks had not been repainted. The step is still the end of every reply, with its
    // buttons; only the sentence is dropped. A press or an order keeps it, because there the sentence IS the answer the
    // person just asked for again ("go" at the open question). A turn left with nothing to say says that.
    const kept = why || out?.said || ''
    // A press of a button, or a word about the install running, is the person asking for THIS, now, so the step (or the
    // install's own line) is said again in full: the Godot question's answer is the question restated with its buttons
    // (tests/rankjuggler.test.mjs). Free-typed words are not that: "i need better mocks please" typed five times is five
    // people asking for the same thing, and the reply must not end on the same sentence five times over. Those go
    // through stepLineFor, which drops the line when the turn before already ended on it.
    const pressed = !!pick || action === 'do:next'
    // What this turn says of its own, all of it: the planner's words, the reason nothing happened, and the part's state.
    // stepLineFor asks whether the turn BEFORE already ended on this line, and the reply's own part decides whether this
    // one has something else to say. Both the part and the step sentence are needed: a part readout alone is not the
    // planner's own words, and counting it as such is what let the same two sentences repeat five replies in a row.
    const own = [kept, saidPart].filter(Boolean).join(' ')
    const stepLine = out?.godot ? '' : pressed && !saidPart ? step.text : stepLineFor(chat, step, own)
    const nothing = !stepLine && !kept && !saidPart ? 'Nothing has changed since the last turn: the same step is open.' : ''
    const text = [kept, saidPart, nothing || stepLine].filter(Boolean).join(' ')
    Object.assign(turn, { text, options: step.options, step: true, plan: plan.id, ...(step.wait ? { wait: true } : {}), ...(step.install ? { install: step.install } : {}), ...(step.sheet ? { sheet: step.sheet } : {}), ...(step.price || out?.ask ? { price: plan.price } : {}) })
    chat.turns.push(turn)
    // the chat's lock is the gate's: one state
    chat.state = plan.gate?.locked ? 'locked' : 'open'
    return { chat, turn, plan, ...(out?.act ? { act: out.act } : {}) }
  })

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
    // a plan's own chat, for the Plan board's dock (web/planchat.js): the one that points at it, or one made for it
    const pm = url.pathname.match(/^\/api\/talk\/plan\/([^/]+)$/)
    if (pm && req.method === 'GET') {
      const plan = plans?.get?.(pm[1])
      const chat = plan && chats.forPlan(plan)
      json(res, chat ? 200 : 404, chat ? withStep(withDraft({ chat })) : { error: 'no such plan' })
      return true
    }
    const m = url.pathname.match(/^\/api\/talk\/([^/]+)(?:\/(lock|unlock))?$/)
    if (!m) return false
    if (!CHAT_ID.test(m[1])) { json(res, 404, { error: 'no such chat' }); return true }
    if (req.method === 'GET' && !m[2]) { const chat = chats.get(m[1]); json(res, chat ? 200 : 404, chat ? withStep(withDraft({ chat })) : { error: 'no such chat' }); return true }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST' }); return true }
    body(req).then(async input => {
      if (m[2] === 'unlock') return json(res, 200, withDraft({ chat: await chats.update(m[1], c => { unlock(c, String(input.key || '')) }) }))
      const chat = chats.get(m[1])
      if (!chat) return json(res, 404, { error: 'no such chat' })
      if (m[2] === 'lock' && chat.kind !== 'game') return json(res, 200, { chat: await chats.update(m[1], c => { lock(c, { env: env() }) }) })
      // soft: words typed while a brief shows the question before a build as its answers. Only an answer ("skip
      // all", "step by step", "build it") is taken; a question and anything else is for the talk, and nothing is written here
      if (input.soft === true && chat.kind !== 'game') { const asked = pendingAsk(chat); if (!asked || /\?/.test(String(input.said || '')) || !readAnswer(String(input.said || ''), asked)) return json(res, 200, { chat, turn: null }) }
      const action = m[2] === 'lock' ? 'lock' : actionOf(chat, { said: String(input.said || ''), pick: String(input.pick || '') })
      if (action) return json(res, 200, withDraft(await actTurn(m[1], input, action)))
      json(res, 200, await turnOf(m[1], input))
    }).catch(err => fail(res, err))
    return true
  }
  routes.chats = chats
  return routes
}
