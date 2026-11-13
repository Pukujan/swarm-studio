// The kit's Button (docs/ux/RULES.md rule 13, 15–17) on React Aria's: one style per role, at least 40 × 40,
// a visible focus ring, text on the accent fill in --accent-ink. The look is web/ui.css's .ui-btn.
// IconButton is the toolbar's square icon button (web/home.css .ib); PlainButton has no look of its own, for a
// control that is a whole object (a project's card), and keeps only the focus ring.
import { forwardRef, type ReactNode } from 'react'
import { Button as AriaButton, Link as AriaLink, type ButtonProps as AriaButtonProps, type LinkProps } from 'react-aria-components'
import { Icon } from './Icon'

export type Role = 'primary' | 'secondary' | 'ghost'

const ROLE: Record<Role, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-surface-2 text-text',
  ghost: 'bg-transparent text-text data-[hovered]:bg-panel-2'
}

const FOCUS = 'outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-frame-hi'

export const buttonClass = (role: Role = 'secondary') =>
  `inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-transparent px-4 font-label text-sm font-semibold uppercase leading-none tracking-[.07em] ${FOCUS} transition-[filter,background-color] duration-150 data-[hovered]:brightness-110 data-[pressed]:brightness-95 data-[disabled]:cursor-default data-[disabled]:opacity-50 ${ROLE[role]}`

type Props = AriaButtonProps & { role?: Role, className?: string }
export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ role, className, ...props }, ref) {
  return <AriaButton {...props} ref={ref} className={`${buttonClass(role)} ${className ?? ''}`} />
})

type IconProps = Omit<AriaButtonProps, 'children'> & { icon: string, label: string, on?: boolean, size?: number, className?: string, children?: ReactNode }
export const IconButton = forwardRef<HTMLButtonElement, IconProps>(function IconButton({ icon, label, on, size, className, children, ...props }, ref) {
  return (
    <AriaButton {...props} ref={ref} aria-label={label} data-on={on || undefined}
      className={`inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1 rounded-[10px] text-muted ${FOCUS} data-[hovered]:bg-surface-2 data-[hovered]:text-text data-[on]:bg-surface-2 data-[on]:text-text ${className ?? ''}`}>
      <Icon name={icon} size={size} />{children}
    </AriaButton>
  )
})

export const PlainButton = forwardRef<HTMLButtonElement, AriaButtonProps & { className?: string }>(function PlainButton({ className, ...props }, ref) {
  return <AriaButton {...props} ref={ref} className={`cursor-pointer text-left ${FOCUS} ${className ?? ''}`} />
})

// A place to go, drawn as a button (a link, so it opens in a new tab and reads as one)
export function LinkButton({ role, className, ...props }: LinkProps & { role?: Role, className?: string }) {
  return <AriaLink {...props} className={`${buttonClass(role)} no-underline ${className ?? ''}`} />
}
