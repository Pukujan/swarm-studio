// @ts-check
// The chat's modes (docs/specs/46-chat-modes.md): Ask, Plan, Build, Fix. One select in the chat box, and the
// same switch typed (/ask, /plan, /build, /fix, or "switch to ask mode"). The mode lasts for this browser
// session and is not saved with the project.
//   Ask    an answer, and nothing changes: a built app or game is asked through dyad's own ask mode (the crew
//          answers while it builds), a website or an empty chat through the planner
//   Plan   the planner's talk: nothing is built until the person presses Build under the brief
//   Build  what the chat always did (web/canvas/loop.js): this file does not touch it
//   Fix    the Studio's own working parts: what failed, whose fault, the one next step (engine/doctor.mjs)
// This file imports only the icons, so node can test the pure parts; the canvas hands it what it needs (h).
import { cursor } from './icons.js'

export const CHAT_MODES = ['ask', 'plan', 'build', 'fix']
const MODE_WORD = { ask: 'Ask', plan: 'Plan', build: 'Build', fix: 'Fix' }
export const modeWord = mode => MODE_WORD[mode] || MODE_WORD.build

// A message that switches the mode -> { mode, rest } (rest: what is left to send in that mode), else null.
// The whole message has to be the switch: "add a dark mode" and "fix mode toggle bug" are briefs.
// /fix with words is still the section rewrite it always was (web/canvas/loop.js runSlash): only /fix alone switches.
const SLASH_MODE = /^\/(ask|plan|build)(?:\s+([\s\S]*))?$/i
const SAID_MODE = /^(?:(?:please\s+)?(?:switch|change|go|set(?:\s+(?:it|the\s+chat))?)\s+(?:back\s+)?(?:to|into)\s+)?(?:the\s+)?(ask|plan|build|fix)\s+mode[.!]?$|^(?:please\s+)?switch\s+(?:back\s+)?to\s+(ask|plan|build|fix)[.!]?$/i
export function readMode(text) {
  const t = String(text || '').trim()
  let m = SLASH_MODE.exec(t)
  if (m) return { mode: m[1].toLowerCase(), rest: (m[2] || '').trim() }
  if (/^\/fix$/i.test(t)) return { mode: 'fix', rest: '' }
  m = SAID_MODE.exec(t)
  return m ? { mode: (m[1] || m[2]).toLowerCase(), rest: '' } : null
}

// a typed yes to the step Fix offered
export const isYes = text => /^(?:yes|y|yep|yeah|ok|okay|sure|do it|go ahead|please do|yes please|yes,? do it)[.!]?$/i.test(String(text || '').trim())

// Where a message goes in a mode, from the chat's state. app: the open build has an app or game (built, or
// building); working: the crew is building it now; talking: a talk with the planner is open.
//   'build'   the chat's own routing, untouched         'crew'    the crew's Talk answers while it builds
//   'app'     dyad's ask mode reads the built app        'planner' the planner answers, nothing is left open
//   'talk'    a talk with the planner starts             'say'     the open talk takes it
//   'doctor'  the Studio's own parts                     'yes'     the step Fix offered, taken by a typed yes
export function modeRoute({ mode = 'build', text = '', run = null, app = false, working = false, talking = false, offered = false } = {}) {
  if (mode === 'ask') return run && app ? (working ? 'crew' : 'app') : 'planner'
  if (mode === 'plan') return talking ? 'say' : 'talk'
  if (mode === 'fix') return offered && isYes(text) ? 'yes' : 'doctor'
  return 'build'
}

// ---------- the switch (the browser from here on)
/** @type {{ now: string, asked: { who: string, text: string }[], offer: any[], select: any, button: any, talking: () => boolean }} */
export const chatMode = { now: 'build', asked: [], offer: [], select: null, button: null, talking: () => false }
// The send button has one writer: its word is the mode's, or Send while a talk has the box.
export function paintSend() {
  if (chatMode.button) chatMode.button.textContent = chatMode.talking() ? 'Send' : modeWord(chatMode.now)
}
export function setChatMode(mode) {
  if (!CHAT_MODES.includes(mode)) return
  chatMode.now = mode
  chatMode.offer = []
  if (chatMode.select && chatMode.select.value !== mode) chatMode.select.value = mode
  paintSend()
}
// select: the mode select; button: the form's send button; talking(): a talk has the box (web/canvas/talk.js)
export function mountChatMode({ select, button, talking, off = false }) {
  Object.assign(chatMode, { select, button, talking })
  if (!select) return
  if (off) { select.hidden = true; return }
  select.value = chatMode.now
  // (the button already carries the first mode's word; talking() is not asked while the page is still loading)
  select.addEventListener('change', () => setChatMode(select.value))
}

// A wait in the chat is a crew member at work (owner, 2026-11-13): their cursor, their name and what they
// are doing, where the answer will be.
/** @param {any} h */
function crewWait(h, who, doing) {
  const item = h.botMsg(doing, true)
  item.classList.add('crew-wait')
  // the line is theirs, not Hermia's: their cursor and name head it
  const head = item.querySelector('b')
  if (head) head.innerHTML = `${cursor('')}${who}`
  return item
}
const modePost = (h, path, body) => h.api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)

// Takes the message in the box when the mode (or a typed switch) says so -> true: handled, the chat's own
// routing does nothing more. false: Build, a slash command, or an open talk in Plan: the chat goes on as ever.
/** @param {any} h */
export async function modeSend(h) {
  let text = String(h.box.value || '').trim()
  if (!text || !chatMode.select || chatMode.select.hidden) return false
  const to = readMode(text)
  if (to) {
    h.feed(null, `› ${text}`, '')
    h.quiet()
    setChatMode(to.mode)
    h.box.value = text = to.rest
    if (!text) return true
  }
  if (/^\/[a-z?]/i.test(text)) return false
  const run = h.run()
  const st = h.app()
  const app = !!run && st.run === run && (st.hasApp || st.state === 'working' || st.state === 'paused')
  const route = modeRoute({ mode: chatMode.now, text, run, app, working: app && st.state === 'working', talking: chatMode.talking(), offered: chatMode.offer.length > 0 })
  if (route === 'build' || route === 'say') return false
  h.box.value = ''
  if (route === 'crew') { await h.appAsk(text); return true }
  if (route === 'talk') { planTalk(h, text, run, app); return true }
  if (route === 'yes') { h.feed(null, text, 'you'); await takeStep(h, chatMode.offer[0]); return true }
  h.feed(null, text, 'you')
  if (route === 'doctor') await fixSay(h, text, run)
  else if (route === 'app') await modeAskApp(h, text, run)
  else await askPlanner(h, text, run)
  return true
}

// Plan: the planner's talk. Build under its brief is the person saying so: in an app or game it is the app's
// next change, in a website the project's next version, with nothing open a new project.
/** @param {any} h */
function planTalk(h, text, run, app) {
  const send = route => (words, chat) => { h.next({ ...route, chat }); h.box.value = words; h.form.requestSubmit() }
  if (app) return h.talkStart({ text, kind: 'app', from: run, build: words => h.appAsk(words) })
  const from = h.site() ? h.runNow() : null
  h.talkStart({ text, kind: 'site', from, blank: !from && !run, build: send(from ? { from, route: 'extend', selected: false } : { fresh: true }) })
}

// Ask, a built app or game: dyad's own ask mode (POST /api/runs/<id>/app/ask). Nothing changes.
/** @param {any} h */
async function modeAskApp(h, text, run) {
  const wait = crewWait(h, 'Pip', 'Reading the app')
  const res = await modePost(h, `/api/runs/${encodeURIComponent(run)}/app/ask`, { text })
  const j = res ? await res.json().catch(() => ({})) : {}
  wait.remove()
  if (!res?.ok || !j.answer) return void h.botMsg(j.error || 'No answer came back. Ask again.')
  const item = h.botMsg(j.answer)
  if (j.media) item.append(h.media(j.media))
}

// Ask, a website or nothing built: the planner answers (POST /api/discuss { ask: true }); no talk is left
// open and nothing is saved. The session's earlier questions stay in view, so "and why?" works.
/** @param {any} h */
async function askPlanner(h, text, run) {
  const off = await h.hermesReady()
  if (off) return void h.hermesSays(off)
  const said = [...chatMode.asked.slice(-8), { who: 'you', text }]
  const wait = crewWait(h, 'Hermia', 'Answering')
  const res = await modePost(h, '/api/discuss', { ask: true, said, kind: h.kind(), ...(run ? { from: run } : {}), ...(h.chat() ? { chat: h.chat() } : {}) })
  const j = res ? await res.json().catch(() => ({})) : {}
  wait.remove()
  if (res?.status === 503 && j.hermes) return void h.hermesSays(j)
  if (!res?.ok || !j.reply) return void h.botMsg(j.error || 'No answer came back. Ask again.')
  chatMode.asked.push({ who: 'you', text }, { who: 'hermia', text: j.reply })
  h.botMsg(j.reply)
}

// Fix: what is wrong with the Studio's own parts (POST /api/doctor). The reply is a crew reply like any
// other; a step it offers is a button, and a typed yes takes the first one.
/** @param {any} h */
async function fixSay(h, text, run) {
  chatMode.offer = []
  const wait = crewWait(h, 'Ren', 'Checking the Studio')
  const res = await modePost(h, '/api/doctor', { text, ...(run ? { run } : {}) })
  const j = res ? await res.json().catch(() => ({})) : {}
  wait.remove()
  if (!res?.ok || !j.reply) return void h.botMsg(j.error || 'The check did not answer. Ask again.')
  const item = h.botMsg(j.reply)
  item.classList.add('fix-reply')
  const acts = Array.isArray(j.actions) ? j.actions : []
  if (!acts.length) return
  chatMode.offer = acts
  const row = document.createElement('div')
  row.className = 'chips'
  acts.forEach((a, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    if (!i) b.className = 'primary'
    b.textContent = a.label
    b.onclick = () => { row.remove(); takeStep(h, a) }
    row.append(b)
  })
  item.append(row)
}

// One step the person pressed, or typed yes to. Each is something the Studio already does elsewhere.
/** @param {any} h */
async function takeStep(h, a) {
  chatMode.offer = []
  if (!a) return
  if (a.kind === 'setup') return void h.setup(a.row === 'parts' ? ['parts', a.group, a.part] : [a.row])
  if (a.kind === 'resume') return void h.resume(a.run)
  if (a.kind === 'app-again') return void h.appAsk('')
  if (a.kind === 'repaint') {
    const res = await modePost(h, `/api/runs/${encodeURIComponent(a.run)}/image`, { page: a.page, layer: a.layer, gen: a.gen })
    const j = res ? await res.json().catch(() => ({})) : {}
    h.botMsg(res?.ok ? 'Painting it again.' : j.error || 'The picture could not be started.')
  }
}
