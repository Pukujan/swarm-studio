// The Overview's mock-ups: the real screen on the real machine at the Overview's address, with the server's answers
// stubbed (no server behind Storybook). One story per state it draws differently: a full project, pages still
// planned (no snapshots yet), a build at work (pictures painting, the game building), a version with nothing yet,
// loading, and a version the server does not have.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { TopBar } from '../shell/TopBar'
import { Overview } from './Overview'

// a page's snapshot, drawn here: its theme's colours in bands, as tall as a long page
const shot = (bg: string, fg: string, accent: string, h = 1800) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${h}"><rect width="1280" height="${h}" fill="${bg}"/><rect y="0" width="1280" height="720" fill="${accent}" opacity=".35"/><rect x="120" y="260" width="620" height="64" rx="10" fill="${fg}"/><rect x="120" y="360" width="420" height="24" rx="6" fill="${fg}" opacity=".6"/>${[820, 1240].map(y => `<rect x="120" y="${y}" width="1040" height="300" rx="16" fill="${fg}" opacity=".08"/>`).join('')}</svg>`)}`
const pic = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${c}"/><circle cx="256" cy="230" r="120" fill="#fff" opacity=".35"/></svg>`)}`

const theme = { colors: ['#f4efe2', '#2f5d50', '#c9a227', '#1d1d1b'], fonts: { heading: 'Big Shoulders Display' } }
const plan = [{ id: 'hero', role: 'hero', h: 720, done: true }, { id: 'menu', role: 'menu', h: 520, done: true }, { id: 'story', role: 'story', h: 520 }, { id: 'foot', role: 'footer', h: 300 }]
const pages = [{ id: 'home', title: 'Alpha Tea — tea for night shifts', cover: null, plan }, { id: 'plans', title: 'Plans', cover: null, plan }, { id: 'gifts', title: 'Gift boxes', cover: null, plan }]
const art = [
  { src: pic('#2f5d50'), page: 'home', layer: 'home-hero', gen: 1, name: 'hero', used: 'Alpha Tea — tea for night shifts', style: 'Ink and wash', hero: true },
  { src: pic('#c9a227'), page: 'plans', layer: 'plans-cups', gen: 1, name: 'cups', used: 'Plans', style: 'Ink and wash' }
]
const BOARD = {
  id: 'r-tea-2', title: 'Alpha Tea — tea for night shifts', kind: 'site', live: false, busy: false, pages, art, painting: [], style: 'Ink and wash', theme,
  films: [{ name: 'Promo', src: '/video/r-tea-2/promo.mp4', poster: pic('#1d1d1b'), seconds: 34 }], game: null, app: false, code: false, work: null,
  snaps: { first: 'home', pages: { home: { v: 'a', s: shot('#f4efe2', '#1d1d1b', '#2f5d50') }, plans: { v: 'b', s: shot('#f4efe2', '#1d1d1b', '#c9a227', 1400) }, gifts: { v: 'c', s: shot('#f4efe2', '#1d1d1b', '#2f5d50', 2200) } } }
}
const PROJECT = { id: 'p-tea', title: 'Alpha Tea', head: 'r-tea-2', versions: [{ id: 'r-tea-2' }, { id: 'r-tea-1' }], parts: {} }
const UPLOADS = { files: [{ name: 'logo.png', type: 'image/png', size: 48213, src: pic('#1d1d1b') }, { name: 'menu.pdf', type: 'application/pdf', size: 1823400 }] }
const REFS = { refs: [{ id: 'f1', kind: 'image', name: 'Library shelves', src: pic('#6b4f2f'), source: 'upload', use: 'the hero' }, { id: 'f2', kind: 'link', name: 'teahouse.example', url: 'https://teahouse.example/', source: 'link' }] }

type Mode = 'full' | 'planned' | 'working' | 'empty' | 'hold' | 'missing'
const boardFor = (mode: Mode) => mode === 'planned' ? { ...BOARD, snaps: { pages: {} }, films: [] }
  : mode === 'working' ? { ...BOARD, busy: true, live: true, snaps: { pages: { home: BOARD.snaps.pages.home } },
    painting: [{ page: 'gifts', layer: 'gifts-box', gen: 1, name: 'box', used: 'Gift boxes', state: 'painting' }],
    game: { title: 'Night Shift Dash', pitch: 'Deliver tea before dawn', cover: pic('#101826'), run: 'r-dash', work: { what: 'game', pct: 0.4 } } }
    : mode === 'empty' ? { ...BOARD, title: '', pages: [], art: [], films: [], snaps: { pages: {} } } : BOARD

// every request answers from the fixtures; `hold` keeps them on their way, `missing` has no such build
function stub(mode: Mode) {
  window.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), location.href).pathname
    if (mode === 'hold') return new Promise(() => {})
    if (mode === 'missing' && path.endsWith('/board')) return new Response(JSON.stringify({ error: 'no such build' }), { status: 404 })
    const body = path.endsWith('/board') ? boardFor(mode)
      : path === '/api/projects' ? { projects: mode === 'empty' ? [] : [PROJECT] }
        : path.endsWith('/files') ? (mode === 'empty' ? { files: [] } : UPLOADS)
          : path.endsWith('/refs') ? (mode === 'empty' ? { refs: [] } : REFS) : {}
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

function Screen({ mode }: { mode: Mode }) {
  // the stub goes in before the screen's first fetch
  const [nav] = useState(() => { stub(mode); return makeNav({ search: '?project=p-tea&version=r-tea-2' }) })
  return <NavProvider nav={nav}><div className="bg-bg text-text"><TopBar /><Overview /></div></NavProvider>
}

const meta = {
  component: Screen,
  args: { mode: 'full' },
  decorators: [Story => <div className="-m-6"><Story /></div>],
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Screen>
export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = {}
export const Planned: Story = { args: { mode: 'planned' } }
export const Working: Story = { args: { mode: 'working' } }
export const Empty: Story = { args: { mode: 'empty' } }
export const Loading: Story = { args: { mode: 'hold' } }
export const Missing: Story = { args: { mode: 'missing' } }
