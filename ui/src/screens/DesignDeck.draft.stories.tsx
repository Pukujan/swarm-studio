// A new project's deck (the machine's `draft`): the Design deck with nothing on it and the chat talking, before
// anything is built. The real machine, moved to `draft` as Projects moves it (New chat, a chat reopened, the Make
// box's Talk), and a stand-in server per state worth seeing: a new chat, one reopened, the brief, Hermia still
// answering, Hermia not answering, and a server that says nothing at all.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { talkOn, type ChatApi, type ChatTalk } from '../chat'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { DesignDeck } from './DesignDeck'

const answer = (body: unknown, status = 200): Promise<Response> => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const never = () => new Promise<Response>(() => {})
const FIRST = 'Say what to make. Nothing is built until you say.'

// the server a new project's chat talks to: Hermia's first line (/api/discuss/step), her answers (/api/discuss), a
// reopened chat (/api/talk/:id); `discuss` is what she says to a turn
const server = (discuss: () => Promise<Response> = () => answer({ chat: 'c-tea', reply: 'Who is it for: people who already drink tea, or people new to it?' })): ChatApi => path => {
  if (path === '/api/discuss/step') return answer({ first: FIRST, step: { text: '', options: [] } })
  if (path === '/api/discuss') return discuss()
  if (path.startsWith('/api/talk/')) return answer({ chat: { id: 'c-tea', turns: [] } })
  if (path === '/api/models') return answer({ roles: { worker: {} }, text: [] })
  return answer({})
}

const SAID: ChatTalk['said'] = [
  { who: 'you', text: 'A tea subscription for night-shift workers. Don\'t build yet.' },
  { who: 'hermia', text: 'Who is it for: people who already drink tea, or people new to it?' }
]

const meta = {
  component: DesignDeck,
  args: { api: server() },
  parameters: { talk: null },
  decorators: [(Story, { parameters }) => {
    // as Projects does: the talk to open on waits for the deck's chat, then the machine moves to `draft`
    talkOn(parameters.talk as ChatTalk | null)
    const nav = makeNav()
    nav.go({ type: 'draft' })
    return <NavProvider nav={nav}><Story /></NavProvider>
  }]
} satisfies Meta<typeof DesignDeck>
export default meta
type Story = StoryObj<typeof meta>

// New chat: Hermia's first line, and the box waits for the idea
export const NewChat: Story = {}
// a chat opened from Projects: its words are back, with Build under Hermia's last
export const Reopened: Story = { parameters: { talk: { id: 'reopened', kind: 'site', chat: 'c-tea', said: SAID, blank: true } satisfies ChatTalk } }
// Build was pressed: the brief to read and edit, with Build, Brand sheet and Keep talking
export const Brief: Story = { parameters: { talk: { id: 'brief', kind: 'site', said: SAID, brief: 'Night Leaf: a tea subscription for night-shift workers. Pages: Home, Plans, About.', what: 'Website', blank: true } satisfies ChatTalk } }
// the Make box's Talk: the person's words are the first message, and Hermia is answering
export const Answering: Story = { args: { api: server(never) }, parameters: { talk: { id: 'answering', kind: 'site', text: 'A tea subscription for night-shift workers', blank: true } satisfies ChatTalk } }
// failed: Hermia did not answer the turn (Hermes is away), and says so
export const HermiaAway: Story = {
  args: { api: server(() => answer({ error: 'Hermes is not answering. Start it with hermes, then say it again.', hermes: true }, 503)) },
  parameters: { talk: { id: 'away', kind: 'site', text: 'A tea subscription for night-shift workers', blank: true } satisfies ChatTalk }
}
// empty: the server says nothing (not even Hermia's first line); the deck and the box still stand
export const ServerSilent: Story = { args: { api: () => answer({ error: 'no' }, 500) } }
