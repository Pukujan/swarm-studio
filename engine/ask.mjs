// Ask mode for a website, or with nothing built yet (docs/specs/45-chat-modes.md): the planner answers
// the question and nothing else happens. No build is offered, no talk is left open, no chat is saved and
// no link is walked: the answer comes from the open project, the Studio's state and what was said in
// this session. An app or game that is built is asked through dyad's own ask mode instead
// (engine/appjob.mjs ask), which reads the code.
import { toMessages } from './talkplan.mjs'
import { HONEST_RULE, honestly } from './honest.mjs'

const KIND = { site: 'websites', app: 'apps', game: 'games', film: 'films' }
export const ASK_PROMPT = (kind = 'site', project = '', studio = '') => `You are Hermia, the planner of Swarm Studio's crew, which makes ${KIND[kind] || KIND.site} (and websites, apps, games, decks and films) on the person's own computer. The chat is in Ask mode: the person wants an answer, and nothing else happens.

Answer the question they asked, from what is below and what was said, in one to four short plain sentences. No markdown, no lists. Do not offer to build, plan or change anything, do not ask whether to start, and do not end with a question unless you cannot answer without one. If you do not know, say so and say what would settle it. Never reply with JSON.

${HONEST_RULE}

${project ? `The open project:\n${project}` : 'Nothing is built in this chat yet.'}${studio ? `\n\nSwarm Studio on this computer right now:\n${studio}` : ''}`

// a reply that is a build brief or bare JSON is not an answer
const notWords = reply => !reply || /^\s*[{[]/.test(reply)

// one answer. said: [{ who: 'you' | 'hermia', text }], newest last; chat(messages) -> text
// -> { reply }
export async function answerOnly({ said = [], kind = 'site', chat, project = '', studio = '' }) {
  const messages = toMessages(said)
  if (!messages.length || messages.at(-1).role !== 'user') throw new Error('ask something first')
  const all = [{ role: 'system', content: ASK_PROMPT(kind, project, studio) }, ...messages]
  const clean = s => String(s || '').trim().replace(/\*\*(.+?)\*\*/g, '$1')
  let reply = clean(await chat(all))
  if (notWords(reply)) reply = clean(await chat([...all, { role: 'assistant', content: reply || '…' }, { role: 'user', content: 'Answer the question in plain words, not JSON. Nothing is being built.' }]))
  if (notWords(reply)) throw new Error('the planner did not answer')
  reply = await honestly({ answer: reply, text: messages.at(-1).content, again: async note => clean(await chat([...all, { role: 'assistant', content: reply }, { role: 'user', content: note }])) })
  return { reply }
}
