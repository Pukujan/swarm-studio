// The board on one GPU canvas (spec 43 §2.4, rollout step 6): PixiJS 8 under @pixi/react 8, the camera from
// pixi-viewport 7 (drag to pan, the wheel scrolls, a trackpad pinch or ctrl/⌘ + wheel zooms). Under the tier manager
// (tiers.ts) every photo is a sprite, culled when off screen, and a photo the plan drops (hidden, or a new size) has
// its texture unloaded at once, so the byte budget holds without waiting for PixiJS's own collector.
//
// A video (§2.6) is its poster frame at rest. Live, it plays as a texture from a <video> that the page's video
// rules hold (web/video.js, @studio/video: preload="metadata", at most 2 playing, torn down with pause(),
// removeAttribute('src'), load()); when it stops being live it is torn down the same way and the poster comes back.
//
// The viewport writes the shared camera (camera.ts), and a move made elsewhere (Fit, Follow) is applied to the
// viewport, so the live overlay and the cursors above it follow the same camera. Nothing here re-renders React
// while the camera moves.
//
// KTX2/Basis (§2.4, "evaluated after the layer lands"): PixiJS 8 loads its Basis transcoder (a wasm file and its
// worker) at run time, and /next/ serves one inlined page with nothing beside it (server/next.mjs), so it cannot be
// tried until /next/ serves files from ui/dist/assets/. Not used.
import { useEffect, useRef } from 'react'
import { Application, useApplication } from '@pixi/react'
import { Assets, CullerPlugin, Sprite, Texture, extensions } from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { boardVideo, dropVideo, playVideo } from '@studio/video'
import type { Camera } from './camera'

extensions.add(CullerPlugin)

export interface Paint {
  id: string
  rect: { x: number, y: number, w: number, h: number }
  // the photo for this tier and size; none: nothing is painted (the item is hidden, or its live frame is shown)
  src?: string
  // a video item: its clip, and whether it is live (playing as a texture)
  video?: { src: string, poster?: string, live: boolean }
}

export function PixiBoard({ camera, items, onMove }: { camera: Camera, items: Paint[], onMove?: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  return (
    <div ref={host} aria-hidden className="absolute inset-0">
      <Application resizeTo={host} backgroundAlpha={0} antialias={false} autoDensity resolution={globalThis.devicePixelRatio || 1}>
        <Layer camera={camera} items={items} onMove={onMove} />
      </Application>
    </div>
  )
}

type Held = { sprite: Sprite, key: string, url?: string, video?: HTMLVideoElement }

// what an item paints now, as one key: a change of key is a new texture
const keyOf = (p: Paint) => (p.video?.live ? `video:${p.video.src}` : p.src ?? '')

function Layer({ camera, items, onMove }: { camera: Camera, items: Paint[], onMove?: () => void }) {
  const { app, isInitialised } = useApplication()
  const view = useRef<Viewport | null>(null)
  const held = useRef(new Map<string, Held>())
  const moveRef = useRef(onMove)
  moveRef.current = onMove

  const release = (h: Held) => {
    // a clip's texture is its own (a VideoSource); a photo's belongs to Assets, which unloads it
    const own = h.video ? h.sprite.texture : null
    h.sprite.destroy()
    own?.destroy(true)
    if (h.video) dropVideo(h.video)
    if (h.url) void Assets.unload(h.url)
  }

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
      for (const h of held.current.values()) release(h)
      held.current.clear()
      v.destroy({ children: true })
      view.current = null
    }
  }, [isInitialised, app, camera])

  // the sprites follow the plan: a new picture is loaded, a dropped one is unloaded (or its player torn down) at once
  useEffect(() => {
    const v = view.current
    if (!v) return
    const want = new Map(items.filter(p => keyOf(p) || p.video?.poster).map(p => [p.id, p]))
    for (const [id, h] of held.current) {
      const p = want.get(id)
      const k = p ? (keyOf(p) || (p.video ? `poster:${p.video.poster ?? ''}` : '')) : ''
      if (p && k === h.key) continue
      release(h)
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
      if (p.video?.live) {
        // a live clip plays as a texture from a <video> the page's video rules hold (and tear down)
        const el = boardVideo(document.createElement('video'), { src: p.video.src, poster: p.video.poster, auto: true })
        el.muted = true; el.loop = true; el.playsInline = true
        held.current.set(p.id, { sprite, key: keyOf(p), video: el })
        void playVideo(el).then(() => { if (!sprite.destroyed) { sprite.texture = Texture.from(el); sprite.setSize(p.rect.w, p.rect.h) } }).catch(() => {})
        continue
      }
      const url = p.src ?? p.video?.poster
      const key = p.src ?? `poster:${p.video?.poster ?? ''}`
      held.current.set(p.id, { sprite, key, url })
      if (url) Assets.load<Texture>(url).then(t => { if (held.current.get(p.id)?.url === url && !sprite.destroyed) { sprite.texture = t; sprite.setSize(p.rect.w, p.rect.h) } }).catch(() => {})
    }
  }, [items, isInitialised])

  return null
}
