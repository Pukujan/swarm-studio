// The kit's text input on React Aria's TextField: a visible label tied to the input, and its error under it once
// it has one (RULES.md rule 10: a marker first). Placeholders are six words at most (rule 8).
//   multiline   a TextArea that grows with its text (field-sizing where the browser has it, its scroll height
//               where not); Enter commits (blurs), Shift+Enter is a new line
//   bare        no visible label (give aria-label): a field that is itself the card, as the brand sheet's own words
import { useLayoutEffect, useRef } from 'react'
import { FieldError, Input, Label, TextArea, TextField as AriaTextField, type TextFieldProps } from 'react-aria-components'

const FIELD = 'rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none placeholder:text-dim data-[focused]:border-frame-hi data-[invalid]:border-hot-text'
// a field that is itself the card: no box of its own, the card's dashed edge is its edge
const BARE = 'w-full bg-transparent px-2 text-[13px] text-text outline-none placeholder:text-dim'
const sizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')

function GrowingArea() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const grow = () => { const el = ref.current; if (sizing || !el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` }
  useLayoutEffect(grow)
  return (
    <TextArea ref={ref} rows={1} onInput={grow}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }}
      className={`block max-h-60 min-h-10 w-full resize-none py-2 leading-[1.4] [field-sizing:content] ${FIELD}`} />
  )
}

export function TextField({ label, placeholder, errorMessage, multiline = false, bare = false, ...props }: TextFieldProps & { label: string, placeholder?: string, errorMessage?: string, multiline?: boolean, bare?: boolean }) {
  return (
    <AriaTextField {...props} className={`flex flex-col gap-1.5 ${bare ? 'w-full' : ''}`}>
      {!bare && <Label className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">{label}</Label>}
      {multiline ? <GrowingArea /> : <Input placeholder={placeholder} className={`min-h-10 ${bare ? BARE : FIELD}`} />}
      <FieldError className="font-monospace text-xs text-hot-text">{errorMessage}</FieldError>
    </AriaTextField>
  )
}
