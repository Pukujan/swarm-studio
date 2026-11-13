import type { Meta, StoryObj } from '@storybook/react-vite'
import { P } from '@studio/icons'
import { Icon } from './Icon'

const meta = { component: Icon, args: { name: 'trash' } } satisfies Meta<typeof Icon>
export default meta
type Story = StoryObj<typeof meta>

export const One: Story = {}
export const Every: Story = {
  render: () => <div className="flex flex-wrap gap-4 text-muted">{Object.keys(P).map(n => <span key={n} title={n}><Icon name={n} /></span>)}</div>
}
