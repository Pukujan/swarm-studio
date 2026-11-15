import type { Meta, StoryObj } from '@storybook/react-vite'
import { RefAsk } from './RefDrop'

// Hermia's one question after a drop to References, beside it on the screen (a relative box stands in for the screen)
const meta = {
  component: RefAsk,
  args: { what: 'moodboard.png', onLike: () => {}, onAsIs: () => {} },
  decorators: [Story => <div className="relative h-[320px] bg-void"><Story /></div>]
} satisfies Meta<typeof RefAsk>
export default meta
type Story = StoryObj<typeof meta>

export const OneFile: Story = {}
export const SeveralFiles: Story = { args: { what: '3 files' } }
export const LongName: Story = { args: { what: 'the-whole-brand-guide-for-the-spring-campaign-final-final-v7.pdf' }, globals: { viewport: { value: 'mobile1' } } }
