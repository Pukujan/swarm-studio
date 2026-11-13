// The dock (SITEMAP §8 › Dock): Move, Frame all, New page, Upload files, Chat, and "Tell the crew…". On a phone it
// also opens the Files panel. About a selected picture, the words repaint it (its Replace); anything else goes to
// the crew through the current Studio for now, where the shared chat lives, until the talk's React port
// (feat/port-talk) hosts it here. Scribble, Eraser and Follow wait for the Design deck's runtime.
import { forwardRef } from 'react'
import { IconButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'

export const Dock = forwardRef<HTMLInputElement, {
  text: string, onText: (t: string) => void, onSubmit: () => void,
  files: boolean, onFiles: () => void, onFrame: () => void, onNewPage: () => void, onUpload: () => void, onChat: () => void
}>(function Dock({ text, onText, onSubmit, files, onFiles, onFrame, onNewPage, onUpload, onChat }, ref) {
  return (
    <div className="ov-dock">
      <IconButton icon="folder" label="Files" className="ov-files-btn" on={files} aria-expanded={files} onPress={onFiles} />
      <IconButton icon="move" label="Move" on />
      <IconButton icon="frame" label="Frame all" onPress={onFrame} />
      <IconButton icon="type" label="New page" onPress={onNewPage} />
      <IconButton icon="image" label="Upload files" onPress={onUpload} />
      <IconButton icon="msg" label="Chat" onPress={onChat} />
      <form className="ov-ask" autoComplete="off" onSubmit={e => { e.preventDefault(); onSubmit() }}>
        <input ref={ref} value={text} onChange={e => onText(e.target.value)} placeholder="Tell the crew…" aria-label="Tell the crew" maxLength={4000}
          className="min-w-0 flex-1 bg-transparent font-monospace text-sm text-text outline-none placeholder:text-dim" />
        <button type="submit" aria-label="Send"
          className="grid size-10 flex-none cursor-pointer place-items-center rounded-[10px] bg-text text-void outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-frame-hi">
          <Icon name="up" size={16} />
        </button>
      </form>
    </div>
  )
})
