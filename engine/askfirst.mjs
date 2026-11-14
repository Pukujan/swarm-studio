// Ask before every build (docs/decisions/0020-ask-before-build.md). Before a new website build, the planner asks
// one question in the chat: Skip all and build now, Step by step, or Pick steps to skip. Nothing builds until the
// person answers. One answer is recommended, from their words alone, so it is the same offline and testable.
// The question is a planner turn whose options have `go:` ids (engine/chats.mjs keeps options on a turn); the
// answer (a pick, or typed words) is read in engine/talkplan.mjs say() before any model is needed, and recorded
// on the chat as chat.go. server/server.mjs /api/run asks, and builds once the chat has its answer.
// The Studio's chat then leads the rest (the second half of this file): which pages, which pictures, one question
// at a time, each answered by typing, with "you choose" and "skip all, just build".
// Pure functions only.

export const PATHS = ['all', 'steps', 'pick']
// what each final answer does: all builds now; the others open the Studio walk with those steps skipped
export const FINAL = ['all', 'steps', 'skip-brand', 'skip-plan']
// Lock goes with Brand: the server uses a brand only once it is locked (server/server.mjs lockedBrand),
// so skipping Brand skips Lock too, and doing Brand locks it
export const SKIPS = { all: ['brand', 'plan'], steps: [], 'skip-brand': ['brand'], 'skip-plan': ['plan'] }

export const ASK_TEXT = 'Before I build: skip the steps, or go through them?'
export const PICK_TEXT = 'Which to skip?'

const LABEL = { all: 'Skip all, build now', steps: 'Step by step', pick: 'Pick steps to skip' }
const PLAIN = { all: 'The crew picks the look and pages', steps: 'Brand, then Plan, then Build', pick: 'Skip Brand or Plan' }

// ---------- the recommendation, from the person's words (and whether they brought a file or a picture)
// help: they asked to be walked through it, or named their own brand
const HELP = /\b(help\s+me|set\s+(it|this|everything)\s+up|walk\s+me\s+through|guide\s+me|step[\s-]*by[\s-]*step|(my|our)\s+(own\s+)?(brand|branding|logo|brand\s+guide|style\s+guide)|like\s+this\s+(site|website|page|one))\b/i
// an explicit opt-out of the setup: it beats a link they also gave
const OPT_OUT = /\b(no|without|skip(\s+the)?)\s+(brand(ing)?|setup|set-?up|onboarding|steps|questions)\b|\bdo\s*n[o']?t\s+ask\b|\bdont\s+ask\b|\bskip\s+(it\s+)?all\b|\bno\s+questions\b/i
// sure words: just make it
const SURE = /\b(just|simply)\s+(make|build|generate|create|do|ship)\b|\b(build|make|generate)\s+(it\s+)?(now|right\s+away|straight\s+away)\b|\bjust\s+(the\s+)?(site|website|page)\b/i
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+\.\w{2,}/i
// a full brief: enough words to build from without asking more
export const LONG_BRIEF = 45

const words = s => String(s || '').split(/\s+/).filter(Boolean).length

// what their words already answer: the look (colours, type) and the pages
export function answered(text = '') {
  const t = String(text || '')
  return {
    brand: /\b(colou?rs?|palette|fonts?|typeface|typography|serif|sans|#[0-9a-f]{3,6}\b|dark\s+mode|pastel|neon|monochrome)\b/i.test(t),
    plan: /\bpages?\s*:|\b(home|about|contact|pricing|menu|blog|faq|shop|gallery)\s*(,|and)\s*(home|about|contact|pricing|menu|blog|faq|shop|gallery)\b/i.test(t)
  }
}

// recommend(text, { files }) -> { path: 'all'|'steps'|'pick', why }
// Precedence: asked for help (or named their brand) > an explicit opt-out > a link or a file > sure words >
// a long brief > pick. "no branding, just generate" is an opt-out, never "brand"; "just make it like
// https://…" is a site to read, so Step by step.
export function recommend(text = '', { files = 0 } = {}) {
  const t = String(text || '')
  if (HELP.test(t)) return { path: 'steps', why: 'You asked to set it up' }
  if (OPT_OUT.test(t)) return { path: 'all', why: 'You said to skip the setup' }
  if (files > 0 || URL_RE.test(t)) return { path: 'steps', why: files > 0 ? 'Your file goes into the Brand' : 'The crew reads that site first' }
  if (SURE.test(t)) return { path: 'all', why: 'You said to just make it' }
  if (words(t) >= LONG_BRIEF) return { path: 'all', why: 'Your brief says enough' }
  return { path: 'pick', why: 'Keep the steps you care about' }
}

const option = (path, why) => ({ id: `go:${path}`, label: LABEL[path], why, made: [] })
// the three answers, the recommended one first with its reason
export function askOptions(rec) {
  const first = PATHS.includes(rec?.path) ? rec.path : 'pick'
  return [option(first, rec?.why || PLAIN[first]), ...PATHS.filter(p => p !== first).map(p => option(p, PLAIN[p]))]
}
// after "Pick steps to skip": Skip Brand, Skip Plan, or skip both; the step their words already answer first
export function pickOptions(text = '') {
  const a = answered(text)
  const brand = { id: 'go:skip-brand', label: 'Skip Brand', why: a.brand ? 'Your words set the look' : 'The crew picks the look', made: [] }
  const plan = { id: 'go:skip-plan', label: 'Skip Plan', why: a.plan ? 'Your words name the pages' : 'The crew picks the pages', made: [] }
  return [...(a.plan && !a.brand ? [plan, brand] : [brand, plan]), { id: 'go:all', label: 'Skip both, build now', why: PLAIN.all, made: [] }]
}

// the planner's question turn (engine/chats.mjs turn shape)
export function askTurn(id, text, { files = 0, now = Date.now() } = {}) {
  let rec
  try { rec = recommend(text, { files }) } catch { rec = { path: 'pick', why: PLAIN.pick } }
  return { id, who: 'planner', at: now, text: ASK_TEXT, options: askOptions(rec), refs: [], marks: [], layers: [], made: [], reads: [] }
}

// which question a planner turn asks: 'skips' (the first), 'pick' (which to skip), or null
export function askedOf(turn) {
  const ids = (turn?.options || []).map(o => String(o.id))
  if (!ids.some(i => i.startsWith('go:'))) return null
  return ids.includes('go:pick') ? 'skips' : 'pick'
}
// the chat's open skip question: its latest planner turn asks one, and nobody answered yet
export function pendingAsk(chat) {
  const last = [...(chat?.turns || [])].reverse().find(t => t.who === 'planner')
  return last && !chat?.go ? askedOf(last) : null
}

// ---------- typed answers: "skip all", "build now", "step by step", "skip the plan", "skip brand"
// readAnswer(text, asked) -> 'all'|'steps'|'pick'|'skip-brand'|'skip-plan'|null
export function readAnswer(text = '', asked = 'skips') {
  const t = String(text || '').toLowerCase().replace(/[’']/g, "'").trim()
  if (!t) return null
  // "skip brand and plan", "skip the plan and the brand": both named after one skip
  const pair = /\b(skip|no|without|drop)\s+(the\s+)?(brand(ing)?|plan|pages)\s*(and|&|,|or)\s*(the\s+)?(brand(ing)?|plan|pages)\b/.exec(t)
  const both = !!pair && /brand/.test(pair[0]) && /plan|pages/.test(pair[0])
  const brand = both || /\b(skip|no|without|drop)\s+(the\s+)?(brand(ing)?|look|lock)\b/.test(t)
  const plan = both || /\b(skip|no|without|drop)\s+(the\s+)?(plan|pages|planning)\b/.test(t)
  if ((brand && plan) || /\bskip\s+(them\s+|it\s+)?(all|both|everything)\b|\bbuild\s+(it\s+)?now\b|\bjust\s+(build|make|generate|do)\b|\bskip\s+all\b|^(go|go ahead|build|build it|yes|yes please|sure|ok|okay)[.!]*$/.test(t)) return 'all'
  if (/\bstep[\s-]*by[\s-]*step\b|\bone\s+(step\s+)?at\s+a\s+time\b|\bwalk\s+me\s+through\b|\bguide\s+me\b|\bdo\s+(all\s+)?the\s+steps\b|\bgo\s+through\s+(them|the\s+steps)\b/.test(t)) return 'steps'
  if (brand) return 'skip-brand'
  if (plan) return 'skip-plan'
  if (/\bpick\b|\bchoose\b|\bwhich\s+(ones?|steps?)\b/.test(t)) return asked === 'pick' ? null : 'pick'
  // answering "Which to skip?" with the step's name alone
  if (asked === 'pick') {
    if (/^(the\s+)?(brand(ing)?|look)[.!]*$/.test(t)) return 'skip-brand'
    if (/^(the\s+)?(plan|pages)[.!]*$/.test(t)) return 'skip-plan'
    if (/^(both|all|everything)[.!]*$/.test(t)) return 'all'
  }
  return null
}

// one short line for each final answer
export const GO_TEXT = {
  all: 'Building it now: the crew picks the look and the pages, pictures as in Setup.',
  steps: "Let's go step by step, starting with Brand.",
  'skip-brand': 'Brand skipped. On to the Plan.',
  'skip-plan': 'Plan skipped. Starting with Brand.'
}

// ---------- the Studio's chat leads (decision 0020; the owner, 2026-11-13: the chat "didnt ask how many pages i
// want and what should they be and gave option for you choose"; it is "supposed to be very dynamic with its
// question and guide the user so they never have to click a button but still feel guided, or give an option to
// skip everything and just generated based on their prompt"). Before a website's build, when the person has not
// said, Hermia asks in the chat, one question at a time, each answered by typing:
//   pages     which pages, how many, or "you choose" (the crew decides: no Pages line in the brief)
//   pictures  painted, stock photos or drawn, or "you choose" (what Setup recommends)
// "Skip all, just build" at any point takes the recommended defaults and says in one line what it picked.
// The answers are the Studio's kit state (web/kit-site.js): pages, pageCount, pagesBy: 'crew', pictures.
// server/studio.mjs POST /api/studio/:pid/ask applies them; web/scaffold.js asks and builds.
export const STUDIO_ASKS = ['pages', 'pictures']
export const PICTURE_MODES = ['painted', 'stock', 'drawn']
const PICTURE_SAYS = { painted: 'painted', stock: 'stock photos', drawn: 'drawn' }
export const STUDIO_ASK_TEXT = {
  pages: 'Which pages? Name them, or say "you choose".',
  pictures: 'Pictures: painted, stock photos or drawn? Or say "you choose".'
}
export const MAX_PAGES = 12

const tidy = s => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()

// what is still open, in the order it is asked. state: the kit's ({ pages, pageCount, pagesBy, pictures });
// planSkipped: the person skipped the Plan when asked; built: the project has a build (its pages exist)
export function studioOpen(state = {}, { planSkipped = false, built = false } = {}) {
  const open = []
  const pagesSaid = (Array.isArray(state?.pages) && state.pages.length > 0) || state?.pagesBy === 'crew'
  if (!pagesSaid && !planSkipped && !built) open.push('pages')
  if (!PICTURE_MODES.includes(state?.pictures)) open.push('pictures')
  return open
}

// "you choose", "up to you", "surprise me", "whatever you think", "idk", "no preference", "the crew decides"
const YOU_CHOOSE = /\b(you|u|ya)\s+(choose|pick|decide|do it|do you)\b|\byou\s+can\s+(choose|pick|decide)\b|\b(up\s+to|upto)\s+(you|u)\b|\byour\s+(call|choice|pick)\b|\bsurprise\s+me\b|\bwhatever(\s+(you|u)\s+(think|want|like)|\s+works|\s+is\s+best)?[.!]*$|\b(i\s+)?(do\s*n'?t|dont)\s+(care|mind|know)\b|\bidk\b|\bno\s+(preference|idea)\b|\bnot\s+sure\b|\b(the\s+)?crew\s+(decides?|picks?|chooses?|can\s+(decide|pick|choose))\b|\blet\s+(the\s+crew|hermia|them)\s+(decide|pick|choose)\b|\b(dealer'?s|your)\s+choice\b|\b(any|anything|either)(\s+(is|works|will\s+do))?(\s+fine)?[.!]*$|\b(the\s+)?(default|recommended)s?(\s+one)?[.!]*$/
export const readYouChoose = (text = '') => YOU_CHOOSE.test(tidy(text))

// "skip all, just build", "skip everything", "just generate it from my prompt", "no questions", "stop asking"
const SKIP_ALL = /\bskip\s+(it\s+|them\s+|this\s+)?(all|everything|both|the\s+(questions|rest|steps))\b|\bskip\s+all\b|\bjust\s+(build|make|generate|create|do|ship)\b|\b(build|make|generate)\s+(it\s+)?(now|already|anyway|right\s+away|straight\s+away)\b|\bno\s+(more\s+)?questions\b|\b(stop|quit)\s+asking\b|\b(do\s*n'?t|dont)\s+ask\b|\b(from|based\s+on|with)\s+(just\s+)?(my|the)\s+prompt\b|\b(you|u)\s+(choose|pick|decide)\s+(everything|it\s+all|all(\s+of\s+it)?|the\s+rest)\b/
export const readSkipAll = (text = '') => SKIP_ALL.test(tidy(text))

// "build", "build it", "go", "go ahead", "make it", "start": the same as pressing Build (what is open is asked first)
const BUILD = /^(ok(ay)?[,.!]?\s+)?(please\s+)?((let'?s\s+)?(build|make|generate|create|start)(\s+(it|this|that|the\s+(site|website)))?|go|go\s+ahead|do\s+it|ship\s+it|ready|i'?m\s+ready)(\s+please)?[.!]*$/
export const readBuild = (text = '') => BUILD.test(tidy(text))

// ---- pictures: "painted", "stock photos", "drawn", "real photos", "illustrations", "ai images", "no photos"
const PIC = {
  drawn: /\b(drawn|draw(ings?|n\s+ones)?|draw\s+them|illustrat(ed|ions?|e\s+them)|svg|vectors?|sketch(ed|es|y)?|line\s+art|no\s+(photos?|pictures|images))\b/,
  stock: /\b(stock|photos?|photographs?|photography|real\s+(photos?|pictures|images)|pexels|unsplash)\b/,
  painted: /\b(paint(ed|ings?)?|paint\s+them|a\.?i\.?[\s-]*(images?|pictures?|art|made|generated)?|generated?|image\s+model|made\s+up)\b/
}
// words a pictures answer may carry besides the choice itself
const PIC_FILLER = /\b(pictures?|images?|pics?|use|using|with|go|for|them|the|ones?|i|i'd|want|would|like|prefer|let'?s|have|make|it|all|be|should|please|just|only|some|kind|of|and|them|to|are|is)\b|[:,.!=\-]/g
// readPictures(text, { only }) -> 'painted' | 'stock' | 'drawn' | null. Two kinds named ("painted or stock?") is
// not an answer. only: the whole line must be the choice (used while another question is open, so a page
// called "Photos" is not read as stock photos)
export function readPictures(text = '', { only = false } = {}) {
  const t = tidy(text)
  if (!t || /\?\s*$/.test(t)) return null
  // "no photos" is drawn, not stock
  const noPhotos = /\bno\s+(photos?|pictures|images)\b/.test(t)
  const hits = PICTURE_MODES.filter(m => PIC[m].test(t) && !(noPhotos && m === 'stock'))
  if (hits.length !== 1) return null
  if (only) {
    let rest = t
    for (const m of PICTURE_MODES) rest = rest.replace(new RegExp(PIC[m].source, 'g'), ' ')
    if (rest.replace(PIC_FILLER, ' ').trim()) return null
  }
  return hits[0]
}

// ---- pages: "Home, Work, Contact", "home work and contact", "3 pages", "5 pages: home, menu, ...", "pages: a, b"
const NUMS = { one: 1, a: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3 }
const NUM = `(\\d{1,2}|${Object.keys(NUMS).join('|')})`
const numOf = w => { const n = /^\d+$/.test(w) ? Number(w) : NUMS[w] || 0; return n >= 1 ? Math.min(MAX_PAGES, n) : 0 }
// page names people type without commas between them
const KNOWN = ['home', 'about', 'work', 'contact', 'pricing', 'menu', 'blog', 'faq', 'shop', 'store', 'gallery', 'services', 'portfolio', 'team', 'booking', 'events', 'news', 'projects', 'products', 'reviews', 'press', 'careers', 'jobs', 'story', 'visit', 'location', 'hours', 'features', 'docs', 'support', 'login', 'signup', 'cart', 'checkout', 'testimonials', 'cases', 'journal', 'studio', 'classes', 'rooms', 'plans', 'gifts', 'landing']
const NOT_A_NAME = /\b(it|its|is|are|was|be|feels?|makes?|should|would|could|can|wants?|needs?|like|with|in|that|this|i|we|you|more|less|very|not|but|bigger|smaller|change|please|something|looks?|build|site|website)\b/i
const LEAD = /^(ok(ay)?|sure|yes|yeah|hmm+|well|so|um+|maybe|how about|what about|i think|i guess|i(\s+would|'d)?\s+(want|need|like)|i\s+(want|need)|let'?s\s+(have|do|go\s+with|say)|give\s+me|make\s+it|make|just|only|with|it\s+should\s+have|it\s+needs?|we\s+need|have)\b[\s,:]*/
const titled = s => s.charAt(0).toUpperCase() + s.slice(1)
// readPages(text, { asked }) -> { pages: [...] } | { count: n } | null
// asked: the pages question is the open one. Without it only a line that says "pages" is read, so a comma list
// inside an idea is never taken for pages.
export function readPages(text = '', { asked = false } = {}) {
  const raw = String(text || '').replace(/[’‘]/g, "'").replace(/[“”"]/g, '').trim()
  if (!raw || raw.length > 400 || /\?\s*$/.test(raw)) return null
  let t = raw, said = false, count = 0
  for (let i = 0; i < 4; i++) {
    const before = t
    t = t.replace(new RegExp(LEAD.source, 'i'), '')
    const n = new RegExp(`^(?:about\\s+|around\\s+|maybe\\s+|just\\s+|only\\s+)?${NUM}\\s+pages?\\b(?:\\s+(?:is|are|will\\s+do|is\\s+enough|total|in\\s+total|please))*[\\s:,\\-–.]*`, 'i').exec(t)
    if (n) { count = numOf(n[1].toLowerCase()); said = true; t = t.slice(n[0].length) }
    const p = /^(the\s+)?pages?\s*(are|should\s+be|will\s+be|is|=)?\s*[:\-–]?\s*/i.exec(t)
    if (p && p[0]) { said = true; t = t.slice(p[0].length) }
    if (t === before) break
  }
  if (!asked && !said) return null
  // a bare number while the question is open: "3", "three"
  const bare = new RegExp(`^${NUM}[.!]*$`, 'i').exec(t.trim())
  if (bare && asked && numOf(bare[1].toLowerCase()) && !/^a$/i.test(bare[1])) return { count: numOf(bare[1].toLowerCase()) }
  t = t.replace(/[.!]+$/, '').trim()
  if (!t) return count ? { count } : null
  let parts = t.split(/\s*(?:,|;|\n|\/|\+|&|\band\b|\bthen\b|\bplus\b)\s*/i).map(x => x.trim()).filter(Boolean)
  // "home work contact", "home work and contact": no commas, every word a page name people know
  parts = parts.flatMap(part => { const ws = part.toLowerCase().split(/\s+/); return ws.length > 1 && ws.every(w => KNOWN.includes(w)) ? ws : [part] })
  const names = []
  for (let part of parts) {
    part = part.replace(/^(a|an|the|one)\s+/i, '').replace(/\s+pages?$/i, '').replace(/^['`]+|['`.!]+$/g, '').trim()
    if (!part) continue
    // a sentence, not a page name: too long, or words a name does not carry ("make it feel calm", "a shop in Kyoto")
    if (!/^[\p{L}\p{N}][\p{L}\p{N} '&\-]{0,39}$/u.test(part) || part.split(/\s+/).length > 4 || NOT_A_NAME.test(part)) return null
    if (!names.some(n => n.toLowerCase() === part.toLowerCase())) names.push(titled(part))
  }
  if (!names.length) return count ? { count } : null
  // one name of several words with nothing that marks a list is a sentence, not a page ("make it feel calm")
  if (names.length === 1 && !said && names[0].split(/\s+/).length > 2) return null
  return { pages: names.slice(0, MAX_PAGES) }
}

const pagesSays = state => (state.pages?.length ? `pages ${state.pages.join(', ')}` : state.pageCount ? `${state.pageCount} pages, the crew picks which` : 'the crew picks the pages')
// one line of everything the build will use: "the crew picks the look and the pages, pictures painted"
export function pickedLine(state = {}, { look = false, planSkipped = false, built = false } = {}) {
  const crewPages = !state.pages?.length && !state.pageCount
  const bits = []
  if (!look && crewPages && !built) bits.push('the crew picks the look and the pages')
  else {
    if (!look) bits.push('the crew picks the look')
    if (!built) bits.push(planSkipped && crewPages ? 'the crew picks the pages' : pagesSays(state))
  }
  bits.push(`pictures ${PICTURE_SAYS[state.pictures] || 'as in Setup'}`)
  return bits.join(', ')
}

// studioTurn({ said, asked, state, ... }) -> { read, set, text, next, build, building }
//   said      the person's typed line ('' asks what is next: the Build press, or the chat's opening line)
//   asked     the question open in the chat now: 'pages', 'pictures' or null
//   state     the kit's state; planSkipped, built: see studioOpen; look: the project has a look of its own
//   defaults  { pictures }: what "you choose" and "skip all" take (Setup's recommendation)
//   building  the person already asked for the build: when nothing is left open, it starts
// read: the line was an answer (else it goes to the planner as before). set: the kit fields to merge (null
// drops one). text: the planner's one line. next: the question now open. build: start the build now.
export function studioTurn({ said = '', asked = null, state = {}, planSkipped = false, built = false, look = false, defaults = {}, building = false } = {}) {
  const env = { planSkipped, built }
  const dflt = PICTURE_MODES.includes(defaults?.pictures) ? defaults.pictures : 'painted'
  const merged = set => { const s = { ...state, ...set }; for (const k of Object.keys(s)) if (s[k] == null) delete s[k]; return s }
  const done = (set, lead, wants = building) => {
    const now = merged(set), next = studioOpen(now, env)[0] || null
    if (next) return { read: true, set, text: [lead, STUDIO_ASK_TEXT[next]].filter(Boolean).join(' '), next, build: false, building: wants }
    if (wants) return { read: true, set, text: `Building it now: ${pickedLine(now, { look, ...env })}.`, next: null, build: true, building: false }
    return { read: true, set, text: [lead, 'Say "build" when you are ready.'].filter(Boolean).join(' '), next: null, build: false, building: false }
  }
  const open = studioOpen(state, env)
  const text = String(said || '').trim()
  // nothing said: what to ask now
  if (!text) {
    const next = open[0] || null
    return { read: false, set: {}, text: next ? STUDIO_ASK_TEXT[next] : '', next, build: !next && building, building: !!next && building }
  }
  if (!STUDIO_ASKS.includes(asked)) asked = null
  // skip all: the recommended defaults for everything still open, said in one line
  if (readSkipAll(text)) {
    const set = {}
    if (open.includes('pages')) set.pagesBy = 'crew'
    if (open.includes('pictures')) set.pictures = dflt
    return done(set, '', true)
  }
  if (readBuild(text)) return done({}, '', true)
  const pagesSet = got => (got.pages ? { pages: got.pages, pagesBy: null, pageCount: null } : { pagesBy: 'crew', pageCount: got.count, pages: null })
  const pagesLead = got => (got.pages ? `Pages: ${got.pages.join(', ')}.` : `${got.count} ${got.count === 1 ? 'page' : 'pages'}, the crew picks which.`)
  if (asked === 'pages') {
    const pic = readPictures(text, { only: true })
    if (pic) return done({ pictures: pic }, `Pictures: ${PICTURE_SAYS[pic]}.`)
    const got = readPages(text, { asked: true })
    if (got && !(got.pages?.length === 1 && readYouChoose(text))) return done(pagesSet(got), pagesLead(got))
    if (readYouChoose(text)) return done({ pagesBy: 'crew', pageCount: null, pages: null }, 'The crew picks the pages.')
    return { read: false, set: {}, text: '', next: asked, build: false, building }
  }
  if (asked === 'pictures') {
    const pic = readPictures(text)
    if (pic) return done({ pictures: pic }, `Pictures: ${PICTURE_SAYS[pic]}.`)
    if (readYouChoose(text)) return done({ pictures: dflt }, `Pictures: ${PICTURE_SAYS[dflt]}.`)
    const got = readPages(text)
    if (got && !built) return done(pagesSet(got), pagesLead(got))
    return { read: false, set: {}, text: '', next: asked, build: false, building }
  }
  // no question open: only a line that says what it is about ("pages: Home, Work", "use stock photos")
  const got = built ? null : readPages(text)
  if (got) return done(pagesSet(got), pagesLead(got))
  const pic = /\b(pictures?|photos?|images?|pics?)\b/i.test(text) ? readPictures(text, { only: true }) : null
  if (pic) return done({ pictures: pic }, `Pictures: ${PICTURE_SAYS[pic]}.`)
  return { read: false, set: {}, text: '', next: open[0] || null, build: false, building }
}
