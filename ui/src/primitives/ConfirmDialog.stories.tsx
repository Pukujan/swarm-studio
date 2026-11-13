import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConfirmDialog } from './ConfirmDialog'

const meta = {
  component: ConfirmDialog,
  args: { title: 'Empty Trash?', line: "3 projects and their files can't be brought back.", yes: 'Empty Trash', isOpen: true, onDone: () => {} }
} satisfies Meta<typeof ConfirmDialog>
export default meta

export const EmptyTrash: StoryObj<typeof meta> = {}
export const DeleteOne: StoryObj<typeof meta> = { args: { title: 'Delete this project for good?', line: "Its files can't be brought back.", yes: 'Delete' } }
