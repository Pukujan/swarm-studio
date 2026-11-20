// The Film studio's mock-ups, one per body it draws: no film yet (the empty form), the storyboard being written,
// the render with its live cut, the finished film (one cut, then several with its three shapes), a film that
// failed, Hermes not there (Set up), the style notes' pill, and the outside services. From the server's own answer
// shapes (film.fixture.ts), with no server.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilmStudioView } from './FilmStudioView'
import { filmEvents, filmPart, filmStatus, media, RUN, savedCuts, type FilmCut } from './film.fixture'
import { foldFilm, noFilm, withCuts, withPart, withStatus, type Film, type FilmOpts } from './model'

const film = (cut: FilmCut): Film => withPart(withStatus(filmEvents(cut).filter(e => e.type.startsWith('video:')).reduce(foldFilm, noFilm(RUN)), filmStatus(cut)), filmPart(cut))
const opts: FilmOpts = { voice: '', music: true, clips: true, style: '', idea: '', refs: [] }
// the live cut's page, as the server writes it for the renderer: here one frame of it
const live = `data:text/html,${encodeURIComponent('<body style="margin:0;display:grid;place-items:center;height:100vh;background:#22302b;color:#e9e2d0;font:700 160px Georgia,serif">River Hours</body>')}`

const meta = {
  component: FilmStudioView,
  args: { film: film('none'), opts, media: null, onOpts: () => {}, onMake: () => {}, onPick: () => {}, onAddRef: () => {}, onReveal: () => {}, onMediaKey: () => {}, onMediaAgain: () => {}, onSetup: () => {}, live },
  parameters: { layout: 'fullscreen' },
  decorators: [Story => <div className="flex h-[760px] flex-col bg-bg"><Story /></div>]
} satisfies Meta<typeof FilmStudioView>
export default meta
type Story = StoryObj<typeof meta>

export const NoFilmYet: Story = {}
export const Loading: Story = { args: { loading: true } }
export const WithChoices: Story = { args: { opts: { ...opts, idea: 'Slow, end on the open sign', style: 'calm', voice: 'af_heart', refs: [{ name: 'moodboard.png' }, { name: 'theme.mp3' }] }, media } }
export const Storyboarding: Story = { args: { film: film('storyboard') } }
export const Rendering: Story = { args: { film: film('rendering') } }
export const Done: Story = { args: { film: film('done'), media } }
// every cut is kept: the newest plays, in the shapes it was made in; an older one is a click away
export const DoneWithCuts: Story = { args: { film: withCuts(film('done'), savedCuts), media } }
export const AnOlderCut: Story = { args: { film: { ...withCuts(film('done'), savedCuts), pick: 0 } } }
export const Failed: Story = { args: { film: film('failed') } }
export const HermesNotThere: Story = { args: { film: film('no-hermes') } }
