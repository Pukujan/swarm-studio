// What you have, the Studio's first step (decision 0015): not a form. The person drops a PDF, a file or pictures,
// or gives their website, and the crew reads it and fills in what it finds (engine/importer.mjs): the idea, who it
// is for, the pages. It sits first on the step, above what was brought (choices first). The card is an `ab`, so
// the board pans around it and never under the person's typing.
import { useState } from 'react'
import { Button } from '../../primitives/Button'
import { TextField } from '../../primitives/TextField'
import { Busy } from '../../primitives/Busy'
import type { StoreItem } from '../../legacy'
import './importer.css'

export function Importer({ onChoose, onLink }: { onChoose: () => void, onLink: (url: string) => Promise<unknown> }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const read = () => {
    const u = url.trim()
    if (!u || busy) return
    const full = /^https?:\/\//i.test(u) ? u : `https://${u}`
    setBusy(true); setError(null)
    onLink(full).then(() => setUrl('')).catch(err => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false))
  }
  return (
    <div className="ab sc-import" role="group" aria-label="Bring what you have">
      <b>Bring what you have</b>
      <span className="text-muted">Drop a PDF, a file or pictures here, or give your website. The crew reads it and fills in what it finds.</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button onPress={onChoose}>Choose a file</Button>
        <span className="text-dim" aria-hidden>or</span>
      </div>
      <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); read() }}>
        <div className="min-w-0 flex-1"><TextField label="Your website" placeholder="yoursite.com" inputMode="url" value={url} onChange={setUrl} isInvalid={!!error} errorMessage={error || undefined} /></div>
        <Button type="submit" role="primary" isDisabled={!url.trim() || busy}>{busy ? 'Opening…' : 'Read it'}</Button>
      </form>
    </div>
  )
}

// under a thing that was brought: what the crew is doing with it, or what it found
export function FoundLine({ r }: { r: StoreItem }) {
  const f = r.found
  if (!f) return null
  if (f.state === 'reading') return <span className="sc-found"><Busy label="Reading" />Reading…</span>
  if (f.state === 'failed') return <span className="sc-found">Could not read it{f.note ? `: ${f.note}` : ''}</span>
  const said = [f.what, f.who && `for ${f.who}`, f.pages?.length && `${f.pages.length} pages`].filter(Boolean).join(' · ')
  return <span className="sc-found">Found: {said || 'nothing to fill in'}</span>
}
