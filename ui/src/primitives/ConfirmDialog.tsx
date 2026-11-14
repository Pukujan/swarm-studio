// A step that cannot be undone (Delete forever, Empty Trash): its button stays off until "delete" is typed, and
// Enter confirms once it is. Closes with Cancel, ×, Esc and a click outside, all of which mean no.
import { useState } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { TextField } from './TextField'

export function ConfirmDialog({ title, line, yes, isOpen, onDone }: { title: string, line: string, yes: string, isOpen: boolean, onDone: (ok: boolean) => void }) {
  const [typed, setTyped] = useState('')
  const ready = typed.trim().toLowerCase() === 'delete'
  const done = (ok: boolean) => { setTyped(''); onDone(ok) }
  return (
    <Dialog title={title} isOpen={isOpen} onOpenChange={open => { if (!open) done(false) }}>
      <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); if (ready) done(true) }}>
        <p className="m-0">{line} Type <b>delete</b> to confirm.</p>
        <TextField label="Type delete to confirm" placeholder="delete" value={typed} onChange={setTyped} autoFocus autoComplete="off" spellCheck="false" />
        <div className="flex justify-end gap-2">
          <Button role="ghost" onPress={() => done(false)}>Cancel</Button>
          <Button role="primary" type="submit" isDisabled={!ready} className="!bg-red !text-text">{yes}</Button>
        </div>
      </form>
    </Dialog>
  )
}
