// The kit's pick-one field on React Aria's Select: a visible label tied to the button, the list in a popover that
// arrows, type-ahead, Esc and a click outside work in (RULES.md rule 18). For a handful of fixed choices.
import { Button as AriaButton, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue, type SelectProps } from 'react-aria-components'

export function Select({ label, options, ...props }: Omit<SelectProps<object>, 'children'> & { label: string, options: { id: string, name: string }[] }) {
  return (
    <AriaSelect {...props} className="flex flex-col gap-1.5">
      <Label className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">{label}</Label>
      <AriaButton className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none data-[focus-visible]:border-frame-hi">
        <SelectValue />
        <span aria-hidden className="text-muted">▾</span>
      </AriaButton>
      <Popover offset={4} className="min-w-(--trigger-width) rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <ListBox items={options} className="outline-none">
          {o => <ListBoxItem id={o.id} textValue={o.name} className="flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 font-monospace text-sm text-text outline-none data-[focused]:bg-panel-2 data-[selected]:font-semibold">{o.name}</ListBoxItem>}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
