// The Studio first's mock-ups: the real machine at the screen's address (as src/App.stories.tsx does), and a stand-in
// server per state worth seeing: loading, the server failing, a new website project, and one well along.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from '../App'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { SourceProvider, type Fetch } from './studio/source'

const ADDRESS = '?room=studio&project=p-cedar&step=brand'
const project = { id: 'p-cedar', name: 'Cedar Cafe', title: 'Cedar Cafe' }
const studio = (more = {}) => ({ kind: 'site', idea: 'Cedar Cafe, a small cafe by the river', mode: 'studio', chat: null, steps: { brand: 'empty', references: 'empty', assets: 'empty', plan: 'empty' }, start: 'brand', kit: {}, ...more })
const NEW = { project, studio: studio(), brand: null, refs: [], assets: [] }
const ALONG = {
  project,
  studio: studio({ kit: { pages: ['Home', 'Menu', 'Visit'] }, steps: { brand: 'started', references: 'done', assets: 'done', plan: 'started' } }),
  brand: { palettes: [{ id: 'p1', bg: '#f4efe6', text: '#2b2118', accent: '#b5562b', link: '#7a3b1d' }], types: [{ id: 't1', heading: 'Fraunces', body: 'Inter' }], pick: { palette: 'p1', type: 't1' } },
  refs: [{ id: 'r1', name: 'Tartine bakery', kind: 'link' }, { id: 'r2', name: 'Morning light', kind: 'file' }],
  assets: [{ id: 'a1', name: 'logo.svg', kind: 'file', role: 'logo' }]
}

const answer = (body: unknown, status = 200): Promise<Response> => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
// the studio record for GET /api/studio/:pid; anything posted answers with the same record
const serving = (record: unknown): Fetch => () => answer(record)

const meta = {
  component: App,
  parameters: { address: ADDRESS, fetch: serving(NEW) },
  decorators: [(Story, { parameters }) => (
    <NavProvider nav={makeNav({ search: parameters.address })}>
      <SourceProvider fetch={parameters.fetch}><Story /></SourceProvider>
    </NavProvider>
  )]
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const NewProject: Story = {}
export const WellAlong: Story = { parameters: { fetch: serving(ALONG), address: '?room=studio&project=p-cedar&step=plan' } }
export const Loading: Story = { parameters: { fetch: () => new Promise<Response>(() => {}) } }
export const ServerFails: Story = { parameters: { fetch: () => answer({ error: 'No such project' }, 404) } }
