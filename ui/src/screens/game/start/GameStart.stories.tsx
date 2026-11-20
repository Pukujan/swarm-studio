// Starting a game, as the Game room's card opens it: the questions one at a time, the planner at work, the spec card
// with Shape it and Build the game, and the ways it goes wrong (a server without game mode, a planner that does not
// answer). Each story answers the routes from start.fixture.ts, so none needs a server.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GameStart } from './GameStart'
import { ART, json, MODELS, QUESTIONS, ROLES, serve, SPEC, WALK } from './start.fixture'

const base = { '/api/game': { questions: QUESTIONS }, '/api/workshops': { workshops: [] } }

const meta = {
  component: GameStart,
  args: { isOpen: true, onClose: () => {}, onBuilt: () => {}, api: serve(base) },
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof GameStart>
export default meta
type Story = StoryObj<typeof meta>

// the first question: the idea in a line, the chips, your own words; Just build it fills the rest
export const FirstQuestion: Story = {}
// with a site build open the game can be its promo game, and an unfinished walk is offered again
export const PromoAndContinue: Story = { args: { site: { run: 'r-shop', name: 'Fern & Stone' }, api: serve({ ...base, '/api/workshops': { workshops: [{ id: WALK.id, title: 'Lantern Run', step: 'heroes' }] } }) } }
// the planner is writing the spec: it cannot be closed meanwhile
export const WritingTheSpec: Story = { args: { answers: { type: 'Roguelike' }, api: serve(base) } }
// the spec card: every line but Engine is edited in place; Shape it walks it, Build the game builds it
export const SpecCard: Story = { args: { answers: { type: 'Roguelike' }, api: serve({ ...base, '/api/game/spec': { spec: SPEC } }) } }
// a promo game's card says whose it is, and offers to put the site online first so the game can link back
export const PromoSpec: Story = { args: { answers: { type: 'Roguelike' }, site: { run: 'r-shop', name: 'Fern & Stone' }, api: serve({ ...base, '/api/game/spec': { spec: { ...SPEC, brand: { name: 'Fern & Stone', from: 'r-shop' } } } }) } }
// a 3D game with people in it: Build the game goes through the Cast step first (press it)
export const SpecWithCast: Story = { args: { answers: { type: 'Roguelike' }, api: serve({ ...base, '/api/game/spec': { spec: SPEC, cast: { roles: ROLES, violent: true } }, '/api/cast': { models: MODELS }, '/api/meshy': { ready: true, cost: { credits: 35 }, art: ART } }) } }
// the planner did not answer: the reason is said and the questions are back, answers kept
export const SpecFailed: Story = { args: { answers: { type: 'Roguelike' }, api: serve({ ...base, '/api/game/spec': () => json({ error: 'Hermes is not running. Start it, then try again.' }, 400) }) } }
// a server that has no game mode: nothing to ask
export const NotLoaded: Story = { args: { api: serve({ ...base, '/api/game': { questions: [] } }) } }
// /cast on a build with no pictures yet: the pictures the person adds become the cast
export const CastOnlyEmpty: Story = { args: { castOnly: { run: 'r-lantern', title: 'Lantern Run' }, api: serve({ ...base, '/api/meshy': { ready: true, cost: { credits: 35 }, art: [] } }) } }
