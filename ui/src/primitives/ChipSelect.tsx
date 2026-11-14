// The kit's chip picker on React Aria's Select: one value from a short list, a chip with no visible label that opens
// its list above it (Select.tsx is the labelled field). Arrow keys and type-ahead move, Enter picks, Esc and a click
// outside close it (RULES.md rule 18). `name` is what a screen reader calls it (the chat's agents and model pickers).
import type { Key } from 'react-aria-components'
import { Button, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue } from 'react-aria-components'

export interface ChipOption { id: string, label: string }

export function ChipSelect({ name, options, value, onChange, className }: { name: string, options: ChipOption[], value: string, onChange: (id: string) => void, className?: string }) {
  return (
    <AriaSelect aria-label={name} selectedKey={value} onSelectionChange={(k: Key | null) => k != null && onChange(String(k))} className={`min-w-0 ${className ?? ''}`}>
      <Button className="inline-flex min-h-10 max-w-full min-w-10 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 bg-transparent px-3 font-monospace text-xs text-muted outline-none data-[hovered]:text-text data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-frame-hi">
        <SelectValue className="truncate" />
        <span aria-hidden className="text-[10px]">▾</span>
      </Button>
      <Popover placement="top start" offset={6} className="max-h-72 min-w-44 overflow-auto rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <ListBox className="outline-none" items={options}>
          {o => <ListBoxItem id={o.id} textValue={o.label} className="flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 font-monospace text-sm text-text outline-none data-[focused]:bg-panel-2 data-[selected]:text-accent">{o.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
