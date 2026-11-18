// Ask mode for a website, or with nothing built yet (docs/specs/46-chat-modes.md): the planner answers
// the question and nothing else happens. No build is offered, no talk is left open, no chat is saved and
// no link is walked: the answer comes from the open project, the Studio's state and what was said in
// this session. An app or game that is built is asked through dyad's own ask mode instead
// (engine/appjob.mjs ask), which reads the code.
//
// A person's question gets an answer in their own terms, never a status line (owner, 2026-11-17: in ANSWER
// ONLY mode, asked "i cant test the game live", the reply was "Right now: using 61 pictures painted before;
// painting 0.", the picture queue's own line, where an answer should be). The rule is in the prompt
// (ANSWER_RULE), and it is also checked on the answer: a reply that is only the build's counters or the
// plan's bookkeeping is asked again once, and if the model still has nothing to say the person is told
// plainly that there is no answer rather than handed the counters. engine/honest.mjs does the same for an
// answer that claims to install something: a prompt line alone is a hope, the check is what holds.
import { toMessages } from './talkplan.mjs'
import { HONEST_RULE, honestly } from './honest.mjs'

const KIND = { site: 'websites', app: 'apps', game: 'games', film: 'films' }

// the person's question is answered in the person's terms, not in the Studio's own bookkeeping
export const ANSWER_RULE = `Answer what the person actually asked, in their terms, about their project or what they are trying to do. The build's own counters and the plan's bookkeeping are not an answer: "using 61 pictures painted before; painting 0", "5 of 9 sections are built", "3 of 7 steps", a step's name or a progress line say what the Studio is doing, never what the person asked. Use a fact from below only inside an answer to their question, and never recite the facts as the reply. When the honest answer is that you cannot tell from here, say "I can't tell from here", say why (what you can and cannot see), and name the one thing that would settle it: the app built and run, or the person looking at it themselves.`

export const ASK_PROMPT = (kind = 'site', project = '', studio = '') => `You are Hermia, the planner of Swarm Studio's crew, which makes ${KIND[kind] || KIND.site} (and websites, apps, games, decks and films) on the person's own computer. The chat is in Ask mode: the person wants an answer, and nothing else happens.

Answer the question they asked, from what is below and what was said, in one to four short plain sentences. No markdown, no lists. Do not offer to build, plan or change anything, do not ask whether to start, and do not end with a question unless you cannot answer without one. If you do not know, say so and say what would settle it. Never reply with JSON.

${ANSWER_RULE}

${HONEST_RULE}

${project ? `The open project:\n${project}` : 'Nothing is built in this chat yet.'}${studio ? `\n\nSwarm Studio on this computer right now:\n${studio}` : ''}`

// a reply that is a build brief or bare JSON is not an answer
const notWords = reply => !reply || /^\s*[{[]/.test(reply)

// What the person is told when the model had only counters to offer twice: plain, and it names what would
// settle it. Never the counters.
export const NO_ANSWER = 'I can\'t tell from here: what I can see is the build\'s own progress, not what it plays or looks like. What would settle it is the app built: press Build the app, and ask me again about it once it runs.'

// ---------- the build's counters and the plan's bookkeeping, which are never an answer on their own
// a count of the build's own parts: "5 of 9 sections are built and kept; 4 failed", "painted 4", "painting 0"
const COUNT = /\b\d+\s*(?:of|\/)\s*\d+\b|\b\d+\s+(?:failed|succeeded|painted|kept|cut|checked|queued|done|left|remaining)\b|\b(?:using|painted|kept|failed|cut|cutting|cuts|sheet|sheets|sprite|sprites|frame|frames|section|sections|step|steps|page|pages|painting|building|checking)\s+\d+\b|\b(?:\d+\s+(?:pictures?|sections?|steps?|pages?|sprites?|sheets?|frames?|shots?|clips?|rows?)|(?:pictures?|sections?|steps?|pages?|sprites?|sheets?|frames?|shots?|clips?|rows?)\s+\d+)\b/i
// the line the Studio says to itself, opening one: "Right now: …", "Status: painting", "The plan: 12 pictures"
const LINE = /^\s*(?:right now|the plan|the build|status|progress|current(?:ly)?|step|next step|stage|job|queue)\b\s*(?:\(|:|\s-\s|is\b|are\b|at\b)/i
// a step of the build, said as what is happening: "Painting the backdrops now.", "It shows on the board"
const STEPPING = /\b(?:painting|drawing|cutting|checking|writing|reviewing|building|publishing|deploying|starting)\b[^.!?]{0,40}\bnow\b|\b(?:shows on the board|as it lands|in progress|on the board)\b|\b(?:painting|building|cutting|checking)\s+(?:app|game|site|website)\b/i
// a job's own line: a label, and the state hung on it ("Job: cut-out, running", "Status: 4 of 12 sprites painted")
const LABELED = /^[^.!?]{0,40}[:;]\s*\S/
const RUNNING = /\b(?:queued|running|paused|stopped|waiting|painted|kept|cut|checked|done|failed)\b/i
// a line that says what a count amounts to: "…, so the menu page has gaps", "…, which means…"
const SO = /\b(?:so|which means|meaning|that means|therefore|because)\b/i
// words that make a line a sentence of its own, whatever else it carries
const TELLS = /\b(?:you|your|yours|can|can't|cannot|could|should|means|needs?|needed|press|open|try|tell|watch|hear|play|test|resume)\b/i
// a verb: a label with its words has none ("Status: painting", "painting 0"), a sentence has one
const VERB = /\b(?:is|are|am|was|were|has|have|had|will|would|do|does|did|get|gets|got|make|makes|made|come|comes|keep|keeps|hold|holds|take|takes|go|goes|went|need|needs|want|see|know|think|say|means|let|give|look|watch|hear|play|test|press|open|try|ask|tell|use|used|uses|works?|run|runs|running|stays?|stops?|start|starts|finish|finishes|paint|paints|painted|build|builds|built|cut|cuts|check|checks|write|writes|review|reviews|publish|publishes|deploy|deploys)\b|n't/i

// Is this reply only the build's counters or the plan's bookkeeping, with no answer in it? Read line by line: a
// sentence of its own is an answer, whatever numbers it carries, and so is a real answer with a count beside it.
export function isBookkeeping(reply) {
  const text = String(reply || '').trim()
  if (!text) return true
  const lines = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)
  if (!lines.length) return true
  // a picture painted before is not a sentence's own verb: "using 61 pictures painted before; painting 0"
  const own = line => line.replace(/\b\w+ painted before\b/g, '')
  return lines.every(function (line) {
    // a sentence with a verb of its own, and no line of the Studio's leading it, is an answer
    if (VERB.test(own(line)) && !LINE.test(line)) return false
    // so is a line that tells the person something
    if (TELLS.test(line)) return false
    // a line of the Studio's own, and a step said as what is happening, are never an answer
    if (LINE.test(line) || STEPPING.test(line)) return true
    // a count of the build's own parts is not, unless the line says what it amounts to
    if (COUNT.test(line) && !SO.test(line)) return true
    // a job's own line, and a label with its few words and no verb, are not
    if (LABELED.test(line) && RUNNING.test(line)) return true
    return line.split(/\s+/).length <= 4 && !VERB.test(line)
  })
}
// one answer. said: [{ who: 'you' | 'hermia', text }], newest last; chat(messages) -> text
// -> { reply }
export async function answerOnly({ said = [], kind = 'site', chat, project = '', studio = '' }) {
  const messages = toMessages(said)
  if (!messages.length || messages.at(-1).role !== 'user') throw new Error('ask something first')
  const all = [{ role: 'system', content: ASK_PROMPT(kind, project, studio) }, ...messages]
  const clean = s => String(s || '').trim().replace(/\*\*(.+?)\*\*/g, '$1')
  let last = ''
  const again = async note => clean(await chat([...all, { role: 'assistant', content: last || '…' }, { role: 'user', content: note }]))
  let reply = clean(await chat(all))
  last = reply
  if (notWords(reply)) { reply = await again('Answer the question in plain words, not JSON. Nothing is being built.'); last = reply || last }
  if (notWords(reply)) throw new Error('the planner did not answer')
  // the counters and the plan's bookkeeping are not an answer: asked once for one, in the person's terms
  if (isBookkeeping(reply)) {
    reply = await again(`That reply is the build's own progress (counters, a step's name), not an answer to "${String(messages.at(-1).content).slice(0, 300)}". Answer the person's question in plain words, in their terms. Never recite the counters or the bookkeeping. If you cannot tell from here, say "I can't tell from here", say why, and name what would settle it.`)
    last = reply || last
    // still only counters: the person is told plainly that there is no answer, never handed the counters
    if (!reply || isBookkeeping(reply)) reply = NO_ANSWER
  }
  reply = await honestly({ answer: reply, text: messages.at(-1).content, again: async note => again(note) })
  return { reply }
}
