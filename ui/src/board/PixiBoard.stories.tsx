// The PixiJS layer at the board gauge's size (spec 43 §7): 250 pages and a few video posters, their pictures drawn
// here, under the tier manager. Pan and zoom it; a page off the prepared area holds no texture.
import { useEffect, useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { createCamera } from './camera'
import { PixiBoard, type Paint } from './PixiBoard'
import { useTiers } from './useTiers'
import { PROFILES, type Item } from './tiers'

const W = 1280, H = 800, GAP = 160, COLS = 25

function picture(i: number, video: boolean) {
  const c = document.createElement('canvas')
  c.width = 320; c.height = 200
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = `hsl(${(i * 37) % 360} 12% ${18 + (i % 5) * 4}%)`; g.fillRect(0, 0, 320, 200)
  g.fillStyle = '#eeeeee'; g.font = '600 20px sans-serif'; g.fillText(video ? `Film ${i}` : `Page ${i}`, 16, 36)
  if (video) { g.beginPath(); g.moveTo(140, 80); g.lineTo(190, 105); g.lineTo(140, 130); g.fill() }
  return c.toDataURL('image/png')
}

function Gauge({ pages, videos, low }: { pages: number, videos: number, low: boolean }) {
  const camera = useMemo(() => createCamera({ x: 20, y: 20, k: 0.08 }), [])
  useEffect(() => () => camera.destroy(), [camera])
  const all = pages + videos
  const items: Item[] = useMemo(() => Array.from({ length: all }, (_, i) => ({ id: `i${i}`, rect: { x: (i % COLS) * (W + GAP), y: Math.floor(i / COLS) * (H + GAP), w: W, h: H }, photoW: W })), [all])
  const pics = useMemo(() => items.map((_, i) => picture(i, i >= pages)), [items, pages])
  const [size, setSize] = useState({ w: 1200, h: 800 })
  useEffect(() => { setSize({ w: innerWidth, h: innerHeight }) }, [])
  const plan = useTiers({ camera, items, stage: size, wants: useMemo(() => ({}), []), budgets: low ? PROFILES.low : PROFILES.normal })
  const paints: Paint[] = items.map((it, i) => {
    const d = plan.get(it.id)
    const shown = d && d.tier !== 'hidden'
    return i >= pages
      ? { id: it.id, rect: it.rect, video: { src: '', poster: shown ? pics[i] : undefined, live: false } }
      : { id: it.id, rect: it.rect, src: shown ? pics[i] : undefined }
  })
  const held = [...plan.values()].filter(d => d.tier !== 'hidden').length
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void">
      <PixiBoard camera={camera} items={paints} />
      <p className="pointer-events-none absolute top-3 left-3 rounded-[8px] bg-deep px-3 py-1.5 font-monospace text-xs text-muted">{held} of {all} holding a picture</p>
    </div>
  )
}

const meta = { component: Gauge, args: { pages: 250, videos: 4, low: false }, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Gauge>
export default meta
type Story = StoryObj<typeof meta>

export const GaugeBoard: Story = {}
export const LowMemory: Story = { args: { low: true } }
