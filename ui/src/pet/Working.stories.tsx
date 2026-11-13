// <Working>: a skeleton in the shape of what is coming, marked aria-busy, while it is on its way; the thing itself
// after. In the app Hermia's cursor works on the skeleton (src/pet/Pet.tsx); here there is no cursor, only the marker.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Working } from './Pet'

const meta = {
  component: Working,
  args: { busy: true, label: 'Cards on their way', className: 'h-[118px] w-[210px]', children: <div className="grid h-[118px] w-[210px] place-items-center rounded-[4px] border border-line bg-deep font-display text-xl">Here</div> }
} satisfies Meta<typeof Working>
export default meta
type Story = StoryObj<typeof meta>

export const OnItsWay: Story = {}
export const Arrived: Story = { args: { busy: false } }
export const ShapedSkeleton: Story = {
  args: {
    className: '',
    skeleton: <div className="flex gap-4">{[0, 1, 2].map(i => <div key={i} className="h-[118px] w-[210px] rounded-[4px] border border-line bg-surface-2 motion-safe:animate-pulse" />)}</div>
  }
}
