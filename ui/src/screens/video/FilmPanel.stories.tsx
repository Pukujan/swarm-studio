// The film panel over the Design deck (FilmPanel.tsx), one mock-up per state it draws: the storyboard being written,
// the render with its live cut, the finished film, a film that failed, and each of them minimized (the title and the
// progress only). From the server's own answer shapes (film.fixture.ts), with no server, over a stand-in for the
// deck's canvas. The deck with its panel is in ../DesignDeck.stories.tsx (FilmBeingMade, FilmReady).
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilmStudioView, type FilmStudioViewProps } from './FilmStudioView'
import { filmEvents, filmPart, filmStatus, media, RUN, savedCuts, type FilmCut } from './film.fixture'
import { foldFilm, noFilm, withCuts, withPart, withStatus, type Film, type FilmOpts } from './model'

const film = (cut: FilmCut): Film => withPart(withStatus(filmEvents(cut).filter(e => e.type.startsWith('video:')).reduce(foldFilm, noFilm(RUN)), filmStatus(cut)), filmPart(cut))
const opts: FilmOpts = { voice: '', music: true, clips: true, style: '', idea: '', refs: [] }
// the live cut's page, as the server writes it for the renderer: here one frame of it
const live = `data:text/html,${encodeURIComponent('<body style="margin:0;display:grid;place-items:center;height:100vh;background:#22302b;color:#e9e2d0;font:700 160px Georgia,serif">River Hours</body>')}`

// the panel as the deck holds it: Minimize and Expand work, starting as the story says
function Panel({ min: first = false, ...props }: Omit<FilmStudioViewProps, 'panel'> & { min?: boolean }) {
  const [min, setMin] = useState(first)
  return <FilmStudioView {...props} panel={{ min, onMin: () => setMin(m => !m), onOpen: () => {} }} />
}

const meta = {
  component: Panel,
  args: { film: film('rendering'), opts, media, onOpts: () => {}, onMake: () => {}, onPick: () => {}, onAddRef: () => {}, onReveal: () => {}, onMediaKey: () => {}, onMediaAgain: () => {}, onSetup: () => {}, live },
  parameters: { layout: 'fullscreen' },
  decorators: [Story => <div className="relative h-[760px] overflow-hidden bg-void [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:24px_24px]"><Story /></div>]
} satisfies Meta<typeof Panel>
export default meta
type Story = StoryObj<typeof meta>

export const Making: Story = {}
export const Storyboarding: Story = { args: { film: film('storyboard') } }
export const Done: Story = { args: { film: withCuts(film('done'), savedCuts) } }
export const Failed: Story = { args: { film: film('failed') } }
export const HermesNotThere: Story = { args: { film: film('no-hermes') } }
export const Minimized: Story = { args: { min: true } }
export const MinimizedDone: Story = { args: { film: film('done'), min: true } }
export const MinimizedFailed: Story = { args: { film: film('failed'), min: true } }
