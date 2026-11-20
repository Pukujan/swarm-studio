// The Game room's mock-ups: the real machine at the game's address (?version=…&room=game), fed from
// game/game.fixture.ts instead of the server, one story per state the room draws differently: the art being painted,
// the crew building, the game playable, the build waiting for you after a slice (its card in the chat), failed,
// stopped, and out of art.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { ToastProvider } from '../primitives/Toast'
import { TrailProvider } from '../shell/Trail'
import { DeckSourceContext, type DeckSource } from './deck/source'
import { GameRoom } from './GameRoom'
import { map, RUN, sheet, STATES } from './game/game.fixture'
import type { GameState } from './game/model'
import { GameSourceContext, type GameSource } from './game/source'

const files = [{ path: 'project.godot', size: 420 }, { path: 'scenes/main.tscn', size: 2100 }, { path: 'scripts/hero.gd', size: 1800 }, { path: 'scripts/crow.gd', size: 900 }]
const text = 'extends CharacterBody2D\n\nconst DIVE := 420.0\n\nfunc _physics_process(delta: float) -> void:\n\tvelocity.y = DIVE\n\tmove_and_slide()\n'

// a source that answers from the fixture; `player`: this Studio has an AI player (the Autoplay switch shows)
const from = (app: GameState, painted: number, o: { player?: boolean, part?: Awaited<ReturnType<GameSource['part']>> } = {}): GameSource => ({
  state: async () => app,
  assets: async () => ({ sheet: sheet(painted) }),
  map: async () => map,
  part: async () => o.part ?? null,
  events: async () => [{ type: 'run:start', run: RUN, title: 'Lantern Run', agents: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Pip' }, { name: 'Di' }] }],
  files: async () => ({ files }),
  file: async (_run, path) => ({ path, text }),
  open: async () => ({ url: STATES.playable.url }),
  tell: async () => ({ answer: 'Pip is on the crows: they dive now, the swoop back up is next.' }),
  build: async () => ({ ...app, state: 'working', stage: 'starting' }),
  ...(o.player ? { autoplay: { get: async () => ({ on: false }), set: async (_run, b) => ({ on: !!b.start, live: false, say: 'going for the lantern' }), frames: () => ({ close: () => {} }) } } : {})
})
const deck: DeckSource = { events: async () => [], live: async () => false }

const meta = {
  component: GameRoom,
  parameters: { layout: 'fullscreen', source: from(STATES.building, 8) },
  decorators: [(Story, { parameters }) => (
    <NavProvider nav={makeNav({ search: `?version=${RUN}&room=game` })}>
      <TrailProvider><ToastProvider>
        <DeckSourceContext value={deck}><GameSourceContext value={parameters.source as GameSource}>
          {/* the room sizes itself under the top bar (3.5rem), which a story does not draw */}
          <div className="-m-6 flex flex-col bg-bg pt-14"><Story /></div>
        </GameSourceContext></DeckSourceContext>
      </ToastProvider></TrailProvider>
    </NavProvider>
  )]
} satisfies Meta<typeof GameRoom>
export default meta
type Story = StoryObj<typeof meta>

// the crew's wall: the Map, the play test, the art as it lands, the file being written
export const Building: Story = {}
// before there is anything to play: the art sheet lies where the game will be (press Art in the switch)
export const PaintingTheArt: Story = { parameters: { source: from(STATES.painting, 3) } }
// built and running: the game on the stage, Crew gone from the switch, Autoplay beside it, the engine project to download
export const Playable: Story = { parameters: { source: from(STATES.playable, 8, { player: true }) } }
// "your turn": a big game waits after a slice, with Hermia's card in the chat (the still, Play it live, the answers)
export const WaitingForYou: Story = { parameters: { source: from(STATES.waiting, 8) } }
// the slice's game never drew: no film, and the chat offers Fix it or Go on
export const WaitingAfterAFailedPlayTest: Story = { parameters: { source: from(STATES.waitingFailed, 8) } }
// the build failed: why in plain words, the detail folded away, Try again
export const Failed: Story = { parameters: { source: from(STATES.failed, 0, { part: { state: 'failed', reason: { message: 'The model stopped answering.', action: 'Wait a minute, then try again.' }, detail: STATES.failed.message, next: 'retry' } }) } }
export const Stopped: Story = { parameters: { source: from(STATES.stopped, 0) } }
// the image model ran out before any art landed
export const NoArt: Story = { parameters: { source: from(STATES.noArt, 0) } }
