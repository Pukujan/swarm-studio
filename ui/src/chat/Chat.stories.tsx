// The left chat in each state worth seeing. A story answers the chat's server calls from a fixture (the `api`
// prop), so each one is a place the person can actually be.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Chat } from './Chat'

const meta = {
  component: Chat,
  decorators: [Story => <div className="h-[640px] w-[340px]"><Story /></div>]
} satisfies Meta<typeof Chat>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
