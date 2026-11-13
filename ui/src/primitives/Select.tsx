// The kit's pickers on React Aria's Select: one value from a short list, in a popover that arrows, type-ahead, Esc
// and a click outside work in (RULES.md rule 18).
//   Select       a form field: a visible label tied to the button (the Studio scaffold's inspector)
//   ChipSelect   a chip with no visible label; `name` is what a screen reader calls it (the left chat's agents and
//                model pickers)
import { Button as AriaButton, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue, type Key, type SelectProps } from 'react-aria-components'

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

export interface SelectOption { id: string, label: string }

export function ChipSelect({ name, options, value, onChange, className }: { name: string, options: SelectOption[], value: string, onChange: (id: string) => void, className?: string }) {
  return (
    <AriaSelect aria-label={name} selectedKey={value} onSelectionChange={(k: Key | null) => k != null && onChange(String(k))} className={`min-w-0 ${className ?? ''}`}>
      <AriaButton className="inline-flex min-h-10 max-w-full min-w-10 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 bg-transparent px-3 font-monospace text-xs text-muted outline-none data-[hovered]:text-text data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-frame-hi">
        <SelectValue className="truncate" />
        <span aria-hidden className="text-[10px]">▾</span>
      </AriaButton>
      <Popover placement="top start" offset={6} className="max-h-72 min-w-44 overflow-auto rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <ListBox className="outline-none" items={options}>
          {o => <ListBoxItem id={o.id} textValue={o.label} className="flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 font-monospace text-sm text-text outline-none data-[focused]:bg-panel-2 data-[selected]:text-accent">{o.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
