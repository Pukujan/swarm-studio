// The Studio's line icons (Lucide, ISC; licence in web/brand/LICENSE-lucide.txt): the same paths the current Studio
// draws (web/icons.js, as @studio/icons), so both apps show the same marks. Always decorative: the control that
// holds one carries the name.
import { P } from '@studio/icons'

export function Icon({ name, size = 18, className }: { name: string, size?: number, className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className={`flex-none ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: P[name] ?? '' }} />
  )
}
