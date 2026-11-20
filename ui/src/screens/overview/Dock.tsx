// The dock (SITEMAP §8 › Dock): Move, Frame all, New page and Upload files. On a phone it also opens the Files
// panel. It has no box of its own: the chat is the one place to type (owner, 2026-11-15; overview/OverviewChat.tsx),
// and it is always on screen (decision 0015), so the dock has no Chat tool either. Scribble, Eraser and Follow wait
// for the Design deck's runtime.
import { IconButton } from '../../primitives/Button'

export function Dock({ files, onFiles, onFrame, onNewPage, onUpload }: {
  files: boolean, onFiles: () => void, onFrame: () => void, onNewPage: () => void, onUpload: () => void
}) {
  return (
    <div className="ov-dock">
      <IconButton icon="folder" label="Files" className="ov-files-btn" on={files} aria-expanded={files} onPress={onFiles} />
      <IconButton icon="move" label="Move" on />
      <IconButton icon="frame" label="Frame all" onPress={onFrame} />
      <IconButton icon="type" label="New page" onPress={onNewPage} />
      <IconButton icon="image" label="Upload files" onPress={onUpload} />
    </div>
  )
}
