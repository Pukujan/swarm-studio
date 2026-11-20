// Shape it: a step of painted pictures (one still being painted, one that failed), the hero's sprite sheet moving
// once it is picked, a level map, a music loop, the walk still opening, a step the planner gave nothing for, and a
// walk that could not be opened.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShapeIt } from './ShapeIt'
import { json, serve, SPEC, WALK } from './start.fixture'

const at = (step: string) => ({ ...WALK, step })
// the walk as it is at a step; a pick, a redraw and new options answer with the same walk (nothing is saved)
const W = `/api/workshops/${WALK.id}`
const walk = (step: string, more: Record<string, unknown> = {}) => serve({ [W]: at(step), [`${W}/choose`]: at(step), [`${W}/paint`]: at(step), [`${W}/sprite`]: at(step), [`${W}/options`]: at(step), ...more })

const meta = {
  component: ShapeIt,
  args: { isOpen: true, id: WALK.id, api: walk('heroes'), onClose: () => {}, onBuilt: () => {} },
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof ShapeIt>
export default meta
type Story = StoryObj<typeof meta>

// Hero: two painted, one a crew member is painting, one that failed; pick Wick to see his sprite sheet move
export const Hero: Story = {}
// Game: the first step, three ways it could play, as words
export const Game: Story = { args: { api: walk('design') } }
// Levels: each option is its map
export const Levels: Story = { args: { api: walk('levels') } }
// Sound: the last step, so the button is Build the game; a pick plays its loop, and the line is heard in a voice
export const Sound: Story = { args: { api: walk('sound') } }
// the walk is opening
export const Opening: Story = { args: { api: serve({}) } }
// a step with nothing yet and a planner that did not answer: the reason, and New options to ask again
export const NoOptions: Story = { args: { api: walk('story', { [`/api/workshops/${WALK.id}/options`]: () => json({ error: 'The planner did not answer. Try New options.' }, 400) }) } }
// a new walk whose pictures cannot be painted: no image model is signed in
export const NoImageModel: Story = { args: { id: null, spec: SPEC, api: serve({ '/api/workshops': { ...WALK, step: 'design', options: {} }, [`/api/workshops/${WALK.id}/options`]: () => json({ error: 'sign in an image model first' }, 503) }) } }
// the walk could not be opened at all
export const Gone: Story = { args: { api: serve({ [`/api/workshops/${WALK.id}`]: () => json({ error: 'no such workshop' }, 404) }) } }
