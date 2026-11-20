// Shape it's music loop (web/workshop.js playSound): a small synth from the option's tempo, scale, lead and drums.
// It plays only on the person's press, and stops when another plays, the step changes or the walk closes.
import { melodyOf } from './model'

export interface Loop { id: string, stop: () => void }

export function playLoop(o: { id: string, bpm?: number, scale?: string, wave?: string, drums?: string }): Loop {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  const out = ctx.createGain(); out.gain.value = 0.18; out.connect(ctx.destination)
  const beat = 60 / (Number(o.bpm) || 110), root = 220
  const { melody, bass } = melodyOf(o.id, String(o.scale || ''))
  const note = (t: number, semi: number, len: number, type: OscillatorType, vol: number) => {
    const osc = ctx.createOscillator(), g = ctx.createGain()
    osc.type = type; osc.frequency.value = root * 2 ** (semi / 12)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len)
    osc.connect(g).connect(out); osc.start(t); osc.stop(t + len + 0.02)
  }
  const noise = (t: number, len: number, vol: number, hp: number) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    src.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol
    src.connect(f).connect(g).connect(out); src.start(t)
  }
  const kick = (t: number) => {
    const osc = ctx.createOscillator(), g = ctx.createGain()
    osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.15)
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    osc.connect(g).connect(out); osc.start(t); osc.stop(t + 0.22)
  }
  const wave = (['sine', 'square', 'sawtooth', 'triangle'] as const).find(w => w === o.wave) || 'triangle'
  let bar = 0
  const schedule = () => {
    const t0 = ctx.currentTime + 0.05
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * beat / 2, m = melody[i]
      if (m != null) note(t, m + 12, beat * 0.45, wave, 0.35)
      if (i % 4 === 0) note(t, bass[(i / 4 + bar) % 4] - 12, beat * 1.8, 'sine', 0.5)
      if (o.drums !== 'none') {
        if (i % 4 === 0 || (o.drums === 'breakbeat' && i % 8 === 6)) kick(t)
        if (o.drums !== 'soft' && i % 4 === 2) noise(t, 0.12, 0.35, 1500)
        if (o.drums === 'driving' || o.drums === 'breakbeat' || i % 2 === 0) noise(t, 0.03, 0.12, 7000)
      }
    }
    bar++
  }
  schedule()
  const timer = window.setInterval(schedule, beat * 8 * 1000)
  return { id: o.id, stop: () => { clearInterval(timer); void ctx.close().catch(() => {}) } }
}
