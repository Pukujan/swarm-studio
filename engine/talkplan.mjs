// The planner conversation (docs/specs/27-plan-conversation.md), grown from engine/discuss.mjs (PR 281).
// One mechanism for every kind: the person and the planner talk in the left chat, either side leads,
// decisions pile up, the planner writes the spec in plain words, and only a locked spec builds.
// A site or app talk ends in a brief (discuss, writeBrief below). A game talk ends in a plan made from
// its decisions (planInput -> engine/plan.mjs planFromAnswers), so the cards, the art list, the engine,
// Meshy (3D only) and the price follow what was decided, not a fixed blueprint.
// The record is the chat of spec 29 §Store (engine/chats.mjs); this file writes turns, decisions,
// spec, state and lead.
import { familyOf, sizeOf, titleFrom, FAMILIES, FAMILY_IDS, SIZES, planSummary } from './planshape.mjs'
import { planFromAnswers, planPrice } from './plan.mjs'
import { askedOf, askOptions, pickOptions, readAnswer, recommend, ASK_TEXT, PICK_TEXT, GO_TEXT, SKIPS } from './askfirst.mjs'

// Talk first: a person who says "don't build yet", "let's talk", "grill me first" or asks the crew a
// question gets a conversation with the planner (Hermia) in the Design deck's chat, on a project
// with nothing built. Nothing is built until they say build; the last step is always a brief they
// can read and edit, with Build and Keep talking.
//
// readIntent decides build, talk or unsure. The planner model reads the message; a short list of
// clear stop words backs it up (a clear stop is never read as a build) and stands in when no model
// answers. discuss is one turn of the conversation; it writes the brief when the person says build.
// Pure functions: the model call is handed in as `chat(messages) → text`.

// words that always mean "not yet": a stop, a wish to talk or plan first, or to be asked questions
export const STOP = new RegExp([
  String.raw`\b(do\s*n[o']?t|dont|do not)\s+(build|start|develop|code|make|design|create)\w*\s+(it\s+|this\s+|anything\s+|the\s+\w+\s+)?(just\s+)?(yet|now|right\s+away|until|before)\b`,
  String.raw`\b(do\s*n[o']?t|dont|do not)\s+(start|begin)\s+(building|coding|developing|designing|yet)\b`,
  String.raw`\bnot\s+(to\s+)?(build|start|develop|design|code)\w*\s+(it\s+|anything\s+)?yet\b`,
  String.raw`\b(build|start)\w*\s+(it\s+)?later\b`,
  String.raw`\b(let'?s|lets|let us|we should|can we|could we|i want to|i'?d like to|wanna)\s+(first\s+)?(talk|discuss|chat|plan|brainstorm)`,
  String.raw`\bgrill\s+me\b`,
  String.raw`\b(just|only)\s+plan\b`,
  String.raw`\bplan\s+(it\s+)?(only|first)\b`,
  String.raw`\b(talk|discuss)\w*\s+(it\s+)?(first|through|before)\b`,
  String.raw`\bhold\s+off\b`,
  String.raw`\bbefore\s+(you|we|anyone)\s+(build|start|code|design)`,
  String.raw`\b(ask|interview)\s+me\s+(some\s+|a\s+few\s+)?questions\s+(first|before)\b`
].join('|'), 'i')

// what the words alone say: a clear stop is talk, a question is unsure, anything else is build
export function wordsRead(text) {
  const t = String(text || '')
  if (STOP.test(t)) return 'talk'
  if (/\?/.test(t)) return 'unsure'
  return 'build'
}

const READ_PROMPT = kind => `A person typed this into the box of a studio where a crew of AI agents builds ${kind === 'app' ? 'web apps' : kind === 'film' ? 'short promo videos' : kind === 'game' ? 'games' : 'websites'}. Sending it normally starts a build at once.
Decide what they want right now. Reply with exactly one word:
build: they describe something to make and nothing says to wait.
talk: they ask not to build yet, to talk, discuss, plan or be asked questions first, or they ask the crew a question that should be answered before anything is made.
unsure: you cannot tell.`

// build, talk or unsure, with who decided: the model, or the words when no model answered
export async function readIntent({ text, kind = 'site', answerTo = '', chat }) {
  const words = wordsRead(text)
  if (words === 'talk') return { intent: 'talk', by: 'words' }
  if (!chat) return { intent: words, by: 'words' }
  try {
    const said = answerTo ? `They were answering the question "${answerTo}" and wrote:\n${text}` : String(text)
    const reply = await chat([{ role: 'system', content: READ_PROMPT(kind) }, { role: 'user', content: said.slice(0, 2000) }])
    const m = String(reply || '').toLowerCase().match(/\b(build|talk|unsure)\b/)
    if (m) return { intent: m[1], by: 'model' }
  } catch {}
  return { intent: words, by: 'words' }
}

const WHAT = { app: 'a web app', film: 'a short promo video', game: 'a game', site: 'a website' }
// Inside a project the planner is told what is there (the server's projectState): its pages, its look,
// what is running. It never says nothing exists, and it says which way a build goes: add to this
// project, start a new project (a different product), or start this one over.
const ROUTES = '"route": "add" (more for this same product), "new" (a different product: its own new project) or "redo" (this product again from scratch: new pages and a new look; the old version stays restorable)'
const placeOf = project => project
  ? `This talk is inside an existing project. What is there now:\n${project}\nNever say nothing exists or nothing has been built: say what is there. When they describe a different product from this project, say so plainly and offer to start it as a new project. When they want to redo it or start from scratch, say that replaces this project's pages and look, and the old version stays restorable.`
  : 'The person asked to talk before anything is built, so nothing is being built and nothing has started.'
const TALK_PROMPT = (kind, project = '') => `You are Hermia, the planner of a crew of AI agents that builds ${WHAT[kind] || WHAT.site} from a brief. ${placeOf(project)} Never say you are building, designing or have started.
Talk with them like a good product lead:
- Answer what they asked first, directly and concretely. Name real options when they ask (services, APIs, payment or sign-in providers) with one line on each, and say what the crew can and cannot do (the crew builds the product and its pages; outside services need the person's own accounts and keys).
- Then ask the one or two questions that matter most for this build. Go deeper when they asked to be grilled: who it is for, the main flows, the data, accounts, money, what to leave out.
- Short: under 130 words, plain sentences, short lists are fine, no headings, no markdown bold.
Only when their last message clearly says to build now (build it, go ahead, start, let's build), reply with this JSON and nothing else:
{"build": true, "brief": "<one paragraph the crew builds from: what it is and who it is for, the pages or screens, the data, accounts, outside services decided, the colours and type when they were decided, and what to leave out>"${project ? `, ${ROUTES}` : ''}}`

const BRIEF_PROMPT = (kind, project = '') => `Write the brief a crew of AI agents will build ${WHAT[kind] || WHAT.site} from, using only what this conversation decided. One paragraph, under 140 words: what it is and who it is for, the pages or screens, the data, accounts, outside services, the colours and type when they were decided, and what to leave out. No instructions to the crew about talking or waiting. ${project ? `The talk is inside an existing project:\n${project}\nReply with JSON only: {"build": true, "brief": "<the paragraph>", ${ROUTES}}` : 'Reply with the paragraph only.'}`

// which way a build from a project's talk goes, from the person's own words when they say it
export function routeWords(text = '') {
  const s = String(text)
  if (/\b(from scratch|start (it )?over|start again|redo|re-do|rebuild|scrap (it|this))\b/i.test(s)) return 'redo'
  if (/\b(a |as a )?(new|separate|different) (project|site|website|app)\b/i.test(s)) return 'new'
  return ''
}
export function routeOf(reply) {
  const m = /"route"\s*:\s*"(add|new|redo)"/.exec(String(reply || ''))
  return m ? m[1] : ''
}
// the person's last words win over the planner's pick; nothing said is "add"
const routeFor = (said, reply) => routeWords([...said].reverse().find(m => m && m.who !== 'hermia' && m.who !== 'planner')?.text || '') || routeOf(reply) || 'add'

// the conversation as chat messages: the person is the user, Hermia the assistant; the newest kept
export function toMessages(said = []) {
  return said.filter(m => m && String(m.text || '').trim()).slice(-24)
    .map(m => ({ role: m.who === 'hermia' || m.who === 'planner' ? 'assistant' : 'user', content: String(m.text).trim().slice(0, 2000) }))
}

// {"build": true, "brief": "…"} anywhere in the reply
export function buildOf(reply) {
  const s = String(reply || '')
  const at = s.indexOf('{')
  if (at < 0) return null
  try {
    const j = JSON.parse(s.slice(at, s.lastIndexOf('}') + 1))
    return j && j.build && String(j.brief || '').trim() ? String(j.brief).trim() : null
  } catch { return null }
}

// one turn: Hermia's answer, or (when the person said build) the brief to show them
export async function discuss({ said = [], kind = 'site', chat, project = '' }) {
  const messages = toMessages(said)
  if (!messages.length || messages.at(-1).role !== 'user') throw new Error('say something first')
  const reply = String(await chat([{ role: 'system', content: TALK_PROMPT(kind, project) }, ...messages]) || '').trim()
  const brief = buildOf(reply)
  if (brief) return project ? { brief, route: routeFor(said, reply) } : { brief }
  if (!reply || /^\s*\{/.test(reply)) throw new Error('the planner did not answer')
  return { reply: reply.replace(/\*\*(.+?)\*\*/g, '$1') }
}

// the brief, asked for by the Build button: what the conversation decided, never the talk itself
export async function writeBrief({ said = [], kind = 'site', chat, project = '' }) {
  const messages = toMessages(said)
  if (!messages.length) throw new Error('nothing to write a brief from')
  const convo = messages.map(m => `${m.role === 'user' ? 'Person' : 'Hermia'}: ${m.content}`).join('\n\n')
  const text = String(await chat([{ role: 'system', content: BRIEF_PROMPT(kind, project) }, { role: 'user', content: convo }]) || '').trim()
  const brief = buildOf(text) || text.replace(/^brief:\s*/i, '')
  if (!brief || /^\s*\{/.test(brief)) throw new Error('the planner did not write a brief')
  return project ? { brief, route: routeFor(said, text) } : { brief }
}

// ===================== the plan is a conversation (spec 27) =====================

const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
// the decisions a game plan is made from; anything else the conversation says goes into the plan's note
export const GAME_KEYS = ['family', 'size', 'art', 'engine', 'title', 'enemies', 'combat', 'look', 'money', 'progression', 'cast']
const ENGINE_IDS = ['web', 'godot', 'unity', 'unreal']
const ENGINE_LABEL = { web: 'the browser', godot: 'Godot 4', unity: 'Unity', unreal: 'Unreal' }
const MAX_ASKS = 6
const YOU_DECIDE = /\b(you decide|you choose|you pick|up to you|your call|surprise me|whatever you think|dealer'?s choice)\b/i
const KEEP_TALKING = /^\s*keep talking\s*$/i

// what a person's own words decide (never a guess: a word that is not there decides nothing)
export function wordsDecide(text) {
  const t = String(text || '')
  const d = {}
  const family = familyOf(t)
  if (family) d.family = family
  const size = sizeOf(t)
  if (size !== 'normal') d.size = size
  const said3d = /\b3d\b|three.?d|low.?poly|modell?ed|\bmodels?\b/i.test(t)
  const said2d = /\b2d\b|two.?d|pixel|sprites?|hand.?drawn|\bdrawn\b|flat art/i.test(t)
  if (said2d && !said3d) d.art = '2d'
  else if (said3d && !said2d) d.art = '3d'
  // "the browser for now, godot later" is the browser: the engine named first for now wins
  if (/\b(browser|web)\b/i.test(t)) d.engine = 'web'
  else if (/godot/i.test(t)) d.engine = 'godot'
  else if (/\bunity\b/i.test(t)) d.engine = 'unity'
  else if (/\bunreal\b/i.test(t)) d.engine = 'unreal'
  const title = titleFrom(t)
  if (title) d.title = title
  if (/\bno\s+(guns?|shooting|ranged|firearms?)\b|\bmelee\b|\bthey bite\b|\bbites?\b/i.test(t)) d.combat = 'No guns, melee only (bites and charges)'
  if (/\bno\s+(fights?|enemies|combat)\b|\bpeaceful\b/i.test(t)) d.enemies = 'No fights'
  else if (/\bwaves?\b/i.test(t)) d.enemies = 'Endless waves'
  else if (/\brival\b|\benemy (colony|faction|base)\b|\bskirmish\b/i.test(t)) d.enemies = 'A rival faction that builds and attacks'
  return d
}

// ---------- the chat as a plan's input: the idea, the answers, the note and what was decided
const valueOf = (chat, key) => chat.decisions?.[key]?.value
export function planInput(chat) {
  const person = (chat.turns || []).filter(t => t.who === 'person')
  const idea = clean(person[0]?.text, 600)
  const note = person.slice(1).filter(t => !t.pick).map(t => clean(t.text, 200)).join('. ')
  const answers = Object.fromEntries(['enemies', 'combat', 'look', 'money', 'progression', 'cast'].map(k => [k, valueOf(chat, k)]).filter(([, v]) => v))
  const force = Object.fromEntries(['family', 'size', 'art', 'engine'].map(k => [k, valueOf(chat, k)]).filter(([, v]) => v))
  return { idea, answers, note, title: valueOf(chat, 'title') || '', force }
}
export const draftOf = (chat, env = {}) => planFromAnswers(planInput(chat), env, null)

// ---------- the questions that idea leaves open, in the order they matter, each with its trade-offs
const askedIn = t => [...new Set((t.options || []).map(o => String(o.id).split(':')[0]).filter(k => GAME_KEYS.includes(k)))]
const asked = chat => new Set((chat.turns || []).filter(t => t.who === 'planner').flatMap(askedIn))
const timesAsked = (chat, key) => (chat.turns || []).filter(t => t.who === 'planner' && askedIn(t).includes(key)).length
// a question is settled once the person decided it after it was asked; asked twice, it is never asked again
const turnNo = id => Number(String(id || '').slice(1)) || 0
const settled = (chat, key) => {
  const at = (chat.turns || []).findIndex(t => t.who === 'planner' && askedIn(t).includes(key))
  return timesAsked(chat, key) >= 2 || (at >= 0 && turnNo(chat.decisions?.[key]?.turn) > at + 1)
}
const opt = (key, value, label, why) => ({ id: `${key}:${value}`, label, why, made: [] })
const priced = (chat, env, force) => planPrice(planFromAnswers({ ...planInput(chat), force: { ...planInput(chat).force, ...force } }, env, null))

export function openQuestions(chat, env = {}) {
  const d = chat.decisions || {}
  const open = []
  const free = key => !d[key] && !settled(chat, key)
  const family = d.family?.value
  if (free('family')) open.push({ key: 'family', text: 'What kind of game is it?', options: ['action', 'rts', 'platformer', 'puzzle'].map(f => opt('family', f, cap(FAMILIES[f].label), ''))})
  const fam = family || 'action'
  if (d.engine?.value === 'godot' && env.godot === false && !settled(chat, 'engine'))
    open.push({ key: 'engine', text: 'Godot 4 is not installed on this computer.', options: [opt('engine', 'godot', 'Godot (install it first)', 'a Godot 4 project, once Godot is installed'), opt('engine', 'web', 'The browser for now', 'plays here at once; Godot later')] })
  if (free('enemies') && ['rts', 'action', 'platformer'].includes(fam)) {
    const o = fam === 'rts'
      ? [opt('enemies', 'Endless waves', 'Endless waves', 'hold the nest as long as you can (recommended, simplest)'), opt('enemies', 'A rival faction that builds and attacks', 'A rival that builds and attacks like you', 'a real opponent, a longer build')]
      : [opt('enemies', 'Minions, elites, bosses', 'Minions, elites and bosses', 'a fight that builds to a boss (recommended)'), opt('enemies', 'Endless waves', 'Endless waves', 'one arena, the simplest'), opt('enemies', 'No fights', 'No fights', 'a calm game')]
    open.push({ key: 'enemies', text: fam === 'rts' ? 'How do the fights come?' : 'What do you fight?', options: o })
  }
  if (free('art')) {
    const p2 = priced(chat, env, { art: '2d' }), p3 = priced(chat, env, { art: '3d' })
    const small = ['tiny', 'small'].includes(d.size?.value)
    open.push({ key: 'art', text: 'Drawn or modelled?', options: [
      opt('art', '2d', '2D sprites', `about ${p2.images} pictures, no credits${small ? ' (recommended for tiny)' : ' (recommended)'}`),
      opt('art', '3d', '3D models', `about ${p3.credits} Meshy credits and longer`)
    ] })
  }
  return asked(chat).size >= MAX_ASKS ? open.filter(q => asked(chat).has(q.key) && timesAsked(chat, q.key) < 2) : open
}

// ---------- the spec in plain words: the same summary the Plan board shows
export function specOf(chat, env = {}) {
  const draft = draftOf(chat, env)
  const price = planPrice(draft)
  return {
    brief: planSummary(draft), open: openQuestions(chat, env).map(q => q.key),
    art: (draft.art?.sprites || []).map(x => ({ what: x.name, ref: null })),
    engine: draft.engine?.label || 'the browser', time: draft.shape.art === '3d' ? 'about a day' : 'one build',
    cost: { pictures: price.images, credits: price.credits }, lockedAt: null
  }
}

// ---------- one turn
const nextId = chat => `t${(chat.turns || []).length + 1}`
const setDecision = (chat, key, value, by, turn, why = '') => {
  if (!GAME_KEYS.includes(key) || value === undefined || value === null || value === '') return false
  const was = chat.decisions[key]
  // a person's decision is never overwritten by the planner
  if (was && was.by === 'person' && by === 'planner') return false
  if (was && was.value === value) { if (by === 'person') Object.assign(was, { by, turn, why: clean(why, 160) || was.why }); return false }
  chat.decisions[key] = { value, why: clean(why, 160), by, turn }
  return true
}
const validDecision = (key, v) => key === 'family' ? FAMILY_IDS.includes(v) : key === 'size' ? SIZES.includes(v) : key === 'art' ? ['2d', '3d'].includes(v) : key === 'engine' ? ENGINE_IDS.includes(v) : typeof v === 'string' && !!clean(v)
const firstSentence = s => (String(s).match(/^.*?[.!?](\s|$)/) || [s])[0].trim()

// the planner's own reply, validated like readShape: { say, decide?, ask?: { key, text, options: [{ value, label, why }] } }
export function readTurn(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let j
  try { j = JSON.parse(m[0]) } catch { return null }
  const word = (k, v) => ['family', 'size', 'art', 'engine'].includes(k) ? clean(v, 20).toLowerCase() : clean(v, 120)
  const decide = Object.fromEntries(Object.entries(j.decide && typeof j.decide === 'object' ? j.decide : {})
    .filter(([k, v]) => GAME_KEYS.includes(k) && typeof v === 'string').map(([k, v]) => [k, word(k, v)]).filter(([k, v]) => validDecision(k, v)))
  let ask = null
  if (j.ask && GAME_KEYS.includes(j.ask.key) && Array.isArray(j.ask.options)) {
    const options = j.ask.options.slice(0, 4).map(o => ({ value: word(j.ask.key, o?.value || o?.label), label: clean(o?.label, 60), why: clean(o?.why, 140) })).filter(o => o.label && validDecision(j.ask.key, o.value))
    if (options.length >= 2) ask = { key: j.ask.key, text: clean(j.ask.text || j.ask.q, 200), options }
  }
  return { say: clean(j.say, 700).replace(/\*\*(.+?)\*\*/g, '$1'), decide, ask }
}

const TURN_PROMPT = `You are Hermia, the planner of a crew of AI agents that makes games. You and the person decide the game together before anything is painted, built or paid for. Reply with JSON only:
{"say": one or two short plain sentences (answer their question first if they asked one),
 "decide": {key: value} only for what their words clearly decided (keys: ${GAME_KEYS.join(', ')}; family is one of ${JSON.stringify(FAMILY_IDS)}, size one of ${JSON.stringify(SIZES)}, art "2d" or "3d", engine one of ${JSON.stringify(ENGINE_IDS)}),
 "ask": the one question that matters most now, or null when nothing important is open: {"key", "text", "options": [{"value", "label", "why"}]} with 2 to 4 options, the one you recommend first; "why" is what you get, what it costs and how long it takes, in one short clause}
Never ask what the idea or the decisions already answer. Art is 2D unless the person wants 3D; 3D means Meshy credits. No markdown.`

async function plannerTurn(chat, env, model, fallback) {
  if (!model) return null
  const draft = draftOf(chat, env)
  const messages = [{ role: 'system', content: TURN_PROMPT }, { role: 'user', content: [
    `Idea: ${planInput(chat).idea}`,
    `Decided: ${JSON.stringify(Object.fromEntries(Object.entries(chat.decisions).map(([k, v]) => [k, v.value])))}`,
    `The plan so far: ${planSummary(draft)}`,
    `Godot installed: ${env.godot === undefined ? 'unknown' : env.godot ? 'yes' : 'no'}`,
    fallback ? `Still open (ask this unless something matters more): ${fallback.text}` : 'Nothing important is open.',
    `Conversation:\n${(chat.turns || []).slice(-12).map(t => `${t.who === 'person' ? 'Person' : 'Hermia'}: ${t.text}`).join('\n')}`
  ].join('\n') }]
  try { return readTurn(await model(messages)) } catch { return null }
}

// say(chat, { said, pick }, { model, env }): the person's turn (typed, or a chip picked), then the planner's.
// Changes the chat in place and returns the planner's turn. model(messages) -> text, or null offline.
export async function say(chat, { said = '', pick = '' } = {}, { model = null, env = {}, now = Date.now() } = {}) {
  chat.decisions ||= {}
  chat.turns ||= []
  const last = [...chat.turns].reverse().find(t => t.who === 'planner')
  const option = pick && (last?.options || []).find(o => o.id === pick)
  const text = clean(said, 2000) || option?.label || ''
  if (!text) throw Object.assign(new Error('say something first'), { status: 400 })
  const turn = { id: nextId(chat), who: 'person', at: now, text, ...(option ? { pick } : {}), refs: [], marks: [], layers: [] }
  // a website's open skip question (decision 0020) is answered here, before any model is needed
  const asked = chat.kind === 'site' && !chat.go ? askedOf(last) : null
  chat.turns.push(turn)
  if (asked) { const back = goTurn(chat, { pick: option ? pick : '', said: option ? '' : text, asked, now }); if (back) return back }
  if (chat.kind !== 'game') return siteTurn(chat, { model, now })
  if (pick === 'talk') {
    const back = { id: nextId(chat), who: 'planner', at: now, text: 'What should change? Say it in your own words.', refs: [], marks: [], layers: [], made: [], reads: [] }
    chat.turns.push(back)
    return back
  }
  let changed = false
  if (option && option.id.includes(':')) {
    const [key, ...rest] = option.id.split(':')
    changed = setDecision(chat, key, rest.join(':'), 'person', turn.id, option.label) || changed
  } else if (!KEEP_TALKING.test(text)) {
    for (const [k, v] of Object.entries(wordsDecide(text))) changed = setDecision(chat, k, v, 'person', turn.id, 'your words') || changed
  }
  if (YOU_DECIDE.test(text)) chat.lead = 'planner'
  else if (chat.turns.filter(t => t.who === 'person').length > 1) chat.lead = 'person'
  // any change to a decision reopens a locked spec
  if (changed && chat.state === 'locked') { chat.state = 'open'; if (chat.spec) chat.spec.lockedAt = null }
  return plannerSays(chat, { model, env, now, changed, asked: /\?\s*$/.test(text) && !option, first: chat.turns.filter(t => t.who === 'person').length === 1 })
}

async function plannerSays(chat, { model, env, now, first, changed = true, asked: question = false }) {
  // the planner leads: it takes its own recommendation on everything still open
  if (chat.lead === 'planner') for (const q of openQuestions(chat, env)) { const [k, ...v] = q.options[0].id.split(':'); setDecision(chat, k, v.join(':'), 'planner', `t${chat.turns.length}`, q.options[0].why) }
  let open = openQuestions(chat, env)
  const ai = await plannerTurn(chat, env, model, open[0])
  if (ai) for (const [k, v] of Object.entries(ai.decide)) changed = setDecision(chat, k, v, 'planner', `t${chat.turns.length}`, 'the planner read it') || changed
  open = openQuestions(chat, env)
  const draft = draftOf(chat, env)
  const lead = first ? `${firstSentence(planSummary(draft))} ` : ''
  const said = ai?.say ? `${ai.say} ` : ''
  let q = null
  if (ai?.ask && !chat.decisions[ai.ask.key] && asked(chat).size < MAX_ASKS) q = { key: ai.ask.key, text: ai.ask.text, options: ai.ask.options.map(o => opt(ai.ask.key, o.value, o.label, o.why)) }
  else if (open[0] && chat.lead !== 'planner') q = open[0]
  const turn = { id: nextId(chat), who: 'planner', at: now, text: '', refs: [], marks: [], layers: [], made: [], reads: [] }
  if (q) Object.assign(turn, { text: clean(`${first ? lead : said}${q.text}`, 900), options: q.options })
  else if (chat.spec && !changed) {
    // nothing changed: the answer alone (offline, a question waits for a planner model), and the spec stands
    const text = said || (question && !model ? 'A planner model answers questions: pick one in Models. Nothing changed.' : 'Nothing changed.')
    Object.assign(turn, { text: clean(text, 900) }, chat.state === 'locked' ? {} : { options: [{ id: 'lock', label: 'Lock', why: '', made: [] }, { id: 'talk', label: 'Keep talking', why: '', made: [] }] })
  } else {
    chat.spec = { ...specOf(chat, env), lockedAt: chat.state === 'locked' ? chat.spec?.lockedAt ?? null : null }
    chat.title ||= draft.title
    const { pictures, credits } = chat.spec.cost || {}
    const priceLine = pictures == null ? '' : ` Price: about ${pictures} pictures${credits ? ` and ${credits} Meshy credits` : ', no credits'}.`
    Object.assign(turn, { text: clean(`${said}${chat.spec.brief}${priceLine}`, 1500), options: [{ id: 'lock', label: 'Lock', why: '', made: [] }, { id: 'talk', label: 'Keep talking', why: '', made: [] }] })
  }
  chat.turns.push(turn)
  return turn
}

// ---------- the skip question before a website's build (docs/decisions/0020-ask-before-build.md, engine/askfirst.mjs)
// Only the person's turn answers it: a pick of one of the question's own options, or their typed words. The final
// answer is kept on the chat (chat.go); the turn says what the screen does next (turn.go). A "don't build yet" goes
// to the talk (null: siteTurn); anything else that is not an answer asks again, in one line.
const firstPersonText = chat => chat.ask?.brief || (chat.turns || []).find(t => t.who === 'person')?.text || ''
function goTurn(chat, { pick = '', said = '', asked, now }) {
  const path = pick ? pick.slice(3) : readAnswer(said, asked)
  if (!path && said && STOP.test(said)) return null
  const turn = { id: nextId(chat), who: 'planner', at: now, text: '', refs: [], marks: [], layers: [], made: [], reads: [] }
  const brief = firstPersonText(chat)
  if (path === 'pick') Object.assign(turn, { text: PICK_TEXT, options: pickOptions(brief) })
  else if (path && SKIPS[path]) {
    chat.go = { path, skip: SKIPS[path], at: now, turn: chat.turns.at(-1)?.id || null }
    Object.assign(turn, { text: GO_TEXT[path], go: { path, skip: SKIPS[path], brief } })
  } else {
    // not an answer: the same question again, its recommendation from everything they said
    const all = (chat.turns || []).filter(t => t.who === 'person').map(t => t.text).join('\n')
    let options
    try { options = asked === 'pick' ? pickOptions(brief) : askOptions(recommend(all)) } catch { options = askOptions(null) }
    Object.assign(turn, { text: asked === 'pick' ? PICK_TEXT : ASK_TEXT, options })
  }
  chat.turns.push(turn)
  return turn
}

// a site or app talk: one discuss() turn; its brief is the spec
async function siteTurn(chat, { model, now }) {
  if (!model) throw Object.assign(new Error('No planner model yet: pick one in Models.'), { status: 503 })
  const out = await discuss({ said: chat.turns, kind: chat.kind, chat: model })
  const turn = { id: nextId(chat), who: 'planner', at: now, text: out.brief || out.reply, refs: [], marks: [], layers: [], made: [], reads: [] }
  if (out.brief) {
    chat.spec = { brief: out.brief, open: [], art: [], engine: '', time: '', cost: null, lockedAt: null }
    turn.options = [{ id: 'lock', label: 'Lock', why: '', made: [] }, { id: 'talk', label: 'Keep talking', why: '', made: [] }]
  }
  chat.turns.push(turn)
  return turn
}

// ---------- Open and Locked: only a locked spec builds
export function lock(chat, { env = {}, now = Date.now() } = {}) {
  if (chat.kind === 'game') {
    const open = openQuestions(chat, env)
    if (open.length) throw Object.assign(new Error(`still open: ${open.map(q => q.key).join(', ')}`), { status: 409 })
    chat.spec = specOf(chat, env)
    chat.title ||= draftOf(chat, env).title
  }
  if (!chat.spec?.brief) throw Object.assign(new Error('nothing to lock yet: talk first'), { status: 409 })
  chat.state = 'locked'
  chat.spec.lockedAt = now
  return chat.spec
}
// change a decision (or just reopen): the spec goes back to Open
export function unlock(chat, key = '') {
  if (key && chat.decisions?.[key]) delete chat.decisions[key]
  chat.state = 'open'
  if (chat.spec) chat.spec.lockedAt = null
  return chat
}

// ---------- where to start (spec 27 §After the lock): once the spec is locked the planner suggests the
// first part to work on, each with a one-line reason, and the pick opens that part of the Plan board
// (web/plan.js focus/select). The parts come from the plan's own sheets (its genre family), so an RTS
// starts with its units or its map, never character creation. What is already painted drops out, so
// the next suggestion follows from what is done.
const MAIN = {
  units: ['Units', 'they are what you command; every screen is full of them'],
  cast: ['Characters', 'the hero is on screen every second'],
  pieces: ['Pieces', 'the pieces are the game; everything else frames them'],
  cards: ['Cards', 'every turn is the cards in your hand'],
  vehicles: ['Vehicles', 'the car is what you look at all race'],
  enemies: ['Enemies', 'what you fight sets how the fights feel'],
  buildings: ['Buildings', 'the base you grow is half the game'],
  opponents: ['Opponents', 'who you play against sets the tone'],
  items: ['Items', 'what you collect and sell drives the loop'],
  icons: ['Icons', 'the HUD has to read at a glance']
}
const MAPS = {
  terrain: ['The map', 'where the fights happen; it sets the size of everything else'],
  tiles: ['The levels', 'the jumps and gaps are where the game is'],
  board: ['The board', 'the board decides how a level reads'],
  tracks: ['Tracks', 'the corners are where races are won'],
  places: ['Places', 'the place you run is the whole screen'],
  scenes: ['Scenes', 'the places the story happens set its mood']
}
export function startsOf(plan) {
  if (!plan?.art) return []
  // the action RPG's sheets and first shot when the family names none (as web/plan.js shows them)
  const kinds = (plan.art.sheets || ['cast', 'weapons']).slice(0, plan.shape?.size === 'tiny' ? 2 : 4)
  const doneSheet = k => (plan.sheets || []).some(s => s.kind === k && s.state === 'done')
  const out = []
  const main = kinds.find(k => MAIN[k])
  if (main) out.push({ id: `start:${main}`, label: MAIN[main][0], why: MAIN[main][1], focus: `sheet:${main}`, select: `sheet:${main}`, done: doneSheet(main) })
  const map = kinds.find(k => MAPS[k])
  if (map) out.push({ id: `start:${map}`, label: MAPS[map][0], why: MAPS[map][1], focus: `sheet:${map}`, select: `sheet:${map}`, done: doneSheet(map) })
  else if (plan.shape?.backdrops !== false) out.push({ id: 'start:world', label: 'The world', why: 'the backdrops set the look of every stage', focus: 'world', select: null, done: (plan.backdrops || []).some(b => b.state === 'done') })
  const card = plan.cards?.[0]
  if (card) out.push({ id: 'start:design', label: 'Overall design', why: 'read the plan cards first and change what is wrong before any picture', focus: 'cards', select: `card:${card.id}`, done: false })
  const shot = plan.art.shots ? plan.art.shots[0]?.[0] : 'combat'
  if (shot) out.push({ id: 'start:slice', label: 'A tiny playable slice', why: 'one picture of a single moment of play shows if the game works', focus: `mock:${shot}`, select: `mock:${shot}`, done: (plan.mocks || []).some(m => m.shot === shot && m.state === 'done') })
  const open = out.filter(o => !o.done)
  return (open.length ? open : out.filter(o => o.id === 'start:design')).map(({ done, ...o }) => o)
}
export function startText(starts) {
  const [first] = starts
  if (!first) return ''
  const name = first.id === 'start:design' || first.id === 'start:slice' ? first.label.toLowerCase() : `the ${first.label.toLowerCase().replace(/^the /, '')}`
  return `Where to start? I would begin with ${name}: ${first.why}.`
}
// the planner's turn right after the lock, with the parts as options
export function startTurn(chat, plan, now = Date.now()) {
  const starts = startsOf(plan)
  if (!starts.length) return null
  const turn = { id: nextId(chat), who: 'planner', at: now, text: startText(starts), options: starts, refs: [], marks: [], layers: [], made: [], reads: [] }
  chat.turns.push(turn)
  return turn
}
