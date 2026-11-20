// The Plan board's mock-ups (one of the six design artifacts, docs/PLANS.md §5): the real machine started at the
// board's address, with the top bar, and the plan the server would answer. The plan is a real one
// (plan/plan.fixture.json, made by POST /api/plans on the walkthrough Studio); each story changes only what its
// state needs.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { talkOn, type ChatApi, type ChatTalk } from '../chat'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { TopBarSlots } from '../shell/Slots'
import { TopBar } from '../shell/TopBar'
import { PlanBoard } from './PlanBoard'
import { SheetsProvider } from './setup/Sheets'
import fixture from './plan/plan.fixture.json'
import type { Plan } from './plan/types'

const base = fixture as unknown as Plan
// a picture as the crew would paint it: a plain frame in the plan's own colours
const pic = (label: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 228"><rect width="342" height="228" fill="#2a2a2d"/><text x="171" y="120" fill="#a1a1aa" font-family="sans-serif" font-size="20" text-anchor="middle">${label}</text></svg>`)}`

const PLANS: Record<string, Plan | 'never' | 'missing'> = {
  full: base,
  loading: 'never',
  missing: 'missing',
  painting: { ...base, sheets: [{ id: 's-cast', kind: 'cast', state: 'painting' }, { id: 's-weapons', kind: 'weapons', state: 'done', src: pic('Weapons'), grid: [5, 4], picks: [2, 7] }], mocks: [{ shot: 'combat', state: 'painting' }] },
  locked: {
    ...base,
    gate: { locked: true, phase: 'rest' },
    sheets: [{ id: 's-cast', kind: 'cast', state: 'done', src: pic('Cast'), grid: [5, 4], picks: [0] }, { id: 's-weapons', kind: 'weapons', state: 'done', src: pic('Weapons') }],
    mocks: ['combat', 'boss', 'ult', 'levelup', 'select'].map(shot => ({ shot, state: 'done' as const, src: pic(shot) })),
    build: { state: 'done', characters: [], sprites: [{ name: 'Hero 1', state: 'done', src: pic('Hero 1') }, { name: 'Hero 2', state: 'painting' }] },
    art: { ...base.art, sprites: [{ name: 'Hero 1' }, { name: 'Hero 2' }] }
  }
}

// GET /api/plans/:id answers with the story's plan; every other call answers with it too (nothing is saved)
function serve(which: string) {
  const answer = PLANS[which]
  window.fetch = async () => {
    if (answer === 'never') return new Promise<Response>(() => {})
    if (answer === 'missing') return new Response(JSON.stringify({ error: 'No such plan' }), { status: 404 })
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

// the chat's server (the `api` prop): each path answered from the table; a path not in it waits forever
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
function chat(answers: Record<string, unknown | (() => Response)>): ChatApi {
  return async path => {
    const key = Object.keys(answers).find(k => path.split('?')[0] === k)
    if (!key) return new Promise<Response>(() => {})
    const a = answers[key]
    return typeof a === 'function' ? (a as () => Response)() : json(a)
  }
}
const MODELS = { roles: { worker: { hermes: 'anthropic/claude-sonnet-5-5' } }, text: [] }
// a plan's own chat (server/talk.mjs GET /api/talk/plan/:id): the talk it was made in, with its next step
const TURNS = [{ id: 't1', who: 'you', text: 'A roguelike about a lamplighter carrying the last flame' }, { id: 't2', who: 'planner', text: 'Locked. Where do you want to start?' }]
const STEP = { text: 'The plan is ready to lock. It paints 14 pictures.', options: [{ id: 'lock', label: 'Lock' }, { id: 'do:sheet:cast', label: 'Sketch the cast first' }] }
const planChat = chat({ '/api/models': MODELS, [`/api/talk/plan/${base.id}`]: { chat: { id: 'c-lantern', kind: 'game', plan: base.id, turns: TURNS } }, '/api/talk/c-lantern': { chat: { id: 'c-lantern', plan: base.id, turns: TURNS }, step: STEP } })
// a new game's talk: the planner asks what the idea left open, and the plan as it stands comes back with each turn
const QUESTION = { text: 'What does the lamplighter fight?', options: [{ id: 'a', label: 'Crows and moths', why: 'Small, fast, many: an arcade feel' }, { id: 'b', label: 'One hunter', why: 'A chase: slower, tenser' }] }
const talking = chat({ '/api/models': MODELS, '/api/talk': { chat: { id: 'c-new' }, turn: QUESTION, draft: { ...base, id: '', title: 'Lantern Run' } } })

const meta = {
  component: PlanBoard,
  args: { api: planChat },
  parameters: { address: `?room=plan&plan=${base.id}`, plan: 'full', talk: null },
  decorators: [(Story, { parameters }) => {
    serve(parameters.plan)
    // as the Make box does: the talk waits for the board's chat to take it
    talkOn(parameters.talk as ChatTalk | null)
    return (
      <NavProvider nav={makeNav({ search: parameters.address })}>
        {/* the top bar's menu opens Setup and Settings, which live in this provider */}
        <SheetsProvider first={false}><TopBarSlots><TopBar /><Story /></TopBarSlots></SheetsProvider>
      </NavProvider>
    )
  }]
} satisfies Meta<typeof PlanBoard>
export default meta
type Story = StoryObj<typeof meta>

// a new plan: nine cards, the starter, sketches, mocks and world, Lock with the price
export const Full: Story = {}
// the plan on its way: the cards' skeleton, aria-busy, Hermia working on it in the app
export const Loading: Story = { parameters: { plan: 'loading' } }
// the crew painting a sheet and a mock: the sheen and the painter's cursor; a done sheet with two picked cells
export const Painting: Story = { parameters: { plan: 'painting' } }
// locked: Build in the top bar, the build's sprites, every mock drawn
export const Locked: Story = { parameters: { plan: 'locked' } }
// the plan is gone: the toast says so, the board stays empty
export const Missing: Story = { parameters: { plan: 'missing' } }
// no plan named and no talk handed over: an empty board, and the chat's box takes the game's first words
export const NoPlanYet: Story = { args: { api: chat({ '/api/models': MODELS }) }, parameters: { address: '?room=plan' } }
// Make › Game with no words: a new game's talk, the board waiting for the plan it will talk through (spec 27)
export const NewGame: Story = { args: { api: chat({ '/api/models': MODELS }) }, parameters: { address: '?room=plan', talk: { id: 'game:0', kind: 'game', blank: true } } }
// Make › Game with words: the planner's open question in the chat, the plan as it stands on the board, read-only,
// and Lock in the top bar, which presses the chat's
export const NewGameTalk: Story = { args: { api: talking }, parameters: { address: '?room=plan', talk: { id: 'game:1', kind: 'game', text: 'A roguelike about a lamplighter carrying the last flame', blank: true } } }
// the planner did not answer the first words: the chat says why, the board still waits
export const NewGameNoAnswer: Story = { args: { api: chat({ '/api/models': MODELS, '/api/talk': () => json({ error: 'Hermes is not running. Start it, then say it again.' }, 503) }) }, parameters: { address: '?room=plan', talk: { id: 'game:2', kind: 'game', text: 'A roguelike about a lamplighter', blank: true } } }
