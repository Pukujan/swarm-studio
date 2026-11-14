// Comment (web/canvas/marks.js): a pin on the picked section; open, its thread and a composer. Send tells the crew
// (POST /api/runs/<run>/comment, with the section as the target); its builder answers in the thread (comment:take)
// and reworks the section, keeping any hand changes. Enter sends, Shift+Enter is a new line, Esc closes.
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { doneSections, type DeckModel, type Note } from './model'

async function sendComment(m: DeckModel, text: string, target: string): Promise<string> {
  const sections = doneSections(m).map(s => ({ ...s, role: m.layers[s.key]?.role }))
  const r = await fetch(`/api/runs/${encodeURIComponent(m.run!)}/comment`, {
    method: 'POST', headers: { 'x-swarm-token': window.SWARM?.token ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({ text, target, sections })
  }).catch(() => null)
  if (r?.ok) return ''
  const j = await r?.json().catch(() => ({})) as { error?: string } | undefined
  return j?.error || 'the studio server is not answering'
}

export function CommentPin({ model, target }: { model: DeckModel, target: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const l = model.layers[target]
  const thread: Note[] = model.threads[target] ?? []
  useEffect(() => { setOpen(false); setText(''); setError('') }, [target])
  useEffect(() => { if (open) area.current?.focus() }, [open])
  if (!l || l.status !== 'done') return null

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    const e = await sendComment(model, t, target)
    setBusy(false)
    setError(e)
    if (!e) setText('')
  }
  if (!open) {
    return (
      <Button role="secondary" aria-label={`Comment on ${l.role}${thread.length ? `, ${thread.length} in the thread` : ''}`} onPress={() => setOpen(true)} className="pointer-events-auto min-w-9 px-2">
        <Icon name="msg" size={16} />{thread.length > 0 && <span className="font-monospace text-xs">{thread.length}</span>}
      </Button>
    )
  }
  return (
    <div role="dialog" aria-label={`Comment on ${l.role}`} className="pointer-events-auto flex w-80 flex-col gap-2 rounded-[12px] border border-edge bg-deep p-3 shadow-[0_14px_40px_rgb(var(--shade-rgb)/.6)]"
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) } }}>
      {thread.length > 0 && (
        <ol aria-label="Thread" className="flex max-h-48 flex-col gap-1.5 overflow-y-auto font-monospace text-[13px]">
          {thread.map((n, i) => <li key={i}><b className={n.you ? 'text-text' : 'text-muted'}>{n.who}</b> {n.text}</li>)}
        </ol>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-label text-xs font-semibold uppercase tracking-[.07em] text-muted">Tell the crew what to change</span>
        <textarea ref={area} rows={2} value={text} onChange={e => setText(e.target.value)} maxLength={4000}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
          className="resize-none rounded-[10px] border border-line-2 bg-void px-3 py-2 font-monospace text-sm text-text outline-none focus:border-frame-hi" />
      </label>
      {error && <p role="alert" className="font-monospace text-xs text-hot-text">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <small className="font-monospace text-xs text-muted">Enter to send · Esc to close</small>
        <div className="flex gap-1">
          <Button role="ghost" onPress={() => setOpen(false)}>Close</Button>
          <Button role="primary" isDisabled={!text.trim() || busy} onPress={send}>{busy ? 'Sending…' : 'Send'}</Button>
        </div>
      </div>
    </div>
  )
}
