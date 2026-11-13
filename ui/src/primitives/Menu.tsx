// The kit's menu on React Aria's: arrow keys, type-ahead, Esc and a click outside close it (RULES.md rule 18).
// Places, actions and settings never share one (rule 5): give each its own menu. `name` is what a screen reader
// calls the button and the menu, for a label that is only an icon.
// MenuAt is the same menu opened by something other than its own button (Make's submit, a right-click at a point);
// MenuRow is an item with its icon, a ✓ when it is the current one, and red for a step that removes something.
import type { ReactNode, RefObject } from 'react'
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, Separator, SubmenuTrigger, type MenuItemProps, type MenuProps } from 'react-aria-components'
import { Button, type Role } from './Button'
import { Icon } from './Icon'

const POPOVER = 'min-w-48 max-h-[70dvh] overflow-y-auto rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none'

export function Menu<T extends object>({ label, name, role = 'ghost', className, children, ...props }: MenuProps<T> & { label: ReactNode, name: string, role?: Role, className?: string }) {
  return (
    <MenuTrigger>
      <Button role={role} aria-label={name} className={className}>{label}</Button>
      <Popover placement="bottom end" offset={6} className={POPOVER}>
        <AriaMenu {...props} aria-label={name} className="outline-none">{children}</AriaMenu>
      </Popover>
    </MenuTrigger>
  )
}

export function MenuAt<T extends object>({ name, triggerRef, isOpen, onClose, placement = 'bottom end', children, ...props }: MenuProps<T> & { name: string, triggerRef: RefObject<Element | null>, isOpen: boolean, onClose: () => void, placement?: 'bottom end' | 'bottom start' | 'top start' }) {
  return (
    <Popover triggerRef={triggerRef} isOpen={isOpen} onOpenChange={open => { if (!open) onClose() }} placement={placement} offset={6} className={POPOVER}>
      <AriaMenu {...props} aria-label={name} autoFocus={props.autoFocus ?? 'first'} onClose={onClose} className="outline-none">{children}</AriaMenu>
    </Popover>
  )
}

const ITEM = 'flex min-h-10 cursor-pointer items-center gap-3 rounded-[8px] px-3 font-monospace text-sm text-text outline-none data-[focused]:bg-panel-2 data-[disabled]:opacity-50'

export function MenuItem(props: MenuItemProps) {
  return <AriaMenuItem {...props} className={ITEM} />
}

export function MenuRow({ icon, label, on, red, more, ...props }: Omit<MenuItemProps, 'children'> & { icon: string, label: string, on?: boolean, red?: boolean, more?: boolean }) {
  return (
    <AriaMenuItem {...props} textValue={label} className={`${ITEM} ${red ? 'text-hot-text' : ''}`}>
      <Icon name={icon} size={16} />
      <span className="flex-1">{label}</span>
      {more ? <Icon name="chr" size={14} /> : on ? <Icon name="check" size={14} /> : null}
    </AriaMenuItem>
  )
}

export const MenuSeparator = () => <Separator className="my-1 border-t border-edge" />

// an item that opens a list of its own beside it (Move to › the folders)
export function Submenu({ icon, label, name, children }: { icon: string, label: string, name: string, children: ReactNode }) {
  return (
    <SubmenuTrigger>
      <MenuRow id={`sub:${label}`} icon={icon} label={label} more />
      <Popover offset={-4} className={POPOVER}>
        <AriaMenu aria-label={name} className="outline-none">{children}</AriaMenu>
      </Popover>
    </SubmenuTrigger>
  )
}
