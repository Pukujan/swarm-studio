// Suggestions (decision 0015): a small underlined link beside the message box that opens a drawer with what Hermia's
// latest turn offers (Build, a question's options, Lock, where to start). There is no row of reply buttons in the
// chat. The drawer opens only when pressed, and ×, Esc and a click outside close it (RULES.md rule 18).
import { useState, type ReactNode } from 'react'
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components'
import { Button } from '../primitives/Button'

export function Suggestions({ count, children }: { count: number, children: (done: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <AriaButton className="inline-flex flex-none min-h-10 cursor-pointer items-center gap-1 rounded-[6px] border-0 bg-transparent px-1 font-monospace text-xs text-muted underline underline-offset-4 outline-none data-[hovered]:text-text data-[focus-visible]:outline-2 data-[focus-visible]:outline-frame-hi">
        Suggestions{count > 0 && <span className="no-underline">({count})</span>}
      </AriaButton>
      <Popover placement="top start" offset={8} className="w-[min(420px,calc(100vw-32px))] rounded-[14px] border border-edge bg-surface-2 p-3 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <Dialog aria-label="Suggestions" className="relative flex max-h-[60vh] flex-col gap-2 overflow-y-auto outline-none">
          <div className="flex items-center justify-between gap-2">
            <Heading slot="title" className="m-0 font-label text-xs font-semibold uppercase tracking-[.1em] text-muted">Suggestions</Heading>
            <Button role="ghost" aria-label="Close" className="min-h-8 min-w-8 px-0" onPress={() => setOpen(false)}>×</Button>
          </div>
          {children(() => setOpen(false))}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
