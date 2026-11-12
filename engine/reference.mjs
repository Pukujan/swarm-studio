// Style references for a film: an image, a video, a website, a game or a piece
// of music. Each is broken down into a style description (palette, type,
// pacing, cut rhythm, camera language, motion, mood, and the music's tempo,
// instruments and structure). That description steers the storyboard, the art
// and the score; the reference itself is never copied: no frames, no melody,
// no logos, no names, no characters. The notes are kept with the run so anyone
// can see what was taken from the reference.

import { execFile } from './proc.mjs'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { streamChat } from './llm.mjs'

const run = (cmd, args, opts = {}) => new Promise((ok, fail) => execFile(cmd, args, { maxBuffer: 1 << 26, encoding: opts.encoding || 'utf8', timeout: opts.timeout || 120000 }, (err, out, errOut) => (err && !opts.allowFail ? fail(new Error(String(errOut || err.message).slice(-300))) : ok({ out, err: String(errOut || '') }))))
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export const KINDS = ['image', 'video', 'site', 'game', 'audio']
const EXT = { image: /\.(png|jpe?g|webp|gif|avif|bmp)$/i, video: /\.(mp4|mov|webm|mkv|m4v)$/i, audio: /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i }
export function kindOf({ file, url, kind } = {}) {
  if (KINDS.includes(kind)) return kind
  const name = String(file || url || '')
  for (const [k, re] of Object.entries(EXT)) if (re.test(name.split('?')[0])) return k
  if (/^https?:\/\//.test(name)) return /itch\.io|store\.steampowered|\/play\b|game/i.test(name) ? 'game' : 'site'
  return file ? 'image' : 'game'
}

// ---------- measuring: numbers only, nothing kept from the reference itself

// Dominant colours from raw RGB pixels: coarse buckets, biggest first.
export function paletteOf(rgb, max = 5) {
  const buckets = new Map()
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const k = ((rgb[i] >> 5) << 6) | ((rgb[i + 1] >> 5) << 3) | (rgb[i + 2] >> 5)
    const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 }
    b.n++; b.r += rgb[i]; b.g += rgb[i + 1]; b.b += rgb[i + 2]
    buckets.set(k, b)
  }
  const hex = x => Math.round(x).toString(16).padStart(2, '0')
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, max).map(b => `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`)
}
const light = hex => { const v = parseInt(hex.slice(1), 16); return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255 }
const chroma = hex => { const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255]; return (Math.max(...c) - Math.min(...c)) / 255 }

async function pixels(ffmpeg, file, at = null) {
  const { out } = await run(ffmpeg, ['-v', 'error', ...(at != null ? ['-ss', String(at)] : []), '-i', file, '-frames:v', '1', '-vf', 'scale=48:27', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' })
  return out
}
async function frameJpeg(ffmpeg, file, at = null) {
  const { out } = await run(ffmpeg, ['-v', 'error', ...(at != null ? ['-ss', String(at)] : []), '-i', file, '-frames:v', '1', '-vf', 'scale=512:-2', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '5', '-'], { encoding: 'buffer' })
  return out
}
async function duration(ffmpeg, file) {
  const { err } = await run(ffmpeg, ['-hide_banner', '-i', file], { allowFail: true })
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
}

export async function measureImage(ffmpeg, file) {
  const palette = paletteOf(await pixels(ffmpeg, file))
  return { palette, brightness: avg(palette.map(light)), saturation: avg(palette.map(chroma)), frames: [await frameJpeg(ffmpeg, file)] }
}

// Cut times from the scene-change score, and the rhythm they make.
export function rhythmOf(cuts, seconds) {
  const shots = [0, ...cuts, seconds].map((t, i, a) => (i ? t - a[i - 1] : null)).filter(x => x != null && x > 0.05)
  const avgShot = shots.length ? seconds / shots.length : seconds
  const half = Math.floor(shots.length / 2)
  const speeding = shots.length > 5 && avg(shots.slice(half)) < avg(shots.slice(0, half)) * 0.75
  return {
    cuts: cuts.length, avgShot: Number(avgShot.toFixed(2)), cutsPerMin: Number(((cuts.length / Math.max(1, seconds)) * 60).toFixed(1)), speeding,
    text: `${cuts.length} cuts in ${seconds.toFixed(0)} s, a shot every ${avgShot.toFixed(1)} s on average${speeding ? ', speeding up toward the end' : ''}`,
  }
}

export async function measureVideo(ffmpeg, file) {
  const seconds = await duration(ffmpeg, file)
  const { err } = await run(ffmpeg, ['-hide_banner', '-i', file, '-vf', "scale=160:-2,select='gt(scene,0.32)',showinfo", '-an', '-f', 'null', '-'], { allowFail: true, timeout: 300000 })
  const cuts = [...err.matchAll(/pts_time:([\d.]+)/g)].map(m => Number(m[1])).filter(t => t > 0.1)
  const at = [0.15, 0.4, 0.65, 0.9].map(k => k * seconds)
  const pal = []
  const frames = []
  for (const t of at) {
    try { pal.push(...paletteOf(await pixels(ffmpeg, file, t), 3)); frames.push(await frameJpeg(ffmpeg, file, t)) } catch {}
  }
  const palette = [...new Set(pal)].slice(0, 6)
  let audio = null
  try { audio = await measureAudio(ffmpeg, file) } catch {}
  return { seconds, palette, brightness: avg(palette.map(light)), saturation: avg(palette.map(chroma)), rhythm: rhythmOf(cuts, seconds || 1), audio, frames }
}

// Loudness, tempo and shape from the decoded audio (mono, 11 kHz).
export async function measureAudio(ffmpeg, file) {
  const { out } = await run(ffmpeg, ['-v', 'error', '-i', file, '-t', '240', '-ac', '1', '-ar', '11025', '-f', 's16le', '-'], { encoding: 'buffer', timeout: 180000 })
  if (!out.length) return null
  const samples = new Int16Array(out.buffer, out.byteOffset, Math.floor(out.length / 2))
  return audioStats(samples, 11025)
}

export function audioStats(samples, rate) {
  const hop = Math.floor(rate * 0.02), frames = Math.floor(samples.length / hop)
  const rms = new Float32Array(frames), zcr = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let e = 0, z = 0
    for (let k = f * hop; k < (f + 1) * hop; k++) { const v = samples[k] / 32768; e += v * v; if (k && (samples[k] >= 0) !== (samples[k - 1] >= 0)) z++ }
    rms[f] = Math.sqrt(e / hop); zcr[f] = z / hop
  }
  const seconds = samples.length / rate
  // onsets: positive jumps in loudness; tempo: the strongest repeat in 60–180 BPM
  const flux = new Float32Array(frames)
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, rms[f] - rms[f - 1])
  let best = 0, tempo = 0
  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = 60 / bpm / 0.02
    let s = 0
    for (let f = Math.ceil(lag); f < frames; f++) s += flux[f] * (flux[Math.round(f - lag)] || 0)
    s /= frames - lag
    if (s > best * 1.02) { best = s; tempo = bpm }
  }
  const peak = Math.max(...rms) || 1
  // silences over 0.3 s, and sections by loudness
  const silences = []
  let start = -1
  for (let f = 0; f <= frames; f++) {
    const quiet = f < frames && rms[f] < peak * 0.03
    if (quiet && start < 0) start = f
    if (!quiet && start >= 0) { if ((f - start) * 0.02 >= 0.3) silences.push([Number((start * 0.02).toFixed(2)), Number((f * 0.02).toFixed(2))]); start = -1 }
  }
  const parts = 8, per = Math.floor(frames / parts) || 1
  const levels = Array.from({ length: parts }, (_, i) => avg([...rms.slice(i * per, (i + 1) * per)]) / peak)
  const shape = levels.map(l => (l < 0.12 ? 'quiet' : l < 0.35 ? 'low' : l < 0.6 ? 'mid' : 'loud'))
  let drop = null
  for (const [, b] of silences) { const after = avg([...rms.slice(Math.floor(b / 0.02), Math.floor(b / 0.02) + 50)]) / peak; if (after > 0.4 && b < seconds - 1) { drop = b; break } }
  const brightness = avg([...zcr])
  return {
    seconds: Number(seconds.toFixed(1)), tempo, silences: silences.slice(0, 6), drop,
    shape, rising: levels.at(-2) > levels[0] * 1.6,
    brightness: brightness > 0.18 ? 'bright, airy' : brightness > 0.08 ? 'balanced' : 'dark, low',
    dynamics: Math.max(...levels) - Math.min(...levels) > 0.5 ? 'big swings between quiet and loud' : 'even',
  }
}

// A website or a web game: its colours, fonts and how much it says, from the HTML and CSS.
export async function measureSite(url, { fetcher = fetch } = {}) {
  const res = await fetcher(url, { headers: { 'user-agent': 'swarm-studio/1.0' }, signal: AbortSignal.timeout(20000), redirect: 'follow' })
  if (!res.ok) throw new Error(`the page answered ${res.status}`)
  const html = String(await res.text()).slice(0, 600000)
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') + [...html.matchAll(/style="([^"]+)"/gi)].map(m => m[1]).join(';')
  const count = new Map()
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { let h = m[1].toLowerCase(); if (h.length === 3) h = h.split('').map(x => x + x).join(''); count.set(`#${h}`, (count.get(`#${h}`) || 0) + 1) }
  const theme = html.match(/<meta[^>]+name="theme-color"[^>]+content="(#[0-9a-f]{6})"/i)?.[1]
  const palette = [...new Set([theme, ...[...count].sort((a, b) => b[1] - a[1]).map(([h]) => h)].filter(Boolean))].slice(0, 6)
  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map(m => m[1].split(',')[0].replace(/["']/g, '').trim()).concat([...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"&:]+)/gi)].map(m => decodeURIComponent(m[1]).replace(/\+/g, ' '))))].filter(f => f && !/inherit|var\(/.test(f)).slice(0, 4)
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  const heads = [...html.matchAll(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
  const title = clip(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1], 120)
  const motion = /@keyframes|animation\s*:|gsap|framer-motion|lottie|three\.js|webgl/i.test(html)
  // names to keep out of the notes: the page's title words and its host
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } })()
  return { palette, fonts, title, heads: heads.slice(0, 6).map(h => clip(h, 80)), words: text.split(' ').length, motion, host, sample: clip(text, 1200) }
}

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

// ---------- describing: a model turns the numbers (and a look at a few frames) into style words

const RULES = `You are an art director describing the STYLE of a reference so a team can make an ORIGINAL film in a similar style. Describe only how it looks, moves and sounds, in general terms. Never name the work, its makers, brands, characters, places, logos or songs, never quote its words or lyrics, and never describe its specific characters or plot. Return JSON only:
{"palette":["#hex", "3 to 6 colours"],"type":"the typography's feel in under 14 words","pacing":"under 14 words","cutRhythm":"under 16 words","camera":"the camera language, under 16 words","motion":"how things move, under 14 words","mood":"3 to 6 mood words","music":{"tempo":120,"instruments":["3 to 5 generic instruments"],"structure":"how the music moves, under 22 words"}}`

export async function describe({ kind, measured, hint = '', provider, model, chat = streamChat, signal }) {
  const facts = { ...measured }
  const frames = facts.frames || []
  delete facts.frames
  const content = [{ type: 'text', text: `Reference kind: ${kind}.${hint ? ` What the person said about it: ${clip(hint, 300)}.` : ''}\nMeasured: ${JSON.stringify(facts).slice(0, 3500)}` }]
  for (const f of frames.slice(0, 4)) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(f).toString('base64')}` } })
  const res = await chat(provider, { trace: { kind: 'video-reference' }, model, maxTokens: 900, temperature: 0.3, signal, messages: [{ role: 'system', content: RULES }, { role: 'user', content: frames.length ? content : content[0].text }] })
  const t = res.text, a = t.indexOf('{'), b = t.lastIndexOf('}')
  return JSON.parse(t.slice(a, b + 1))
}

// Without a model: the measurements in plain words.
export function plainNotes(kind, m = {}) {
  const r = m.rhythm, au = m.audio || (kind === 'audio' ? m : null)
  const dark = (m.brightness ?? 0.5) < 0.35, vivid = (m.saturation ?? 0.3) > 0.35
  return {
    palette: m.palette || [],
    type: m.fonts?.length ? `${/serif|garamond|playfair|times|georgia/i.test(m.fonts[0]) ? 'serif' : /mono|code/i.test(m.fonts[0]) ? 'monospaced' : 'sans-serif'} headings, ${m.words > 800 ? 'lots of copy' : 'few words'}` : '',
    pacing: r ? (r.avgShot < 1.5 ? 'very fast' : r.avgShot < 3 ? 'brisk' : r.avgShot < 5 ? 'measured' : 'slow, lingering') : au?.tempo ? (au.tempo > 125 ? 'fast' : au.tempo < 90 ? 'slow' : 'steady') : '',
    cutRhythm: r?.text || '',
    camera: r ? (r.avgShot < 2 ? 'quick punch-ins and hard cuts' : 'slow push-ins and long holds') : m.motion ? 'animated, moving parts' : '',
    motion: m.motion ? 'animated sections and transitions' : r?.speeding ? 'accelerating' : '',
    mood: [dark ? 'dark' : 'light', vivid ? 'vivid' : 'muted', au?.dynamics?.startsWith('big') ? 'dramatic' : ''].filter(Boolean).join(', '),
    music: au ? { tempo: au.tempo || null, instruments: [], structure: [au.shape?.join(' → '), au.silences?.length ? `${au.silences.length} silences` : '', au.drop != null ? `a drop at ${au.drop}s` : '', au.brightness].filter(Boolean).join('; ') } : null,
  }
}

// Strip any name the reference brought along (its title words, its host, file name) from the notes.
export function scrub(notes, avoid = []) {
  const bad = [...new Set(avoid.flatMap(a => String(a || '').split(/[^\p{L}\p{N}']+/u)).filter(w => w.length > 3 && /^\p{Lu}/u.test(w) || /\./.test(w)))]
  const hosts = avoid.filter(a => /\./.test(String(a || '')))
  const clean = s => {
    let x = String(s ?? '')
    for (const w of [...bad, ...hosts]) x = x.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '')
    return x.replace(/["“”][^"“”]{2,80}["“”]/g, '').replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  }
  const out = {
    palette: (Array.isArray(notes.palette) ? notes.palette : []).filter(h => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 6),
    type: clip(clean(notes.type), 120), pacing: clip(clean(notes.pacing), 120),
    cutRhythm: { text: clip(clean(typeof notes.cutRhythm === 'string' ? notes.cutRhythm : notes.cutRhythm?.text), 160) },
    camera: clip(clean(notes.camera), 140), motion: clip(clean(notes.motion), 120), mood: clip(clean(notes.mood), 80),
    music: notes.music ? { tempo: Math.round(Number(notes.music.tempo)) || null, instruments: (Array.isArray(notes.music.instruments) ? notes.music.instruments : []).map(x => clip(clean(x), 30)).filter(Boolean).slice(0, 5), structure: clip(clean(notes.music.structure), 200) } : null,
  }
  return out
}

// One reference, start to finish. ref: { kind?, file?, url?, text? }. Returns { kind, what, notes, measured }.
export async function breakdown(ref, { ffmpeg, provider, model, chat = streamChat, fetcher = fetch, signal } = {}) {
  const kind = kindOf(ref)
  let measured = {}
  const avoid = [ref.name, ref.text, ref.url]
  if (ref.file && !existsSync(ref.file)) throw new Error('the reference file is missing')
  if (kind === 'image') measured = await measureImage(ffmpeg, ref.file)
  else if (kind === 'video') measured = await measureVideo(ffmpeg, ref.file)
  else if (kind === 'audio') measured = await measureAudio(ffmpeg, ref.file)
  else if (ref.url) {
    measured = await measureSite(ref.url, { fetcher })
    avoid.push(measured.title, measured.host, ...measured.heads)
    // the page's words only give its feel; they are never passed on
    measured = { ...measured, heads: measured.heads.map(h => h.split(' ').length), sample: undefined, title: undefined }
  }
  let notes = plainNotes(kind, measured)
  let by = 'measured'
  if (provider && model) {
    try {
      const said = await describe({ kind, measured, hint: kind === 'game' && !ref.url ? ref.text : '', provider, model, chat, signal })
      // the measured palette and rhythm win over guesses
      notes = { ...said, palette: notes.palette.length ? notes.palette : said.palette, cutRhythm: notes.cutRhythm || said.cutRhythm, music: said.music ? { ...said.music, tempo: measured?.audio?.tempo || measured?.tempo || said.music.tempo } : notes.music }
      by = 'model'
    } catch {}
  }
  const what = { image: 'an image', video: 'a video', audio: 'a piece of music', site: 'a website', game: 'a game' }[kind]
  const facts = { ...measured }
  delete facts.frames
  return { kind, what, by, notes: scrub(notes, avoid), measured: facts }
}

// Several references into one set of notes: the first one leads each field it fills.
export function merge(list) {
  const out = { from: list.map(x => ({ kind: x.kind, what: x.what, by: x.by })), palette: [], music: null }
  for (const { notes } of list) {
    for (const k of ['type', 'pacing', 'camera', 'motion', 'mood']) if (!out[k] && notes[k]) out[k] = notes[k]
    if (!out.cutRhythm?.text && notes.cutRhythm?.text) out.cutRhythm = notes.cutRhythm
    out.palette = [...new Set([...out.palette, ...(notes.palette || [])])].slice(0, 6)
    if (notes.music && (!out.music || (!out.music.tempo && notes.music.tempo))) out.music = { ...out.music, ...notes.music }
  }
  const avg = list.map(x => x.measured?.rhythm?.avgShot).find(Boolean)
  if (avg) out.cutRhythm = { ...out.cutRhythm, avgShot: avg }
  return out
}

export const refDir = runDir => { const d = join(runDir, 'video', 'refs'); mkdirSync(d, { recursive: true }); return d }
export const safeName = name => clip(String(name || 'reference').split(/[\\/]/).pop().replace(/[^\w.-]+/g, '-'), 60).replace(/^[-.]+/, '') || 'reference'
