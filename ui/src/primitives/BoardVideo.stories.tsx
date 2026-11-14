import type { Meta, StoryObj } from '@storybook/react-vite'
import { BoardVideo } from './BoardVideo'

// a two-second clip recorded in the browser (a canvas and MediaRecorder), so the stories need no media file
async function recordClip(): Promise<string> {
  const c = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
  const g = c.getContext('2d')!
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' })
  const parts: Blob[] = []
  rec.ondataavailable = e => parts.push(e.data)
  const done = new Promise(r => (rec.onstop = r))
  rec.start(100)
  const t0 = performance.now()
  await new Promise<void>(r => {
    const f = () => {
      const t = performance.now() - t0
      g.fillStyle = '#1f1f22'; g.fillRect(0, 0, 320, 180)
      g.fillStyle = '#f4f4f5'; g.fillRect((t / 8) % 320, 60, 60, 60)
      if (t < 2000) requestAnimationFrame(f); else r()
    }
    f()
  })
  rec.stop()
  await done
  return URL.createObjectURL(new Blob(parts, { type: 'video/webm' }))
}

const meta = {
  component: BoardVideo,
  args: { src: '', label: 'The play test' },
  loaders: [async () => ({ clip: await recordClip() })],
  render: (args, { loaded }) => <BoardVideo {...args} src={args.src || loaded.clip} className="border border-edge" style={{ width: 480 }} />
} satisfies Meta<typeof BoardVideo>
export default meta
type Story = StoryObj<typeof meta>

// waits for a hover or a press; a player only while it is wanted
export const Pressed: Story = {}
// a looping clip that plays while on screen
export const Auto: Story = { args: { auto: true } }
// ten looping clips in a column: scroll, and only the two on screen play (the rest are posters)
export const Board: Story = {
  args: { auto: true },
  render: (args, { loaded }) => (
    <div className="flex flex-col" style={{ gap: 40 }}>
      {Array.from({ length: 10 }, (_, i) => <BoardVideo key={i} {...args} src={args.src || loaded.clip} label={`Clip ${i + 1}`} className="border border-edge" style={{ width: 640, height: 360 }} />)}
    </div>
  )
}
