// The left chat in each state worth seeing. A story answers the chat's server calls from a fixture (the `api`
// prop), so each one is a place the person can actually be: the same answers /api/discuss, /api/talk, /api/chats
// and /api/models give.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Chat } from './Chat'
import type { ChatApi, ChatLine } from './types'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const MODELS = { roles: { worker: { hermes: 'anthropic/claude-sonnet-5-5', picked: null }, planner: { picked: 'anthropic/claude-opus-5-5' } }, text: Array.from({ length: 42 }, (_, i) => `m${i}`) }
const CHATS = { groups: [{ name: 'Design', chats: [{ id: 'c-home', title: 'A calmer home page' }] }, { name: 'Game', chats: [{ id: 'c-ants', title: 'Army of ants', state: 'locked' }] }] }

// a server that answers each path from the table; a path not in it waits forever (a slow answer)
function fixture(answers: Record<string, unknown | ((init?: RequestInit) => Response)>): ChatApi {
  return async (path, init) => {
    const key = Object.keys(answers).find(k => path.split('?')[0] === k)
    if (!key) return new Promise<Response>(() => {})
    const a = answers[key]
    return typeof a === 'function' ? (a as (init?: RequestInit) => Response)(init) : json(a)
  }
}
const base = { '/api/models': MODELS, '/api/chats': { chats: [{ id: 'c-loose', title: 'A shop for rare plants' }] }, '/api/projects/p-ants/chats': CHATS }

const meta = {
  component: Chat,
  args: { api: fixture(base) },
  decorators: [Story => <div className="h-[680px] w-[340px]"><Story /></div>]
} satisfies Meta<typeof Chat>
export default meta
type Story = StoryObj<typeof meta>

// nothing said yet: Send builds
export const Empty: Story = {}

// an old chat reopened: its words are back, and Build sits under Hermia's last answer
export const Reopened: Story = {
  args: {
    api: fixture({ ...base, '/api/discuss': (init?: RequestInit) => json(JSON.parse(String(init?.body || '{}')).brief
      ? { chat: 'c-loose', brief: 'A shop for rare plants: a home page, the plants with a care guide each, a cart and a checkout. For first-timers.' }
      : { chat: 'c-loose', reply: 'First-timers it is: each plant gets a short care guide and a difficulty mark.' }) }),
    talk: { id: 't1', kind: 'site', chat: 'c-loose', said: [
      { who: 'you', text: 'A shop for rare plants, with care guides' },
      { who: 'hermia', text: 'A small shop: a home page, the plants, one guide per plant and a cart. Who buys them, collectors or first-timers?' }
    ] }
  }
}

// Hermia is answering: the dots, and the words wait in the box
export const Answering: Story = { args: { api: fixture({ ...base }), talk: { id: 't2', kind: 'site', text: 'A portfolio for a ceramicist' } } }

// she did not answer
export const NoAnswer: Story = { args: { api: fixture({ ...base, '/api/discuss': () => json({ error: 'Hermes is not running.' }, 503) }), talk: { id: 't3', kind: 'site', text: 'A portfolio for a ceramicist' } } }

// the brief: read it, edit it, then Build; a website can settle its brand sheet first
export const Brief: Story = {
  args: { talk: { id: 't4', kind: 'site', brief: 'A portfolio for a ceramicist: a home page with the newest pieces, a shop, a page about the studio and a contact form. Warm, quiet, lots of white space.' } }
}

// inside a project, a different product: New project first, Add here second
export const BriefNewProject: Story = {
  args: {
    from: 'r-ants-2', project: 'p-ants',
    api: fixture({ ...base, '/api/discuss': { chat: 'c-new', brief: 'A shop for the ant farm kits: the kits, a cart and a checkout.', route: 'new' } }),
    talk: { id: 't5', kind: 'site', text: 'Actually I want a shop for the kits' }
  }
}

// a game talk: one open question, each option with what it gets, costs and takes. A pick asks the next one,
// then the spec comes with Lock, and the lock gives where to start
const SPEC = { chat: { id: 'c-ants' }, turn: { text: 'Army of Ants: a top-down RTS for Godot 4 with three unit types and five waves, in 2D sprites. 15 pictures, no credits.', options: [{ id: 'lock', label: 'Lock' }, { id: 'talk', label: 'Keep talking' }] } }
const LOCKED = { plan: { id: 'p-ants' }, turn: { text: 'Locked. Where do you want to start?', options: [{ id: 'start:art', label: 'The art', focus: 'art' }, { id: 'start:units', label: 'The units', focus: 'units' }] } }
export const GameQuestion: Story = {
  args: {
    api: fixture({ ...base, '/api/talk/c-ants': SPEC, '/api/talk/c-ants/lock': LOCKED, '/api/talk': { chat: { id: 'c-ants' }, turn: { text: 'A tiny real-time strategy game about an ant colony, for Godot 4. How should it look?', options: [
      { id: 'art:2d', label: '2D sprites', why: '15 pictures, no credits, ready to try in one build' },
      { id: 'art:3d', label: '3D models', why: 'about 200 Meshy credits and a day of building' },
      { id: 'talk', label: 'You decide' }
    ] } } }),
    talk: { id: 't6', kind: 'game', text: 'army of ants, rts game in godot' }
  }
}

// the spec in plain words: Lock and Keep talking
export const GameSpec: Story = {
  args: {
    api: fixture({ ...base, '/api/talk': SPEC, '/api/talk/c-ants/lock': LOCKED }),
    talk: { id: 't7', kind: 'game', text: 'three unit types, waves' }
  }
}

// a project's chat with the crew's lines and the Log
const at = Date.now() - 60000
const lines: ChatLine[] = [
  { id: 'l1', at, who: 'you', text: 'Make the hero bigger', where: 'Home · Hero', layers: ['home/hero'] },
  { id: 'l2', at: at + 5000, who: 'crew', name: 'Ines', color: 'var(--accent)', text: 'Done: the heading is 72 px now and the picture fills the width.', where: 'Home · Hero', layers: ['home/hero'] },
  { id: 'l3', at: at + 9000, who: 'hermia', text: 'Built 4 pages and 18 sections in 41.2s with 8 agents. Open a page, or play the prototype.' }
]
const log: ChatLine[] = [
  { id: 'g1', at, who: 'sys', name: 'Hermia', text: 'Planning four pages: Home, Kits, About, Contact.' },
  { id: 'g2', at: at + 3000, who: 'sys', name: 'Ines', color: 'var(--accent)', text: 'Home · Hero: writing the heading' }
]
export const InProject: Story = {
  args: { from: 'r-ants-2', project: 'p-ants', lines, log, commands: [{ name: 'help', what: 'what you can type here' }, { name: 'fix', arg: '<what to change>', what: 'an agent rewrites the selected section, or the page' }] }
}

// the hosted studio: at most 8 agents
export const Hosted: Story = { args: { agentsMax: 8 } }
