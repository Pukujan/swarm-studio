// One Mermaid diagram (src/shared/mermaid.ts), drawn when its text changes; while Mermaid loads, the space it will
// take is marked busy, and a diagram that cannot be drawn says so in a line instead of showing nothing.
import { useEffect, useState } from 'react'
import { renderMermaid } from './mermaid'

export function MermaidDiagram({ text, label }: { text: string, label: string }) {
  const [out, setOut] = useState<{ svg?: string, error?: string } | null>(null)
  useEffect(() => {
    let live = true
    setOut(null)
    renderMermaid(text).then(r => { if (live) setOut(r) })
    return () => { live = false }
  }, [text])
  if (!out) return <div role="img" aria-label={label} aria-busy="true" className="min-h-40 w-full" />
  if (out.error) return <p className="p-3 font-monospace text-xs text-muted">The {label.toLowerCase()} could not be drawn.</p>
  // Mermaid's own SVG, made with securityLevel strict from the plan's words
  return <div role="img" aria-label={label} className="w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: out.svg! }} />
}
