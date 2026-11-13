// The kit's menu on React Aria's: arrow keys, type-ahead, Esc and a click outside close it (RULES.md rule 18).
// Places, actions and settings never share one (rule 5): give each its own menu. `name` is what a screen reader
// calls the button and the menu, for a label that is only an icon.
import type { ReactNode } from 'react'
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, type MenuItemProps, type MenuProps } from 'react-aria-components'
import { Button, type Role } from './Button'

// `isDisabled` greys the button; `onOpenChange` hears it open (a menu whose items load when it opens)
export function Menu<T extends object>({ label, name, role = 'ghost', isDisabled, onOpenChange, children, ...props }: MenuProps<T> & {
  label: ReactNode, name: string, role?: Role, isDisabled?: boolean, onOpenChange?: (open: boolean) => void
}) {
  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      <Button role={role} aria-label={name} isDisabled={isDisabled}>{label}</Button>
      <Popover placement="bottom end" offset={6} className="min-w-48 rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <AriaMenu {...props} aria-label={name} className="outline-none">{children}</AriaMenu>
      </Popover>
    </MenuTrigger>
  )
}

export function MenuItem(props: MenuItemProps) {
  return <AriaMenuItem {...props} className="flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 font-monospace text-sm text-text outline-none data-[focused]:bg-panel-2 data-[disabled]:opacity-50" />
}
