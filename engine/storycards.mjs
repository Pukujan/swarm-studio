// Story cards (docs/specs/37-story.md): each beat of runs/<id>/story.json as a designed card in the
// project's own colours and type, with its real pictures and screens, laid out for its frame:
//   tall 1080×1920 (a phone story), wide 1920×1080 (desktop and tablet), square 1080×1080.
// Drawn as HTML and photographed with the puppeteer-core and Chrome the page shots already use
// (engine/pageshots.mjs), so no new browser comes in. With no browser, PIL draws a plain type card.
// A card is drawn again only when what it shows changed (its key), so an edit redraws one beat.

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from './proc.mjs'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { browserEnv } from './proc.mjs'
import { findChrome } from './seo.mjs'
import { chromePath } from './footage.mjs'

export const SHAPES = {
  tall: { w: 1080, h: 1920, label: 'Phone' },
  wide: { w: 1920, h: 1080, label: 'Desktop' },
  square: { w: 1080, h: 1080, label: 'Square' }
}
export const cardName = (shape, beat) => `${shape}-${beat}.jpg`

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const font = s => String(s || '').replace(/[^\w ]/g, '')

// the picture a beat shows, as a URL the card page can load: art from runs/<id>/img, a screen from
// the page shots (desktop for wide and square, phone for tall)
export function pictureUrl(beat, shape, { runDir, screens = {} }) {
  const p = beat?.picture
  if (!p) return null
  if (p.kind === 'screen') {
    const s = screens[p.page]
    return (shape === 'tall' ? s?.phone || s?.desktop : s?.desktop || s?.phone) || null
  }
  const file = typeof p.src === 'string' && p.src.startsWith('/img/') ? join(runDir, 'img', basename(p.src.split('?')[0])) : null
  return file && existsSync(file) ? `file://${file}` : null
}

// One card's HTML. A screen sits in a device (a phone on a tall card, a browser window on the others)
// on a ground mixed from the brand's accent; art fills its part of the frame. The words keep to their
// own block, never over a picture, at sizes set for the frame (not one card shrunk to three).
export function cardHtml(story, beat, shape, pic) {
  const b = story.brand || {}, { w, h } = SHAPES[shape]
  const i = story.beats.findIndex(x => x.id === beat.id), n = story.beats.length
  const screen = beat.picture?.kind === 'screen' && pic
  const type = !pic
  const big = beat.role === 'hook' || beat.role === 'next' || type
  const hs = shape === 'tall' ? (big ? 104 : 84) : shape === 'wide' ? (big ? 96 : 76) : (big ? 84 : 66)
  const ls = shape === 'tall' ? 40 : shape === 'wide' ? 36 : 32
  const ks = shape === 'tall' ? 30 : 26
  const pad = shape === 'wide' ? 96 : 80
  const fonts = [b.heading, b.body].filter(f => f && !/^(Georgia|Helvetica)$/.test(f)).map(f => `family=${encodeURIComponent(font(f))}:wght@400;600;700`).join('&')
  const media = !pic ? '' : screen
    ? `<div class="stage"><div class="${shape === 'tall' ? 'phone' : 'window'}">${shape === 'tall' ? '' : '<i></i><i></i><i></i>'}<img src="${esc(pic)}"></div></div>`
    : `<div class="art" style="background-image:url('${esc(pic)}')"></div>`
  const words = `<div class="words">
    ${beat.kicker ? `<div class="kicker">${esc(beat.kicker)}</div>` : ''}
    <h1>${esc(beat.headline)}</h1>
    ${beat.line ? `<p>${esc(beat.line)}</p>` : ''}
    ${beat.role === 'next' && !beat.headline.includes(story.name) ? `<div class="name">${esc(story.name)}</div>` : ''}
  </div>`
  const ticks = `<div class="ticks">${story.beats.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>`
  const layout = type ? 'type' : shape === 'wide' ? 'split' : 'stack'
  return `<!doctype html><html><head><meta charset="utf-8">
${fonts ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=block">` : ''}
<style>
*{box-sizing:border-box;margin:0}
:root{--bg:${b.bg};--fg:${b.text};--ac:${b.accent};--ink:${b.ink}}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:'${font(b.body)}',Helvetica,Arial,sans-serif}
.card{position:relative;width:100%;height:100%;display:flex}
.stack{flex-direction:column}.split{flex-direction:row}.type{flex-direction:column;justify-content:center}
.stack .media{flex:0 0 ${shape === 'tall' ? 62 : 56}%}.split .media{flex:0 0 58%;order:2}
.media{position:relative;overflow:hidden;background:color-mix(in srgb,var(--ac) 22%,var(--bg))}
.art{position:absolute;inset:0;background-size:cover;background-position:center 40%}
.stage{position:absolute;inset:0;display:flex;align-items:${shape === 'tall' ? 'flex-end' : 'center'};justify-content:center;padding:${shape === 'tall' ? '120px 0 0' : '64px'}}
.phone{width:62%;height:100%;border-radius:64px 64px 0 0;border:14px solid #0b0b0c;border-bottom:0;overflow:hidden;background:#0b0b0c;box-shadow:0 40px 80px rgba(0,0,0,.35)}
.phone img{width:100%;display:block}
.window{width:100%;height:100%;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 30px 70px rgba(0,0,0,.3);padding-top:34px;position:relative}
.window i{position:absolute;top:12px;width:12px;height:12px;border-radius:50%;background:#d4d4d8}.window i:nth-child(1){left:16px}.window i:nth-child(2){left:36px}.window i:nth-child(3){left:56px}
.window img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.words{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${shape === 'tall' ? 28 : 22}px;padding:${pad}px}
.type .words{flex:0 0 auto;padding:${pad * 1.4}px}
.kicker{font-size:${ks}px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ac)}
h1{font-family:'${font(b.heading)}',Georgia,serif;font-weight:700;font-size:${hs}px;line-height:1.04;letter-spacing:-.01em;text-wrap:balance}
p{font-size:${ls}px;line-height:1.35;opacity:.86;text-wrap:pretty;max-width:30ch}
.name{margin-top:12px;font-size:${ks}px;font-weight:600;display:inline-block;align-self:flex-start;padding:14px 26px;border-radius:999px;background:var(--ac);color:var(--ink)}
.type h1{font-size:${hs * 1.25}px}
.type::before{content:'';position:absolute;left:${pad * 1.4}px;top:${pad * 1.4}px;width:120px;height:12px;background:var(--ac)}
.ticks{position:absolute;top:28px;left:28px;right:28px;display:flex;gap:8px;z-index:2}
.ticks span{flex:1;height:6px;border-radius:3px;background:color-mix(in srgb,var(--fg) 25%,transparent)}
.ticks span.on{background:var(--fg)}
${shape === 'tall' ? '' : '.ticks{display:none}'}
</style></head><body><div class="card ${layout}">${ticks}${pic ? `<div class="media">${media}</div>` : ''}${words}</div></body></html>`
}

// what a card shows, so an unchanged card is not drawn again
export function cardKey(story, beat, shape, pic) {
  return createHash('sha1').update(JSON.stringify([story.brand, story.name, story.beats.length, story.beats.findIndex(b => b.id === beat.id), beat.role, beat.kicker, beat.headline, beat.line, shape, pic && pic.length > 200 ? createHash('sha1').update(pic).digest('hex') : pic])).digest('hex').slice(0, 16)
}

function puppeteer(dataDir) {
  try { return createRequire(join(dataDir, 'video-tools', 'package.json'))('puppeteer-core') } catch { return null }
}

// PIL's plain card when there is no browser: the brand's ground, the headline and line in its colours
const PY_CARD = `import sys
from PIL import Image, ImageDraw, ImageFont
dst, w, h, bg, fg, ac, kicker, title, sub = sys.argv[1:10]
w, h = int(w), int(h)
im = Image.new('RGB', (w, h), bg); d = ImageDraw.Draw(im)
def font(n, bold=True):
    for f in (['/System/Library/Fonts/Supplemental/Georgia Bold.ttf'] if bold else []) + ['/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try: return ImageFont.truetype(f, n)
        except Exception: pass
    return ImageFont.load_default()
pad = int(w * 0.09); width = w - 2 * pad
def wrap(text, f):
    lines, line = [], ''
    for word in text.split():
        if d.textlength((line + ' ' + word).strip(), font=f) > width and line: lines.append(line); line = word
        else: line = (line + ' ' + word).strip()
    if line: lines.append(line)
    return lines
size = int(w * 0.085)
f = font(size); lines = wrap(title, f)
y = int(h * 0.38) - len(lines) * size // 2
d.rectangle((pad, y - 90, pad + 120, y - 78), fill=ac)
if kicker: d.text((pad, y - 60), kicker.upper(), fill=ac, font=font(int(size * 0.32)))
for l in lines: d.text((pad, y), l, fill=fg, font=f); y += int(size * 1.08)
y += 24; sf = font(int(size * 0.4), False)
for l in wrap(sub, sf)[:4]: d.text((pad, y), l, fill=fg, font=sf); y += int(size * 0.55)
im.save(dst, 'JPEG', quality=86)
`
function pilCard(file, story, beat, shape) {
  const b = story.brand || {}, { w, h } = SHAPES[shape]
  try {
    execFileSync('python3', ['-E', '-c', PY_CARD, file, String(w), String(h), b.bg || '#111111', b.text || '#ffffff', b.accent || '#ffffff', beat.kicker || '', beat.headline || '', beat.line || ''], { stdio: 'ignore', timeout: 30000, cwd: tmpdir() })
    return existsSync(file)
  } catch { return false }
}

// Draw every card of a story into outDir (runs/<id>/story/). screens: { [pageId]: { desktop, phone } }
// as URLs (data: or file:). Returns { cards: { tall: [...], wide: [...], square: [...] }, drawn, by }.
// Cards of beats that are gone are deleted.
export async function drawCards(story, { outDir, runDir, screens = {}, dataDir, shapes = Object.keys(SHAPES), timeoutMs = 60000 } = {}) {
  mkdirSync(outDir, { recursive: true })
  const keysFile = join(outDir, 'keys.json')
  let keys = {}
  try { keys = JSON.parse(readFileSync(keysFile, 'utf8')) } catch {}
  const jobs = []
  for (const shape of shapes) for (const beat of story.beats) {
    const pic = pictureUrl(beat, shape, { runDir, screens })
    const name = cardName(shape, beat.id), key = cardKey(story, beat, shape, pic)
    if (keys[name] === key && existsSync(join(outDir, name))) continue
    jobs.push({ shape, beat, pic, name, key })
  }
  const pp = jobs.length ? puppeteer(dataDir) : null
  const chrome = pp ? findChrome() || chromePath() : null
  let by = jobs.length ? 'pil' : 'cache', drawn = 0
  if (pp && chrome) {
    by = 'browser'
    const browser = await pp.launch({ executablePath: chrome, headless: true, env: browserEnv(), args: ['--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', '--disable-gpu-sandbox'] })
    const tmp = join(outDir, '.html')
    mkdirSync(tmp, { recursive: true })
    try {
      const page = await browser.newPage()
      for (const j of jobs) {
        const { w, h } = SHAPES[j.shape]
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
        const html = join(tmp, `${j.shape}-${j.beat.id}.html`)
        writeFileSync(html, cardHtml(story, j.beat, j.shape, j.pic))
        try {
          await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: Math.min(timeoutMs, 20000) })
        } catch {}
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => {})
        await page.screenshot({ path: join(outDir, j.name), type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: w, height: h } })
        keys[j.name] = j.key; drawn++
      }
    } finally {
      await browser.close().catch(() => {})
      rmSync(tmp, { recursive: true, force: true })
    }
  } else {
    for (const j of jobs) if (pilCard(join(outDir, j.name), story, j.beat, j.shape)) { keys[j.name] = j.key; drawn++ }
  }
  // cards of beats that no longer exist
  const want = new Set(shapes.flatMap(s => story.beats.map(b => cardName(s, b.id))))
  for (const f of readdirSync(outDir)) if (/^(tall|wide|square)-b\d+\.jpg$/.test(f) && !want.has(f)) { rmSync(join(outDir, f), { force: true }); delete keys[f] }
  writeFileSync(keysFile, JSON.stringify(keys))
  const cards = Object.fromEntries(shapes.map(s => [s, story.beats.map(b => cardName(s, b.id)).filter(f => existsSync(join(outDir, f)))]))
  return { cards, drawn, by }
}
