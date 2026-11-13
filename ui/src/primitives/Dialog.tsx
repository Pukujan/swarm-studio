// The kit's Dialog on React Aria's: it closes three ways, ×, Esc and a click outside (RULES.md rule 18), keeps
// focus inside while open and gives it back after.
import type { ReactNode } from 'react'
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay, type ModalOverlayProps } from 'react-aria-components'
import { Button } from './Button'

export function Dialog({ title, children, ...props }: Omit<ModalOverlayProps, 'children'> & { title: string, children: ReactNode }) {
  return (
    <ModalOverlay {...props} isDismissable className="fixed inset-0 z-50 grid place-items-center bg-[rgb(var(--shade-rgb)/.5)] p-4">
      <Modal className="w-full max-w-md rounded-[14px] border border-edge bg-deep text-text shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)]">
        <AriaDialog className="relative p-6 outline-none">
          {({ close }) => (
            <>
              <Heading slot="title" className="pr-10 font-label text-lg font-semibold uppercase tracking-[.07em]">{title}</Heading>
              <Button role="ghost" aria-label="Close" onPress={close} className="absolute top-3 right-3">×</Button>
              <div className="mt-4 font-monospace text-sm">{children}</div>
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}
