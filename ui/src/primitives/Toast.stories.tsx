import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { Button } from './Button'
import { ToastProvider, useToast } from './Toast'

function Say({ text, action }: { text: string, action?: string }) {
  const toast = useToast()
  useEffect(() => { toast(text, { icon: 'trash', action, onAction: () => {} }) }, [toast, text, action])
  return <Button onPress={() => toast(text, { icon: 'trash', action })}>Again</Button>
}
const meta = { component: Say, args: { text: 'In Trash' }, decorators: [Story => <ToastProvider><Story /></ToastProvider>] } satisfies Meta<typeof Say>
export default meta
type Story = StoryObj<typeof meta>

export const Plain: Story = {}
export const WithUndo: Story = { args: { text: '3 in Trash', action: 'Undo' } }
