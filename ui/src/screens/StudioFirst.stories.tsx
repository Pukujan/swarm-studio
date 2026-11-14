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

// the Brand step (decision 0015): the three options to pick a mood from, the picked one's moodboard, and the story,
// colours, type and voice that follow from it
const photo = (c: string) => ({ url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${c}"/></svg>`)}` })
const option = (slug: string, name: string, bg: string, text: string, accent: string, heading: string, line: string, colours: string[]) =>
  ({ slug, name, why: `For a cafe that wants to feel ${name.toLowerCase()}.`, palette: { bg, text, accent, link: accent }, type: { heading, body: 'Inter' }, voice: { lines: [line] }, pictures: { photos: colours.map(photo) } })
const OPTIONS = [
  option('warm-editorial', 'Warm editorial', '#f4eee3', '#2a241f', '#b5552f', 'DM Serif Display', 'Coffee by the water, slowly.', ['#c9b49a', '#8a6f55', '#d8c7ad', '#a58a6b', '#e6d6bd', '#6f5843']),
  option('clean-product', 'Clean product', '#f5f5f2', '#1c1c1a', '#2f5d3a', 'Work Sans', 'Open at seven. Bread at eight.', ['#d7d6d0', '#a9a8a2', '#e8e7e2']),
  option('playful-community', 'Playful community', '#fff7e8', '#1f2430', '#ff7a45', 'Fraunces', 'Bring a friend, stay a while.', ['#f2c38b', '#9fc4e8', '#f7dfb8'])
]
const PICKED = {
  ...ALONG.brand, pack: 'warm-editorial', story: { what: 'Cedar Cafe, a small cafe by the river', who: 'neighbours and walkers' },
  voice: { lines: OPTIONS[0].voice.lines }, pictures: { photos: OPTIONS[0].pictures.photos }
}
export const BrandStep: Story = {
  parameters: {
    fetch: (path: string) => (String(path).includes('/brand') ? answer({ brand: PICKED, packs: OPTIONS }) : answer({ ...ALONG, brand: PICKED })),
    address: ADDRESS
  }
}
