// The board's photos on one GPU canvas (architecture §3.4): PixiJS 8 under @pixi/react 8, the camera from
// pixi-viewport 7 (drag to pan, the wheel scrolls, a trackpad pinch or ctrl/⌘ + wheel zooms). Every photo is a sprite,
// culled when off screen; a photo the tier manager drops (hidden, or a new size) has its texture unloaded at once, so
// the byte budget holds without waiting for PixiJS's own garbage collector. The viewport writes the shared camera
// (src/board/camera.ts), and a move made elsewhere (Fit, Follow) is applied to the viewport, so the live overlay and
// the cursors above follow the same camera. Nothing here re-renders React while the camera moves.
//
// KTX2/Basis (§3.4, "evaluate"): PixiJS 8 loads its Basis transcoder (a wasm file and its worker) at run time, and
// /next/ serves one inlined page with nothing beside it (server/next.mjs), so it cannot be tried here until /next/
// serves assets. Not used.
import { useEffect, useRef } from 'react'
import { Application, useApplication } from '@pixi/react'
import { Assets, CullerPlugin, Sprite, extensions, type Texture } from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import type { Camera } from './camera'

extensions.add(CullerPlugin)

export interface Photo { id: string, src?: string, rect: { x: number, y: number, w: number, h: number } }

export function PixiPhotos({ camera, photos, onMove }: { camera: Camera, photos: Photo[], onMove?: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  return (
    <div ref={host} aria-hidden className="absolute inset-0">
      <Application resizeTo={host} backgroundAlpha={0} antialias={false} autoDensity resolution={globalThis.devicePixelRatio || 1}>
        <Photos camera={camera} photos={photos} onMove={onMove} />
      </Application>
    </div>
  )
}

function Photos({ camera, photos, onMove }: { camera: Camera, photos: Photo[], onMove?: () => void }) {
  const { app, isInitialised } = useApplication()
  const view = useRef<Viewport | null>(null)
  const held = useRef(new Map<string, { sprite: Sprite, src: string }>())
  const moveRef = useRef(onMove)
  moveRef.current = onMove

  // the viewport: its moves write the camera, the camera's other moves are applied to it
  useEffect(() => {
    if (!isInitialised) return
    const v = new Viewport({ events: app.renderer.events, screenWidth: app.screen.width, screenHeight: app.screen.height, passiveWheel: false })
    v.drag({ wheel: true }).pinch().wheel({ wheelZoom: false, trackpadPinch: true }).clampZoom({ minScale: 0.04, maxScale: 2 })
    app.stage.addChild(v)
    view.current = v
    let own = false
    const c0 = camera.get()
    v.position.set(c0.x, c0.y)
    v.scale.set(c0.k)
    v.on('moved', () => { own = true; camera.set({ x: v.x, y: v.y, k: v.scale.x }); own = false; moveRef.current?.() })
    const off = camera.subscribe(c => { if (own || (v.x === c.x && v.y === c.y && v.scale.x === c.k)) return; v.position.set(c.x, c.y); v.scale.set(c.k) })
    const resize = () => v.resize(app.screen.width, app.screen.height)
    app.renderer.on('resize', resize)
    return () => {
      off()
      app.renderer.off('resize', resize)
      for (const { src } of held.current.values()) void Assets.unload(src)
      held.current.clear()
      v.destroy({ children: true })
      view.current = null
    }
  }, [isInitialised, app, camera])

  // the sprites follow the plan: a new photo is loaded, a dropped one is unloaded straight away
  useEffect(() => {
    const v = view.current
    if (!v) return
    const want = new Map(photos.filter(p => p.src).map(p => [p.id, p]))
    for (const [id, h] of held.current) {
      const p = want.get(id)
      if (p && p.src === h.src) continue
      h.sprite.destroy()
      void Assets.unload(h.src)
      held.current.delete(id)
    }
    for (const p of want.values()) {
      const h = held.current.get(p.id)
      if (h) { h.sprite.position.set(p.rect.x, p.rect.y); h.sprite.setSize(p.rect.w, p.rect.h); continue }
      const sprite = new Sprite()
      sprite.cullable = true
      sprite.position.set(p.rect.x, p.rect.y)
      sprite.setSize(p.rect.w, p.rect.h)
      v.addChild(sprite)
      const src = p.src as string
      held.current.set(p.id, { sprite, src })
      Assets.load<Texture>(src).then(t => { if (held.current.get(p.id)?.src === src && !sprite.destroyed) { sprite.texture = t; sprite.setSize(p.rect.w, p.rect.h) } }).catch(() => {})
    }
  }, [photos, isInitialised])

  return null
}
