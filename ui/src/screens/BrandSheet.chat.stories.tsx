// A brand sheet opened from a chat's brief (spec 31; brand/ChatSheet.tsx): the Design deck of a new project, its
// chat on the brief, and the sheet in the canvas's place beside it. The real machine, moved to `draft` and then to
// `brand` by the chat's own Brand sheet button (the talk asks for the sheet at once: ChatTalk `sheet`), the top bar
// with Lock, and a stand-in server for the chat's brand routes (server/brand.mjs) that keeps what is picked, edited,
// locked and unlocked. A project's sheet, opened from its Studio, is BrandSheet.stories.tsx.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { talkOn, type ChatApi, type ChatTalk } from '../chat'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { TopBarSlots } from '../shell/Slots'
import { TopBar } from '../shell/TopBar'
import { DesignDeck } from './DesignDeck'
import { PACKS, SHEET } from './brand/fixtures'
import type { Brand } from './brand/types'

const answer = (body: unknown, status = 200): Promise<Response> => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const never = () => new Promise<Response>(() => {})

// POST /api/brand makes the sheet (and the chat: the brief had none); /api/brand/c-rats/<what> changes it
function server(make: 'options' | 'locked' | 'loading' | 'error'): ChatApi {
  let brand: Brand = { ...SHEET, lockedAt: make === 'locked' ? 1 : null }
  const view = () => answer({ chat: 'c-rats', brand, theme: null, packs: PACKS })
  return (path, init) => {
    if (path === '/api/models') return answer({ roles: { worker: {} }, text: [] })
    if (path === '/api/brand') return make === 'loading' ? never() : make === 'error' ? answer({ error: 'Hermes did not answer. Try again.' }, 502) : view()
    const what = path.match(/^\/api\/brand\/c-rats\/(pick|edit|lock|unlock)$/)?.[1]
    if (!what) return answer({})
    const b = JSON.parse(String(init?.body || '{}')) as { part?: 'palette' | 'type' | 'story', id?: string, values?: Record<string, string> }
    if (what === 'lock') brand = { ...brand, lockedAt: Date.now() }
    else if (what === 'unlock') brand = { ...brand, lockedAt: null }
    else if (what === 'pick' && (b.part === 'palette' || b.part === 'type') && b.id) brand = { ...brand, pick: { ...brand.pick, [b.part]: b.id }, lockedAt: null }
    else if (what === 'edit' && b.part === 'story') brand = { ...brand, story: { ...brand.story, ...b.values }, lockedAt: null }
    else if (what === 'edit' && b.part === 'palette') brand = { ...brand, palettes: brand.palettes.map(x => (x.id === b.id ? { ...x, ...b.values } : x)), lockedAt: null }
    else if (what === 'edit' && b.part === 'type') brand = { ...brand, types: brand.types.map(x => (x.id === b.id ? { ...x, ...b.values } : x)), lockedAt: null }
    return view()
  }
}

// the brief the chat ends in, asking for its sheet at once (as the Make box's guided brief does)
const TALK: ChatTalk = { id: 'sheet', kind: 'site', brief: SHEET.brief, what: 'Website', sheet: true, blank: true }

const meta = {
  component: DesignDeck,
  args: { api: server('options') },
  parameters: { layout: 'fullscreen' },
  decorators: [Story => {
    talkOn({ ...TALK })
    const nav = makeNav()
    nav.go({ type: 'draft' })
    return <NavProvider nav={nav}><TopBarSlots><TopBar /><Story /></TopBarSlots></NavProvider>
  }]
} satisfies Meta<typeof DesignDeck>
export default meta
type Story = StoryObj<typeof meta>

// the options, made from the brief: packs, story, palettes and type, the chat beside them; Lock in the top bar, and
// Chat in the breadcrumb goes back to the deck with the brief
export const Options: Story = {}
// the options on their way (a model call): the cards' skeleton, aria-busy, Hermia's cursor on the first card
export const Loading: Story = { args: { api: server('loading') } }
// a sheet locked before, opened again: Unlock in the top bar, no own-words cards
export const Locked: Story = { args: { api: server('locked') } }
// the options could not be made: the toast says so, Lock waits
export const Failed: Story = { args: { api: server('error') } }
