import type { Meta, StoryObj } from '@storybook/react-vite'
import { DialogTrigger } from 'react-aria-components'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { TextField } from './TextField'

const meta = {
  component: Dialog,
  args: { title: 'Rename', children: null },
  render: (args, { parameters }) => (
    <DialogTrigger defaultOpen={!!parameters.open}>
      <Button>Rename</Button>
      <Dialog {...args}>
        <div className="flex flex-col gap-4">
          <TextField label="Name" defaultValue="Army of Ants" autoFocus />
          <Button role="primary" slot="close">Save</Button>
        </div>
      </Dialog>
    </DialogTrigger>
  )
} satisfies Meta<typeof Dialog>
export default meta

export const Closed: StoryObj<typeof meta> = {}
export const Open: StoryObj<typeof meta> = { parameters: { open: true } }
// a walk of steps (a new game's questions) is wider
export const Wide: StoryObj<typeof meta> = { args: { size: 'wide' }, parameters: { open: true } }
// while its work must not be dropped it does not close: Esc, a click outside and × are off
export const Locked: StoryObj<typeof meta> = { args: { locked: true }, parameters: { open: true } }
