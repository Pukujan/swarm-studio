// The Studio's line icons (web/icons.js, Lucide-style, ISC), the same paths both apps draw. Decorative: the control
// that holds one gives the name (aria-label), so the icon itself is hidden from screen readers.
import { P } from '@studio/icons'

export function Icon({ name, size = 18, className }: { name: string, size?: number, className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      className={`flex-none fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8] ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: P[name] ?? '' }} />
  )
}
