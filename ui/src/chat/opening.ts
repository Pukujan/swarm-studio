// The talk a new project's deck opens on (the machine's `draft`, web/nav.js): a chat picked on Projects, or the Make
// box's words when the person said to talk first. The machine keeps no chat (spec 34: the chat is not in the address),
// so the talk waits here for the deck's chat to take it, as a page waits in src/nav/opening.ts. With none waiting, the
// deck starts a new website talk (web/home.js newChat).
import type { ChatTalk } from './types'

let wanted: ChatTalk | null = null

// the next new project's deck opens on this talk
export function talkOn(talk: ChatTalk | null) { wanted = talk }

// the talk waiting, left where it is: read while drawing, which may happen twice
export const talkWaiting = () => wanted

// taken: called once the deck's chat has it
export function talkTaken(talk: ChatTalk | null) { if (wanted === talk) wanted = null }
