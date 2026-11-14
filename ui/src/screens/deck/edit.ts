// A section changed by hand (Open Design's Edit, web/edit/patches.js, decision 0010): patched here, saved as a
// section version (POST /api/runs/<run>/restore, as web/canvas/hook.js layers.save does), which the server writes
// as the section's layer:done, so the deck, the saved build and Versions all have it, and the crew keeps it on a
// rework. Undo and Redo save the version before or after again.
import { useCallback, useState } from 'react'
import { swEdit, type Patch } from '@studio/edit'
import type { DeckLayer } from './model'

// who made a change, so this deck does not announce its own edits back to itself
export const CLIENT = 'next-deck'

export async function saveSection(run: string, l: DeckLayer, html: string, why: string): Promise<string> {
  const r = await fetch(`/api/runs/${encodeURIComponent(run)}/restore`, {
    method: 'POST',
    headers: { 'x-swarm-token': window.SWARM?.token ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({ page: l.page, layer: l.id, html, by: CLIENT, why })
  }).catch(() => null)
  if (r?.ok) return ''
  const j = await r?.json().catch(() => ({})) as { error?: string } | undefined
  return j?.error || 'the studio server is not answering'
}

interface Step { key: string, before: string, after: string, label: string }

// the deck's hand edits, with Undo and Redo; `edit` returns where the part is afterwards, or an error
export function useEdits(run: string | null, layers: Record<string, DeckLayer>) {
  const [undo, setUndo] = useState<Step[]>([])
  const [redo, setRedo] = useState<Step[]>([])
  const [error, setError] = useState('')

  const save = useCallback(async (key: string, html: string, why: string) => {
    const l = layers[key]
    if (!run || !l) return false
    const e = await saveSection(run, l, html, why)
    setError(e)
    return !e
  }, [run, layers])

  const edit = useCallback(async (key: string, patch: Patch, why: string): Promise<string | null> => {
    const l = layers[key]
    if (!l || l.status !== 'done') return null
    const r = swEdit.apply(l.text, patch)
    if (!r.ok) { setError(r.error || 'That change could not be made.'); return patch.id }
    if (r.html === l.text) return r.id
    if (await save(key, r.html, `hand: ${why}`)) {
      setUndo(u => [...u.slice(-49), { key, before: l.text, after: r.html, label: `${why} in ${l.role}` }])
      setRedo([])
    }
    return r.id
  }, [layers, save])

  const back = useCallback(async () => {
    const s = undo.at(-1)
    if (!s || !(await save(s.key, s.before, 'undo'))) return
    setUndo(u => u.slice(0, -1))
    setRedo(r => [...r, s])
  }, [undo, save])
  const again = useCallback(async () => {
    const s = redo.at(-1)
    if (!s || !(await save(s.key, s.after, 'redo'))) return
    setRedo(r => r.slice(0, -1))
    setUndo(u => [...u, s])
  }, [redo, save])

  return { edit, undo: back, redo: again, canUndo: undo.length > 0, canRedo: redo.length > 0, undoLabel: undo.at(-1)?.label, redoLabel: redo.at(-1)?.label, error, clearError: () => setError('') }
}
