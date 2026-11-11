// What the left chat shows after each slice of a big game, and what the bots check in it.
// A slice ends with things to look at: a contact sheet of the bots' filmed play test, the
// game before and after the slice, and a close-up of every visual bug the bots saw (with the
// same close-up after the fix). The pictures are cut from the play-test film with ffmpeg;
// the bugs come from the reviewer model looking at the contact sheet. Nothing here paints.

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FF = process.env.FFMPEG || 'ffmpeg'
const ff = (args, ms = 90000) => new Promise(ok => execFile(FF, ['-y', '-loglevel', 'error', ...args], { timeout: ms }, err => ok(!err)))

// The frames of a play-test film, two a second (Playwright's webm carries no duration,
// so the frames are read out rather than seeked to). → [{ file, t }] in a temp folder
export async function filmFrames(clip, dir) {
  if (!clip || !existsSync(clip)) return []
  if (!await ff(['-i', clip, '-vf', 'fps=2,scale=640:-2', '-q:v', '3', join(dir, 'f-%03d.jpg')])) return []
  return readdirSync(dir).filter(f => /^f-\d+\.jpg$/.test(f)).sort().map((f, i) => ({ file: join(dir, f), t: i / 2 }))
}

// n frames spread over the film, past the loading screen at the start
export function spread(frames, n = 6) {
  if (frames.length <= n) return frames.slice()
  const from = Math.min(Math.floor(frames.length * 0.12), frames.length - n)
  const span = frames.length - 1 - from
  return Array.from({ length: n }, (_, k) => frames[from + Math.round((span * k) / (n - 1))])
}

// six frames in a 3 × 2 grid, read left to right, top to bottom
export async function contactSheet(files, out) {
  const six = files.slice(0, 6)
  if (six.length < 2) return false
  while (six.length < 6) six.push(six.at(-1))
  const ins = six.flatMap(f => ['-i', f])
  const scale = six.map((_, i) => `[${i}:v]scale=480:300:force_original_aspect_ratio=decrease,pad=480:300:(ow-iw)/2:(oh-ih)/2[v${i}]`).join(';')
  const grid = `${six.map((_, i) => `[v${i}]`).join('')}xstack=inputs=6:layout=0_0|480_0|960_0|0_300|480_300|960_300[out]`
  return ff([...ins, '-filter_complex', `${scale};${grid}`, '-map', '[out]', '-frames:v', '1', '-q:v', '3', out])
}

// a box [x, y, w, h] in fractions of the picture, padded a little and kept inside it
export function padBox(box, pad = 0.06) {
  if (!Array.isArray(box) || box.length !== 4 || box.some(v => typeof v !== 'number' || !isFinite(v))) return null
  let [x, y, w, h] = box.map(v => Math.min(1, Math.max(0, v)))
  if (w < 0.02 || h < 0.02) return null
  x = Math.max(0, x - pad); y = Math.max(0, y - pad)
  w = Math.min(1 - x, w + pad * 2); h = Math.min(1 - y, h + pad * 2)
  // a close-up never shows less than a fifth of the frame: too small reads as noise
  if (w < 0.2) { x = Math.max(0, Math.min(1 - 0.2, x - (0.2 - w) / 2)); w = 0.2 }
  if (h < 0.2) { y = Math.max(0, Math.min(1 - 0.2, y - (0.2 - h) / 2)); h = 0.2 }
  return [x, y, w, h].map(v => +v.toFixed(3))
}
const cropOf = b => (b ? `crop=iw*${b[2]}:ih*${b[3]}:iw*${b[0]}:ih*${b[1]},` : '')

// before | after, side by side at one height, both cropped to the same box when given
export async function beforeAfter(before, after, out, box = null, h = 300) {
  if (!existsSync(before) || !existsSync(after)) return false
  const b = padBox(box) || null
  const f = `[0:v]${cropOf(b)}scale=-2:${h}[a];[1:v]${cropOf(b)}scale=-2:${h}[b];[a]pad=iw+8:ih:0:0:color=0x111111[a2];[a2][b]hstack=inputs=2[out]`
  return ff(['-i', before, '-i', after, '-filter_complex', f, '-map', '[out]', '-frames:v', '1', '-q:v', '3', out])
}

// one close-up of one frame
export async function closeUp(frame, out, box, h = 300) {
  const b = padBox(box)
  if (!b || !existsSync(frame)) return false
  return ff(['-i', frame, '-vf', `${cropOf(b)}scale=-2:${h}`, '-frames:v', '1', '-q:v', '3', out])
}

// ---------- what the bots look for
export const LOOK_FOR = [
  'an effect, decal, trail or shadow drawn with a hard rectangular edge or a visible box behind it (it should fade out softly)',
  'text that overflows, is cut off by or spills out of its card, button or box',
  'a colour tint, flash or fade stuck over the whole screen, or leaking onto things it should not touch',
  'a character tipped over or rotated sideways, or facing the wrong way',
  'a missing picture shown as a plain box, a placeholder shape or a broken image',
  'a black, blank or frozen screen',
  'HUD pieces overlapping each other or the action',
  'characters too small or too dark to read against the backdrop'
]

export function lookMessages({ title = 'the game', slice = '', image }) {
  return [
    { role: 'system', content: 'You are the play-test bot of a game studio. You look at frames of a 2D browser game and name only real, visible bugs a player would notice. Ignore taste. Reply with JSON only.' },
    {
      role: 'user', content: [
        { type: 'text', text: `Six frames of the bots playing ${slice ? `the slice "${slice}" of ` : ''}${title}, numbered 1 to 6, left to right, top to bottom (each frame is one cell of the grid).\n\nLook for:\n${LOOK_FOR.map(x => `- ${x}`).join('\n')}\n\nWorst first, at most 4. For each: the frame it shows best in, what is wrong in under 12 plain words, the box around it inside that frame as fractions of the frame [x, y, w, h] (0 to 1), one sentence telling the coder how to fix it, and obvious: true when it is plainly a bug with a plain fix in code (not a matter of taste or new art).\n\n{"findings":[{"frame":1,"what":"","box":[0,0,0,0],"fix":"","obvious":true}]}\n\nNo bugs: {"findings":[]}` },
        { type: 'image_url', image_url: { url: image } }
      ]
    }
  ]
}

function json(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
}

export function parseFindings(text) {
  const raw = json(text)
  if (!raw || !Array.isArray(raw.findings)) return null
  const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)
  return raw.findings
    .filter(f => f && clip(f.what, 1))
    .slice(0, 4)
    .map(f => ({ frame: Math.min(6, Math.max(1, Math.round(+f.frame) || 1)), what: clip(f.what, 90), box: padBox(f.box) ? f.box.map(Number) : null, fix: clip(f.fix, 240), obvious: f.obvious === true }))
}

// after a fix: the same close-up, before and after, and is the bug gone?
export function goneMessages({ what, image }) {
  return [
    { role: 'system', content: 'You compare two close-ups of a game, before (left) and after (right) a fix. Reply with JSON only.' },
    { role: 'user', content: [{ type: 'text', text: `The bug was: ${what}. Is it gone in the right picture? {"gone":true} or {"gone":false}` }, { type: 'image_url', image_url: { url: image } }] }
  ]
}
export const parseGone = text => json(text)?.gone === true

// where in this frame the thing the person called rough is, so the polish pass shows it close up
export function whereMessages({ what, image }) {
  return [
    { role: 'system', content: 'You find things in game frames. Reply with JSON only.' },
    { role: 'user', content: [{ type: 'text', text: `Six frames of a 2D game, numbered 1 to 6, left to right, top to bottom. The owner said: "${what}". Which frame shows what they mean best, and where in it? {"frame":1,"box":[x,y,w,h]} as fractions of that frame. Not visible in any: {"frame":0}` }, { type: 'image_url', image_url: { url: image } }] }
  ]
}
export function parseWhere(text) {
  const raw = json(text)
  const frame = Math.round(+raw?.frame) || 0
  return frame >= 1 && frame <= 6 ? { frame, box: padBox(raw.box) ? raw.box.map(Number) : null } : null
}

export const dataUrl = file => `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`

// ---------- the person's words, mid-build
// "Some of the FX look rough" asks for a polish pass on what is built, with close-ups;
// anything else is a change the crew folds into the slice it builds next.
const POLISH = /\b(rough|rougher|polish|jagged|janky|blurry|pixelated|ugly|messy|sloppy|cheap|crisp(er)?|clean(er)? (it )?up|smooth(er)? out|look(s|ing)? (off|bad|wrong|weird|cheap|flat|unfinished)|(hard|sharp) edges?|tidy (it )?up)\b/i
export const isPolish = text => POLISH.test(String(text || ''))

export function polishPrompt(notes, { godot = false } = {}) {
  return `A quality pass on the game as it is now, nothing new. The owner looked at it and said:\n${notes.map(n => `- "${n}"`).join('\n')}\n\nFind what they mean in the code and make it look finished: soft edges on effects and trails (fade them out, never a hard box), text that fits its box, tints and flashes that end, figures that read clearly. Change only how those things look and move; keep the rules, levels and everything that works. ${godot ? 'Touch nothing outside ports/godot/.' : 'Finish with the typecheck and build passing.'}`
}

export function fixPrompt(findings, { godot = false } = {}) {
  return `The play-test bots watched the game and saw these visual bugs:\n${findings.map((f, k) => `${k + 1}. ${f.what}. Fix: ${f.fix}`).join('\n')}\n\nFix exactly these, in the game as it is now. Change nothing else. ${godot ? 'Touch nothing outside ports/godot/.' : 'Finish with the typecheck and build passing.'}`
}

// A temp folder for frames, removed after
export async function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'slice-'))
  try { return await fn(dir) } finally { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
}

// ---------- live peeks while a slice is being built
// Every few minutes the bots open the game as it stands (Vite reloads the crew's changes),
// play a few seconds and film it; Hermia says in one line what works and what looks broken.
export const PEEK_MS = Number(process.env.SWARM_PEEK_MS) || 180000

export function peekMessages({ title = 'the game', slice = '', image, before = '' }) {
  return [
    { role: 'system', content: 'You are Hermia, the lead of a game crew, looking at the game live while the crew builds it. Plain words, no markdown. Reply with JSON only.' },
    {
      role: 'user', content: [
        { type: 'text', text: `A frame of ${title} right now, while the crew builds ${slice ? `the slice "${slice}"` : 'it'}.${before ? ` Last look you said: "${before}".` : ''} In at most 16 words, tell the owner what works and what looks broken or missing on screen, as a crew lead would (e.g. "Mika runs and slashes now; the lanterns are still grey boxes, fixing next"). {"note":""}` },
        { type: 'image_url', image_url: { url: image } }
      ]
    }
  ]
}
export function parseNote(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}')
  let note = ''
  if (a >= 0 && b > a) try { note = String(JSON.parse(s.slice(a, b + 1)).note || '') } catch {}
  return note.replace(/\s+/g, ' ').trim().slice(0, 160)
}
