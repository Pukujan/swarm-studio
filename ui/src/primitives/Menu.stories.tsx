import type { Meta, StoryObj } from '@storybook/react-vite'
import { Menu, MenuItem } from './Menu'

const meta = {
  component: Menu,
  args: { label: '☰', name: 'Settings' },
  render: args => (
    <div className="flex justify-end">
      <Menu {...args}>
        <MenuItem id="light">Light</MenuItem>
        <MenuItem id="dark">Dark</MenuItem>
        <MenuItem id="sound" isDisabled>Sound</MenuItem>
      </Menu>
    </div>
  )
} satisfies Meta<typeof Menu>
export default meta

export const Settings: StoryObj<typeof meta> = {}
