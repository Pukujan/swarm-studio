// The Film studio's mock-ups as the screen: the real machine at the room's address (?version=…&room=video), fed a
// film's saved events and answers from video/film.fixture.ts instead of the server, one story per state the room
// draws differently, with its chat.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { ToastProvider } from '../primitives/Toast'
import { SheetsProvider } from './setup/Sheets'
import { FilmStudio } from './FilmStudio'
import { filmEvents, filmPart, filmStatus, media, RUN, savedCuts, type FilmCut } from './video/film.fixture'
import { FilmSourceContext, type FilmSource } from './video/source'

const from = (cut: FilmCut, more: Partial<FilmSource> = {}): FilmSource => ({
  events: async () => filmEvents(cut),
  status: async () => filmStatus(cut),
  part: async () => filmPart(cut),
  cuts: async () => (cut === 'done' ? savedCuts : []),
  make: async () => ({ state: 'working', pct: 0, stage: 'storyboard' }),
  ref: async (_run, file) => ({ name: file.name }),
  reveal: async () => {},
  media: async () => media,
  mediaKey: async () => media,
  ...more
})

const meta = {
  component: FilmStudio,
  parameters: { source: from('done') },
  decorators: [(Story, { parameters }) => (
    <NavProvider nav={makeNav({ search: `?version=${RUN}&room=video` })}>
      <SheetsProvider first={false}><ToastProvider><FilmSourceContext value={parameters.source as FilmSource}><Story /></FilmSourceContext></ToastProvider></SheetsProvider>
    </NavProvider>
  )]
} satisfies Meta<typeof FilmStudio>
export default meta
type Story = StoryObj<typeof meta>

export const Done: Story = {}
export const NoFilmYet: Story = { parameters: { source: from('none') } }
export const Storyboarding: Story = { parameters: { source: from('storyboard') } }
export const Rendering: Story = { parameters: { source: from('rendering') } }
export const Failed: Story = { parameters: { source: from('failed') } }
export const HermesNotThere: Story = { parameters: { source: from('no-hermes') } }
export const Loading: Story = { parameters: { source: from('none', { events: () => new Promise(() => {}) }) } }
// the server would not start it (a build with nothing built yet): its reason, and Try again
export const CouldNotStart: Story = { parameters: { source: from('none', { make: () => Promise.reject(new Error('Nothing to film yet: build a page first.')) }) } }
