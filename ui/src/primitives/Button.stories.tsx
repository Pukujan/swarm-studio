import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, LinkButton } from './Button'

const meta = { component: Button, args: { children: 'Build' } } satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { role: 'primary' } }
export const Secondary: Story = { args: { role: 'secondary', children: 'Preview' } }
export const Ghost: Story = { args: { role: 'ghost', children: 'Skip' } }
export const Disabled: Story = { args: { role: 'primary', isDisabled: true } }
export const Link: Story = { render: () => <LinkButton role="secondary" href="/">Open in the Studio</LinkButton> }
