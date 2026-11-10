// The film's storyboard, written fresh from the person's prompt every time.
//
// A model writes a beat sheet: every beat's length, layer (a story shot, a real
// capture of the build, or a type card), camera move, caption with one accent
// word, the cut into it, the music's shape at that point (pulse, build, hit,
// hard stop, drop, resolve) and the sound effects that land on it. checkBoard
// makes it safe to render; fallbackBoard writes one without a model. Templates
// are only starting points the writer may borrow from: the prompt shapes the film.

import { CAST, MOODS } from './sound.mjs'
import { checkLook, lookPrompt, rng, hash, CUTS } from './look.mjs'
import { streamChat } from './llm.mjs'

export const KINDS = ['open', 'image', 'split', 'mosaic', 'list', 'stat', 'quote', 'clip', 'cta', 'title', 'black']
export const LAYERS = ['story', 'proof', 'type']
export const CAMERAS = ['push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'punch-in', 'drift', 'shake', 'hold']
export const CUES = ['pulse', 'build', 'full', 'hit', 'stop', 'drop', 'resolve', 'calm']
export const SFX = ['hit', 'boom', 'riser', 'whoosh', 'tick', 'glitch', 'sting', 'chime', 'heartbeat']
const BEAT_CUTS = ['hard', ...CUTS]

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const num = (x, a, b, d) => { const v = Number(x); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d }
const pick = (r, list) => list[Math.floor(r(0, list.length)) % list.length]

// Starting points the writer may borrow from. None of them is the film: the prompt is.
export const TEMPLATES = {
  trailer: { label: 'Movie trailer', pace: 'fast', outline: 'A movie trailer: a story shot with a hook line, a hard cut to proof, a black type card, a hit as the hero appears, a montage of very short proof shots cut on the beat that speeds up, a hard stop to black and silence, one quiet story beat, a drop into the payoff, the brand lock-up last. Captions only, no voiceover.' },
  promo: { label: 'Promo', pace: 'medium', outline: 'A classic promo: the brand, the best pictures, what is on offer, the invitation.' },
  kinetic: { label: 'Kinetic type', pace: 'fast', outline: 'Kinetic typography: mostly type cards with 2 to 5 word lines that hit like a beat, one or two pictures at most.' },
  slideshow: { label: 'Slideshow', pace: 'calm', outline: 'A calm photo slideshow: every picture, slow camera moves, short captions, soft fades.' },
  teaser: { label: 'Teaser', pace: 'medium', outline: 'A teaser: four or five beats, hint and hold back, end on the name.' },
  story: { label: 'Customer story', pace: 'medium', outline: 'One person\'s story: their moment before, what they found, how it felt, told in story shots, with proof shots between.' },
  calm: { label: 'Calm film', pace: 'calm', outline: 'A slow, quiet film: long story shots that breathe, drifting camera, fades, a soft score with no drums, few words.' },
}

// What the prompt asks for, before any model: fast, calm or in between.
const FAST = /trailer|fast|quick|hype|punch|energ|action|intense|thrill|scary|horror|loud|epic|rapid|frantic|teaser|hard[- ]cut|montage|beat|tiktok|reel/i
const CALM = /calm|slow|gentle|quiet|soft|peace|serene|dream|relax|cozy|cosy|warm|meditat|ambient|lull|unhurried|tender/i
export function readPace(prompt = '', notes = null) {
  const p = String(prompt), f = (p.match(new RegExp(FAST.source, 'gi')) || []).length, c = (p.match(new RegExp(CALM.source, 'gi')) || []).length
  if (f > c) return 'fast'
  if (c > f) return 'calm'
  const avg = notes?.cutRhythm?.avgShot
  if (avg) return avg < 2 ? 'fast' : avg > 4.5 ? 'calm' : 'medium'
  return 'medium'
}
const PACE = { fast: { avg: 1.6, min: 0.45, max: 5, bpm: [118, 150] }, medium: { avg: 2.8, min: 0.9, max: 6.5, bpm: [96, 122] }, calm: { avg: 4.6, min: 2, max: 9, bpm: [62, 90] } }

// Twists that push each run off the first idea, picked by the seed.
const TWISTS = [
  { p: 'fast', t: 'Open cold on a story shot with a one-line hook; no title first.' },
  { p: 'any', t: 'Open on black with one typed line before any picture.' },
  { p: 'any', t: 'Hold the brand name back until the very last beat.' },
  { p: 'fast', t: 'Put a hard stop (black, silence) about two thirds in, then drop back in harder.' },
  { p: 'fast', t: 'Build one montage of very short proof shots, under a second each, cut on the beat.' },
  { p: 'any', t: 'Let one shot breathe much longer than any other.' },
  { p: 'any', t: 'Make the first caption a question.' },
  { p: 'any', t: 'End on a single word.' },
  { p: 'fast', t: 'Alternate story and proof every beat in the middle stretch.' },
  { p: 'calm', t: 'Use one slow camera move all the way through a long shot, and fades only.' },
  { p: 'calm', t: 'Leave a beat with no words at all, only the picture and the music.' },
  { p: 'any', t: 'Change the camera language halfway (still and locked off, then moving).' },
  { p: 'fast', t: 'Use a sudden punch-in on the strongest proof shot, with a hit on it.' },
  { p: 'any', t: 'Put the strongest picture second, not first.' },
]
export function twists(seed, pace = 'medium', n = 2) {
  const r = rng(hash(`twist${seed}`))
  const pool = TWISTS.filter(x => x.p === 'any' || x.p === pace)
  const out = []
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r(0, pool.length)) % pool.length, 1)[0].t)
  return out
}

// ---------- the prompt
export function boardPrompt(c, { prompt = '', template = '', notes = null, seed = 0, shots = false } = {}) {
  const clips = c.clips || [], pace = readPace(prompt, notes)
  const borrow = TEMPLATES[template] ? `The person picked a starting point: ${TEMPLATES[template].outline} Borrow from it, but their words come first.` : `Starting points you may borrow from, or ignore:\n${Object.entries(TEMPLATES).map(([k, t]) => `- ${k}: ${t.outline}`).join('\n')}`
  return [
    {
      role: 'system',
      content: `You are a film editor and director. You cut a short film for something a team of AI agents just built, from one person's prompt. The prompt decides everything: the kind of film (a movie trailer, a calm film, a teaser, an ad), its pace, its order, its sound. Never fall back on the same safe promo shape.

Return JSON only:
{"title":"a working title","pace":"fast|medium|calm","plan":"the starting point you borrowed from, or own","voice":false,"cast":{"narrator":"<voice id>","second":"<voice id or null>"},"look":{...},"music":{"bpm":120,"mood":"3 to 6 words","instruments":["3 to 5 instruments"],"structure":"one sentence: how the music moves"},"fx":[],"beats":[{"kind":"${KINDS.join('|')}","layer":"story|proof|type","seconds":1.5,"camera":"${CAMERAS.join('|')}","cut":"${BEAT_CUTS.join('|')}","kicker":"","headline":"the caption","accent":"one word of the caption","sub":"","image":1,${shots ? '"shot":"a new painted still",' : ''}${clips.length ? '"clip":1,"from":0,"speed":1,' : ''}"items":[],"say":"","music":"${CUES.join('|')}","sfx":["${SFX.join('|')}"]}]}

${lookPrompt()}

Layers, never mixed:
- story: people, places and moments around the build, in pictures (${shots ? 'listed pictures, or a new painted still with "shot"' : 'the listed pictures'}). A story shot never shows a product screen, so nobody mistakes art for the product working.
- proof: what the build really is: ${clips.length ? 'real footage recorded from it ("clip"), or ' : ''}its own pictures. Every product claim sits on a proof beat.
- type: words on a plain frame: "title" (a black card, the caption typed on, one accent word lit), "quote", "list", "stat", "open" (the name), "cta" (the closing card), "black" (an empty frame: a pause, often with music "stop").

Beat kinds: image (full-frame picture, caption over it), split (picture and words side by side), mosaic (2 or 3 "images"), ${clips.length ? 'clip (real footage, "clip" number, "from" seconds in, "speed" 1 to 8 to speed a long take up), ' : ''}title, black, quote, list (exactly 3 short "items"), stat (one real number from the build as the headline), open, cta.

Timing and rhythm:
- "seconds" is each beat's length, 0.4 to 9. A fast trailer cuts every 0.5 to 2 seconds and speeds up into its peak; a calm film holds shots 4 to 8 seconds. The whole film runs 15 to 60 seconds unless the prompt asks for another length.
- "cut" is the cut into the beat: hard for a straight cut (trailers use mostly hard cuts and a flash or whip at a hit), or a named transition.
- "camera" is the move on the beat's picture: push-in, pull-out, pans, tilts, punch-in (a sudden zoom on a hit), drift (slow float), shake (handheld tension), hold (locked off).
- "music" marks how the score changes from this beat on: pulse (low and tense), build (rising), full, hit (one big hit on this beat), stop (silence for this beat), drop (everything comes back hard), resolve (it settles), calm (soft, no drums). Mark the first beat. "sfx" are effects that land on the beat's first frame.
- Captions: one short line each, under 7 words, the way a trailer card reads. "accent" is the one word that lights up. No exclamation marks, no emoji, no hashtags.
- "voice": true only when the prompt wants narration; then "say" is a spoken line of 5 to 14 words for most beats. A trailer is usually captions and music only.
- Beats: 6 to 28. Use each picture at most once and only numbers from the lists. Use real names, offers and numbers from the build; the closing beat carries the name.

Style references: when style notes are given, follow their palette, type, pacing, cut rhythm, camera language, motion, mood and music, but make something original. Never copy a reference: no frames, no melody, no logos, no names, no characters, no lines from it.
${shots ? '\n"shot": a new still painted for a story beat (image or split kind) instead of "image": a concrete description under 30 words (subject, place, light, mood, camera), in the build\'s own colours. A scene, never a website, app, screen, sign or logo, and no brand names. 2 to 5 shots.' : ''}
Voices for "cast", when there is a voice:
${Object.entries(CAST).map(([id, d]) => `  ${id}: ${d}`).join('\n')}
"fx" are effects over the whole film (sparkle, stars, fireworks, breeze, confetti, snow): only what the prompt asks for.`,
    },
    {
      role: 'user',
      content: `The person's prompt (it leads; follow it closely): ${prompt || 'a short film of this build, your choice of shape'}

${borrow}

Read pace: ${pace}. Seed ${seed}: ${twists(seed, pace).join(' ')}
${notes ? `\nStyle notes from the person's references (follow the style, copy nothing):\n${notesText(notes)}\n` : ''}
Brand: ${c.brand}
Brief: ${c.brief}
Art direction: ${c.theme?.direction || ''}

Pictures:
${(c.images || []).map(i => `${i.n}. (${i.page}) ${i.gen}`).join('\n') || 'none'}${clips.length ? `\n\nFootage of the build (real captures):\n${clips.map(x => `${x.n}. ${x.what} (${x.seconds.toFixed(0)} s)`).join('\n')}` : ''}

The build:
${c.copy || ''}`,
    },
  ]
}

// Style notes as plain lines for a prompt.
export function notesText(n) {
  return [
    n.palette?.length && `palette: ${n.palette.join(' ')}`,
    n.type && `type: ${n.type}`,
    n.pacing && `pacing: ${n.pacing}`,
    n.cutRhythm?.text && `cut rhythm: ${n.cutRhythm.text}`,
    n.camera && `camera: ${n.camera}`,
    n.motion && `motion: ${n.motion}`,
    n.mood && `mood: ${n.mood}`,
    n.music && `music: ${[n.music.tempo && `${n.music.tempo} BPM`, n.music.instruments?.join(', '), n.music.structure].filter(Boolean).join('; ')}`,
  ].filter(Boolean).map(x => `- ${x}`).join('\n')
}

// ---------- the check: anything the renderer can't play is fixed or dropped
export function checkBoard(raw = {}, c, { prompt = '', notes = null, shots = false, seed = Date.now(), template = '', fixesIn = [], fallback = false } = {}) {
  const fixes = [...fixesIn]
  const pace = ['fast', 'medium', 'calm'].includes(raw.pace) ? raw.pace : readPace(prompt, notes)
  // the prompt wins over the writer when they disagree on pace
  const asked = readPace(prompt, null), want = asked !== 'medium' ? asked : pace
  if (want !== pace) fixes.push(`pace ${pace} → ${want} (the prompt asked)`)
  const P = PACE[want]
  const has = n => (c.images || []).some(i => i.n === n)
  const used = new Set(), usedClips = new Set()
  let shotCount = 0
  const beats = []
  for (const b of (Array.isArray(raw.beats) ? raw.beats : Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, 40)) {
    let kind = KINDS.includes(b.kind) ? b.kind : 'title'
    const s = {
      kind,
      layer: LAYERS.includes(b.layer) ? b.layer : null,
      seconds: num(b.seconds, 0.4, 9, null),
      camera: CAMERAS.includes(b.camera) ? b.camera : null,
      cut: BEAT_CUTS.includes(b.cut) ? b.cut : null,
      kicker: clip(b.kicker, 28),
      headline: clip(b.headline, kind === 'quote' ? 90 : 60),
      sub: clip(b.sub, 90),
      say: clip(b.say, 140),
      who: b.who === 'second' ? 'second' : 'narrator',
      cue: CUES.includes(b.music) ? b.music : CUES.includes(b.cue) ? b.cue : null,
      sfx: [...new Set((Array.isArray(b.sfx) ? b.sfx : b.sfx ? [b.sfx] : []).filter(x => SFX.includes(x)))].slice(0, 2),
    }
    const accent = clip(b.accent, 24)
    if (accent && s.headline.toLowerCase().includes(accent.toLowerCase())) s.accent = accent
    if (kind === 'image' || kind === 'split') {
      const n = Number(b.image), fresh = shots && !has(n) && clip(b.shot, 220)
      if (fresh && shotCount < 5) { shotCount++; s.shot = clip(b.shot, 220); s.layer = 'story' }
      else if (has(n) && !used.has(n)) { used.add(n); s.image = n }
      else { kind = 'title'; fixes.push(`beat ${beats.length + 1}: no such picture, made a type card`) }
    }
    if (kind === 'mosaic') {
      s.images = [...new Set((Array.isArray(b.images) ? b.images : []).map(Number))].filter(n => has(n) && !used.has(n)).slice(0, 3)
      if (s.images.length < 2) { kind = 'title'; delete s.images } else s.images.forEach(n => used.add(n))
    }
    if (kind === 'clip') {
      const n = Number(b.clip), x = (c.clips || []).find(y => y.n === n)
      if (x && (!usedClips.has(n) || x.seconds > 12)) {
        usedClips.add(n)
        s.clip = n
        s.from = num(b.from, 0, Math.max(0, x.seconds - 0.5), 0)
        s.speed = Math.round(num(b.speed, 1, 8, 1))
        s.layer = 'proof'
      } else { kind = 'title'; fixes.push(`beat ${beats.length + 1}: no such footage, made a type card`) }
    }
    if (kind === 'list') {
      s.items = (Array.isArray(b.items) ? b.items : []).map(x => clip(x, 32)).filter(Boolean).slice(0, 3)
      if (s.items.length < 2) { kind = 'title'; delete s.items }
    }
    if (kind === 'stat' && !/\d/.test(s.headline)) kind = 'title'
    s.kind = kind
    if (kind === 'black') { s.headline = ''; s.sub = ''; s.layer = 'type' }
    else if (!s.headline && !['image', 'split', 'mosaic', 'clip'].includes(kind)) continue
    if (!s.layer || (kind !== 'image' && kind !== 'split' && kind !== 'mosaic' && kind !== 'clip')) s.layer = ['image', 'split', 'mosaic'].includes(kind) ? (s.layer || 'proof') : kind === 'clip' ? 'proof' : 'type'
    beats.push(s)
  }
  // a film needs something to open on and its name to close on
  if (beats.length < 3 && !fallback) {
    fixes.push('too few beats, used the fallback')
    return fallbackBoard(c, { prompt, notes, seed, template, fixes })
  }
  const last = beats.at(-1)
  if (!beats.length) beats.push({ kind: 'open', layer: 'type', seconds: null, camera: null, cut: null, kicker: '', headline: c.brand, sub: clip(c.brief, 60), say: '', who: 'narrator', cue: null, sfx: [] })
  if (!['cta', 'open', 'title'].includes(last?.kind ?? beats.at(-1).kind) || !new RegExp(escapeRe(c.brand), 'i').test(`${last.headline} ${last.kicker} ${last.sub}`)) {
    beats.push({ kind: 'cta', layer: 'type', seconds: null, camera: null, cut: 'hard', kicker: '', headline: c.brand, sub: clip(c.cta || 'Made with Swarm Studio', 60), say: '', who: 'narrator', cue: 'resolve', sfx: [] })
    fixes.push('added the closing card with the name')
  }
  const voice = raw.voice === true && beats.some(b => b.say)
  // lengths: the writer's, in the prompt's pace, snapped to the beat when there is no voice
  const bpm = Math.round(num(raw.music?.bpm, 56, 176, (P.bpm[0] + P.bpm[1]) / 2))
  const half = 60 / bpm / 2
  const free = beats.filter(b => b.seconds == null)
  for (const b of free) b.seconds = b.kind === 'black' ? Math.max(P.min, 1) : b.kind === 'cta' ? Math.max(2.4, P.avg) : P.avg
  const avg = beats.reduce((a, b) => a + b.seconds, 0) / beats.length
  if (avg > P.avg * 1.6 || avg < P.avg / 1.8) {
    const k = P.avg / avg
    for (const b of beats) b.seconds *= k
    fixes.push(`retimed to a ${want} pace (beats averaged ${avg.toFixed(1)} s)`)
  }
  for (const b of beats) {
    const floor = b.kind === 'cta' || b.kind === 'open' ? Math.max(P.min, 2) : b.kind === 'list' ? Math.max(P.min, 2.6) : P.min
    b.seconds = Math.min(P.max, Math.max(floor, b.seconds))
    if (!voice) b.seconds = Math.max(half, Math.round(b.seconds / half) * half)
    b.seconds = Number(b.seconds.toFixed(3))
  }
  let total = beats.reduce((a, b) => a + b.seconds, 0)
  if (total > 90) { const k = 88 / total; for (const b of beats) b.seconds = Number((b.seconds * k).toFixed(3)); total = 88; fixes.push('trimmed to under 90 s') }
  // the first beat always says what the music does
  if (!beats[0].cue) beats[0].cue = want === 'calm' ? 'calm' : want === 'fast' ? 'pulse' : 'full'
  // default cameras and cuts from the pace, varied by the seed
  const r = rng(hash(`board${seed}`))
  for (const b of beats) {
    if (!b.camera) b.camera = want === 'calm' ? pick(r, ['drift', 'push-in', 'pan-left', 'pan-right', 'hold']) : want === 'fast' ? pick(r, ['push-in', 'punch-in', 'shake', 'pan-left', 'pull-out']) : pick(r, ['push-in', 'pan-right', 'pull-out', 'drift'])
    if (!b.cut) b.cut = want === 'fast' ? (b.cue === 'hit' || b.cue === 'drop' ? 'flash' : 'hard') : want === 'calm' ? 'fade' : null
  }
  const out = Object.assign(beats, {
    title: clip(raw.title, 60) || c.brand,
    pace: want,
    plan: TEMPLATES[raw.plan] ? raw.plan : TEMPLATES[template] ? template : 'own',
    voice,
    cast: { narrator: CAST[raw.cast?.narrator] ? raw.cast.narrator : null, second: CAST[raw.cast?.second] && raw.cast.second !== raw.cast?.narrator ? raw.cast.second : null },
    music: checkMusic(raw.music, want, bpm, notes),
    fx: (Array.isArray(raw.fx) ? raw.fx : []).filter(x => typeof x === 'string').slice(0, 4),
    look: checkLook(raw.look || lookFromNotes(notes, want), seed),
    seed,
    fixes,
  })
  if (notes?.palette?.length) out.look.notesPalette = notes.palette.slice(0, 5)
  return out
}

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function checkMusic(m = {}, pace = 'medium', bpm = 110, notes = null) {
  const words = x => (Array.isArray(x) ? x : x ? [x] : []).map(y => clip(y, 30)).filter(Boolean).slice(0, 6)
  return {
    bpm,
    mood: clip(m?.mood || notes?.music?.mood || notes?.mood || (pace === 'fast' ? 'tense, driving, cinematic' : pace === 'calm' ? 'warm, slow, gentle' : 'bright, steady, hopeful'), 80),
    instruments: words(m?.instruments).length ? words(m.instruments) : words(notes?.music?.instruments).length ? words(notes.music.instruments) : pace === 'fast' ? ['taiko drums', 'low synth bass', 'string stabs', 'braams'] : pace === 'calm' ? ['felt piano', 'warm pad', 'soft strings'] : ['plucked synth', 'pad', 'light drums', 'bass'],
    structure: clip(m?.structure || notes?.music?.structure, 200),
  }
}

// a look that leans on the reference's feel when the writer gives none
function lookFromNotes(n, pace) {
  if (!n) return {}
  const mood = `${n.mood || ''} ${n.motion || ''} ${n.camera || ''}`.toLowerCase()
  return {
    layout: /dark|horror|scary|noir|cinematic|film/.test(mood) ? 'cinematic' : /neon|glitch|cyber|arcade/.test(mood) ? 'neon' : /playful|cute|collage|hand/.test(mood) ? 'collage' : pace === 'calm' ? 'editorial' : undefined,
    motion: pace === 'fast' ? 'snappy' : pace === 'calm' ? 'drift' : undefined,
  }
}

// ---------- without a model: the build's own words and pictures, cut in the prompt's pace
export function fallbackBoard(c, { prompt = '', notes = null, seed = Date.now(), template = '', fixes = [] } = {}) {
  const pace = TEMPLATES[template]?.pace && readPace(prompt) === 'medium' ? TEMPLATES[template].pace : readPace(prompt, notes)
  const r = rng(hash(`fallback${seed}`))
  const titles = (c.copy || '').match(/^PAGE \S+ "([^"]+)"/gm)?.map(l => l.replace(/^PAGE \S+ "|"$/g, '').split(/\s[—–|:-]\s/).pop()) || []
  const imgs = [...(c.images || [])].sort(() => r() - 0.5)
  const clips = [...(c.clips || [])]
  // the build's own short headlines make the best captions; page names only fill in
  const heads = [...(c.copy || '').matchAll(/\] ([^/—\n]+)/g)].map(m => m[1].trim()).filter(h => h.split(' ').length >= 2 && h.split(' ').length <= 6 && h.length <= 40)
  const lines = [...new Set([...heads.slice(0, 8), ...(heads.length < 3 ? titles.slice(1) : []), 'Made in one prompt'])].sort(() => r() - 0.5)
  const beats = []
  const word = s => s.split(' ').sort((a, b) => b.length - a.length)[0]
  const title = (h, cue, sfx = []) => beats.push({ kind: 'title', layer: 'type', headline: clip(h, 40), accent: word(clip(h, 40)), cue, sfx })
  const story = (img, cue, sfx = []) => img && beats.push({ kind: 'image', layer: 'proof', image: img.n, headline: clip(lines.pop() || c.brand, 40), cue, sfx })
  const proof = (x, speed, cue) => x && beats.push({ kind: 'clip', layer: 'proof', clip: x.n, from: x.from || 0, speed, headline: clip(x.label || 'Live', 20), cue })
  if (pace === 'fast') {
    r() < 0.5 ? title(clip(c.brief, 40) || c.brand, 'pulse') : story(imgs.shift(), 'pulse')
    proof(clips[0], 4, null)
    title(lines.pop() || 'One prompt', 'hit', ['hit'])
    for (const img of imgs.splice(0, 4)) beats.push({ kind: 'image', layer: 'proof', image: img.n, headline: '', cue: beats.length === 3 ? 'build' : null, seconds: 0.9 })
    if (clips[1]) proof(clips[1], 8, null)
    beats.push({ kind: 'black', layer: 'type', headline: '', cue: 'stop', seconds: 1.2 })
    title(lines.pop() || 'All of it', 'drop', ['boom'])
  } else {
    beats.push({ kind: 'open', layer: 'type', headline: c.brand, sub: clip(c.brief, 60), cue: pace === 'calm' ? 'calm' : 'full' })
    for (const img of imgs.splice(0, pace === 'calm' ? 4 : 3)) story(img, null)
    proof(clips[0], 1, null)
    if (titles.length > 2) beats.push({ kind: 'list', layer: 'type', headline: c.brand, items: titles.slice(1, 4).map(t => clip(t, 30)), cue: null })
  }
  beats.push({ kind: 'cta', layer: 'type', headline: c.brand, sub: 'Made with Swarm Studio', cue: 'resolve', cut: 'fade' })
  return checkBoard({ beats, pace, music: { bpm: Math.round(r(...PACE[pace].bpm)) } }, c, { prompt, notes, seed, template, fixesIn: fixes, fallback: true })
}

// ---------- the call
export async function writeBoard({ provider, model, c, prompt = '', template = '', notes = null, seed = Date.now(), shots = false, signal, chat = streamChat }) {
  const res = await chat(provider, { trace: { kind: 'video' }, model, messages: boardPrompt(c, { prompt, template, notes, seed: seed % 10000, shots }), maxTokens: 4000, temperature: 1, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal })
  const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
  if (s < 0 || e <= s) throw new Error('no JSON in the storyboard')
  return checkBoard(JSON.parse(res.text.slice(s, e + 1)), c, { prompt, notes, shots, seed, template })
}

// The music's shape in seconds, once each beat's length is final.
export function cueSheet(beats, lengths) {
  const at = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0))
  const sections = [], hits = [], silence = [], sfx = []
  let drop = null
  beats.forEach((b, i) => {
    const t = at[i], end = t + lengths[i]
    if (b.cue === 'stop') silence.push([Number(t.toFixed(3)), Number(end.toFixed(3))])
    else if (b.cue === 'hit') { hits.push(Number(t.toFixed(3))); sections.push({ at: t, shape: 'full' }) }
    else if (b.cue) sections.push({ at: t, shape: b.cue })
    if (b.cue === 'drop' && drop == null) drop = Number(t.toFixed(3))
    for (const x of b.sfx || []) sfx.push({ at: Number(t.toFixed(3)), kind: x })
  })
  if (!sections.length || sections[0].at > 0) sections.unshift({ at: 0, shape: 'full' })
  return { sections: sections.map(s => ({ ...s, at: Number(s.at.toFixed(3)) })), hits, silence, drop, sfx, cuts: at.slice(1).map(t => Number(t.toFixed(3))) }
}
