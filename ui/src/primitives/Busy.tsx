// The kit's busy marker: a small spinner a screen reader hears as its label ("Testing", "Checking"), marked
// aria-busy so the audit's loading check (tools/dev/audit) sees it. Still for anyone who asks for less motion.
export function Busy({ label = 'Checking' }: { label?: string }) {
  return <span role="img" aria-label={label} aria-busy="true" className="inline-block size-3.5 flex-none animate-spin rounded-full border-2 border-line-2 border-t-text motion-reduce:animate-none" />
}
