// The kit's Button (docs/ux/RULES.md rule 13, 15–17) on React Aria's: one style per role, at least 40 × 40,
// a visible focus ring, text on the accent fill in --accent-ink. The look is web/ui.css's .ui-btn.
import { Button as AriaButton, Link as AriaLink, type ButtonProps as AriaButtonProps, type LinkProps } from 'react-aria-components'

export type Role = 'primary' | 'secondary' | 'ghost'

const ROLE: Record<Role, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-surface-2 text-text',
  ghost: 'bg-transparent text-text data-[hovered]:bg-panel-2'
}

export const buttonClass = (role: Role = 'secondary') =>
  `inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-transparent px-4 font-label text-sm font-semibold uppercase leading-none tracking-[.07em] outline-none transition-[filter,background-color] duration-150 data-[hovered]:brightness-110 data-[pressed]:brightness-95 data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-frame-hi data-[disabled]:cursor-default data-[disabled]:opacity-50 ${ROLE[role]}`

export function Button({ role, className, ...props }: AriaButtonProps & { role?: Role, className?: string }) {
  return <AriaButton {...props} className={`${buttonClass(role)} ${className ?? ''}`} />
}

// A place to go, drawn as a button (a link, so it opens in a new tab and reads as one)
export function LinkButton({ role, className, ...props }: LinkProps & { role?: Role, className?: string }) {
  return <AriaLink {...props} className={`${buttonClass(role)} no-underline ${className ?? ''}`} />
}
