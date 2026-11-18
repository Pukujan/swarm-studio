// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): talks before a build: talk first, the game talk, Chats.
import { els, api, $, ico, commandOps, BASE } from './core.js'
import { viewing, setViewing } from './replay.js'
import { fresh, links } from './base.js'
import { botMsg, feed, failSay, hermesSays } from './panels.js'
import { esc } from './design.js'
import { nextRoute, slashPop, slashMatches, slashAt, renderSlash, pickSlash, setNextRoute, setSlashAt } from './loop.js'
import { runNow, shownRun, showRun } from './film.js'
import { paintSend, crewWait } from '../chatmode.js'
import { chatCards, chatCardsLine } from '../chatcards.js'

// ---------- talk first (engine/talkplan.mjs): the person asked not to build yet, or asked the crew
// a question. Hermia answers here in the chat, the conversation goes on in this dock, and nothing is
// built until they say build. Then the brief she writes from the talk shows here, editable, with
// Build and Keep talking; only Build starts anything. From the Make box the canvas is empty: a new
// project with nothing built yet. From a project's dock its pages stay and Build extends it.
// The talk is kept in a chat (spec 29, engine/chats.mjs): the server makes it on the first turn and
// answers with its id; an old chat opened from Studio home or a project's chats comes back here.
// ask: the chat's skip question before a website's build is open (decision 0020): words and picks answer it
// briefAsk: a brief on screen carries that question as its own answers: its text box (typed answers reach it too)
// retry: the message the planner did not answer, ready to be sent again (Try again, or typed)
export const talk = { on: false, busy: false, said: [], kind: 'site', build: null, dock: null, chat: null, from: null, plan: null, ask: false, briefAsk: null, retry: null }
// "try again" typed after a turn that failed is the Try again button
const AGAIN_WORDS = /^(?:please )?(?:try|say|send|ask)(?: it| that| this)? again(?: please)?[.!]?$|^retry[.!]?$/i
// while talking, the dock sends to Hermia: its button says Send, not the mode's word (web/chatmode.js
// writes the button: the mode can change while a talk is open)
function talkDock(on) {
  if (on && !talk.dock) { talk.dock = { ph: els.brief.placeholder }; els.brief.placeholder = 'Tell Hermia…' }
  if (!on && talk.dock) { els.brief.placeholder = talk.dock.ph; talk.dock = null }
  paintSend()
}
export const readTalk = (text, answerTo = '', kind = 'site') => api('/api/discuss/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, answerTo, kind }) })
  .then(r => r.json()).then(j => j.intent || 'build').catch(() => 'build')
// brief: nothing to talk about yet, the brief is shown at once to read, edit and Build (a showcase, or a
// Make box prompt): nothing is built, and no token is spent, until Build. what: one line on what Build makes.
// heard(text): told each line the person sends (the Studio takes its idea from the first). When it answers with
// words (a promise of them), the line was an answer to the Studio's own question (which pages, which pictures:
// web/scaffold.js, decision 0020): those words are Hermia's reply, and the planner is not asked
export function talkStart({ text = '', kind = 'site', build, blank = false, said = [], chat = null, from = null, brief = '', what = '', sheet = false, heard = null }) {
  if (blank) { setViewing('new'); fresh(null) }
  Object.assign(talk, { on: true, busy: false, said: [], kind, build, chat, from, plan: null, heard, ask: false, briefAsk: null, retry: null })
  talkDock(true)
  els.feed.querySelector('.empty-chat')?.remove()
  let last = null
  for (const m of said) {
    talk.said.push({ who: m.who, text: m.text + chatCardsLine(m.cards) })
    last = m.who === 'hermia' ? botMsg(m.text) : feed(null, m.text, 'you')
    if (m.who === 'hermia' && m.cards?.length) talkCards(last, m.cards, m.turn || null)
  }
  if (brief) { talk.said.push({ who: 'you', text: brief }); return talkBrief(brief, '', what, sheet) }
  if (text) return talkSay(text)
  // a game chat reopened: its open question's chips come back under the planner's last words
  if (kind === 'game' && chat) return gameResume(last)
  // a website's chat with its skip question open: the question's answers come back, not Build
  if (kind === 'site' && chat && last && said.at(-1)?.who === 'hermia') return siteResume(last)
  // an old chat reopened: its words are back, and the dock goes on from them, with the real next step
  if (last && said.at(-1)?.who === 'hermia') stepNow(last)
  // a new chat is never blank: Hermia's first line and the real first step, from the build's state (not while the
  // Studio's own question leads, `heard`)
  else if (!said.length && !heard && kind !== 'game') stepNow(null)
  els.brief.focus({ preventScroll: true })
}
// ---------- the real next step of a website's or an app's chat (engine/chatstep.mjs, the game chat's is
// engine/gamestep.mjs): what is true comes from the build's one state on the server, and every button under
// Hermia's answer runs what its label says, as the button of the same name elsewhere does. A typed "resume",
// "try again", "build the app" or "build it" is the same press (the server reads it: `act`). An action that fails
// says "Nothing happened: <why>" and offers the step again.
// the room the chat is in: the App room's chat is an app's, whatever kind the talk was opened as
const roomNow = () => (/** @type {any} */ (window).swarm?.view === 'app' ? 'app' : undefined)
const stepBody = () => ({ kind: talk.kind, ...(roomNow() ? { room: roomNow() } : {}), ...(talk.chat ? { chat: talk.chat } : {}), ...(talk.from ? { from: talk.from } : {}) })
/** @param {HTMLElement | null} item Hermia's last message, or null for a chat where nothing was said yet */
async function stepNow(item) {
  const chat = talk.chat
  const j = await api('/api/discuss/step', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...stepBody(), talked: !!item }) }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  if (!talk.on || talk.chat !== chat || talk.busy || els.feed.querySelector('.talk-acts')) return
  if (item) return j?.step ? stepActs(item, j.step) : talkActs(item)
  // nothing was said since: the first line still belongs at the top of an empty chat
  if (j?.first && !talk.said.length) stepActs(botMsg(j.first), j.step)
}
/** @param {HTMLElement} item  @param {{ options?: { id: string, label: string }[], run?: string | null }} step */
function stepActs(item, step) {
  const opts = step?.options || []
  if (!item || !opts.length) return
  const acts = document.createElement('div')
  acts.className = 'chips talk-acts'
  acts.innerHTML = opts.map((o, i) => `<button type="button" data-pick="${esc(o.id)}"${i ? '' : ' class="primary"'}>${esc(o.label)}</button>`).join('')
  acts.onclick = e => {
    // @ts-ignore
    const b = e.target.closest('[data-pick]')
    const o = b && opts.find(x => x.id === b.dataset.pick)
    if (o && !talk.busy) stepRun(o.id, step, o.label)
  }
  item.append(acts)
}
/** @param {string} id  @param {{ options?: { id: string, label: string }[], run?: string | null }} step  @param {string} [label] the pressed button's (typed words are already in the chat) */
async function stepRun(id, step, label = '') {
  // Build writes the brief from the talk; nothing starts until the brief's own answer
  if (id === 'do:brief') return talkSay('', true)
  els.feed.querySelectorAll('.talk-acts').forEach(x => x.remove())
  // Build the app: the App room's own button (web/canvas/rooms.js appAsk reads the words as that press)
  if (id === 'do:app') { talkEnd(); return commandOps.app?.({ ask: label || 'Build the app' }) }
  if (label) { talk.said.push({ who: 'you', text: label }); feed(null, label, 'you') }
  const run = step?.run || talk.from || shownRun()
  const way = id === 'do:resume' ? 'resume' : id === 'do:again' ? 'again' : ''
  const wait = botMsg('…', true)
  talk.busy = true
  const res = way && run ? await api(`/api/runs/${encodeURIComponent(run)}/${way}`, { method: 'POST' }).catch(() => null) : null
  const j = res ? await res.json().catch(() => ({})) : {}
  talk.busy = false
  wait.remove()
  if (!talk.on) return
  if (res?.status === 503 && j.hermes) return void hermesSays(j)
  if (!res?.ok) return stepActs(botMsg(`Nothing happened: ${String(j.error || (res ? `the Studio answered ${res.status}` : 'the Studio did not answer')).replace(/\.$/, '')}.`), step)
  talkEnd()
  showRun(j.run, { started: true })
}
// a chat from the store, as the talk keeps it: the person is 'you', the planner 'hermia'
export const saidOf = chat => (chat?.turns || []).filter(t => t.who !== 'crew').map(t => ({ who: t.who === 'planner' ? 'hermia' : 'you', text: t.text, ...(t.cards?.length ? { cards: t.cards, turn: t.id } : {}) }))
// what a tool Hermia used found (decision 0025 e): its cards under her message; a press answers as her next one
const talkCards = (/** @type {HTMLElement} */ item, /** @type {any[]} */ cards, /** @type {string | null} */ turn) => chatCards(item, { cards, chat: talk.chat, turn, base: BASE, api, said: text => { talk.said.push({ who: 'hermia', text }); botMsg(text) } })
export const talkEnd = () => { talk.on = false; talk.busy = false; talk.briefAsk = null; talkDock(false); els.feed.querySelectorAll('.talk-acts, .fail-turn .chips').forEach(x => x.remove()) }
export async function talkSay(text, brief = false) {
  // the turn before failed and this asks for it again: the same message is sent, nothing new is said
  const retry = talk.retry
  talk.retry = null
  if (retry && !brief && AGAIN_WORDS.test(String(text).trim())) { feed(null, text, 'you'); els.feed.querySelectorAll('.fail-turn .chips').forEach(x => x.remove()); return retry() }
  if (talk.kind === 'game') return gameSay({ said: text })
  if (talk.ask && !brief) return goSay({ said: text })
  // a brief with the question's answers on it: typed "skip all", "step by step" or "build it" answers it as a
  // press does (decision 0020); anything else is for Hermia, as before
  if (talk.briefAsk && !brief) {
    const box = talk.briefAsk
    if (talk.chat && box.value.trim() && await goSay({ said: text, brief: box.value.trim(), soft: true })) { box.disabled = true; return }
    talk.briefAsk = null
    if (!talk.on) return
  }
  // A picture pasted or attached is this turn's, whichever button sends it: it used to be taken only on the
  // plain send, so pressing "Build"/the brief threw the chip away and the crew never saw the screenshot the
  // person had just attached (the person, 2026-11-16: "i cant seem to send images ... it doesnt get sent").
  const media = links.take('ref')
  // layers dragged in (the Studio scaffold's Layers, web/layers.js): the planner is told what the turn is about
  const about = links.take('layer')
  let took = null, mine = null
  if (!brief) { talk.said.push({ who: 'you', text: about.length ? `${text}\n(About: ${about.map(c => c.name).join(', ')})` : text }); mine = feed(null, text, 'you', [...about, ...media].map(m => m.name).join(', ')); took = talk.heard?.(text) }
  els.feed.querySelectorAll('.talk-acts, .fail-turn .chips').forEach(x => x.remove())
  if (took && typeof took.then === 'function') {
    talk.busy = true
    const reply = await took.catch(() => null)
    talk.busy = false
    if (!talk.on) return
    if (typeof reply === 'string' && reply) { for (const m of [...media, ...about]) links.add(m); talk.said.push({ who: 'hermia', text: reply }); return void botMsg(reply) }
  }
  return talkSend(brief, media, mine, text)
}
// the planner is asked (again, when the turn before failed): the talk as it stands, with this turn's media
// mine, text: this turn's own bubble and words (none when the turn is sent again)
async function talkSend(brief, media, mine = null, text = '') {
  const wait = botMsg(brief ? 'Writing the brief…' : '…', true)
  talk.busy = true
  const res = await api('/api/discuss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ said: talk.said, kind: talk.kind, brief, ...(roomNow() ? { room: roomNow() } : {}), ...(media.length ? { refs: media.map(m => m.key) } : {}), ...(talk.chat ? { chat: talk.chat } : {}), ...(talk.from ? { from: talk.from } : {}) }) }).catch(() => null)
  const j = res ? await res.json().catch(() => ({})) : {}
  if (j.chat && talk.on) talk.chat = j.chat
  talk.busy = false
  wait.remove()
  if (!talk.on) return
  // no answer: the turn is not Hermia's. The reason, and the one thing that works: the same message again
  // (Check again when Hermes is away, Models when none is set). Never Build under an error.
  if (!res?.ok) {
    const again = () => { talk.retry = null; if (talk.on && !talk.busy) talkSend(brief, media) }
    talk.retry = again
    return void failSay(j.hermes ? { code: 'hermes', message: j.message, action: j.action } : j.reason, { again })
  }
  if (j.brief) return talkBrief(j.brief, j.route, '', false, j.options)
  // the typed words were the step's action ("resume", "build the app"): it runs, as its button does
  // (the App room shows the words itself when it takes them)
  if (j.act === 'do:app') { mine?.remove(); return stepRun(j.act, j.step, text) }
  if (j.act) return stepRun(j.act, j.step)
  talk.said.push({ who: 'hermia', text: j.heard || j.reply })
  const msg = botMsg(j.reply)
  if (j.cards?.length) talkCards(msg, j.cards, j.turn || null)
  if (j.step) stepActs(msg, j.step)
  else talkActs(msg)
}
// ---------- the skip question before a website's build (docs/decisions/0020-ask-before-build.md, engine/askfirst.mjs):
// Skip all, Step by step, or Pick steps to skip, the recommended one first. A pick or typed words answer it through
// /api/talk (engine/talkplan.mjs say), and the answer says what happens next: the build starts, or the Studio walk
// opens with the skipped steps marked. Only the person's press or words answer it.
const isAsk = turn => (turn?.options || []).some(o => String(o.id).startsWith('go:'))
async function siteResume(last) {
  const j = await api(`/api/talk/${encodeURIComponent(talk.chat)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  if (!talk.on) return
  const turn = j?.chat?.turns?.at(-1)
  // a new website's brief, kept with the question's answers on it: it comes back as the brief, to edit and answer
  if (!j?.chat?.go && turn?.who === 'planner' && turn.brief && isAsk(turn)) { last.remove(); return talkBrief(turn.text, '', '', false, turn.options) }
  if (!j?.chat?.go && turn?.who === 'planner' && isAsk(turn)) { talk.ask = true; return askActs(last, turn) }
  stepNow(last)
  els.brief.focus({ preventScroll: true })
}
function askActs(item, turn) {
  const opts = turn?.options || []
  if (!item || !opts.length) return
  const acts = document.createElement('div')
  acts.className = 'talk-acts talk-opts'
  acts.innerHTML = opts.map(o => `<button type="button" data-pick="${esc(o.id)}">${esc(o.label)}${o.why ? `<small>${esc(o.why)}</small>` : ''}</button>`).join('')
  acts.onclick = e => {
    // @ts-ignore
    const b = e.target.closest('[data-pick]')
    const o = b && opts.find(x => x.id === b.dataset.pick)
    if (o && !talk.busy) goSay({ pick: o.id, label: o.label })
  }
  item.append(acts)
}
// brief: the brief as it stands in its box, when the pick was made on the brief itself
// soft: typed words that may or may not answer the brief's question: nothing shows until the server says they do
// again: the same words or pick after a turn that failed (they were said once already)
// -> true when the words (or the pick) were taken
async function goSay({ said = '', pick = '', label = '', brief = '', soft = false, again = false }) {
  if (talk.busy || !talk.chat) return false
  const text = again ? '' : said || label
  const show = () => {
    if (text) { talk.said.push({ who: 'you', text }); feed(null, text, 'you') }
    els.feed.querySelectorAll('.talk-acts, .fail-turn .chips').forEach(x => x.remove())
    return botMsg('…', true)
  }
  let wait = soft ? null : show()
  talk.busy = true
  try {
    const j = await talkPost(`/api/talk/${encodeURIComponent(talk.chat)}`, { said, pick, ...(brief ? { brief } : {}), ...(soft ? { soft: true } : {}) })
    if (!talk.on) return true
    if (soft && !j.turn) return false
    if (soft) wait = show()
    talk.briefAsk = null
    const turn = j.turn || {}
    talk.said.push({ who: 'hermia', text: turn.text })
    const item = botMsg(turn.text)
    talk.ask = isAsk(turn)
    if (talk.ask) { askActs(item, turn); return true }
    if (turn.go) { goOn(turn.go, j.chat?.id || talk.chat); return true }
    talkActs(item)
    return true
  } catch (err) {
    // typed words that might have answered the brief: unanswered, they go on to the talk
    if (soft) return false
    // no answer: the reason and Try again, which sends the same words or pick (it was said once already)
    if (talk.on) { const again = () => { talk.retry = null; goSay({ said, pick, brief, again: true }) }; talk.retry = again; failSay(err.reason, { again }) }
    return true
  } finally { talk.busy = false; wait?.remove() }
}
// the answer: build now (this chat's brief, answered), or the Studio walk from it with the skipped steps marked
async function goOn(go, chat) {
  const brief = String(go.brief || '').trim()
  const build = talk.build
  talkEnd()
  if (go.path === 'all') {
    if (build) return build(brief, chat)
    setNextRoute({ fresh: true, chat }); els.brief.value = brief; return els.form.requestSubmit()
  }
  const skip = Array.isArray(go.skip) ? go.skip : []
  const start = skip.includes('brand') ? 'plan' : 'brand'
  const res = await api('/api/studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'site', idea: brief, chat, skip, start }) }).catch(() => null)
  const j = res ? await res.json().catch(() => ({})) : {}
  if (!res?.ok || !j.project?.id) return botMsg(j.error || 'The Studio did not open. Say it again.')
  window.swarmCosmos?.studio?.(j.project.id, start)
}
// the skip question asked before a build (server/server.mjs /api/run answered 409 ask): its chat opens here,
// through Projects when it is there (it knows how a website builds), with the question's answers
export function openAsk(chat) {
  if (!chat) return
  if (window.swarmCosmos?.openChat) return window.swarmCosmos.openChat(chat)
  return openChatHere(chat)
}
// Hermes asked for a build: the chat with its question is shown for the person to answer (launcher.py)
commandOps.chat = c => openAsk(c.target)
// ---------- a game talk (docs/specs/27-plan-conversation.md, server/talk.mjs): the planner asks only
// what the idea leaves open, each option with what it gets, costs and takes (its second line, on the
// open question only); the plan takes shape on the board beside the chat. Lock makes the plan, or
// re-plans it in place, and opens it; saying a change later ("make it 3d") reopens the spec.
const talkPost = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error('no answer'), { reason: j.hermes ? { code: 'hermes', message: j.message, action: j.action } : j.reason || null }); return j })
// again: the same words once more after a failed turn (nothing is said twice); saved: that turn is in the chat
// already (its model failed inside the turn), so the server takes it back before it asks again
// A game talk takes the media chips too (spec 29): they were uploaded and filed in the chat by the time the chip
// showed, so the send has to name them or the picture is never seen by the planner (#648)
async function gameSay({ said = '', pick = '', label = '', again = false, saved = false }) {
  if (talk.busy) return
  const text = again ? '' : said || label
  const media = !again && !pick ? links.take('ref') : []
  if (text) { talk.said.push({ who: 'you', text }); feed(null, text, 'you') }
  els.feed.querySelectorAll('.talk-acts, .fail-turn .chips').forEach(x => x.remove())
  const wait = botMsg('…', true)
  talk.busy = true
  try {
    const refs = media.length ? { refs: media.map(m => m.key) } : {}
    let j
    try {
      j = talk.chat
        ? await talkPost(`/api/talk/${encodeURIComponent(talk.chat)}`, { said, pick, ...refs, ...(again && saved ? { again: true } : {}) })
        : await talkPost('/api/talk', { kind: 'game', said, ...refs })
    } catch (err) {
      // the turn did not happen: the chips go back so the next send still carries the picture
      for (const m of media) links.add(m)
      throw err
    }
    if (!talk.on) return
    talk.chat = j.chat.id
    talk.said.push({ who: 'hermia', text: j.turn.text + chatCardsLine(j.turn.cards) })
    // an install has no place on the board: its line in the chat is Hermia at work on it, with how far it is
    const msg = j.turn.install ? crewWait({ botMsg }, 'Hermia', j.turn.text) : botMsg(j.turn.text)
    if (j.turn.cards?.length) talkCards(msg, j.turn.cards, j.turn.id)
    gameActs(msg, j.turn)
    // an action changed the plan (server/talk.mjs): the board opens on it, or shows what changed
    if (j.plan?.id) { const fresh = talk.plan !== j.plan.id; talk.plan = j.plan.id; if (fresh) window.swarmCosmos?.plan?.(j.plan.id, true); else window.swarmCosmos?.planAt?.(j.plan.id, {}) }
    else if (j.draft) window.swarmCosmos?.planDraft?.(j.draft)
    if (j.turn.wait) gameWatch(j.turn.text, j.turn.install ? msg : null)
    // the planner's model did not answer this turn (server/talk.mjs `failed`): the step above is the plan's own;
    // the reason is said beside it, with Try again for the same words
    if (j.failed) { for (const m of media) links.add(m); const retry = () => { talk.retry = null; gameSay({ said, pick, again: true, saved: true }) }; talk.retry = retry; failSay(j.failed, { again: retry }) }
  } catch (err) {
    if (talk.on) { for (const m of media) links.add(m); const retry = () => { talk.retry = null; gameSay({ said, pick, again: true }) }; talk.retry = retry; failSay(err.reason, { again: retry }) }
  } finally { talk.busy = false; wait.remove() }
}
// While something paints, ask for the next step every few seconds; when it moves on, Hermia says it with its buttons
// (line: the working line of an install, kept at the step's own words while it runs and taken away when it ends)
/** @param {string} was @param {HTMLElement | null} [line] */
function gameWatch(was, line = null) {
  const chat = talk.chat
  const tick = async () => {
    if (!talk.on || talk.chat !== chat) return
    const j = await api(`/api/talk/${encodeURIComponent(chat)}`).then(r => r.ok ? r.json() : null).catch(() => null)
    if (!talk.on || talk.chat !== chat) return
    // a look that failed (the computer slept, the server was busy) is tried again while an install's line is up
    if (!j?.step) return void (line?.isConnected && setTimeout(tick, 3000))
    if (j.step.wait) {
      const txt = line && j.step.install ? line.querySelector('.txt') : null
      if (txt) txt.textContent = j.step.text
      return void setTimeout(tick, 3000)
    }
    line?.remove()
    if (j.step.text === was) return
    els.feed.querySelectorAll('.talk-acts, .talk-sheet').forEach(x => x.remove())
    talk.said.push({ who: 'hermia', text: j.step.text })
    gameActs(botMsg(j.step.text), j.step)
    if (talk.plan) window.swarmCosmos?.planAt?.(talk.plan, {})
  }
  setTimeout(tick, 3000)
}
// the sketch sheet that waits on picks, in the turn: a click on a design picks it (its number's button)
function sheetIn(item, sheet, opts, pick) {
  if (!sheet?.src) return
  const [cols, rows] = sheet.grid || [5, 4]
  const box = document.createElement('div')
  box.className = 'talk-sheet'
  box.setAttribute('role', 'img')
  box.setAttribute('aria-label', 'Sketch sheet')
  box.innerHTML = `<img src="${esc(BASE + sheet.src)}" alt="" draggable="false">${(sheet.picks || []).map(c => `<i style="left:${(c % cols) / cols * 100}%;top:${Math.floor(c / cols) / rows * 100}%;width:${100 / cols}%;height:${100 / rows}%"></i>`).join('')}`
  box.onclick = e => {
    const r = box.getBoundingClientRect()
    const cell = Math.min(rows - 1, Math.floor((e.clientY - r.top) / r.height * rows)) * cols + Math.min(cols - 1, Math.floor((e.clientX - r.left) / r.width * cols))
    const o = opts.find(x => x.id.startsWith(`do:cell:${sheet.id}:${cell}:`) || x.id === `do:cell:${sheet.id}:${cell}`)
    if (o) pick(o)
  }
  item.append(box)
  // the sheet is taller than the line it arrives under, and the line was already pushed and scrolled: it grows
  // below the fold, so the picks it asks for sit where nobody looks (#644, after a Godot install). Once the
  // picture has its height, the feed follows it down if it was at the bottom.
  const stick = () => { const f = els.feed; if (f && f.scrollHeight - f.scrollTop - f.clientHeight < 400) f.scrollTop = f.scrollHeight }
  const img = box.querySelector('img')
  if (img && !img.complete) img.addEventListener('load', stick, { once: true })
  stick()
}
// the open question's options, or Lock and Keep talking under the spec
// a plan's next step (server/talk.mjs): Lock and every action are buttons in the turn, and run on the server
function gameActs(item, turn) {
  const opts = turn?.options || []
  if (!item || !opts.length) return
  const spec = opts.some(o => o.id === 'lock' || o.id.startsWith('do:'))
  const pick = o => { if (!talk.busy) gameSay({ pick: o.id, label: o.label }) }
  sheetIn(item, turn.sheet, opts, pick)
  const acts = document.createElement('div')
  acts.className = spec ? 'chips talk-acts' : 'talk-acts talk-opts'
  acts.innerHTML = opts.map((o, i) => `<button type="button" data-pick="${esc(o.id)}"${spec && !i && !o.id.startsWith('do:cell:') ? ' class="primary"' : ''}>${esc(o.label)}${!spec && o.why ? `<small>${esc(o.why)}</small>` : ''}</button>`).join('')
  acts.onclick = e => {
    // @ts-ignore
    const b = e.target.closest('[data-pick]')
    const o = b && opts.find(x => x.id === b.dataset.pick)
    if (!o || talk.busy) return
    if (o.id.startsWith('start:')) return gameStart(o, acts, b)
    pick(o)
  }
  item.append(acts)
}
async function gameResume(last) {
  const j = await api(`/api/talk/${encodeURIComponent(talk.chat)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  if (!j?.chat || !talk.on) return
  const turn = j.chat.turns.at(-1)
  talk.plan = j.chat.plan || null
  // a chat with its plan: the real next step from the plan file, said again if her last words were not it
  if (j.step) {
    if (j.step.install) gameWatch(j.step.text, crewWait({ botMsg }, 'Hermia', j.step.text))
    else {
      gameActs(turn?.who === 'planner' && turn.text === j.step.text && last ? last : botMsg(j.step.text), j.step)
      if (j.step.wait) gameWatch(j.step.text)
    }
  } else if (turn?.who === 'planner') gameActs(last, turn)
  if (j.draft && !j.chat.plan) window.swarmCosmos?.planDraft?.(j.draft)
  els.brief.focus({ preventScroll: true })
}
// where to start (after the lock): the pick opens that part of the Plan board; the chips stay, so
// another part is one click away
function gameStart(o, acts, b) {
  if (!talk.plan) return
  acts.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b))
  window.swarmCosmos?.planAt?.(talk.plan, { focus: o.focus, select: o.select })
}
// the plan's Lock, from the board's button while the chat talks: the same lock as the chat's (server/talk.mjs), its
// price and what comes next said in the chat
export function gameLock() {
  if (talk.busy || !talk.chat) return
  return gameSay({ pick: 'lock', label: 'Lock' })
}
// under Hermia's latest answer: Build, which writes the brief first (nothing starts yet)
function talkActs(item) {
  const acts = document.createElement('div')
  acts.className = 'chips talk-acts'
  acts.innerHTML = '<button class="primary">Build</button>'
  // @ts-ignore
  acts.firstChild.onclick = () => { if (!talk.busy) talkSay('', true) }
  item.append(acts)
}
// Inside a project the planner says which way it goes (engine/talkplan.mjs routeFor): more for this
// project (Build), a different product (New project, with Add here for when it is not), or this one
// from scratch (Start over: new pages and look, the old version stays in the project).
// sheet: open the brand sheet at once (asked for from the Make box's brief)
// options: a new website's brief carries the question before a build (decision 0020) as its own answers, the
// recommended one first: pressing one on the brief builds, or opens the walk, with no second question
function talkBrief(text, route = '', what = '', sheet = false, options = null) {
  const item = botMsg(what || 'The brief')
  item.classList.add('talk-brief')
  const inProject = !!talk.from
  const asks = !inProject && Array.isArray(options) && options.some(o => String(o.id).startsWith('go:')) ? options : null
  const acts = asks ? '' : inProject && route === 'new' ? '<button class="primary" data-go="new">New project</button><button data-go="add">Add here</button>'
    : inProject && route === 'redo' ? '<button class="primary" data-go="redo">Start over</button><button data-go="add">Add here</button>'
      : '<button class="primary" data-go="add">Build</button>'
  // a website or app can settle its story, palette and type first (spec 31); Build works without it
  const sheetHtml = talk.kind === 'site' || talk.kind === 'app' ? '<button data-brand>Brand sheet</button>' : ''
  const asksHtml = asks ? `<div class="talk-acts talk-opts">${asks.map(o => `<button type="button" data-pick="${esc(o.id)}">${esc(o.label)}${o.why ? `<small>${esc(o.why)}</small>` : ''}</button>`).join('')}</div>` : ''
  item.insertAdjacentHTML('beforeend', `<textarea aria-label="The brief" rows="6" maxlength="4000"></textarea>${asksHtml}<div class="chips talk-acts">${acts}${sheetHtml}<button data-more>Keep talking</button></div>`)
  const box = item.querySelector('textarea')
  box.value = text
  talk.briefAsk = asks ? box : null
  // @ts-ignore
  item.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => {
    const t = box.value.trim()
    // @ts-ignore
    const o = asks?.find(x => x.id === b.dataset.pick)
    if (!t || !o || talk.busy) return
    box.disabled = true
    goSay({ pick: o.id, label: o.label, brief: t })
  } })
  // @ts-ignore
  item.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => {
    const t = box.value.trim()
    if (!t) return
    // @ts-ignore
    const way = b.dataset.go, chat = talk.chat, from = talk.from
    const go = way === 'new' ? (x, c) => { setNextRoute({ fresh: true, chat: c }); els.brief.value = x; els.form.requestSubmit() }
      : way === 'redo' ? (x, c) => { setNextRoute({ from, route: 'redo', selected: false, chat: c }); els.brief.value = x; els.form.requestSubmit() }
        : talk.build
    talkEnd()
    box.disabled = true
    go?.(t, chat)
  } })
  // @ts-ignore
  item.querySelector('[data-more]').onclick = () => { talk.briefAsk = null; item.querySelectorAll('.talk-acts').forEach(x => x.remove()); els.brief.focus() }
  const sheetBtn = item.querySelector('[data-brand]')
  // @ts-ignore
  if (sheetBtn) sheetBtn.onclick = () => {
    const t = box.value.trim()
    if (!t) return
    window.swarmCosmos?.brand?.({ chat: talk.chat, brief: t, kind: talk.kind, done: (id, locked) => { if (id) talk.chat = id; sheetBtn.textContent = locked ? 'Brand sheet · Locked' : 'Brand sheet' } })
  }
  // @ts-ignore
  if (sheet && sheetBtn) return sheetBtn.click()
  box.focus({ preventScroll: true })
}
// ---------- Chats (spec 29): the project's talks, grouped Design, App, Game, Video; outside a
// project, the loose ones. One opens here where it left off; a row dragged onto another group moves
// it there. New chat starts an empty talk (in the project when one is open).
const chatsBtn = $('#chats-btn')
let chatsPop = null
const projectNow = () => window.swarmCosmos?.project || null
// Build from a chat: inside a project it is the project's next version; outside one, a new project
function chatBuild(run) {
  return (text, chat) => { setNextRoute(run ? { from: run, route: 'extend', selected: false, chat } : { fresh: true, chat }); els.brief.value = text; els.form.requestSubmit() }
}
async function openChatHere(id) {
  const chat = await api(`/api/chats/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  if (!chat?.id) return
  // a loose chat that is not a website opens from Studio home, which knows how each kind builds
  if (!chat.project && chat.kind !== 'site' && window.swarmCosmos?.openChat) return window.swarmCosmos.openChat(id)
  const run = chat.project ? runNow() : null
  talkStart({ kind: chat.kind, chat: chat.id, said: saidOf(chat), blank: !chat.project, from: run, build: chatBuild(run) })
}
if (chatsBtn) chatsBtn.onclick = async () => {
  if (chatsPop && !chatsPop.closed) return chatsPop.close()
  const run = shownRun(), known = projectNow()
  const j = await api(known ? `/api/projects/${encodeURIComponent(known)}/chats` : `/api/chats${run ? `?run=${encodeURIComponent(run)}` : ''}`).then(r => r.json()).catch(() => ({}))
  const pid = known || j.project || null
  // Inside a project the picker is that project's own chats and nothing else. It used to fall back to every
  // loose chat — first when the project had none, then always — which mixed other builds into this one: two
  // rows both named "Rooftop Signal", "Army of Ants" beside a game about rooftops (the person, 2026-11-16:
  // "this is supposed to show recent chat logs only from this project not others"). A chat belongs to a
  // build through its `project`; a chat that has none is loose and is shown only where there is no project.
  const groups = pid
    ? (j.groups || []).map(g => ({ ...g, chats: (g.chats || []).filter(c => !c.project || c.project === pid) })).filter(g => g.chats.length)
    : [{ name: '', chats: j.chats || [] }]
  const row = c => `<button type="button" class="cp-row${talk.on && talk.chat === c.id ? ' on' : ''}" data-chat="${esc(c.id)}" draggable="${!!pid}"><span>${esc(c.title)}</span>${c.state === 'locked' ? '<small>Locked</small>' : ''}</button>`
  // every group is a place to drop a chat, so the four always show while dragging. A group named '' is the
  // loose chats (no project): it has no heading and no drop target of its own.
  const names = [...new Set([...(pid ? ['Design', 'App', 'Game', 'Video'] : []), ...groups.map(g => g.name)])]
  const list = names.map(n => { const g = groups.find(x => x.name === n); return `<section class="cp-group${g && g.chats.length ? '' : ' empty'}" data-group="${n}">${n ? `<h4>${n}</h4>` : ''}${(g?.chats || []).map(row).join('')}</section>` }).join('')
  // the rows scroll, the New chat button does not: it stays where the hand expects it
  const html = `<div class="chats-pop-scroll">${list}</div>` +
    `<button type="button" class="cp-row cp-new" data-new>${ico('plus')}<span>New chat</span></button>`
  chatsPop = window.SwarmUI.popover(chatsBtn, html, { className: 'chats-pop', align: 'start' })
  const el = chatsPop.el
  el.onclick = e => {
    const b = e.target.closest('.cp-row')
    if (!b) return
    chatsPop.close()
    if (b.dataset.new != null) { const run = pid ? runNow() : null; return talkStart({ from: run, blank: !pid, build: chatBuild(run) }) }
    openChatHere(b.dataset.chat)
  }
  el.addEventListener('dragstart', e => { const b = e.target.closest('.cp-row[data-chat]'); if (!b) return; e.dataTransfer.setData('text/x-swarm-chat', b.dataset.chat); el.classList.add('dragging') })
  el.addEventListener('dragend', () => el.classList.remove('dragging'))
  el.addEventListener('dragover', e => { const g = e.target.closest('.cp-group'); if (g && e.dataTransfer.types.includes('text/x-swarm-chat')) e.preventDefault() })
  el.addEventListener('drop', async e => {
    const g = e.target.closest('.cp-group'), id = e.dataTransfer.getData('text/x-swarm-chat')
    if (!g || !id || !g.dataset.group) return
    e.preventDefault()
    const row = el.querySelector(`.cp-row[data-chat="${CSS.escape(id)}"]`)
    if (row && row.parentElement !== g) { g.append(row); g.classList.remove('empty') }
    el.querySelectorAll('.cp-group').forEach(x => x.classList.toggle('empty', !x.querySelector('.cp-row')))
    await api(`/api/chats/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: g.dataset.group }) }).catch(() => null)
  })
}

// not sure whether to build: one choice, here in the chat
export function talkAsk(text, now, first) {
  const item = botMsg('Build now or talk first?')
  const acts = document.createElement('div')
  acts.className = 'chips'
  acts.innerHTML = '<button class="primary" data-now>Build now</button><button data-first>Talk first</button>'
  // @ts-ignore
  acts.querySelector('[data-now]').onclick = () => { acts.remove(); now() }
  // @ts-ignore
  acts.querySelector('[data-first]').onclick = () => { acts.remove(); first() }
  item.append(acts)
}

els.brief.addEventListener('keydown', e => {
  if (!slashPop.hidden) {
    const m = slashMatches()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSlashAt((slashAt + (e.key === 'ArrowDown' ? 1 : m.length - 1)) % m.length); return renderSlash() }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && m[slashAt] && els.brief.value.trim() !== `/${m[slashAt][0]}`)) { e.preventDefault(); return pickSlash(m[slashAt][0]) }
    if (e.key === 'Escape') { slashPop.hidden = true; return }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); els.form.requestSubmit() }
})
