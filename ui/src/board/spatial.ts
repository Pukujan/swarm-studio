// Every item on a board, by its rectangle (architecture §3.2): RBush, so a settled frame asks only for what is near
// the screen, and an agent's new page or picture goes in without rebuilding anything.
import RBush from 'rbush'

export interface Rect { x: number, y: number, w: number, h: number }
interface Entry { minX: number, minY: number, maxX: number, maxY: number, id: string }

export class Spatial {
  private tree = new RBush<Entry>()
  private byId = new Map<string, Entry>()

  upsert(id: string, r: Rect) {
    const had = this.byId.get(id)
    if (had && had.minX === r.x && had.minY === r.y && had.maxX === r.x + r.w && had.maxY === r.y + r.h) return
    if (had) this.tree.remove(had)
    const e = { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h, id }
    this.byId.set(id, e)
    this.tree.insert(e)
  }
  remove(id: string) {
    const had = this.byId.get(id)
    if (!had) return
    this.tree.remove(had)
    this.byId.delete(id)
  }
  // the ids whose rectangles meet the view grown by `margin` screens on every side
  query(view: Rect, margin = 1): string[] {
    const mx = view.w * margin, my = view.h * margin
    return this.tree.search({ minX: view.x - mx, minY: view.y - my, maxX: view.x + view.w + mx, maxY: view.y + view.h + my }).map(e => e.id)
  }
  rect(id: string): Rect | null {
    const e = this.byId.get(id)
    return e ? { x: e.minX, y: e.minY, w: e.maxX - e.minX, h: e.maxY - e.minY } : null
  }
  ids() { return [...this.byId.keys()] }
  get size() { return this.byId.size }
}
