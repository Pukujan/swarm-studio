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
const TALK_PROMPT = kind => `You are Hermia, the planner of a crew of AI agents that builds ${WHAT[kind] || WHAT.site} from a brief. The person asked to talk before anything is built, so nothing is being built and nothing has started. Never say you are building, designing or have started.
Talk with them like a good product lead:
- Answer what they asked first, directly and concretely. Name real options when they ask (services, APIs, payment or sign-in providers) with one line on each, and say what the crew can and cannot do (the crew builds the product and its pages; outside services need the person's own accounts and keys).
- Then ask the one or two questions that matter most for this build. Go deeper when they asked to be grilled: who it is for, the main flows, the data, accounts, money, what to leave out.
- Short: under 130 words, plain sentences, short lists are fine, no headings, no markdown bold.
Only when their last message clearly says to build now (build it, go ahead, start, let's build), reply with this JSON and nothing else:
{"build": true, "brief": "<one paragraph the crew builds from: what it is and who it is for, the pages or screens, the data, accounts, outside services decided, and what to leave out>"}`

const BRIEF_PROMPT = kind => `Write the brief a crew of AI agents will build ${WHAT[kind] || WHAT.site} from, using only what this conversation decided. One paragraph, under 140 words: what it is and who it is for, the pages or screens, the data, accounts, outside services, and what to leave out. No instructions to the crew about talking or waiting. Reply with the paragraph only.`

// the conversation as chat messages: the person is the user, Hermia the assistant; the newest kept
export function toMessages(said = []) {
  return said.filter(m => m && String(m.text || '').trim()).slice(-24)
    .map(m => ({ role: m.who === 'hermia' ? 'assistant' : 'user', content: String(m.text).trim().slice(0, 2000) }))
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
export async function discuss({ said = [], kind = 'site', chat }) {
  const messages = toMessages(said)
  if (!messages.length || messages.at(-1).role !== 'user') throw new Error('say something first')
  const reply = String(await chat([{ role: 'system', content: TALK_PROMPT(kind) }, ...messages]) || '').trim()
  const brief = buildOf(reply)
  if (brief) return { brief }
  if (!reply || /^\s*\{/.test(reply)) throw new Error('the planner did not answer')
  return { reply: reply.replace(/\*\*(.+?)\*\*/g, '$1') }
}

// the brief, asked for by the Build button: what the conversation decided, never the talk itself
export async function writeBrief({ said = [], kind = 'site', chat }) {
  const messages = toMessages(said)
  if (!messages.length) throw new Error('nothing to write a brief from')
  const convo = messages.map(m => `${m.role === 'user' ? 'Person' : 'Hermia'}: ${m.content}`).join('\n\n')
  const text = String(await chat([{ role: 'system', content: BRIEF_PROMPT(kind) }, { role: 'user', content: convo }]) || '').trim()
  const brief = buildOf(text) || text.replace(/^brief:\s*/i, '')
  if (!brief || /^\s*\{/.test(brief)) throw new Error('the planner did not write a brief')
  return { brief }
}
