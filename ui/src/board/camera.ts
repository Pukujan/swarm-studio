// The camera, outside React (image-first boards architecture §3.1): pan and zoom live in this small store and are
// applied once per animation frame. Whatever draws the board (a transform on a DOM world, a PixiJS viewport, the
// live overlay) subscribes to every move imperatively; React components only hear that the camera settled, and the
// zoom bucket, through useSettledCamera(). While the camera moves nothing changes tier and nothing is photographed.
import { useSyncExternalStore } from 'react'

export interface Cam { x: number, y: number, k: number }
export interface Settled { at: number, bucket: number, cam: Cam }

// how long the camera rests before it counts as settled
export const SETTLE_MS = 160

// zoom in power-of-two steps: bucket 0 is 1:1, -1 is 1:2, 1 is 2:1 (the tier manager picks photo sizes from it)
export const bucketOf = (k: number) => Math.round(Math.log2(Math.max(1e-4, k)))

export interface Camera {
  get(): Cam
  // move it; the move is drawn on the next frame
  set(next: Partial<Cam>): void
  // every drawn frame (for imperative consumers: a transform, a canvas)
  subscribe(fn: (c: Cam) => void): () => void
  // once the camera has rested SETTLE_MS
  onSettled(fn: (s: Settled) => void): () => void
  settled(): Settled
  moving(): boolean
  destroy(): void
}

export function createCamera(start: Cam = { x: 0, y: 0, k: 1 }, clock: { now(): number, frame(f: () => void): number, cancel(id: number): void, after(f: () => void, ms: number): unknown, clear(t: unknown): void } = browserClock()): Camera {
  let cam = { ...start }
  let pending: Cam | null = null
  let frame = 0
  let rest: unknown = null
  let still: Settled = { at: clock.now(), bucket: bucketOf(cam.k), cam: { ...cam } }
  let isMoving = false
  const frames = new Set<(c: Cam) => void>()
  const settles = new Set<(s: Settled) => void>()

  const draw = () => {
    frame = 0
    if (!pending) return
    cam = pending
    pending = null
    for (const f of frames) f(cam)
  }
  const settle = () => {
    rest = null
    isMoving = false
    still = { at: clock.now(), bucket: bucketOf(cam.k), cam: { ...cam } }
    for (const f of settles) f(still)
  }
  return {
    get: () => pending ?? cam,
    set(next) {
      const base = pending ?? cam
      const to = { x: next.x ?? base.x, y: next.y ?? base.y, k: next.k ?? base.k }
      if (to.x === base.x && to.y === base.y && to.k === base.k) return
      pending = to
      isMoving = true
      if (!frame) frame = clock.frame(draw)
      if (rest) clock.clear(rest)
      rest = clock.after(settle, SETTLE_MS)
    },
    subscribe(fn) { frames.add(fn); fn(cam); return () => { frames.delete(fn) } },
    onSettled(fn) { settles.add(fn); return () => { settles.delete(fn) } },
    settled: () => still,
    moving: () => isMoving,
    destroy() { if (frame) clock.cancel(frame); if (rest) clock.clear(rest); frames.clear(); settles.clear() }
  }
}

function browserClock() {
  return {
    now: () => performance.now(),
    frame: (f: () => void) => requestAnimationFrame(f),
    cancel: (id: number) => cancelAnimationFrame(id),
    after: (f: () => void, ms: number) => setTimeout(f, ms),
    clear: (t: unknown) => clearTimeout(t as number)
  }
}

// React's view of the camera: only the settled one (its time, its zoom bucket), never a frame of a move
export function useSettledCamera(camera: Camera): Settled {
  return useSyncExternalStore(fn => camera.onSettled(fn), () => camera.settled(), () => camera.settled())
}
