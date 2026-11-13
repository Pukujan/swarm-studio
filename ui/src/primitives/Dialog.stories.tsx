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
