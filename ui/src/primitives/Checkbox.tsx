// The kit's checkbox on React Aria's: the box beside its label (RULES.md checklist: "checkboxes sit beside their
// labels"), the whole row at least 40 high, a visible focus ring, checked in --accent.
import { Checkbox as AriaCheckbox, type CheckboxProps } from 'react-aria-components'

export function Checkbox({ children, className, ...props }: Omit<CheckboxProps, 'children'> & { children: string, className?: string }) {
  return (
    <AriaCheckbox {...props} className={`group flex min-h-10 cursor-pointer items-center gap-2.5 font-body text-[13px] text-text data-[disabled]:cursor-default data-[disabled]:opacity-50 ${className ?? ''}`}>
      <span aria-hidden className="grid size-4 place-items-center rounded-[4px] border border-line-2 bg-void group-data-[selected]:border-accent group-data-[selected]:bg-accent group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-frame-hi">
        <svg viewBox="0 0 12 12" className="hidden size-3 text-accent-ink group-data-[selected]:block"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {children}
    </AriaCheckbox>
  )
}
