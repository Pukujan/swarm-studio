// Films that do not need a website (docs/specs/40-video-kit.md): the film engine (engine/video.mjs,
// engine/storyboard.mjs, engine/director.mjs) cuts from `c`, what a build has to say. Here `c` is made
// from a locked brand, the project's references and assets, the Video kit's spec or a build's story,
// so the same director, storyboard, music cut, renderer and critic make a film from any of them.
//
//   brandSource({ name, brief, theme, story, pictures, clips, copy })  -> c   (the collect() shape)
//   checkKit(raw)       the Video kit's spec as locked on the board: beats, music, voice, length, shape
//   kitBoard(kit, c)    the kit's script as storyboard beats, its words kept as written
//   checkStory(raw)     a build's story (5 to 8 beats), shared with the cards and captions
//   storySource(story, c, resolve)  adds the story's pictures and footage to c
//   storyBoard(story, c)            the story as storyboard beats, cut to music later
//
// A board from here goes through checkBoard (engine/storyboard.mjs) like the writer's, so nothing it
// makes can reach the renderer unchecked.

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const words = s => clip(s, 400).split(' ').filter(Boolean).length
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Number(v))) : d)

// tall for phones, wide for desktop, square for feeds
export const FILM_SHAPES = ['tall', 'wide', 'square']
// where the person starts on the kit's board
export const KIT_STARTS = ['opening', 'storyboard', 'music']

// ---------- c from a brand: the shape engine/video.mjs collect() returns for a build
// theme: engine/brand.mjs brandTheme(brand) (name, direction, vars, fonts) or null
// story: the brand sheet's story { what, who, voice } ; pictures: [{ file, about, id? }] ; clips: [{ file, about, seconds, id? }]
// (id: the reference's or asset's id, so a kit's frame can name it)
export function brandSource({ name = '', brief = '', theme = null, story = {}, pictures = [], clips = [], copy = '', cta = '' } = {}) {
  const brand = clip(name || story?.name || theme?.name || 'Our brand', 40)
  const lines = [
    story?.what && `  [what] ${clip(story.what, 160)}`,
    story?.who && `  [who] ${clip(story.who, 160)}`,
    story?.voice && `  [voice] ${clip(story.voice, 120)}`,
    ...String(copy || '').split('\n').map(l => clip(l, 200)).filter(Boolean).slice(0, 12).map(l => `  [line] ${l}`)
  ].filter(Boolean)
  return {
    brief: clip(brief || story?.what || brand, 600),
    agents: [],
    theme: theme ? { name: theme.name || '', direction: theme.direction || '', vars: theme.vars || {}, fonts: theme.fonts || {} } : { direction: '' },
    brand,
    copy: `PAGE story "${brand}": ${clip(story?.what || brief, 160)}\n${lines.join('\n')}`.slice(0, 5000),
    images: pictures.filter(p => p?.file).slice(0, 24).map((p, i) => ({ n: i + 1, gen: clip(p.about || p.name || 'a picture from the references', 160), page: p.page || 'refs', file: p.file, ...(p.id ? { id: String(p.id) } : {}), ...(p.given ? { given: true } : {}) })),
    clips: clips.filter(x => x?.file).slice(0, 8).map((x, i) => ({ n: i + 1, what: clip(x.about || x.name || 'a clip from the references', 160), label: clip(x.label, 20), seconds: Number(x.seconds) || 0, from: 0, file: x.file, ...(x.id ? { id: String(x.id) } : {}) })),
    ...(cta ? { cta: clip(cta, 60) } : {})
  }
}

// ---------- the Video kit's spec, as Lock writes it
// beats: [{ text, say?, frame?: { item: '<ref or asset id>' } | { picture: n } | { clip: n } | { paint: 'what to paint' }, seconds? }]
// music: { file?, mood? }  voice: { who?, tone?, sample? } | null  seconds  shape  start
export function checkKit(raw = {}) {
  const beats = (Array.isArray(raw.beats) ? raw.beats : []).slice(0, 16).map(b => {
    const f = b?.frame || {}
    const frame = /^[\w-]{1,40}$/.test(String(f.item || '')) ? { item: String(f.item) }
      : Number(f.picture) > 0 ? { picture: Math.round(Number(f.picture)) }
      : Number(f.clip) > 0 ? { clip: Math.round(Number(f.clip)) }
        : clip(f.paint, 220) ? { paint: clip(f.paint, 220) } : null
    return { text: clip(b?.text, 90), say: clip(b?.say, 140), frame, seconds: num(b?.seconds, 0.6, 9, null) }
  }).filter(b => b.text || b.frame)
  const m = raw.music || {}, v = raw.voice
  return {
    beats,
    music: { file: typeof m.file === 'string' && m.file ? m.file : null, mood: clip(m.mood, 80) },
    voice: v && (v.who || v.tone || v.sample) ? { who: clip(v.who, 40), tone: clip(v.tone, 60), sample: clip(v.sample, 140) } : null,
    seconds: num(raw.seconds, 6, 90, null),
    shape: FILM_SHAPES.includes(raw.shape) ? raw.shape : 'wide',
    start: KIT_STARTS.includes(raw.start) ? raw.start : 'storyboard'
  }
}

// What the director is told about a kit (a prompt line), so its treatment and music follow it
export function kitPrompt(kit) {
  const k = checkKit(kit)
  return [
    k.beats.length ? `The script, one beat per line, in this order, with these words: ${k.beats.map((b, i) => `${i + 1}. ${b.text || '(a picture, no words)'}`).join(' ')}` : '',
    k.music.mood ? `Music: ${k.music.mood}.` : '',
    k.voice ? `Voice: ${[k.voice.who, k.voice.tone].filter(Boolean).join(', ')}${k.voice.sample ? `, like "${k.voice.sample}"` : ''}.` : 'No voice.',
    k.seconds ? `About ${Math.round(k.seconds)} seconds.` : ''
  ].filter(Boolean).join(' ')
}

// a beat's picture as a storyboard kind: a full picture most of the time, side by side now and then
const picKind = (text, i) => (words(text) > 7 && i % 2 ? 'split' : 'image')
const CAMS = ['push-in', 'drift', 'pan-left', 'pull-out', 'pan-right', 'tilt-up']

// The kit's script as storyboard beats: its words as written, its frames as pictures or clips,
// a type card where a beat has no frame, and the closing card with the name.
export function kitBoard(kitIn, c) {
  const kit = checkKit(kitIn)
  const has = n => (c.images || []).some(i => i.n === n), hasClip = n => (c.clips || []).some(x => x.n === n)
  const voice = !!kit.voice
  const beats = kit.beats.map((b, i) => {
    // a reference or an asset named by its id: its picture, or its clip
    if (b.frame?.item) {
      const p = (c.images || []).find(x => x.id === b.frame.item), v = (c.clips || []).find(x => x.id === b.frame.item)
      b = { ...b, frame: p ? { picture: p.n } : v ? { clip: v.n } : null }
    }
    const base = { headline: b.text, say: voice ? b.say || b.text : '', seconds: b.seconds, camera: CAMS[i % CAMS.length], cut: i ? null : 'hard' }
    if (b.frame?.clip && hasClip(b.frame.clip)) return { ...base, kind: 'clip', layer: 'proof', clip: b.frame.clip }
    if (b.frame?.picture && has(b.frame.picture)) return { ...base, kind: picKind(b.text, i), layer: 'story', image: b.frame.picture }
    if (b.frame?.paint) return { ...base, kind: 'image', layer: 'story', shot: b.frame.paint }
    return { ...base, kind: 'title', layer: 'type' }
  })
  if (beats[0]) beats[0].music = 'pulse'
  const last = beats.at(-1)
  if (!last || !new RegExp(c.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(last.headline || '')) beats.push({ kind: 'cta', layer: 'type', headline: c.brand, sub: c.cta || '', music: 'resolve', cut: 'hard' })
  else last.music = 'resolve'
  const pace = kit.seconds && kit.beats.length ? (kit.seconds / Math.max(1, kit.beats.length) < 2.4 ? 'fast' : kit.seconds / kit.beats.length > 4.5 ? 'calm' : 'medium') : 'medium'
  return { title: c.brand, pace, plan: 'kit', voice, music: { mood: kit.music.mood || '', bpm: pace === 'fast' ? 124 : pace === 'calm' ? 78 : 104 }, beats }
}

// ---------- the build's story: one format for cards, captions and the film
// { v: 1, type, title, beats: [{ id, role, text, sub?, say?, pic?: { kind, src, page?, focus? }, seconds? }], next?: { label, url } }
export const STORY_ROLES = ['hook', 'what', 'who', 'moment', 'made', 'next']
export const STORY_PICS = ['picture', 'screen', 'replay', 'clip', 'none']
// each story type: the beats it usually has, how fast it moves, and whether a voice tells it
export const STORY_TYPES = {
  launch: { label: 'Launch', roles: ['hook', 'what', 'who', 'moment', 'moment', 'next'], pace: 'medium', voice: false, music: 'bright, confident, building' },
  about: { label: 'About me', roles: ['hook', 'who', 'what', 'moment', 'moment', 'next'], pace: 'calm', voice: true, music: 'warm, personal, light' },
  walkthrough: { label: 'Walkthrough', roles: ['hook', 'what', 'moment', 'moment', 'moment', 'next'], pace: 'medium', voice: true, music: 'clean, steady, modern' },
  trailer: { label: 'Trailer', roles: ['hook', 'moment', 'moment', 'moment', 'what', 'next'], pace: 'fast', voice: false, music: 'driving, tense, big hits' },
  event: { label: 'Event', roles: ['hook', 'what', 'who', 'moment', 'next'], pace: 'medium', voice: false, music: 'upbeat, festive, punchy' },
  made: { label: 'How it was made', roles: ['hook', 'made', 'made', 'made', 'what', 'next'], pace: 'fast', voice: false, music: 'playful, quick, ticking' }
}

// A story as written, made safe: 5 to 8 beats, short lines, known roles and picture kinds.
// Unknown fields are ignored, never an error; a story with fewer than 2 beats is null.
export function checkStory(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  // engine/story.mjs's story.json (spec 39: headline, line, picture { kind: image|screen|clip }, role
  // 'making', name, url) is read as it is; so is this file's own shorter shape (text, sub, pic)
  const alias = { making: 'made', image: 'picture' }
  const rawType = alias[raw.type] || raw.type
  const type = STORY_TYPES[rawType] ? rawType : 'launch'
  const beats = (Array.isArray(raw.beats) ? raw.beats : []).slice(0, 8).map((b, i) => {
    const p = b?.pic || b?.picture || {}
    const pk = alias[p.kind] || p.kind
    const kind = STORY_PICS.includes(pk) ? pk : p.src ? 'picture' : 'none'
    const src = clip(p.src, 300)
    const role = alias[b?.role] || b?.role
    return {
      id: clip(b?.id, 24) || `b${i + 1}`,
      role: STORY_ROLES.includes(role) ? role : 'moment',
      text: clip(b?.text ?? b?.headline, 90),
      sub: clip(b?.sub ?? b?.line, 120),
      say: clip(b?.say, 140),
      // a screen may name only its page (story/screens/<page>-desktop.jpg holds its shot)
      pic: kind === 'none' || (!src && !(kind === 'screen' && p.page)) ? { kind: 'none' } : { kind, src, page: clip(p.page, 80), focus: Array.isArray(p.focus) ? p.focus.slice(0, 2).map(x => num(x, 0, 1, 0.5)) : null },
      seconds: num(b?.seconds, 1.5, 6, null)
    }
  }).filter(b => b.text || b.pic.kind !== 'none')
  if (beats.length < 2) return null
  const next = raw.next && (raw.next.label || raw.next.url) ? { label: clip(raw.next.label, 40), url: clip(raw.next.url, 300) }
    : raw.url ? { label: clip(beats.findLast(b => b.role === 'next')?.sub || '', 40), url: clip(raw.url, 300) } : null
  return { v: 1, type, title: clip(raw.title ?? raw.name, 60), beats, next }
}

// The story's pictures and footage added to c. resolve(pic) -> an absolute file, or null when it
// cannot be found (that beat becomes a type card). Returns { c, at } where at[i] is the beat's
// { picture: n } or { clip: n } or null.
export function storySource(story, c, resolve = () => null) {
  const out = { ...c, images: [...(c.images || [])], clips: [...(c.clips || [])] }
  const at = story.beats.map(b => {
    if (b.pic.kind === 'none') return null
    const file = resolve(b.pic)
    if (!file) return null
    if (b.pic.kind === 'replay' || b.pic.kind === 'clip' || /\.(mp4|webm|mov)$/i.test(file)) {
      const n = out.clips.length + 1
      out.clips.push({ n, what: b.text || 'the crew at work', label: b.pic.kind === 'replay' ? 'Replay' : '', seconds: b.pic.seconds || 8, from: 0, file })
      return { clip: n }
    }
    const known = out.images.find(i => i.file === file)
    if (known) return { picture: known.n }
    const n = out.images.length + 1
    out.images.push({ n, gen: b.text || 'a picture from the build', page: b.pic.page || 'story', file })
    return { picture: n }
  })
  return { c: out, at }
}

// The story as storyboard beats: each beat's own words, its picture or screen, and a length the
// music cut may stretch onto the beat. A hook opens hard; the next beat is the closing card.
export function storyBoard(story, c, at = []) {
  const T = STORY_TYPES[story.type] || STORY_TYPES.launch
  const beats = story.beats.map((b, i) => {
    const f = at[i]
    const base = { headline: b.text, sub: b.sub, say: T.voice ? b.say || b.text : '', seconds: b.seconds, camera: CAMS[i % CAMS.length] }
    if (b.role === 'next') return { ...base, kind: 'cta', layer: 'type', kicker: story.title || c.brand, sub: story.next?.label || b.sub || c.cta || '', camera: null }
    if (f?.clip) return { ...base, kind: 'clip', layer: 'proof', clip: f.clip, speed: b.role === 'made' ? 4 : 1 }
    if (f?.picture) {
      // a screen is the product: proof; a painted or dropped picture is the story around it
      const layer = b.pic.kind === 'screen' ? 'proof' : 'story'
      const kind = b.role === 'what' || b.role === 'who' ? 'split' : 'image'
      return { ...base, kind, layer, image: f.picture }
    }
    if (b.role === 'who' && words(b.text) <= 12) return { ...base, kind: 'quote', layer: 'type' }
    return { ...base, kind: 'title', layer: 'type' }
  })
  if (beats[0]) Object.assign(beats[0], { music: T.pace === 'fast' ? 'hit' : 'pulse', cut: 'hard' })
  // the story always ends on where to go next, with the name on it
  if (beats.at(-1)?.kind !== 'cta') beats.push({ kind: 'cta', layer: 'type', kicker: '', headline: story.title || c.brand, sub: story.next?.label || c.cta || '', music: 'resolve' })
  else beats.at(-1).music = 'resolve'
  const bpm = T.pace === 'fast' ? 128 : T.pace === 'calm' ? 80 : 108
  return { title: story.title || c.brand, pace: T.pace, plan: `story:${story.type}`, voice: T.voice && beats.some(b => b.say), music: { mood: T.music, bpm }, beats }
}
