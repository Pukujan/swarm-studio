// The kit's text input on React Aria's TextField: a visible label tied to the input, and its error under it once
// it has one (RULES.md rule 10: a marker first). Placeholders are six words at most (rule 8).
import { FieldError, Input, Label, TextField as AriaTextField, type TextFieldProps } from 'react-aria-components'

export function TextField({ label, placeholder, errorMessage, ...props }: TextFieldProps & { label: string, placeholder?: string, errorMessage?: string }) {
  return (
    <AriaTextField {...props} className="flex flex-col gap-1.5">
      <Label className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">{label}</Label>
      <Input placeholder={placeholder} className="min-h-10 rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none placeholder:text-dim data-[focused]:border-frame-hi data-[invalid]:border-hot-text" />
      <FieldError className="font-monospace text-xs text-hot-text">{errorMessage}</FieldError>
    </AriaTextField>
  )
}
