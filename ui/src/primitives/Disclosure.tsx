// The kit's grouped-list row (iOS Settings, docs/ux/PATTERNS.md): a name, its state on the right and a chevron;
// a tap opens what is under it. On React Aria's Disclosure, so it is a button with aria-expanded and its panel is
// tied to it. Open or shut is the caller's (`isExpanded`): a screen's machine decides which row is open.
import type { ReactNode } from 'react'
import { Button, Disclosure as AriaDisclosure, DisclosurePanel, Heading } from 'react-aria-components'

export function Disclosure({ name, state, isExpanded, onToggle, size = 'row', children }: {
  name: ReactNode
  state?: ReactNode
  isExpanded: boolean
  onToggle: () => void
  // a row of a sheet, or a smaller one inside an open row
  size?: 'row' | 'item'
  children: ReactNode
}) {
  const head = size === 'row'
    ? 'min-h-[52px] px-3.5 font-label text-sm font-semibold uppercase tracking-[.08em]'
    : 'min-h-11 px-2.5 font-monospace text-[13px]'
  return (
    <AriaDisclosure isExpanded={isExpanded} onExpandedChange={onToggle} className="group">
      <Heading className="m-0">
        <Button slot="trigger" className={`flex w-full cursor-pointer items-center gap-2.5 text-left text-text outline-none data-[hovered]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-frame-hi ${head}`}>
          <span className="flex-none">{name}</span>
          <span className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">{state}</span>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4 flex-none fill-none stroke-current stroke-2 text-muted transition-transform duration-150 group-data-[expanded]:rotate-180 motion-reduce:transition-none"><path d="m6 9 6 6 6-6" /></svg>
        </Button>
      </Heading>
      <DisclosurePanel className={size === 'row' ? 'flex flex-col gap-2.5 px-3.5 pt-0.5 pb-3.5' : 'flex flex-col gap-2.5 px-2.5 pb-3'}>{children}</DisclosurePanel>
    </AriaDisclosure>
  )
}
