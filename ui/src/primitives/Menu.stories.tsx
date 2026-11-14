import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import { Button } from './Button'
import { Menu, MenuAt, MenuItem, MenuRow, MenuSeparator, Submenu } from './Menu'

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

// a project's menu: icons, a list beside it, a separator and a red last item
export const Rows: StoryObj<typeof meta> = {
  render: () => (
    <Menu label="…" name="More">
      <MenuRow id="open" icon="ext" label="Open" />
      <MenuRow id="rename" icon="type" label="Rename" />
      <Submenu icon="folder" label="Move to" name="Move to">
        <MenuRow id="f:Client work" icon="folder" label="Client work" on />
        <MenuRow id="new" icon="plus" label="New folder" />
      </Submenu>
      <MenuSeparator />
      <MenuRow id="trash" icon="trash" label="Delete" red />
    </Menu>
  )
}

function Opened() {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  return (
    <>
      <Button ref={ref} role="primary" onPress={() => setOpen(true)}>Make</Button>
      <MenuAt name="Make" triggerRef={ref} isOpen={open} onClose={() => setOpen(false)}>
        <MenuRow id="now" icon="zap" label="Just make it" />
        <MenuRow id="studio" icon="grid" label="Studio" on />
      </MenuAt>
    </>
  )
}
export const At: StoryObj<typeof meta> = { render: () => <Opened /> }
