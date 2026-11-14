// Dragging a layer into the chat (docs/specs/29-chats-references-marks.md, "Drag a layer into the chat"): what a
// drag source puts on the drag, the same as the current Studio's (web/layerlink.js), so a layer dragged from either
// app's Layers lands in either app's chat. The Layers ports call layerDrag in their onDragStart.

export const LAYER_TYPE = 'application/x-swarm-layer'
// told when a layer drag starts (the current Studio's chat listens; this chat never opens or moves by itself,
// decision 0015, so it does not)
const LAYER_DRAG_EVENT = 'swarm:layerdrag'

export function layerDrag(e: { dataTransfer: DataTransfer | null }, key: string, name: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(LAYER_TYPE, JSON.stringify({ key, name }))
  e.dataTransfer.setData('text/plain', name)
  e.dataTransfer.effectAllowed = 'copy'
  document.dispatchEvent(new CustomEvent(LAYER_DRAG_EVENT))
}

// what a drop carries, or null: { key, name } from a layer
export function layerOf(dt: DataTransfer | null): { key: string, name: string } | null {
  try {
    const j = JSON.parse(dt?.getData(LAYER_TYPE) || '')
    return j && typeof j.key === 'string' ? { key: j.key, name: String(j.name || j.key.split('/').pop()) } : null
  } catch { return null }
}
