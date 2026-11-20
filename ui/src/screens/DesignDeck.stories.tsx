// The Design deck's mock-ups: the real machine at the deck's address (?version=…&room=deck), fed a build's
// events from deck/deck.fixture.ts instead of the server, one story per state the deck draws differently. The build's
// film (video/film.fixture.ts) is none unless a story says: then its panel floats over the corner.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { DesignDeck } from './DesignDeck'
import { deckEvents, RUN, type Cut } from './deck/deck.fixture'
import { DeckSourceContext, type DeckSource } from './deck/source'
import { PhotoSourceContext, type PhotoSource } from '../board/photos'
import { SheetsProvider } from './setup/Sheets'
import { filmSource } from './video/film.fixture'
import { FilmSourceContext, type FilmSource } from './video/source'

// the image-first board (src/board/) with a photo per page, drawn here, so its photo tiers have something to show
const drawn: PhotoSource = {
  async pages() {
    const out: Record<string, { s: string, f: string }> = {}
    for (const [i, id] of ['home', 'menu', 'visit', 'about', 'press'].entries()) {
      const c = document.createElement('canvas')
      c.width = 320; c.height = 225
      const g = c.getContext('2d') as CanvasRenderingContext2D
      g.fillStyle = ['#1d1d1f', '#2a2a2d', '#3a3a3e', '#26262a', '#303034'][i]; g.fillRect(0, 0, 320, 225)
      g.fillStyle = '#eeeeee'; g.font = '600 22px sans-serif'; g.fillText(id, 20, 44)
      const url = c.toDataURL('image/png')
      out[id] = { s: url, f: url }
    }
    return out
  }
}

// `live`: the server is making this build now (a saved one that never finished shows as stopped)
const from = (cut: Cut, live = false): DeckSource => ({ events: async () => deckEvents(cut), live: async () => live })

const meta = {
  component: DesignDeck,
  parameters: { source: from('done'), film: filmSource('none'), extra: '' },
  decorators: [(Story, { parameters }) => (
    <NavProvider nav={makeNav({ search: `?version=${RUN}&room=deck${(parameters.extra as string | undefined) ?? ''}` })}>
      <SheetsProvider first={false}><FilmSourceContext value={parameters.film as FilmSource}>
        <DeckSourceContext value={parameters.source as DeckSource}><PhotoSourceContext value={drawn}><Story /></PhotoSourceContext></DeckSourceContext>
      </FilmSourceContext></SheetsProvider>
    </NavProvider>
  )]
} satisfies Meta<typeof DesignDeck>
export default meta
type Story = StoryObj<typeof meta>

export const Done: Story = {}
export const Building: Story = { parameters: { source: from('building', true) } }
export const StoppedHalfWay: Story = { parameters: { source: from('building') } }
export const Planned: Story = { parameters: { source: from('planned', true) } }
export const Stopped: Story = { parameters: { source: from('stopped') } }
export const SectionFailed: Story = { parameters: { source: from('failed') } }
export const Loading: Story = { parameters: { source: { events: () => new Promise(() => {}) } satisfies DeckSource } }
export const Empty: Story = { parameters: { source: { events: async () => [] } satisfies DeckSource } }
export const Missing: Story = { parameters: { source: { events: () => Promise.reject(new Error('This build is not here any more.')) } satisfies DeckSource } }
// Play: the machine's player open on a page (?play=prototype&page=…)
export const Playing: Story = { parameters: { extra: '&play=prototype&page=plans' } }
// ☰ → Replay: the finished build played again on its own clock
export const Replaying: Story = { parameters: { extra: `&replay=${RUN}` } }

// the build's film, already there when the deck opened: its panel waits minimized (the title, and the progress of
// one being made); Expand shows it, and its head opens the Film studio
export const FilmBeingMade: Story = { parameters: { film: filmSource('rendering') } }
export const FilmReady: Story = { parameters: { film: filmSource('done') } }

// the image-first board behind its flag: photos under the tier manager, as <img> and on the PixiJS canvas
export const BoardTiers: Story = { args: { board: 'tiers' }, parameters: { source: from('building', true) } }
export const BoardPixi: Story = { args: { board: 'pixi' }, parameters: { source: from('building', true) } }
