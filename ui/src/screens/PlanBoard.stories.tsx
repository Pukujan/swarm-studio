// The Plan board's mock-ups (one of the six design artifacts, docs/PLANS.md §5): the real machine started at the
// board's address, with the top bar, and the plan the server would answer. The plan is a real one
// (plan/plan.fixture.json, made by POST /api/plans on the walkthrough Studio); each story changes only what its
// state needs.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { TopBarSlots } from '../shell/Slots'
import { TopBar } from '../shell/TopBar'
import { PlanBoard } from './PlanBoard'
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

const meta = {
  component: PlanBoard,
  parameters: { address: `?room=plan&plan=${base.id}`, plan: 'full' },
  decorators: [(Story, { parameters }) => {
    serve(parameters.plan)
    return (
      <NavProvider nav={makeNav({ search: parameters.address })}>
        <TopBarSlots><TopBar /><Story /></TopBarSlots>
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
// no plan named: the new game the chat is talking through (spec 27), drawn in the current Studio
export const NewGame: Story = { parameters: { address: '?room=plan' } }
