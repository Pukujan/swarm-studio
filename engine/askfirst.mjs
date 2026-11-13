// Ask before every build (docs/decisions/0020-ask-before-build.md). Before a new website build, the planner asks
// one question in the chat: Skip all and build now, Step by step, or Pick steps to skip. Nothing builds until the
// person answers. One answer is recommended, from their words alone, so it is the same offline and testable.
// The question is a planner turn whose options have `go:` ids (engine/chats.mjs keeps options on a turn); the
// answer (a pick, or typed words) is read in engine/talkplan.mjs say() before any model is needed, and recorded
// on the chat as chat.go. server/server.mjs /api/run asks, and builds once the chat has its answer.
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
  all: 'Building it now.',
  steps: "Let's go step by step, starting with Brand.",
  'skip-brand': 'Brand skipped. On to the Plan.',
  'skip-plan': 'Plan skipped. Starting with Brand.'
}
