// The kit's toggle group on React Aria's ToggleButtonGroup: one pick of a few (at most four, RULES.md rule 4),
// read as a radio group, arrow keys move between them. The look is web/ui.css's .ui-toggle-group.
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components'

export function ToggleGroup<K extends string>({ label, items, value, onChange }: {
  label: string
  items: readonly { k: K, label: string }[]
  value: K
  onChange: (k: K) => void
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={keys => { const [k] = [...keys]; if (k !== undefined && k !== value) onChange(k as K) }}
      className="flex gap-1 rounded-[12px] border border-edge bg-[rgb(var(--void-rgb)/.5)] p-1"
    >
      {items.map(x => (
        <ToggleButton
          key={x.k}
          id={x.k}
          className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-[8px] px-3 font-label text-[13.5px] font-semibold uppercase leading-none tracking-[.08em] text-muted outline-none data-[hovered]:bg-panel-2 data-[hovered]:text-text data-[selected]:bg-text data-[selected]:text-bg data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-frame-hi max-[480px]:px-2 max-[480px]:text-[12.5px]"
        >
          {x.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
