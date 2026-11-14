// The brand sheet's screen mock-ups (one of the six design artifacts, docs/PLANS.md §5): the real machine started at
// the sheet's address, with the top bar, and the answers the server would give (brand/fixtures.ts). The board's
// own states, with picks and edits applied, are brand/BrandBoard.stories.tsx.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { TopBarSlots } from '../shell/Slots'
import { TopBar } from '../shell/TopBar'
import { BrandSheet } from './BrandSheet'
import { PACKS, SHEET } from './brand/fixtures'

const STUDIO = { project: { title: 'Bristol Rat Rescue' }, studio: { idea: SHEET.brief, kind: 'site' } }
const ANSWERS: Record<string, unknown> = {
  options: { chat: 'p-rats', brand: SHEET, theme: null, packs: PACKS },
  locked: { chat: 'p-rats', brand: { ...SHEET, lockedAt: 1 }, theme: null, packs: PACKS }
}

// GET /api/studio/:pid answers with the project; the sheet's routes with the story's sheet ('loading': never)
function serve(which: string) {
  window.fetch = async input => {
    const url = String(input instanceof Request ? input.url : input)
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/studio/')) return json(STUDIO)
    if (which === 'loading') return new Promise<Response>(() => {})
    if (which === 'error') return json({ error: 'Hermes did not answer. Try again.' }, 503)
    return json(ANSWERS[which])
  }
}

const meta = {
  component: BrandSheet,
  parameters: { address: '?room=brand&project=p-rats&step=brand', sheet: 'options' },
  decorators: [(Story, { parameters }) => {
    serve(parameters.sheet)
    return (
      <NavProvider nav={makeNav({ search: parameters.address })}>
        <TopBarSlots><TopBar /><Story /></TopBarSlots>
      </NavProvider>
    )
  }]
} satisfies Meta<typeof BrandSheet>
export default meta
type Story = StoryObj<typeof meta>

// the options: packs, story, palettes and type; Lock in the top bar
export const Options: Story = {}
// the options on their way (a model call): the cards' skeleton, aria-busy, Hermia's cursor on the first card
export const Loading: Story = { parameters: { sheet: 'loading' } }
// locked: Unlock in the top bar, no own-words cards
export const Locked: Story = { parameters: { sheet: 'locked' } }
// the options could not be made: the toast says so, Lock waits
export const Failed: Story = { parameters: { sheet: 'error' } }
