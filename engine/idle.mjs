// The hero's idle, animated (docs/specs/24-video-idle.md). Three routes, in order:
//   1. video   one painted frame on a flat key colour, animated by the video model the person
//              picked (any Hermes video provider: Veo through FAL or OpenRouter, xAI's Grok
//              Imagine, Kling or Seedance on FAL…), keyed and looped by scripts/idle_sheet.py.
//              The way ARES's Oracle and Baker idles were made. It costs a clip, so the owner
//              says yes to the price first.
//   2. keys    no video model (or its clip failed): a few close keyframes painted over the same
//              base frame, the frames between them made by the in-betweener (RIFE by default),
//              checked for ghost blends.
//   3. painted the six painted poses, as before.
import { randomBytes } from 'node:crypto'

// The video models, each with its own tuning: its name, its list price per second (720p, no
// sound, checked November 2026), the frame shape and length it draws well, and how it likes its
// prompt. Matched on "provider/model"; the first hit wins, the last one fits any model. A login
// on a plan (a SuperGrok xAI login) may not be charged per clip; the line says the list price.
export const IDLE_MODELS = [
  { test: /veo-?3\.1(?!.*(fast|lite))/i, by: 'Veo 3.1', rate: 0.40, aspect: '16:9', seconds: 4, tune: 'full' },
  { test: /^openrouter\/.*veo/i, by: 'Veo 3.1 Fast', rate: 0.10, aspect: '16:9', seconds: 4, tune: 'full' },
  { test: /veo/i, by: 'Veo 3.1 Fast', rate: 0.15, aspect: '16:9', seconds: 4, tune: 'full' },
  { test: /^xai\/|grok/i, by: 'Grok Imagine', rate: 0.14, aspect: '1:1', seconds: 4, tune: 'short' },
  { test: /kling/i, by: 'Kling', rate: 0.10, aspect: '1:1', seconds: 5, tune: 'short' },
  { test: /seedance/i, by: 'Seedance', rate: 0.12, aspect: '1:1', seconds: 5, tune: 'short' },
  { test: /hailuo|minimax/i, by: 'Hailuo', rate: 0.08, aspect: '16:9', seconds: 6, tune: 'short' },
  { test: /\bwan/i, by: 'Wan', rate: 0.10, aspect: '16:9', seconds: 5, tune: 'short' },
  { test: /.*/, by: '', rate: 0.15, aspect: '16:9', seconds: 4, tune: 'full' },
]
export const idleModel = (provider = '', model = '') => IDLE_MODELS.find(m => m.test.test(`${provider}/${model || ''}`))

// The video models the person can pick for the idle, from Hermes's video providers
// (videogen.py --list: provider, label, model, available): the saved pick first when it is
// there, then Veo (known good), then the rest in list order. pick: { provider, model } from
// models.json (a model the provider takes but does not list, such as a FAL Kling id, is offered
// too), or 'off' (no clips: the keys route).
export function idleOptions(videos = [], pick = null) {
  if (pick === 'off') return []
  const out = []
  const add = (provider, model, label) => {
    const id = `${provider}/${model || ''}`
    if (out.some(o => o.id === id)) return
    const m = idleModel(provider, model)
    const by = m.by || label || provider
    const usd = Math.round(m.rate * m.seconds * 100) / 100
    out.push({ id, provider, model: model || '', by, seconds: m.seconds, aspect: m.aspect, tune: m.tune, usd, line: `${by} · one ${m.seconds} s clip · about $${usd.toFixed(2)}` })
  }
  const on = videos.filter(v => v?.available && v.provider)
  const mine = pick?.provider && on.find(v => v.provider === pick.provider)
  if (mine) add(mine.provider, pick.model || mine.model, mine.label)
  for (const v of on.filter(v => /veo/i.test(v.model || ''))) add(v.provider, v.model, v.label)
  for (const v of on) add(v.provider, v.model, v.label)
  return out
}
// the option the person said yes to, at the price on its button (a stale or made-up price is
// refused, like Meshy's credits); no id means the first (the default)
export const optionOf = (options, id) => (id ? options.find(o => o.id === id) : options[0]) || null
export const priceOk = (option, usd) => !!option && Math.abs(Number(usd) - option.usd) < 0.005

// The key colour the clip is made on: green, as ARES's idles were (a video model keeps a flat green
// steadier than magenta), and magenta when the figure itself is green.
export const idleKey = (look = '') => (/\b(green|emerald|jade|lime|olive|mint|teal)\b/i.test(String(look)) ? { name: 'magenta', hex: '#FF00FF' } : { name: 'green', hex: '#00FF00' })

// Every start image gets its own name: video kits that attach ingredients by file name
// (Flow's gen.mjs) would otherwise send an older picture of another character.
export const idleStartName = runId => `idle-start-${String(runId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-24)}-${randomBytes(4).toString('hex')}.png`

// The prompt, from the proven `sprite-idle-green` template (video-studio flow/templates.mjs),
// with the key colour and the figure's own look; no pronoun is assumed. `tune` is the model's:
// 'full' (Veo reads a long, exact brief well) or 'short' (Grok, Kling, Seedance and the like
// follow a few plain lines better and drift on long ones).
export function idlePrompt({ who = 'the character', look = '', key = idleKey(look), tune = 'full' } = {}) {
  const cloth = String(look).match(/\b(cape|cloak|scarf|coat|jacket|robe|dress|skirt|ribbons?|sash|tail)\b/i)?.[1]?.toLowerCase() || 'loose clothes'
  const sway = `the hair and the ${cloth}`
  const lines = tune === 'short'
    ? [
        'Animate this image. 2D anime art in the same style and colours, not 3D.',
        'Static camera, no cuts, no zoom.',
        `${who} stands still, breathing gently; ${sway} sway a little; one soft blink.`,
        `Same pose, face and outfit. The feet stay planted. Flat pure ${key.name} (${key.hex}) background; nothing else appears. Small motions only.`
      ]
    : [
        'Animate this exact image as the first frame. A 2D anime character idle, not 3D, not photorealistic, in exactly the same art style, line work and colours as the image.',
        'Locked-off static camera, one continuous shot, no cuts, no zoom, no pan.',
        `${who} stands in place breathing gently with a slight sway of weight, ${sway} move softly in a light breeze, and halfway through a soft blink, then settles back.`,
        `${who} keeps the same pose, face, hairstyle and outfit; anything held stays in the same hand.`,
        `The feet stay planted; nothing appears, disappears or changes shape. The background stays flat pure ${key.name} (${key.hex}), no shadows, no light changes, no particles. Small motions only. No text.`
      ]
  return lines.join(' ').replace(/\s+/g, ' ').slice(0, 1400)
}

// The keys route's keyframes: painted as one sheet over the sprite, all the same pose with only
// tiny changes (big pose gaps are what make an in-betweener ghost). Frames 1 to 4 are the keys.
export const IDLE_KEY_FRAMES = 'four keyframes of one idle, every one the same standing pose as the reference with only tiny changes: 1 exactly the reference pose, 2 breathing in (the chest and shoulders a touch higher, nothing else moves), 3 the hair and loose clothes swayed slightly to one side, 4 the eyes closed in a blink and the rest as frame 1; 5 and 6 exactly the same as frame 1'

// The idle sheets a hero gets when the idle is animated: the painted idle (the video route
// animates its first frame, and it stays as the last fallback) and, by route, the video sheet
// or the keyframes and the in-betweened sheet, each replacing the painted one when it passes.
// `side` games get a side-view idle, the rest face the viewer.
export const IDLE_FRONT = 'facing the viewer, standing: breathing in, breathing out, a small shift of weight, a glance, breathing in, breathing out'
export function idleItems({ who, look, side, sheetItem, MOVES, have = [], route = 'video' }) {
  const painted = sheetItem({ who, look, move: { name: 'idle', ...MOVES.idle, ...(side ? {} : { frames: IDLE_FRONT }) } })
  const out = have.some(i => i.id === painted.id) ? [] : [painted]
  // it waits for the painted idle (ref) but goes on from the sprite if that one failed
  if (route === 'video') out.push({ ...idleBase({ who, look }), id: 'sheet-hero-idle-video', video: true, after: 'sprite-hero', what: `idle loop of ${who} (video)` })
  else out.push(...keyItems({ who, look, sheetItem }))
  return out
}
const idleBase = ({ who, look }) => ({ kind: 'sheet', ref: 'sheet-hero-idle', replaces: 'sheet-hero-idle', aspect: 'square', sheet: 'idle', loop: true, look: String(look || who).slice(0, 320), who })
// the keys route on its own (a clip that failed falls back to it): the keyframes sheet, never
// used by the game itself, and the in-betweened sheet made from it
export function keyItems({ who, look, sheetItem }) {
  const keys = { ...sheetItem({ who, look, move: { name: 'idle-keys', fps: 6, loop: true, frames: IDLE_KEY_FRAMES } }), keys: true, what: `idle keyframes of ${who}` }
  return [keys, { ...idleBase({ who, look }), ref: undefined, id: 'sheet-hero-idle-tween', tween: true, after: keys.id, what: `idle loop of ${who} (in-betweened)` }]
}

// What the reviewer is asked about the frames (all of them in order on dark): the checks the
// owner does by eye on an animated idle.
export function idleMessages(what, image) {
  return [
    {
      role: 'system',
      content: `You check one looping idle animation before it goes into a game: ${String(what).slice(0, 80)}. A video model (or an in-betweener between close painted keyframes) animated one painted frame; its frames were keyed out and are shown in order, left to right, top to bottom, on dark.

Send it back only for a clear, visible problem:
- an extra object, figure, speck or glow that is not in the first frame
- the face, hair or outfit changes from the first frame (a different face, eyes or expression that stays)
- flicker: a frame much brighter, darker, blurrier or a different size than its neighbours
- ghosting: a doubled, see-through or smeared limb, face or hair, as if two frames were blended
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
  tween: by => `${by} is filling in the frames between the keyframes`,
  clip: () => 'The clip is in: cutting it into a loop',
  sheet: n => `${n} frames, keyed and looping: checking them`,
  done: (n, how = 'the clip') => `The idle is in the game: ${n} frames from ${how}`,
  no: () => 'Kept the painted idle',
  failed: why => `Kept the painted idle: ${why}`
}
