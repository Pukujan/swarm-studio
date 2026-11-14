// A panel under its anchor (the Make box's Examples and its questions): it closes with ×, Esc and a click outside
// (RULES.md rule 18) and is not modal, so the box above it stays usable and keeps its words.
import type { ReactNode, RefObject } from 'react'
import { Dialog, Popover as AriaPopover } from 'react-aria-components'
import { IconButton } from './Button'

export function Panel({ name, triggerRef, isOpen, onClose, children }: { name: string, triggerRef: RefObject<Element | null>, isOpen: boolean, onClose: () => void, children: ReactNode }) {
  return (
    <AriaPopover triggerRef={triggerRef} isOpen={isOpen} onOpenChange={open => { if (!open) onClose() }} isNonModal placement="bottom" offset={8}
      className="w-[min(760px,calc(100vw-32px))] rounded-[16px] border border-line bg-deep p-5 text-text shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
      <Dialog aria-label={name} className="relative outline-none">
        <div onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
          <IconButton icon="x" label="Close" size={16} onPress={onClose} className="absolute -top-2 -right-2" />
          {children}
        </div>
      </Dialog>
    </AriaPopover>
  )
}
