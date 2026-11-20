// The kit's type-or-pick field on React Aria's ComboBox: a visible label tied to the input, and a list under it
// that narrows as the person types (arrows, Enter, Esc and a click outside work in it, RULES.md rule 18). What is
// typed need not be in the list: Enter, a pick or leaving the field gives `onCommit` the text, once per change.
// For a long list of names where a new one is still a fair answer (a model's id).
import { useEffect, useRef, useState } from 'react'
import { ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components'

// more than this is never shown at once: the person types to narrow it
const MOST = 400

export function ComboField({ label, value, options, placeholder, isDisabled, onCommit }: {
  label: string
  // the saved text; the field shows it until the person types
  value: string
  options: string[]
  placeholder?: string
  isDisabled?: boolean
  onCommit: (text: string) => void
}) {
  const [text, setText] = useState(value)
  const sent = useRef(value)
  const picked = useRef(false)
  useEffect(() => { setText(value); sent.current = value }, [value])

  const commit = (raw: string) => {
    const t = raw.trim()
    if (t === sent.current) return
    sent.current = t
    onCommit(t)
  }

  // a name typed in full shows the whole list again, so the next one is a scroll away
  const q = text.trim().toLowerCase()
  const hits = (q && options.includes(text.trim()) ? options : options.filter(m => m.toLowerCase().includes(q))).slice(0, MOST)

  return (
    <ComboBox allowsCustomValue allowsEmptyCollection menuTrigger="focus" isDisabled={isDisabled} className="flex min-w-0 flex-1 flex-col gap-1.5"
      items={hits.map(id => ({ id }))} inputValue={text} onInputChange={setText}
      onSelectionChange={k => { if (k == null) return; picked.current = true; setText(String(k)); commit(String(k)) }}
      onBlur={() => commit(text)}
      onKeyDown={e => {
        if (e.key !== 'Enter') return
        // Enter on a row of the list picks it (above, in this same key press); with none, the text as typed
        picked.current = false
        const typed = text
        setTimeout(() => { if (!picked.current) commit(typed) })
      }}>
      <Label className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">{label}</Label>
      <Input placeholder={placeholder} autoComplete="off" spellCheck={false}
        className="min-h-10 w-full rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none placeholder:text-dim data-[focused]:border-frame-hi data-[disabled]:opacity-50" />
      <Popover offset={4} className="max-h-80 w-(--trigger-width) overflow-y-auto rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <ListBox className="outline-none" renderEmptyState={() => <p className="m-0 px-3 py-2 font-monospace text-xs text-muted">No match: press Enter to use it as typed</p>}>
          {(o: { id: string }) => <ListBoxItem id={o.id} textValue={o.id} className="flex min-h-9 cursor-pointer items-center rounded-[8px] px-3 font-monospace text-[13px] [overflow-wrap:anywhere] text-text outline-none data-[focused]:bg-panel-2">{o.id}</ListBoxItem>}
        </ListBox>
      </Popover>
    </ComboBox>
  )
}
