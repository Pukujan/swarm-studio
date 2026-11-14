// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): talks before a build: talk first, the game talk, Chats.
import { els, api, $, ico, commandOps } from './core.js'
import { viewing, setViewing } from './replay.js'
import { fresh, links } from './base.js'
import { botMsg, feed } from './panels.js'
import { esc } from './design.js'
import { nextRoute, slashPop, slashMatches, slashAt, renderSlash, pickSlash, setNextRoute, setSlashAt } from './loop.js'
import { runNow, shownRun } from './film.js'

// ---------- talk first (engine/talkplan.mjs): the person asked not to build yet, or asked the crew
// a question. Hermia answers here in the chat, the conversation goes on in this dock, and nothing is
// built until they say build. Then the brief she writes from the talk shows here, editable, with
// Build and Keep talking; only Build starts anything. From the Make box the canvas is empty: a new
// project with nothing built yet. From a project's dock its pages stay and Build extends it.
// The talk is kept in a chat (spec 29, engine/chats.mjs): the server makes it on the first turn and
// answers with its id; an old chat opened from Studio home or a project's chats comes back here.
// ask: the chat's skip question before a website's build is open (decision 0020): words and picks answer it
export const talk = { on: false, busy: false, said: [], kind: 'site', build: null, dock: null, chat: null, from: null, plan: null, ask: false }
const dockBtn = els.form.querySelector('button[type="submit"]')
// while talking, the dock sends to Hermia: its button says Send, not Build
function talkDock(on) {
  if (on && !talk.dock) { talk.dock = { ph: els.brief.placeholder, btn: dockBtn.textContent }; els.brief.placeholder = 'Tell Hermia…'; dockBtn.textContent = 'Send' }
  if (!on && talk.dock) { els.brief.placeholder = talk.dock.ph; dockBtn.textContent = talk.dock.btn; talk.dock = null }
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
  Object.assign(talk, { on: true, busy: false, said: [], kind, build, chat, from, plan: null, heard, ask: false })
  talkDock(true)
  els.feed.querySelector('.empty-chat')?.remove()
  let last = null
  for (const m of said) { talk.said.push(m); last = m.who === 'hermia' ? botMsg(m.text) : feed(null, m.text, 'you') }
  if (brief) { talk.said.push({ who: 'you', text: brief }); return talkBrief(brief, '', what, sheet) }
  if (text) return talkSay(text)
  // a game chat reopened: its open question's chips come back under the planner's last words
  if (kind === 'game' && chat) return gameResume(last)
  // a website's chat with its skip question open: the question's answers come back, not Build
  if (kind === 'site' && chat && last && said.at(-1)?.who === 'hermia') return siteResume(last)
  // an old chat reopened: its words are back, and the dock goes on from them
  if (last && said.at(-1)?.who === 'hermia') talkActs(last)
  els.brief.focus({ preventScroll: true })
}
// a chat from the store, as the talk keeps it: the person is 'you', the planner 'hermia'
export const saidOf = chat => (chat?.turns || []).filter(t => t.who !== 'crew').map(t => ({ who: t.who === 'planner' ? 'hermia' : 'you', text: t.text }))
export const talkEnd = () => { talk.on = false; talk.busy = false; talkDock(false); els.feed.querySelectorAll('.talk-acts').forEach(x => x.remove()) }
export async function talkSay(text, brief = false) {
  if (talk.kind === 'game') return gameSay({ said: text })
  if (talk.ask && !brief) return goSay({ said: text })
  const media = brief ? [] : links.take('ref')
  // layers dragged in (the Studio scaffold's Layers, web/layers.js): the planner is told what the turn is about
  const about = brief ? [] : links.take('layer')
  let took = null
  if (!brief) { talk.said.push({ who: 'you', text: about.length ? `${text}\n(About: ${about.map(c => c.name).join(', ')})` : text }); feed(null, text, 'you', [...about, ...media].map(m => m.name).join(', ')); took = talk.heard?.(text) }
  els.feed.querySelectorAll('.talk-acts').forEach(x => x.remove())
  if (took && typeof took.then === 'function') {
    talk.busy = true
    const reply = await took.catch(() => null)
    talk.busy = false
    if (!talk.on) return
    if (typeof reply === 'string' && reply) { for (const m of [...media, ...about]) links.add(m); talk.said.push({ who: 'hermia', text: reply }); return void botMsg(reply) }
  }
  const wait = botMsg(brief ? 'Writing the brief…' : '…', true)
  talk.busy = true
  const res = await api('/api/discuss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ said: talk.said, kind: talk.kind, brief, ...(media.length ? { refs: media.map(m => m.key) } : {}), ...(talk.chat ? { chat: talk.chat } : talk.from ? { from: talk.from } : {}) }) }).catch(() => null)
  const j = res ? await res.json().catch(() => ({})) : {}
  if (j.chat && talk.on) talk.chat = j.chat
  talk.busy = false
  wait.remove()
  if (!talk.on) return
  if (!res?.ok) return talkActs(botMsg(j.error || 'Hermia did not answer. Say it again.'))
  if (j.brief) return talkBrief(j.brief, j.route)
  talk.said.push({ who: 'hermia', text: j.reply })
  talkActs(botMsg(j.reply))
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
  if (!j?.chat?.go && turn?.who === 'planner' && isAsk(turn)) { talk.ask = true; return askActs(last, turn) }
  talkActs(last)
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
async function goSay({ said = '', pick = '', label = '' }) {
  if (talk.busy || !talk.chat) return
  const text = said || label
  if (text) { talk.said.push({ who: 'you', text }); feed(null, text, 'you') }
  els.feed.querySelectorAll('.talk-acts').forEach(x => x.remove())
  const wait = botMsg('…', true)
  talk.busy = true
  try {
    const j = await talkPost(`/api/talk/${encodeURIComponent(talk.chat)}`, { said, pick })
    if (!talk.on) return
    const turn = j.turn || {}
    talk.said.push({ who: 'hermia', text: turn.text })
    const item = botMsg(turn.text)
    talk.ask = isAsk(turn)
    if (talk.ask) return askActs(item, turn)
    if (turn.go) return goOn(turn.go, j.chat?.id || talk.chat)
    talkActs(item)
  } catch (err) { if (talk.on) botMsg(err.message || 'Hermia did not answer. Say it again.') } finally { talk.busy = false; wait.remove() }
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
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
async function gameSay({ said = '', pick = '', label = '' }) {
  if (talk.busy) return
  const text = said || label
  if (text) { talk.said.push({ who: 'you', text }); feed(null, text, 'you') }
  els.feed.querySelectorAll('.talk-acts').forEach(x => x.remove())
  const wait = botMsg('…', true)
  talk.busy = true
  try {
    const j = talk.chat ? await talkPost(`/api/talk/${encodeURIComponent(talk.chat)}`, { said, pick }) : await talkPost('/api/talk', { kind: 'game', said })
    if (!talk.on) return
    talk.chat = j.chat.id
    talk.said.push({ who: 'hermia', text: j.turn.text })
    gameActs(botMsg(j.turn.text), j.turn)
    if (j.draft) window.swarmCosmos?.planDraft?.(j.draft)
  } catch (err) { if (talk.on) botMsg(err.message || 'Hermia did not answer. Say it again.') } finally { talk.busy = false; wait.remove() }
}
// the open question's options, or Lock and Keep talking under the spec
function gameActs(item, turn) {
  const opts = turn?.options || []
  if (!item || !opts.length) return
  const spec = opts.some(o => o.id === 'lock')
  const acts = document.createElement('div')
  acts.className = spec ? 'chips talk-acts' : 'talk-acts talk-opts'
  acts.innerHTML = opts.map((o, i) => `<button type="button" data-pick="${esc(o.id)}"${spec && !i ? ' class="primary"' : ''}>${esc(o.label)}${!spec && o.why ? `<small>${esc(o.why)}</small>` : ''}</button>`).join('')
  acts.onclick = e => {
    // @ts-ignore
    const b = e.target.closest('[data-pick]')
    const o = b && opts.find(x => x.id === b.dataset.pick)
    if (!o || talk.busy) return
    if (o.id === 'lock') return gameLock()
    if (o.id.startsWith('start:')) return gameStart(o, acts, b)
    gameSay({ pick: o.id, label: o.label })
  }
  item.append(acts)
}
async function gameResume(last) {
  const j = await api(`/api/talk/${encodeURIComponent(talk.chat)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  if (!j?.chat || !talk.on) return
  const turn = j.chat.turns.at(-1)
  talk.plan = j.chat.plan || null
  if (turn?.who === 'planner' && j.chat.state !== 'locked') gameActs(last, turn)
  // locked: where to go next, from what is painted so far
  else if (j.chat.state === 'locked' && j.starts?.length) gameActs(last, { options: j.starts })
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
// only a locked spec builds: the plan is made (or re-planned, the same plan) and the board opens on it
export async function gameLock() {
  if (talk.busy || !talk.chat) return
  els.feed.querySelectorAll('.talk-acts').forEach(x => x.remove())
  talk.busy = true
  try {
    const j = await talkPost(`/api/talk/${encodeURIComponent(talk.chat)}/lock`)
    botMsg('Locked')
    if (j.plan?.id) { talk.plan = j.plan.id; window.swarmCosmos?.plan?.(j.plan.id, true) }
    if (j.turn?.text) { talk.said.push({ who: 'hermia', text: j.turn.text }); gameActs(botMsg(j.turn.text), j.turn) }
  } catch (err) { botMsg(err.message) } finally { talk.busy = false }
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
function talkBrief(text, route = '', what = '', sheet = false) {
  const item = botMsg(what || 'The brief')
  item.classList.add('talk-brief')
  const inProject = !!talk.from
  const acts = inProject && route === 'new' ? '<button class="primary" data-go="new">New project</button><button data-go="add">Add here</button>'
    : inProject && route === 'redo' ? '<button class="primary" data-go="redo">Start over</button><button data-go="add">Add here</button>'
      : '<button class="primary" data-go="add">Build</button>'
  // a website or app can settle its story, palette and type first (spec 31); Build works without it
  const sheetHtml = talk.kind === 'site' || talk.kind === 'app' ? '<button data-brand>Brand sheet</button>' : ''
  item.insertAdjacentHTML('beforeend', `<textarea aria-label="The brief" rows="6" maxlength="4000"></textarea><div class="chips talk-acts">${acts}${sheetHtml}<button data-more>Keep talking</button></div>`)
  const box = item.querySelector('textarea')
  box.value = text
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
  item.querySelector('[data-more]').onclick = () => { item.querySelector('.talk-acts').remove(); els.brief.focus() }
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
  const groups = pid ? (j.groups || []) : [{ name: '', chats: j.chats || [] }]
  const row = c => `<button type="button" class="cp-row${talk.on && talk.chat === c.id ? ' on' : ''}" data-chat="${esc(c.id)}" draggable="${!!pid}"><span>${esc(c.title)}</span>${c.state === 'locked' ? '<small>Locked</small>' : ''}</button>`
  // every group is a place to drop a chat, so the four always show while dragging
  const names = pid ? ['Design', 'App', 'Game', 'Video'] : ['']
  const html = names.map(n => { const g = groups.find(x => x.name === n); return `<section class="cp-group${g ? '' : ' empty'}" data-group="${n}">${n ? `<h4>${n}</h4>` : ''}${(g?.chats || []).map(row).join('')}</section>` }).join('') +
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
