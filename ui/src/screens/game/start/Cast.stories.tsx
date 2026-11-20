// The Cast step and its bench: a role's shortlist with the project's own art first, the open card, Meshy's prices on
// its buttons, the bench with a job at each stage and one that failed, and the shortlist that found nothing.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CastStep } from './Cast'
import { newCast, type Cast } from './model'
import { ART, json, MODELS, pic, ROLES, serve } from './start.fixture'

const roles = [...ROLES, { id: 'guide', label: 'Guide' }, { id: 'crow', label: 'Crow' }, { id: 'boss', label: 'Boss' }]
const meshy = { ready: true, cost: { credits: 35 }, art: ART }
const api = (more: Record<string, unknown> = {}) => serve({ '/api/cast': { models: MODELS }, '/api/meshy': meshy, ...more })
const cast = (o: Partial<Cast> = {}) => newCast({ roles: ROLES, violent: true, ...o })

const meta = {
  component: CastStep,
  args: { cast: cast(), from: 'r-lantern', api: api(), onBack: () => {}, onBuild: () => {}, onSay: () => {} },
  decorators: [Story => <div className="mx-auto max-w-[720px] bg-deep p-6 font-monospace text-sm text-text"><Story /></div>]
} satisfies Meta<typeof CastStep>
export default meta
type Story = StoryObj<typeof meta>

// a role's shortlist: the project's own art first (Meshy, with a key), then licence-checked models, numbered
export const Shortlist: Story = {}
// a model picked and open: who made it, its licence, its triangles and where it is from
export const ModelOpen: Story = { args: { cast: cast({ sel: 'sketchfab:m0', picks: { hero: { key: 'sketchfab:m0', role: 'hero', ...MODELS[0] } } }) } }
// the own-art card open with a Meshy key: the pictures to make it from, Make with its price, Make all with the total
export const MeshyOpen: Story = { args: { cast: cast({ sel: 'own' }) } }
// no Meshy key: the art itself is the character, a free 2.5D sprite, picked at once
export const SpriteNoKey: Story = { args: { cast: cast({ sel: 'own' }), api: api({ '/api/meshy': { ...meshy, ready: false } }) } }
// the bench: a job waiting in line, one being sculpted, one being rigged, one carried to the library, one failed,
// and a made one on the shelf (its poll never answers here, so each stays at its stage)
export const Bench: Story = {
  args: {
    api: serve({ '/api/cast': { models: MODELS }, '/api/meshy': meshy }),
    cast: cast({
      roles, sel: 'own', role: 4,
      own: {
        hero: { art: pic('Wick'), job: { id: 'j1', state: 'running', stage: 'queued', progress: 0, worker: 'Pebble' } },
        rival: { art: pic('Snuffer'), job: { id: 'j2', state: 'running', stage: 'model', progress: 55, worker: 'Ada' } },
        guide: { art: pic('Guide'), job: { id: 'j3', state: 'running', stage: 'rig', progress: 100, worker: 'Bo' } },
        crow: { art: pic('Crow'), job: { id: 'j4', state: 'done', stage: 'download', pick: { name: 'Crow', thumbSrc: pic('Crow 3D'), source: 'meshy' } } },
        boss: { art: pic('Boss'), job: { state: 'failed', error: 'Meshy is out of credits. Top up, then press Make again.' } }
      }
    })
  }
}
// a made character: its still, Redo with the price, and Accept, which makes it the role's pick
export const MeshyMade: Story = { args: { cast: cast({ sel: 'own', own: { hero: { art: pic('Wick'), job: { id: 'j9', state: 'done', pick: { name: 'Wick', thumbSrc: pic('Wick 3D'), source: 'meshy' } } } } }) } }
// the shortlist is being searched
export const Searching: Story = { args: { api: serve({ '/api/meshy': { ...meshy, art: [] } }) } }
// the search found nothing that fits, and the project has no pictures: Skip or add pictures
export const NothingFits: Story = { args: { api: api({ '/api/cast': { models: [] }, '/api/meshy': { ...meshy, art: [] } }) } }
// the search did not answer
export const NoAnswer: Story = { args: { api: api({ '/api/cast': () => json({ error: 'Sketchfab did not answer.' }, 500), '/api/meshy': { ...meshy, art: [] } }) } }
