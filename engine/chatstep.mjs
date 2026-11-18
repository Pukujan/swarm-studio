// @ts-check
// A website's and an app's chat say only what is true, and their buttons really act: what engine/gamestep.mjs is
// for the game chat (owner, 2026-11-14: "chat works for everything"; 2026-11-15: one true state per thing, every
// screen and the chat read it). The planner never says by itself that something is built, finished, published,
// live, locked or started, or how many pages there are: the facts come from the one state of the build
// (engine/buildstate.mjs for a website; an app's state object as engine/appjob.mjs state() gives it, or a sibling
// state function's, anything with { state, hasApp, steps }), the planner is told them before it speaks, its answer
// is checked against them, and the turn ends with the real next step as buttons that run what their label says.
//
//   chatFacts({ kind, build, pages, app, published, locked })   what is true now, as data
//   stateLine(facts)            the same in the Studio's own words (web/replaytalk.js), for the person
//   factsText(facts)            the same for the planner, before it speaks
//   nextStep(facts)             the one line and the options for what the person can do next: ids are actions
//                               ('do:resume', 'do:again', 'do:app', 'do:brief') the chat runs as the button does
//   checkSaid(text, facts)      the planner's words without the sentences the facts deny, the true line added
//   firstLine(facts)            Hermia's first line in a chat where nothing was said yet
//   wordsAct(text, step)        "resume", "try again", "build the app", "build it", "go": the step's action, typed
//   stateAsk(text, facts)       "how far is the build?", "what's going on?": answered from the state, no model
//   truthTurn({ text, facts, plan })   one turn through all of it
//
// Pure functions: no store, no model, no server.
import { cutClaims } from './claims.mjs'
import { readBuild } from './askfirst.mjs'
import { endWords } from '../web/replaytalk.js'

/**
 * @typedef {import('./buildstate.mjs').BuildState} BuildState
 * @typedef {{ state?: string, hasApp?: boolean, steps?: unknown[] }} AppState an app's state object
 * @typedef {{ state: string, live: boolean, whole: boolean, pages: number, names: string[], built: number, total: number, failed: number, next: 'resume' | 'again' | null, raw: BuildState }} SiteFacts
 * @typedef {{ state: string, built: boolean, working: boolean, steps: number }} AppFacts
 * @typedef {{ kind: 'site' | 'app', run: string | null, pages: number, names: string[], site: SiteFacts | null, app: AppFacts | null, published: string | null, locked: boolean }} ChatFacts
 * @typedef {{ id: string, label: string, why: string, made: never[] }} StepOption
 * @typedef {{ text: string, options: StepOption[], run: string | null, wait?: boolean }} Step  run: the build the actions act on
 */

const LIVE = new Set(['planning', 'building'])
const WHOLE = new Set(['done', 'unchanged'])

/**
 * What is true now. build: the website build's one state (null: no website build here). pages: its pages' titles.
 * app: the app's state object (null: not asked about, or none). published: the address it is live at.
 * run: the build's id, for the step's actions.
 * @param {{ kind?: string, run?: string | null, build?: BuildState | null, pages?: string[], app?: AppState | null, published?: string | null, locked?: boolean }} [o]
 * @returns {ChatFacts}
 */
export function chatFacts({ kind = 'site', run = null, build = null, pages = [], app = null, published = null, locked = false } = {}) {
  const site = build ? {
    state: build.state, live: LIVE.has(build.state), whole: WHOLE.has(build.state), pages: pages.length, names: pages.slice(0, 12).map(String),
    built: build.done + build.kept, total: build.planned + build.kept, failed: build.failed.length, next: build.next, raw: build
  } : null
  const a = app ? { state: String(app.state || 'idle'), built: !!app.hasApp, working: app.state === 'working', steps: (app.steps || []).length } : null
  // a game keeps its own kind: it has no pages and no website build, but its app build is the thing its chat could
  // not see (issue #666), and stateLine/factsText read the app facts the same way for all three kinds
  return { kind: kind === 'app' ? 'app' : kind === 'game' ? 'game' : 'site', run: run ? String(run) : null, pages: pages.length, names: pages.slice(0, 12).map(String), site, app: a, published: published ? String(published) : null, locked: !!locked }
}

const APP_SAYS = { working: 'The app is still building.', failed: 'The app build did not finish.', stopped: 'The app build is stopped partway.', paused: 'The app build waits on you.' }
/** @param {AppFacts} a */
const appLine = a => APP_SAYS[/** @type {keyof typeof APP_SAYS} */ (a.state)] || (a.built ? 'The app is built.' : 'The app is not built yet.')
/** @param {SiteFacts} s */
const siteLine = s => s.state === 'planning' ? 'Planning the pages…'
  : s.live ? `Building: ${s.raw.done}/${s.raw.planned} sections across ${s.pages} pages.`
    : s.whole ? (s.pages === 1 ? 'The page is built.' : `All ${s.pages} pages are built.`)
      : endWords(s.raw)

/**
 * The state in words, for the person: the build's own words (web/replaytalk.js endWords), never the planner's.
 * @param {ChatFacts} f
 */
export function stateLine(f) {
  const parts = []
  if (f.site) parts.push(siteLine(f.site))
  if (f.app && (f.kind === 'app' || f.app.built || f.app.state !== 'idle')) parts.push(`${!f.site && f.pages && !f.app.built ? `The design has ${f.pages} page${f.pages === 1 ? '' : 's'}. ` : ''}${appLine(f.app)}`)
  if (f.published) parts.push(`Live at ${f.published}.`)
  return parts.join(' ') || 'Nothing is built yet.'
}

/**
 * What the planner is told before it speaks.
 * @param {ChatFacts} f
 */
export function factsText(f) {
  const s = f.site
  const lines = [`What has really happened: ${stateLine(f)}`]
  if (f.pages) lines.push(`Pages: ${f.pages} (${f.names.join('; ')}).`)
  lines.push(`Building now: ${s?.live || f.app?.working ? 'yes' : 'NO'}. Published: ${f.published || 'NO'}.${f.kind === 'app' || f.app ? ` The app: ${f.app?.built ? 'built' : 'NOT built'}.` : ''}`)
  lines.push('Say nothing else about what is built, finished, running, published, live or locked, and no other count of pages or sections: you cannot build, publish or start anything yourself; the person\'s buttons do.')
  return lines.join('\n')
}

/** @param {string} id  @param {string} label  @returns {StepOption} */
const o = (id, label) => ({ id, label, why: '', made: [] })

/**
 * The one next step. Its options are actions: the chat runs each as the button of the same name does
 * (web/canvas/talk.js stepRun), and a typed "resume", "try again", "build the app" or "go" is the same press.
 * talked: something was said in this chat (a brief is written from the talk, so with nothing said there is none).
 * @param {ChatFacts} f  @param {{ talked?: boolean }} [o]  @returns {Step}
 */
export function nextStep(f, { talked = true } = {}) {
  const text = stateLine(f)
  const s = f.site, a = f.app
  // somebody is working: nothing to press, the answer says how far
  if (s?.live || a?.working) return { text, options: [], run: f.run, wait: true }
  /** @type {StepOption[]} */
  const options = []
  // an app that is designed and not built: the room's own button, in the chat
  // (its design is a build of its own kind, with no website state: its pages are what says it is designed)
  if (f.kind === 'app' && a && !a.built && (s ? s.built > 0 : f.pages > 0)) options.push(o('do:app', a.state === 'failed' ? 'Try again' : a.state === 'stopped' && a.steps ? 'Go on' : 'Build the app'))
  // a build with something left: the one way forward its state names
  else if (s?.next === 'resume') options.push(o('do:resume', 'Resume'))
  else if (s?.next === 'again') options.push(o('do:again', 'Try again'))
  // and what a talk always ends in: the brief, written from it (nothing starts until its own Build)
  if (talked) options.push(o('do:brief', 'Build'))
  return { text, options, run: f.run }
}

/**
 * Hermia's first line in a chat where nothing was said yet: what is here, from the state, and what to do.
 * @param {ChatFacts} f
 */
export function firstLine(f) {
  if (!f.site && !f.app) return 'Say what to make. Nothing is built until you say.'
  const line = stateLine(f)
  return /Say what to change/.test(line) || f.site?.live || f.app?.working ? line : `${line} Say what to change.`
}

// ---------- the person's words
const tidy = (/** @type {string} */ s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
const NOT_NOW = /\b(do ?n'?t|dont|do not|not|never|no|later|wait|hold|stop|should|could|would|can|how|what|why|when|if)\b/
/** @type {[string, RegExp][]} */
const WORDS = [
  ['do:resume', /^(please )?(resume|go on|continue|keep going|carry on|pick (it )?up|finish (it|the build))( it| the build| building)?( please)?$/],
  ['do:again', /^(please )?(try( it)? again|retry|again|start (it )?again|build it again)( please)?$/],
  ['do:app', /^(please )?((build|make|start|create)( me)? (the|an|my|this) app|turn (it|this) into (an|a working) app|go on|continue|resume|keep going|try( it)? again|retry)( now| please)?$/]
]
/**
 * The action a typed line asks for, or null: only a whole line that is the command, never a question, never
 * "don't build yet", and only an action the step offers now.
 * @param {string} text  @param {Step} step
 */
export function wordsAct(text, step) {
  const raw = tidy(text)
  const t = raw.replace(/[.!]+$/, '')
  if (!t || t.length > 48 || /\?/.test(raw) || NOT_NOW.test(t)) return null
  const ids = (step?.options || []).map(x => x.id)
  for (const [id, re] of WORDS) {
    if (!ids.includes(id) || !re.test(t)) continue
    // "go on" and "try again" start an app only where its button says so (a build stopped or failed partway)
    if (id === 'do:app' && !/\bapp\b/.test(t) && step.options.find(x => x.id === id)?.label === 'Build the app') continue
    return id
  }
  // the button's own name, typed
  const named = (step?.options || []).find(x => x.label.toLowerCase() === t.replace(/^please /, ''))
  if (named) return named.id
  if (!readBuild(t)) return null
  // "build it", "make it": the app's build where that is the step, else the brief; never Resume or Try again,
  // which a word that names another button must not press. "go", "do it", "go ahead": the step's first action.
  if (/\b(build|make|generate|create)\b/.test(t)) return ids.includes('do:app') ? 'do:app' : ids.includes('do:brief') ? 'do:brief' : null
  return ids.find(i => i.startsWith('do:')) || null
}

const IT = '(?:it|this|that|the (?:build|site|website|app|project))'
const STATE_ASK = new RegExp(`^(?:so |and |ok(?:ay)?,? |hey,? |hermia,? )*(?:` + [
  `how far (?:along )?(?:is|are|did|has|have) (?:${IT}|we|you|the crew)(?: (?:along|now|got|gotten|come|get))?`,
  `how(?:'s| is) ${IT} (?:going|doing|coming(?: along)?)`,
  `what(?:'s| is|s) (?:going on|happening)(?: here| now| with ${IT})?`,
  `what(?:'s| is|s) (?:built|done|left|finished)(?: so far| now| yet| here)?`,
  `what(?:'s| is|s) the (?:state|status)(?: of ${IT})?`,
  `is ${IT} (?:done|built|finished|ready|live|published|building|running)(?: yet| now)?`,
  `(?:is|are) (?:all )?(?:the )?(?:pages|sections) (?:done|built|finished|ready)(?: yet| now)?`,
  `did ${IT} (?:finish|fail|work|stop|build)`,
  'status', 'progress', 'where are we(?: now| at)?'
].join('|') + ')$')
/**
 * Is this a question about how far things are? Then the state answers it, not the planner. Only the whole line,
 * about the build itself ("add a progress bar" and "how far down should the menu go?" are words for the planner),
 * and only with something here to speak of.
 * @param {string} text  @param {ChatFacts} f
 */
export function stateAsk(text, f) {
  const t = tidy(text).replace(/[?.!]+$/, '').trim()
  return !!(f.site || f.app) && STATE_ASK.test(t)
}

// ---------- the planner's own words, checked against the facts
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const N = `(\\d{1,3}|${Object.keys(NUMS).join('|')})`
const num = (/** @type {string | undefined} */ w) => (w === undefined ? NaN : /^\d+$/.test(w) ? Number(w) : NUMS[/** @type {keyof typeof NUMS} */ (w.toLowerCase())] ?? NaN)
// "is built", "are all finished", "has been published", "it's live", "has started"
const BE = /\b(?:is|are|was|were|it['’]s|that['’]s|they['’]re|has been|have been|has|have|got)\s+(?:(?:all|now|already|fully|just|been|still|currently)\s+)*(built|finished|done|complete|completed|ready|live|online|published|deployed|launched|locked|started|underway|under way|running|building|in progress)\b(?!\s+(?:to|for|when|if|as)\b)/gi
// "I built", "we've published", "the crew has started", "I'm building"
const DID = /\b(?:i|we|the crew|they|hermia)(?:['’]ve|['’]m|['’]re|\s+have|\s+has|\s+am|\s+are|\s+is|\s+just|\s+already|\s+now)*\s+(built|finished|completed|published|deployed|launched|started|locked|building|publishing|deploying|starting)\b/gi
// what comes just before makes it no claim: "once it is built", "when all 3 pages are built", "it is not built"
const UNSAID = /\b(once|when|whenever|if|after|until|before|unless|whether|as soon as|will|would|should|could|can|must|might|may|not|never|won['’]t|isn['’]t|aren['’]t|wasn['’]t|hasn['’]t|haven['’]t|didn['’]t|doesn['’]t|don['’]t|cannot|can['’]t)\s+(?:[\w'’]+\s+){0,3}$/i
// a second state hung on the first: "is finished and live", "is built, published and locked"
const AND = /(?:\band|,)\s+(?:(?:is|are|now|already|also)\s+)*(built|finished|done|live|online|published|deployed|launched|locked|started|running)\b/gi
const KIND = { built: 'built', finished: 'built', done: 'built', complete: 'built', completed: 'built', ready: 'built', live: 'published', online: 'published', published: 'published', deployed: 'published', launched: 'published', publishing: 'published', deploying: 'published', locked: 'locked' }
// what the verb's own subject has to be, to be a claim about the build: the words just before it ("the brief is
// ready", "I think that part is done" and "many shops like yours are online" are not about it)
const ABOUT = /\b(site|website|app|pages?|sections?|screens?|build|project|prototype|it|everything|all|they)\b/i
const subjectOf = (/** @type {string} */ s, /** @type {RegExpMatchArray} */ m) => `${s.slice(0, m.index).split(/[,;:]/).at(-1)?.split(/\s+/).slice(-6).join(' ') || ''} ${m[0].split(/\s+/)[0]}`
const COUNT = new RegExp(`\\b${N}\\s+(?:of\\s+(?:the\\s+)?${N}\\s+)?(pages?|sections?|screens?)\\b`, 'i')
const HAS = new RegExp(`\\b(?:site|website|project|app|it)\\s+(?:now\\s+)?(?:has|have)\\s+(?:now\\s+|only\\s+|exactly\\s+)?${N}\\s+(pages?|screens?)\\b`, 'i')
const NOTHING = /\b(nothing|no pages?|not anything)\b[^.!?]{0,30}\b(built|made|exists?|here|started)\b/i

/** every claim a sentence makes: 'built' | 'published' | 'locked' | 'running'  @param {string} s */
function claimsIn(s) {
  if (/\?\s*$/.test(s)) return []
  const out = new Set()
  for (const re of [BE, DID]) for (const m of s.matchAll(re)) {
    if (UNSAID.test(s.slice(0, m.index))) continue
    const kind = KIND[/** @type {keyof typeof KIND} */ (m[1].toLowerCase())] || 'running'
    // "I built", "the crew has started" name who did it; "is built" has to be said of the build ("is locked" of anything)
    if (re === BE && kind !== 'locked' && !ABOUT.test(subjectOf(s, m))) continue
    out.add(kind)
  }
  if (out.size) for (const m of s.matchAll(AND)) out.add(KIND[/** @type {keyof typeof KIND} */ (m[1].toLowerCase())] || 'running')
  return [...out]
}
/** is a "built" sentence true? With a count in it the count has to be the state's.  @param {string} s  @param {ChatFacts} f */
function builtOk(s, f) {
  if (/\bapp\b/i.test(s)) return !!f.app?.built
  const site = f.site
  if (!site) return false
  const c = COUNT.exec(s)
  if (c) {
    const n = num(c[1]), of = num(c[2])
    if (/^section/i.test(c[3])) return n === site.built && (Number.isNaN(of) ? true : of === site.total)
    return site.whole && n === site.pages && (Number.isNaN(of) || of === site.pages)
  }
  return site.whole
}
/** @param {ChatFacts} f  @returns {import('./claims.mjs').ClaimRule[]} */
const rules = f => [
  { claims: s => claimsIn(s).includes('built'), ok: s => builtOk(s, f) },
  { claims: s => claimsIn(s).includes('published'), ok: () => !!f.published },
  { claims: s => claimsIn(s).includes('running'), ok: () => !!(f.site?.live || f.app?.working) },
  { claims: s => claimsIn(s).includes('locked'), ok: () => f.locked },
  { claims: s => !!f.site && !/\?\s*$/.test(s) && HAS.test(s), ok: s => num(HAS.exec(s)?.[1]) === f.site?.pages },
  { claims: s => !/\?\s*$/.test(s) && NOTHING.test(s), ok: () => !((f.site?.built || 0) > 0 || f.app?.built) }
]

/**
 * The planner's words without the sentences that claim what the facts deny. When something was cut, the true
 * line is said in its place, so the answer is corrected and never empty.
 * @param {string} text  @param {ChatFacts} f
 * @returns {{ text: string, cut: string[] }}
 */
export function checkSaid(text, f) {
  const { text: kept, cut } = cutClaims(text, rules(f))
  if (!cut.length) return { text: kept, cut }
  const line = stateLine(f)
  return { text: kept.includes(line) ? kept : `${kept} ${line}`.trim(), cut }
}

/**
 * One turn of a website's or an app's chat. plan() asks the planner (it was told factsText) and resolves with
 * { reply } | { brief } | { tool }. Returns that, with the reply checked, plus `step` (the real next step) and:
 *   act    the typed line was the step's action ("resume", "build the app"): the planner is not asked
 *   by     'state' when the state answered a question about how far things are
 * ask: Ask mode (an answer and nothing else): no action is read from the words.
 * @param {{ text?: string, facts: ChatFacts, ask?: boolean, plan: () => Promise<any> }} o
 */
export async function truthTurn({ text = '', facts, ask = false, plan }) {
  const step = nextStep(facts)
  const act = ask ? null : wordsAct(text, step)
  if (act) return { act, step, reply: step.text }
  if (stateAsk(text, facts)) return { reply: stateLine(facts), step, by: 'state' }
  const out = await plan()
  if (out && typeof out.reply === 'string') {
    const checked = checkSaid(out.reply, facts)
    out.reply = checked.text
    if (checked.cut.length) out.cut = checked.cut
  }
  return { ...out, step }
}
