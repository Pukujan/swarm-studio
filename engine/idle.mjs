// The hero's idle from a video model (docs/specs/24-video-idle.md): one painted frame on a flat
// key colour, animated by the video model Hermes has signed in (Veo through FAL or OpenRouter,
// xAI's Grok Imagine…), then keyed and packed into a looping sheet by scripts/idle_sheet.py.
// The way ARES's Oracle and Baker idles were made. Optional: it costs a clip, so the owner says
// yes to the price first; without a video model, or on a no, the painted idle sheet stays.
import { randomBytes } from 'node:crypto'

// one clip: 4 s is enough for a ~2.8 s loop with the first moments skipped
export const IDLE_SECONDS = 4

// list prices per second of video (720p, no sound), checked November 2026. A login on a plan
// (a SuperGrok xAI login) may not be charged per clip; the line still says the list price.
const RATES = [
  [/fal/i, /veo-?3\.1(?!.*fast)/i, 0.40, 'Veo 3.1'],
  [/fal/i, /veo/i, 0.15, 'Veo 3.1 Fast'],
  [/openrouter/i, /veo/i, 0.10, 'Veo 3.1 Fast'],
  [/xai/i, /.*/, 0.14, 'Grok Imagine'],
  [/fal/i, /kling/i, 0.10, 'Kling'],
  [/fal/i, /seedance/i, 0.12, 'Seedance'],
]
export function idleCost(clips, seconds = IDLE_SECONDS) {
  if (!clips?.on) return null
  const p = String(clips.provider || ''), m = String(clips.model || '')
  const hit = RATES.find(([pr, mr]) => pr.test(p) && mr.test(m || 'veo'))
  const rate = hit ? hit[2] : 0.15
  const by = /veo/i.test(clips.by || '') ? (hit?.[3] || 'Veo') : hit?.[3] || clips.by || p
  const usd = Math.round(rate * seconds * 100) / 100
  return { provider: p, by, seconds, usd, line: `${by} · one ${seconds} s clip · about $${usd.toFixed(2)}` }
}
// the person said yes to this price (a stale or made-up price is refused, like Meshy's credits)
export const priceOk = (cost, usd) => !!cost && Math.abs(Number(usd) - cost.usd) < 0.005

// The key colour the clip is made on: green, as ARES's idles were (a video model keeps a flat green
// steadier than magenta), and magenta when the figure itself is green.
export const idleKey = (look = '') => (/\b(green|emerald|jade|lime|olive|mint|teal)\b/i.test(String(look)) ? { name: 'magenta', hex: '#FF00FF' } : { name: 'green', hex: '#00FF00' })

// the frame shape the model draws: xAI does square; Veo draws 16:9 (the figure sits in the middle)
export const idleAspect = provider => (/xai/i.test(String(provider)) ? '1:1' : '16:9')

// Every start image gets its own name: video kits that attach ingredients by file name
// (Flow's gen.mjs) would otherwise send an older picture of another character.
export const idleStartName = runId => `idle-start-${String(runId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-24)}-${randomBytes(4).toString('hex')}.png`

// The prompt, from the proven `sprite-idle-green` template (video-studio flow/templates.mjs),
// with the key colour and the figure's own look; no pronoun is assumed.
export function idlePrompt({ who = 'the character', look = '', key = idleKey(look) } = {}) {
  const cloth = String(look).match(/\b(cape|cloak|scarf|coat|robe|dress|skirt|ribbons?|sash|tail)\b/i)?.[1]?.toLowerCase() || 'loose clothes'
  const sway = `the hair and the ${cloth}`
  return [
    'Animate this exact image as the first frame. A 2D anime character idle, not 3D, not photorealistic, in exactly the same art style, line work and colours as the image.',
    'Locked-off static camera, one continuous shot, no cuts, no zoom, no pan.',
    `${who} stands in place breathing gently with a slight sway of weight, ${sway} move softly in a light breeze, and halfway through a soft blink, then settles back.`,
    `${who} keeps the same pose, face, hairstyle and outfit; anything held stays in the same hand.`,
    `The feet stay planted; nothing appears, disappears or changes shape. The background stays flat pure ${key.name} (${key.hex}), no shadows, no light changes, no particles. Small motions only. No text.`
  ].join(' ').replace(/\s+/g, ' ').slice(0, 1400)
}

// The idle sheets a hero gets when the video idle is on: the painted idle (its first frame is the
// one the model animates, and it stays as the fallback) and the video one that replaces it.
// `side` games get a side-view idle, the rest face the viewer.
export const IDLE_FRONT = 'facing the viewer, standing: breathing in, breathing out, a small shift of weight, a glance, breathing in, breathing out'
export function idleItems({ who, look, side, sheetItem, MOVES, have = [] }) {
  const painted = sheetItem({ who, look, move: { name: 'idle', ...MOVES.idle, ...(side ? {} : { frames: IDLE_FRONT }) } })
  const out = have.some(i => i.id === painted.id) ? [] : [painted]
  // it waits for the painted idle (ref) but goes on from the sprite if that one failed
  out.push({ id: 'sheet-hero-idle-video', kind: 'sheet', video: true, after: 'sprite-hero', ref: painted.id, replaces: painted.id, aspect: 'square', sheet: 'idle', loop: true, what: `idle loop of ${who} (video)`, look: String(look || who).slice(0, 320), who })
  return out
}

// What the reviewer is asked about the frames (all of them in order on dark): the four checks
// the owner does by eye on a video idle.
export function idleMessages(what, image) {
  return [
    {
      role: 'system',
      content: `You check one looping idle animation before it goes into a game: ${String(what).slice(0, 80)}. A video model animated one painted frame; its frames were keyed out and are shown in order, left to right, top to bottom, on dark.

Send it back only for a clear, visible problem:
- an extra object, figure, speck or glow that is not in the first frame
- the face, hair or outfit changes from the first frame (a different face, eyes or expression that stays)
- flicker: a frame much brighter, darker, blurrier or a different size than its neighbours
- leftover background: green or magenta patches, specks or a coloured rim around the figure
- the figure looks 3D or photographic instead of 2D drawn art

Return JSON only: {"ok":true} or {"ok":false,"problems":["what is wrong, under 10 words"]}. At most 3 problems. If in doubt, it is ok.`
    },
    { role: 'user', content: [{ type: 'text', text: 'Check these idle frames.' }, { type: 'image_url', image_url: { url: image } }] }
  ]
}

// what the chat says at each step (event game:idle)
export const IDLE_SAY = {
  ask: who => `I can animate ${who}'s idle with a video clip, the way ARES's heroines move.`,
  making: by => `${by} is animating the idle`,
  clip: () => 'The clip is in: cutting it into a loop',
  sheet: n => `${n} frames, keyed and looping: checking them`,
  done: n => `The idle is in the game: ${n} frames from the clip`,
  no: () => 'Kept the painted idle',
  failed: why => `Kept the painted idle: ${why}`
}
