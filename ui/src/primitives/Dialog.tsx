// The kit's Dialog on React Aria's: it closes three ways, ×, Esc and a click outside (RULES.md rule 18), keeps
// focus inside while open and gives it back after. A tall one scrolls inside the window.
//   size     md (the default), wide (a walk of steps: a new game's questions), or full (the whole window: Shape it)
//   locked   it does not close while its work must not be dropped (the planner is writing): × is off too
//   bare     no heading and no × of its own: the content draws its own top (it gets `close`), named by `title`
import type { ReactNode } from 'react'
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay, type ModalOverlayProps } from 'react-aria-components'
import { Button } from './Button'

const SIZE = { md: 'max-h-[calc(100dvh-2rem)] max-w-md', wide: 'max-h-[calc(100dvh-2rem)] max-w-[760px]', full: 'h-[calc(100dvh-2rem)] max-w-none' }

export function Dialog({ title, size = 'md', locked = false, bare = false, children, ...props }: Omit<ModalOverlayProps, 'children'> & {
  title: string, size?: keyof typeof SIZE, locked?: boolean, bare?: boolean, children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const body = (close: () => void) => (typeof children === 'function' ? children(close) : children)
  return (
    <ModalOverlay {...props} isDismissable={!locked} isKeyboardDismissDisabled={locked} className="fixed inset-0 z-50 grid place-items-center bg-[rgb(var(--shade-rgb)/.5)] p-4">
      <Modal className={`w-full overflow-y-auto rounded-[14px] border border-edge bg-deep text-text shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] ${SIZE[size]}`}>
        {bare ? <AriaDialog aria-label={title} className="relative h-full outline-none">{({ close }) => body(close)}</AriaDialog> : (
          <AriaDialog className="relative p-6 outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className="pr-10 font-label text-lg font-semibold uppercase tracking-[.07em]">{title}</Heading>
                <Button role="ghost" aria-label="Close" isDisabled={locked} onPress={close} className="absolute top-3 right-3">×</Button>
                <div className="mt-4 font-monospace text-sm">{body(close)}</div>
              </>
            )}
          </AriaDialog>
        )}
      </Modal>
    </ModalOverlay>
  )
}
