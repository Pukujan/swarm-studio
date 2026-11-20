// The Overview's mock-ups: the real screen on the real machine at the Overview's address, with the server's answers
// stubbed (no server behind Storybook). One story per state it draws differently: a full project, pages still
// planned (no snapshots yet), a build at work (pictures painting, the game building), a version with nothing yet,
// loading, and a version the server does not have. The chat is on every one (overview/OverviewChat.tsx): down the left
// in a wide window, along the bottom in a narrower one; the last stories show it with the build's own lines, on a
// phone, and with a section dragged in.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { TopBar } from '../shell/TopBar'
import { SheetsProvider } from './setup/Sheets'
import { Overview } from './Overview'
import { deckEvents } from './deck/deck.fixture'
import { DeckSourceContext, type DeckSource } from './deck/source'
import { LAYER_TYPE } from '../chat'

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

// the build's events, which the chat reads its lines from: none, or a finished build's (deck/deck.fixture.ts)
const quiet: DeckSource = { events: async () => [] }
const built: DeckSource = { events: async () => deckEvents('done') }
// Scribble (spec 29): a ring the run has (sent, so dashed), what it was read to say, the draft the crew made of that
// section and another still being written
const marked: DeckSource = { events: async () => [...deckEvents('done'),
  { type: 'marks', run: 'r-tea-2', text: 'make this bigger', marks: [{ id: 'k1', kind: 'box', page: 'home', pts: [], box: { x: 0.12, y: 0.06, w: 0.5, h: 0.1 } }] },
  { type: 'marks:read', run: 'r-tea-2', reads: [{ mark: 'k1', read: 'k1: a box round the headline, "make this bigger"' }] },
  { type: 'draft', run: 'r-tea-2', id: 'd1', page: 'home', layer: 'hero', role: 'hero', marks: ['k1'], html: '<section class="px-16 py-24"><h1 class="text-7xl font-semibold">Alpha Tea</h1><p class="mt-4 text-xl opacity-80">Tea for night shifts.</p></section>' },
  { type: 'draft:start', run: 'r-tea-2', page: 'plans', layer: 'hero', role: 'hero' }
] }

function Screen({ mode, lines = false, scribbled = false }: { mode: Mode, lines?: boolean, scribbled?: boolean }) {
  // the stub goes in before the screen's first fetch
  const [nav] = useState(() => { stub(mode); return makeNav({ search: '?project=p-tea&version=r-tea-2' }) })
  return <NavProvider nav={nav}><SheetsProvider first={false}><DeckSourceContext value={scribbled ? marked : lines ? built : quiet}><div className="bg-bg text-text"><TopBar /><Overview /></div></DeckSourceContext></SheetsProvider></NavProvider>
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

// the chat with what the crew said while they built: their lines in the Chat tab, the build's news in Log
export const ChatWithTheBuild: Story = { args: { lines: true } }
// a narrower window: the chat is a dock along the bottom, and the Overview's own dock sits above it
export const ChatOnAPhone: Story = { args: { lines: true }, globals: { viewport: { value: 'mobile1' } } }
// Scribble: a mark the crew have (dashed), their draft of that section beside its page, and one still being written
export const Scribbled: Story = { args: { scribbled: true } }
// the draft picked: the section as written again, what the mark was read to say, Accept and Dismiss
export const ADraftPicked: Story = {
  args: { scribbled: true },
  play: async ({ canvasElement }) => {
    const draft = await new Promise<HTMLElement>(ok => { const look = () => { const el = canvasElement.ownerDocument.querySelector<HTMLElement>('.ov-ab.draft:not(.writing)'); if (el) ok(el); else setTimeout(look, 50) }; look() })
    draft.click()
  }
}
// Scribble in hand and a mark drawn: the page wears it, and the message box says "1 mark"
export const AMarkDrawn: Story = {
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument
    const wait = <T extends Element>(sel: string) => new Promise<T>(ok => { const look = () => { const el = doc.querySelector<T>(sel); if (el) ok(el); else setTimeout(look, 50) }; look() })
    ;(await wait<HTMLButtonElement>('.ov-dock [aria-label="Scribble"]')).click()
    const pad = await wait<HTMLElement>('.ov-ab.page .ov-mk-pad.scribble')
    const r = pad.getBoundingClientRect(), at = (fx: number, fy: number) => ({ bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy })
    pad.setPointerCapture = () => {}
    pad.dispatchEvent(new PointerEvent('pointerdown', at(0.2, 0.2)))
    for (const [x, y] of [[0.4, 0.22], [0.6, 0.3], [0.7, 0.4]]) pad.dispatchEvent(new PointerEvent('pointermove', at(x, y)))
    pad.dispatchEvent(new PointerEvent('pointerup', at(0.7, 0.4)))
  }
}
// a section dragged from Layers into the chat: a chip in the message box, and the words go to just that section
export const SectionInTheChat: Story = {
  play: async ({ canvasElement }) => {
    const chat = await new Promise<Element>(ok => { const look = () => { const el = canvasElement.ownerDocument.querySelector('[data-chat-dock]'); if (el) ok(el); else setTimeout(look, 50) }; look() })
    const dataTransfer = new DataTransfer()
    dataTransfer.setData(LAYER_TYPE, JSON.stringify({ key: 'home/hero', name: 'hero' }))
    chat.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
  }
}
