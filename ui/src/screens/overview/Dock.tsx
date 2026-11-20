// The dock (SITEMAP §8 › Dock): Move, Scribble, Eraser, Frame all, New page and Upload files. On a phone it also
// opens the Files panel. It has no box of its own: the chat is the one place to type (owner, 2026-11-15;
// overview/OverviewChat.tsx), and it is always on screen (decision 0015), so the dock has no Chat tool either.
// Scribble and Eraser are toggles (pressed again, Move is back; S, E and V on the keyboard). Follow waits for the
// Design deck's runtime.
import { IconButton } from '../../primitives/Button'
import type { Tool } from './useScribble'

export function Dock({ files, tool, onTool, onFiles, onFrame, onNewPage, onUpload }: {
  files: boolean, tool: Tool, onTool: (t: Tool) => void, onFiles: () => void, onFrame: () => void, onNewPage: () => void, onUpload: () => void
}) {
  return (
    <div className="ov-dock">
      <IconButton icon="folder" label="Files" className="ov-files-btn" on={files} aria-expanded={files} onPress={onFiles} />
      <IconButton icon="move" label="Move" on={tool === 'move'} onPress={() => onTool('move')} />
      <IconButton icon="pencil" label="Scribble" on={tool === 'scribble'} aria-pressed={tool === 'scribble'} onPress={() => onTool('scribble')} />
      <IconButton icon="eraser" label="Eraser" on={tool === 'eraser'} aria-pressed={tool === 'eraser'} onPress={() => onTool('eraser')} />
      <IconButton icon="frame" label="Frame all" onPress={onFrame} />
      <IconButton icon="type" label="New page" onPress={onNewPage} />
      <IconButton icon="image" label="Upload files" onPress={onUpload} />
    </div>
  )
}
