// The kit's search box on React Aria's SearchField: Esc clears it, and its name is read, not shown (a list's own
// search needs no label above it).
import { Input, SearchField as AriaSearchField, type SearchFieldProps } from 'react-aria-components'

export function SearchField({ label, placeholder, ...props }: SearchFieldProps & { label: string, placeholder?: string }) {
  return (
    <AriaSearchField {...props} aria-label={label} className="flex">
      <Input placeholder={placeholder} className="min-h-10 w-full rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none placeholder:text-dim data-[focused]:border-frame-hi [&::-webkit-search-cancel-button]:hidden" />
    </AriaSearchField>
  )
}
