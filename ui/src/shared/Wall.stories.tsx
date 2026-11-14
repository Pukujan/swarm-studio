import type { Meta, StoryObj } from '@storybook/react-vite'
import { Wall, type WallWindow } from './Wall'

const box = (text: string) => <div className="grid h-full place-items-center p-4 font-monospace text-sm text-muted">{text}</div>
const windows: WallWindow[] = [
  { id: 'map', title: 'Map', content: box('the screens and the data') },
  { id: 'live', title: 'Live app', content: box('the app as it is built') },
  { id: 'code', title: 'Code', content: box('src/pages/Book.tsx') },
  { id: 'shipped', title: 'Shipped', content: box('Book a class, done') }
]

const meta = {
  component: Wall,
  args: { label: 'App build', windows },
  decorators: [Story => <div className="flex h-[640px] flex-col bg-bg"><Story /></div>]
} satisfies Meta<typeof Wall>
export default meta
type Story = StoryObj<typeof meta>

export const Four: Story = {}
export const Busy: Story = { args: { windows: windows.map((w, i) => (i === 1 ? { ...w, busy: true, content: <div className="h-full motion-safe:animate-pulse bg-surface-2" /> } : w)) } }
export const Answering: Story = { args: { windows: windows.map((w, i) => (i === 2 ? { ...w, say: { who: 'Pip', text: "I'm on the booking form: the date picker next." } } : w)) } }
export const Phone: Story = { args: { start: 1 }, globals: { viewport: { value: 'mobile1' } } }
