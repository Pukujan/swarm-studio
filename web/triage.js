// @ts-check
// Reading what the person is asking for in Build mode (docs/specs/49-read-the-ask.md). The owner, 2026-11-16:
// "its supposed to help address complex user request fix issues do multiple things as well ... so build mode is
// contraint to building the whatever they are building right now".
//
// Build mode took the box's free text and fired it straight out as one brief. A complaint ("the mocks look
// turn-based", "theyre not being repainted") became a fresh build; a request in several parts ("redo the mocks,
// then fix the look, then add lighting at assembly") became one build with all of it in one paragraph; and
// nothing in the chat ever said back what was understood, so the person could not tell which it was.
//
// readAsk reads the words before any of that: a build (a product described), a change (something here is wrong,
// or should be made otherwise), several things asked in order, a question, or words it will not guess about. It
// decides from the words alone (and a little of the build's state): no model, no I/O, no DOM. When the words are
// not decisive it says 'unclear', so the caller asks the planner; it never turns a change into a fresh build.
//
//   readAsk(text, ctx) -> { kind, parts, needsConfirmation, unclear, heard }
//     kind               'build' | 'change' | 'multi' | 'question' | 'unclear'
//     parts              [{ what, target }]: one per thing asked, in the order asked (what: the person's words)
//     needsConfirmation  not one whole build: the chat says back what it understood before anything runs
//     unclear            the words were not decisive: ask, rather than guess
//     heard              one plain line of what was understood ('' for a kind this file leaves alone)
//
// Why the browser and not engine/: the page runs as one inline script that cannot import anything
// (server/page.mjs joinModules), and the dependency rules keep web/ to web/ (.dependency-cruiser.cjs,
// page-code-stays-in-web). This file imports nothing and touches nothing, so node tests it directly
// (tests/triage.test.mjs) and web/canvas/loop.js is its one caller.

// The names a part can have: the plan's own stages, so what is read back is what the drawer shows ("the mocks",
// "the look"), plus the sections and the app for a website. Anything else the person names is still a part, with
// target ''.
const KIND_WORD = {
  mocks: 'the mock screens', sheets: 'the sheets', backdrops: 'the backdrops', sprites: 'the sprites',
  characters: 'the characters', lighting: 'the lighting', sound: 'the sound', look: 'the look', game: 'the game',
  sections: 'the sections', pages: 'the pages', app: 'the app', film: 'the film', video: 'the video', brand: 'the brand'
}

const tidy = s => String(s || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()

// ---------- what the words are doing
// A question: it opens with a question word, says it wants to know, or ends in "?". "can u install pillow then?"
// is one (engine/ask.mjs answers it); "can you make the hero darker" is a change, which is why a clause that asks
// for something of this build wins over the question form.
const QUESTION_OPEN = /^(what|what's|whats|how|how's|hows|why|why's|whys|when|where|which|who|whose|is|are|was|were|do|does|did|can|cannot|can't|could|couldn't|would|won't|will|should|shall|may|might|has|have|had|am)\b/i
const ASKS_TO_KNOW = /\b(tell me|show me|let me know|do you know|i want to know|i'?d like to know|wondering|any idea|explain|what do you think|thoughts on)\b/i
const HYPOTHETICAL = /\b(what if|how about|should i|should we|do you think|would it be|is it (possible|worth))\b/i
// An answer to a question the chat asked, and nothing else: "ok", "yes", "do it pls", "go ahead", "build it". Such a
// word is never a brief ("do it" once locked a roster with nobody asked) and is never read as a change here: the
// chat runs it in the state that asked for it, and with nothing asking it says so. web/chatmode.js has the short
// list of yes words Take uses; this one also takes the fillers people type after them.
export const isAgree = text => /^(?:(?:ok(?:ay)?|k|yes|yeah|yep|yup|sure|alright|fine|great|perfect|nice|cool|thanks|please|pls|plz|now|then|just|go|ahead|do|it|that|this|so|do it)[!.,\s]*){1,4}$/i.test(String(text || '').trim()) && !/^\s*$/.test(String(text || ''))
// a filler about nothing in particular ("not sure about it", "maybe"): no part named, no ask this file can read, and
// so no build. Never a question either, which is why a question does not start the words.
const FILLER = /^(?:i'?m |it'?s |that'?s |just |so |well |ok |okay )*(?:not sure|maybe|perhaps|i don'?t know|i dunno|idk|hmm+|no idea|never mind|nothing|dunno|unsure|confused|lost)\b/i


// A verb that works on what is here, as opposed to one that makes a product: "make it darker" (here) against
// "make a bakery site" (a build, which is excluded by PRODUCT_LEAD).
const VERB = /\b(redo|remake|rebuild|repaint|redraw|rework|regenerate|change|adjust|tweak|fix|update|improve|correct|replace|remove|delete|add|adding|give|make|turn|put|swap|set|brighten|lighten|darken|punch|beef|bump|lower|raise|increase|decrease|reduce|speed|slow|move|shift|resize|shrink|enlarge|reorder|rename|reword|rewrite|tidy|clean|simplify|refine|polish|paint|fill|tighten|sharpen|soften|smooth|balance|spread|loosen|calm|shorten|trim|center|centre|align|unify|harmonise|harmonize|tone)\b/i
const PRODUCT_NOUN = /\b(websites?|app|apps|game|games|shop|store|bakery|restaurant|cafe|menu|portfolio|landing|platform|site|program|tool|service)\b/i
const PRODUCT_LEAD = /^(a|an|the|my|our|build|make|create|design|generate|write|start|new)\s+[^.,;!?]{0,80}\b(websites?|app|apps|game|games|shop|store|bakery|restaurant|cafe|menu|portfolio|landing|platform|site|program|tool|service)\b/i

// A complaint about what is here. The sharp forms are one on their own ("the mocks look turn-based", "not feeling
// the lighting", "theyre not being repainted", "i cant test the game live"); the soft ones need a verb or a part
// ("more lighting", "kind of bland") to be about this build rather than a product being described.
const COMPLAINT_SHARP = /\b(looks? (wrong|off|bad|weird|flat|bland|dull|cheap|broken|turn-?based|like)|not feeling|doesn'?t (feel|work|look|read)|not being|isn'?t (working|repainting|updating|changing|showing|feeling|right)|aren'?t (working|repainting|showing|right)|not repaint|is not (working|repainting|right)|not working|that'?s wrong|that is wrong|still not|do(es)? ?n'?t work|broken|nothing (happened|changed|happens)|no change|i can'?t|i cannot|can'?t (test|play|see|tell|load|open))\b/i
const COMPLAINT_SOFT = /\b(looks?|looking|feels?|feeling|seems?|reads?|not|isn'?t|doesn'?t|dont|don'?t|didn'?t|won'?t|needs?|should|could be|too (flat|bland|dark|light|slow|busy|plain|chunky|small|big|fast)|still|stuck|wrong|weird|bland|flat|dull|cheap|messy|ugly|slow|clunky|hard to|difficult|confusing|missing|empty|nothing|never|again|turn-?based|not enough|more)\b/i

// Adding to what is here: "also", "and a...", "lighting at assembly" after an ask
const ADDING = /\b(add|adding|also|plus|another|extra|more|include|put|attach|finally|last)\b/i
// A look word: what makes it a change on its own ("brighter", "more visual polish"), or a thing being judged
const LOOK_WORD = /\b(look|looks|polish|lighting|brighter|darker|warmer|cooler|softer|sharper|flat|bland|dull|cheap|modern|bold|muted|vivid|vibrant|punchy|cinematic|cozy|cleaner)\b/i
// a judgement of a thing with nothing being asked for ("the mocks are good now", "looks great"): never a new build
const JUDGED = /\b(looks?|seems?|reads?|is|are|was|were)\s+(good|great|nice|fine|ok|okay|better|perfect|right|solid|awesome|better now)\b/i
// The past tense, about work done to something ("redid the mocks", "made the hero darker", "i fixed the copy"):
// never a fresh build. With the words naming a part, it is a change the planner will read; with none, ask.
const PAST = /^(?:you\s+(?:just\s+)?|we\s+|it\s+|they\s+|i\s+)?(?:re-?did|redid|rebuilt|repainted|redrawn|rewrote|changed|fixed|updated|made|added|removed|deleted|did|gave|turned|put|swapped|set|painted|brightened|darkened|lightened|polished|tweaked|adjusted|moved|renamed|reordered|kept|used|went|bumped|raised|lowered|reduced|increased|improved)\b/i

// ---------- the parts, as the words name them
// In the order they win: the first name in the words is the part ("the mocks look turn-based" is the mocks,
// whose look it is; "the look of the pages" is the look). Words that name two things name the narrower one:
// "redo the mocks" is the mocks, not the game the mocks are of.
const NAME = /** @type {[string, RegExp][]} */ ([
  ['mocks', /\b(mocks?|mock[- ]?ups?|mockups?|shots?)\b/i],
  ['sheets', /\b(sheets?|sprite\s?sheets?|turnarounds?)\b/i],
  ['backdrops', /\b(backdrops?|backgrounds?)\b/i],
  ['sprites', /\b(sprites?|pixel art)\b/i],
  ['characters', /\b(characters?|cast|hero|heroine|fighters?|enem(?:y|ies)|boss(?:es)?|avatar)\b/i],
  ['lighting', /\b(lighting|lights?|neon|glow|shadows?|bloom|grading)\b/i],
  ['sound', /\b(sounds?|audio|sfx|music|score|voices?)\b/i],
  ['look', /\b(look|style|styles|visual polish|polish|colours?|colors?|palette|theme|fonts?|typefaces?|typography|aesthetic|vibe|mood|art direction|art style|feel)\b/i],
  ['game', /\b(game|gameplay|levels?|combat|controls|mechanics?|difficulty)\b/i],
  ['sections', /\b(sections?|blocks?|copy|headlines?|paragraphs?|cards?)\b/i],
  ['pages', /\b(pages?|tabs?|screens?)\b/i],
  ['app', /\b(app|apps|software|product|working app)\b/i],
  ['film', /\b(films?|trailer|promo|teaser)\b/i],
  ['video', /\b(videos?|clip|footage)\b/i],
  ['brand', /\b(brand|branding|logo|logos|identity)\b/i]
])
/** The first name these words say, or '' if they name none of them. @param {string} words */
export function targetOf(words = '') {
  const t = String(words || '')
  for (const [kind, re] of NAME) if (re.test(t)) return kind
  return ''
}

// ---------- clauses
// A clause starts after a comma, a full stop, a line, or an ordering word ("first", "then", "after that",
// "finally"), and after a listed number ("1)", "2."). A part that only says "then", "please" or "and" is not a
// part. What is left is in the order it was said.
/** @param {string} text */
export function clausesOf(text = '') {
  const t = tidy(text)
  if (!t) return []
  const cut = t
    .replace(/\b(?:and\s+then|after\s+that)\b/gi, ' \u0001 ')
    .replace(/\b(?:first(?=\s)|then|afterwards|finally|lastly)\b/gi, ' \u0001 ')
    .replace(/(^|\s)([1-9])[).]\s+/g, '$1\u0001 $2) ')
    .replace(/[,;!?]+/g, ' \u0001 ')
  const out = []
  for (const raw of cut.split('\u0001')) {
    const c = raw.replace(/^[\s.]+|[\s.]+$/g, '').replace(/^(?:and|so|ok|okay|now|but)\s+/i, '').trim()
    if (!c) continue
    if (/^(?:and|then|also|plus|please|ok|okay|so|now|next|first|second|third|last|finally|too|just|it|that|this|them|those|ones|all|of|the|a|an)(?:\s+(?:of|the|it|them|that|this|ones|all|too|again|please))?[.!?]*$/i.test(c)) continue
    out.push(c)
  }
  return out
}

// A clause that asks for something of what is here: it aims a verb at it ("redo the mocks", "add lighting") and
// is not a product being described ("make a bakery site"). A look word on its own is the look being asked about:
// "warm up the lighting", "the mocks look turn-based".
const asksFor = c => (VERB.test(c) || LOOK_WORD.test(c)) && !PRODUCT_LEAD.test(c)
// one clause with two asks in it ("redo the mocks and repaint the sheets"): the words around each verb are a part
const ASK_IN = /\b(redo|remake|rebuild|repaint|redraw|rework|regenerate|change|adjust|tweak|fix|update|improve|correct|replace|remove|delete|add|brighten|darken|lighten|polish|rewrite|reword|move|tighten|warm|calm|loosen|trim|shorten)\b/gi
// a clause that names a thing to change with no verb: "more visual polish", "less busy copy"
const namesMore = c => /^(?:please\s+)?(?:a\s+bit\s+)?(?:more|less|some more|bigger|smaller|brighter|darker|warmer|cooler|softer|sharper|punchier)\b/i.test(c)

/** @param {string} c */
function partOf(c) {
  const what = String(c || '').trim().replace(/^[.]+|[.]+$/g, '').trim()
  return { what, target: targetOf(what) }
}
// "warm up the lighting", "make the mocks brighter": a look word aimed at a part with the verb left out
const looksNames = c => LOOK_WORD.test(c) && !!targetOf(c)
/** @param {string[]} list */
const eachPart = list => list.map(partOf).filter(p => p.what)
// no part twice, in the order first said: "redo the mocks, then the sheets, then the mocks again" is two
/** @param {{ what: string, target: string }[]} list */
const dedupe = list => {
  const out = []
  for (const p of list) {
    if (out.some(q => q.what.toLowerCase() === p.what.toLowerCase() || (p.target && q.target === p.target))) continue
    out.push(p)
  }
  return out
}
// The parts of one clause with more than one ask in it: "redo the mocks and repaint the sheets" is two parts,
// each with its own verb. One part is returned when the words hold only one ask.
/** @param {string} clause */
function asksIn(clause) {
  const hits = [...String(clause || '').matchAll(ASK_IN)]
  if (hits.length < 2) return [partOf(clause)]
  const out = []
  hits.forEach((h, i) => {
    const from = h.index || 0
    const to = i + 1 < hits.length ? hits[i + 1].index : clause.length
    // the words before the first verb belong to it ("please redo the mocks")
    const words = clause.slice(i === 0 ? 0 : from, to).replace(/\s+(and|also|plus|then)\s*$/i, '').trim()
    if (words) out.push(partOf(words))
  })
  return out.length >= 2 ? out : [partOf(clause)]
}

// ---------- the line the chat says back
const NUM = { 2: 'Two', 3: 'Three', 4: 'Four' }
const noStop = s => String(s || '').replace(/[.]+$/, '')
/** @param {'build'|'change'|'multi'|'question'|'unclear'} kind @param {{ what: string, target: string }[]} parts */
export function heardOf(kind, parts = []) {
  if (kind === 'question') return 'That is a question, so nothing in the build changes. Ask it in Ask mode for an answer.'
  if (kind === 'unclear') return ''
  if (kind === 'multi') {
    const n = parts.length
    return `${NUM[n] || 'Several'} things, in order: ${parts.map(p => noStop(p.what)).join(', then ')}.`
  }
  if (kind === 'change') {
    const t = KIND_WORD[/** @type {keyof typeof KIND_WORD} */ (parts[0]?.target)]
    return t ? `A change to ${t}, not a new build: ${noStop(parts[0].what)}.` : `A change to what is here, not a new build: ${noStop(parts[0]?.what || '')}.`
  }
  return ''
}

// ---------- the read
const NUMBERED = /(^|\s)[1-9][).]\s/
/**
 * ctx (all optional): { hasBuild, kind: 'game'|'site'|'app', preview, fresh }
 *   hasBuild  something is built here: a change has something to change
 *   kind      what this is, when it is built (a game's "the look" is its art; a website's is its theme)
 *   preview   the words were a slash command the chat already took ("/fix …"): not read here
 *   fresh     a send made in code that starts something new (a Build button): never read
 * planner: the fallback for words this file will not guess about. Given the words and the ctx, it returns a read
 *   (its kind at least) or null to leave it. It is asked only when the words were not decisive, never for a
 *   sentence this file read.
 * @param {string} text @param {any} [ctx] @param {((text: string, ctx: any) => any) | null} [planner]
 */
export function readAsk(text = '', ctx = {}, planner = null) {
  const t = tidy(text)
  const c = ctx || {}
  if (!t || c.preview || c.fresh || /^\//.test(t)) return { kind: 'build', parts: [], needsConfirmation: false, unclear: false, heard: '' }

  const clauses = clausesOf(t)
  const asked = clauses.filter(asksFor)
  const ordered = /\b(and\s+then|then|after\s+that|afterwards|finally|lastly|first)\b/i.test(t) || NUMBERED.test(t) || clauses.length > 1
  const product = PRODUCT_LEAD.test(t)
  /** @param {any} kind @param {any[]} parts @param {any} [extra] */
  const end = (kind, parts, extra = {}) => ({
    kind, parts, needsConfirmation: kind === 'change' || kind === 'multi' || kind === 'unclear', unclear: kind === 'unclear', heard: heardOf(kind, parts), ...extra
  })
  const part = () => (asked.length ? partOf(asked[0]) : partOf(clauses[0] || t))
  // parts with no verb at all, each named, in order: "first the mocks, then the lighting"
  const named = ordered && clauses.length >= 2 && !product && clauses.every(cl => targetOf(cl) || namesMore(cl))
  // "ok", "yes", "build it", "do it": an answer to something the chat asked, never a brief and never a build ("do it pls"
  // was read as a request and became nothing; "do it" read as go words and locked a roster with nobody asked)
  if (isAgree(t)) return end('unclear', [partOf(t)], { needsConfirmation: true })
  // a filler about nothing in particular ("not sure about it", "maybe"): asked about, not built (never a question)
  const filler = asked.length === 0 && clauses.length === 1 && !targetOf(t) && FILLER.test(t) && !QUESTION_OPEN.test(t) && !isAgree(t)

  // ---------- a question: nothing in the build changes
  const questionWord = !product && !filler && (QUESTION_OPEN.test(t) || ASKS_TO_KNOW.test(t) || /\?\s*$/.test(t))
  if (questionWord) {
    // "can you make the hero darker": the question form is a polite ask of this build
    const politeAsk = /^(?:can|could|would|will)\s+(?:you|u)\b/i.test(t) && clauses.length === 1 && asksFor(t)
    if (!politeAsk) {
      const parts = asked.length ? dedupe(eachPart(asked)) : [{ what: t, target: targetOf(t) }]
      return end('question', parts, { needsConfirmation: false, hypothetical: HYPOTHETICAL.test(t) })
    }
  }

  // ---------- several things, in order: one part per clause that asks for something, each clause's own asks split
  // (a clause starts at a comma, "then" or a listed number; "and" is read only when the other side asks too, since
  // "more lighting and a bit more polish" is one change)
  if (asked.length >= 2) {
    const many = dedupe(asked.flatMap(asksIn))
    if (many.length >= 2) return end('multi', many)
  }
  // "redo the mocks and repaint the sheets": two asks in one clause, each its own part in the order said
  if (asked.length === 1 && !product) {
    const many = asksIn(asked[0])
    if (many.length >= 2) return end('multi', dedupe(many))
  }
  // "first the mocks, then the lighting": parts with no verb at all, each named, in order
  if (named) {
    const many = dedupe(eachPart(clauses))
    if (many.length >= 2) return end('multi', many)
  }

  // ---------- a complaint about what is here
  const complaint = COMPLAINT_SHARP.test(t) || JUDGED.test(t) || (COMPLAINT_SOFT.test(t) && (VERB.test(t) || LOOK_WORD.test(t) || (!ordered && !!targetOf(t))) && !product)
  if (complaint) {
    const parts = dedupe(asked.length ? asked.flatMap(asksIn) : clauses.length ? eachPart(clauses) : [partOf(t)])
    if (parts.length > 1 && ordered) return end('multi', dedupe(asked.flatMap(asksIn)))
    // a complaint about two things ("the mocks and the look are both wrong") is still one change of both
    return end('change', parts.length ? parts : [partOf(t)])
  }

  // ---------- one thing asked for, working on what is here
  const names = (asked.length === 1 || (asked.length === 0 && looksNames(t))) && (ADDING.test(t) || namesMore(t) || LOOK_WORD.test(t) || !ordered) && !product
  // a verb on a product word is a product being changed only when it is not a new one being described
  if (names && !(VERB.test(t) && PRODUCT_NOUN.test(t) && /\b(a|an|new)\s+(app|site|game|website)\b/i.test(t))) return end('change', [part()])
  // ---------- words that ask for something this file cannot name: never guessed into a fresh build.
  // An unknown shape of ask (a part with no verb this file knows, a sentence in the past tense) goes to the
  // planner; with no planner, it asks the person rather than start a build from scratch.
  const past = PAST.test(t) && !product
  const unknown = asked.some(cl => !!targetOf(cl)) && !product
  if (unknown || (asked.length === 1 && !product) || (past && !asked.length)) {
    const p = planner ? planner(t, c) : null
    if (p && p.kind) return end(p.kind, p.parts && p.parts.length ? p.parts : [part()])
    return end('unclear', asked.length ? dedupe(asked.flatMap(asksIn)) : [part()])
  }
  // a filler about nothing in particular ("not sure about it", "maybe"): asked about, never built
  if (filler) return end('unclear', [partOf(t)])

  // ---------- a product described: a build
  if (product || /\b(a|an|new)\s+(app|website|site|game|shop|store|platform|tool)\b/i.test(t) || !VERB.test(t)) {
    return end('build', [{ what: t, target: targetOf(t) }], { needsConfirmation: false })
  }
  // a verb with nothing here to work on and no product named: ask rather than build over the person's work
  const p2 = planner ? planner(t, c) : null
  if (p2 && p2.kind) return end(p2.kind, p2.parts && p2.parts.length ? p2.parts : [part()])
  return end('unclear', [part()])
}

export const TRIAGE_KINDS = Object.keys(KIND_WORD)

// What a read does to the send: 'build' runs the words as they are (one brief), 'say' says what was understood
// and offers the parts (nothing runs), 'pass' leaves it to the chat's own routing (a question, or not read).
/** @param {{ kind?: string, parts?: any[] } | null | undefined} read */
export const askRoute = read => (!read || !read.parts?.length ? 'pass' : read.kind === 'build' ? 'build' : read.kind === 'question' ? 'pass' : 'say')
// The buttons a read offers: one per part, named by what the person said.
/** @param {{ what: string, target?: string }[]} parts */
export const partButtons = (parts = []) => parts.map((p, i) => ({ id: `part:${i}`, label: noStop(p.what), what: p.what, target: p.target || '' }))
