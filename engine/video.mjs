// Promo video: one model call turns a finished build into a storyboard (6 or so
// scenes, in the site's own words and pictures), then fixed motion templates in
// the site's theme turn it into a HyperFrames composition (HTML + GSAP), which
// HyperFrames renders to MP4 in headless Chrome.
//
// HyperFrames and ffmpeg are fetched from npm into the plugin's data folder the
// first time a video is made, unless they are already on PATH.

import { spawn, execFile } from 'node:child_process'
import { CAST, MOODS } from './sound.mjs'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, chmodSync, rmSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { streamChat } from './llm.mjs'

const HYPERFRAMES = 'hyperframes@0.9.26'
const W = 1920, H = 1080, FPS = 30
const KINDS = new Set(['open', 'image', 'split', 'list', 'quote', 'cta'])
const LENGTH = { open: 3.2, image: 3.4, split: 3.6, list: 4.2, quote: 3.4, cta: 3.6 }

// Video plans: each one changes what the storyboard writer is asked for, the
// pace, the cut between scenes and the music. A person's own idea rides on top.
export const STYLES = {
  promo: { label: 'Promo', transition: 'wipe', pace: 1, rule: 'A classic promo: brand, best pictures, what is on offer, the invitation.' },
  kinetic: { label: 'Kinetic type', transition: 'flash', pace: 0.8, music: 'snappy', rule: 'Kinetic typography: mostly words, no more than one picture. Use open, quote, list and cta scenes with very short, punchy headlines (2 to 5 words) that hit like a beat. Short voice lines, 4 to 9 words.' },
  slideshow: { label: 'Slideshow', transition: 'fade', pace: 1.2, music: 'gentle', rule: 'A calm photo slideshow: show every picture, each as an image or split scene, with short captions. Unhurried, warm voice lines.' },
  teaser: { label: 'Teaser', transition: 'zoom', pace: 0.9, rule: 'A teaser: only 4 scenes, open first and cta last. Hint, do not explain; build curiosity and hold back details.' },
  story: { label: 'Customer story', transition: 'slide', pace: 1.05, rule: 'A short story told from one customer\'s point of view: their moment before, what they found here, how it felt. Use the second voice for the customer\'s own lines (two or three), the narrator for the rest.' },
}
export const TRANSITIONS = ['wipe', 'fade', 'zoom', 'slide', 'flash']

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const text = html => String(html || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

// ---------- what the build has to say: brand, pages, copy, pictures
export function collect(events, runDir) {
  const start = events.find(e => e.type === 'run:start') || {}
  const theme = events.findLast(e => e.type === 'theme') || {}
  const pages = events.filter(e => e.type === 'page')
  const sections = new Map()
  for (const e of events) if (e.type === 'layer:done' && e.html) sections.set(`${e.page}/${e.layer}`, e)
  const copy = pages.map(p => {
    const lines = []
    for (const [key, s] of sections) {
      if (!key.startsWith(`${p.id}/`)) continue
      const heads = [...s.html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => text(m[1])).filter(Boolean)
      const paras = [...s.html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => text(m[1])).filter(t => t.length > 20)
      if (heads.length || paras.length) lines.push(`  [${s.layer}] ${heads.slice(0, 3).join(' / ')}${paras[0] ? ` — ${clip(paras[0], 140)}` : ''}`)
    }
    return `PAGE ${p.id} "${p.title}": ${p.purpose || ''}\n${lines.slice(0, 8).join('\n')}`
  }).join('\n\n')
  const images = []
  for (const e of events) {
    if (e.type !== 'image' || !e.src) continue
    const file = join(runDir, 'img', e.src.split('/').pop())
    if (existsSync(file) && !images.some(i => i.file === file)) images.push({ n: images.length + 1, gen: clip(e.gen, 160), page: e.page, file })
  }
  const brand = clip((pages[0]?.title || start.brief || 'Our site').split(/\s[—–|:-]\s/)[0], 40)
  return { brief: start.brief || '', agents: start.agents || [], theme, brand, copy: copy.slice(0, 5000), images }
}

// ---------- the storyboard
function storyPrompt(c, { style = 'promo', idea = '' } = {}) {
  return [
    {
      role: 'system',
      content: `You are a motion designer cutting a short promo video for a website a team of AI agents just built. You write the storyboard; fixed animation templates in the site's own theme play it.

Return JSON only:
{"cast":{"narrator":"<voice id>","second":"<voice id, or null>"},"music":"gentle|snappy","scenes":[{"kind":"open|image|split|list|quote|cta","kicker":"tiny label above, 1-3 words","headline":"the big line","sub":"one supporting line","image":1,"items":["...","...","..."],"say":"what is said over this scene","who":"narrator|second"}]}

Scene kinds:
- open: the brand reveal. headline = the brand name; sub = what it is, under 9 words. No image.
- image: a full-screen picture with a short headline over it. Needs "image".
- split: picture on one side, headline and sub on the other. Needs "image".
- list: headline plus exactly 3 short items (2-4 words each): features, steps, or offers from the site.
- quote: one short, punchy line in quotes (a promise or a customer-style line from the site's copy). headline = the quote, under 12 words.
- cta: the closing call to action. headline under 6 words; sub = the action, like "Subscribe at lumeroasters.pt" or "Book your first visit"; kicker can be the brand.

Rules:
- 5 to 7 scenes. First is open, last is cta. Vary the kinds; use each picture at most once and only numbers from the list.
- Use the site's real names, offers and voice. Headlines under 7 words except quotes. No exclamation marks, no emoji, no hashtags.
- "say" is the voiceover, read aloud by a warm narrator: one natural spoken sentence per scene, 5 to 14 words, that adds to the words on screen rather than repeating them. Write numbers and dates the way they are spoken ("March twentieth"). The last scene's line is the invitation.
- Cast the voices to fit the brand, the art direction and the audience: "narrator" reads most lines. A "second" voice is optional: use it for one or two lines that sound like a different person (a customer, a vendor, a host), never for the invitation. Voices:
${Object.entries(CAST).map(([id, d]) => `  ${id}: ${d}`).join('\n')}
- "music": snappy for loud, fast, nightlife, sport or tech brands; gentle for calm, warm, crafted or premium ones.`
    },
    {
      role: 'user',
      content: `Video plan: ${(STYLES[style] || STYLES.promo).rule}${idea ? `\nThe person's own idea for this video (follow it): ${idea}` : ''}\n\nBrand: ${c.brand}\nBrief: ${c.brief}\nArt direction: ${c.theme.direction || ''}\n\nPictures:\n${c.images.map(i => `${i.n}. (${i.page}) ${i.gen}`).join('\n') || 'none'}\n\nThe site:\n${c.copy}`
    }
  ]
}

export function checkStory(raw, c) {
  const used = new Set()
  const scenes = []
  for (const s of raw.scenes || []) {
    let kind = KINDS.has(s.kind) ? s.kind : 'quote'
    let image = Number(s.image)
    if (kind === 'image' || kind === 'split') {
      if (!c.images.some(i => i.n === image) || used.has(image)) kind = 'quote'
      else used.add(image)
    }
    const scene = { kind, kicker: clip(s.kicker, 28), headline: clip(s.headline, kind === 'quote' ? 90 : 56), sub: clip(s.sub, 90), say: clip(s.say, 140), who: s.who === 'second' ? 'second' : 'narrator' }
    if (kind === 'image' || kind === 'split') scene.image = image
    if (kind === 'list') {
      scene.items = (Array.isArray(s.items) ? s.items : []).map(x => clip(x, 32)).filter(Boolean).slice(0, 3)
      if (scene.items.length < 2) scene.kind = 'quote'
    }
    if (scene.headline) scenes.push(scene)
  }
  if (scenes[0]?.kind !== 'open') scenes.unshift({ kind: 'open', kicker: '', headline: c.brand, sub: clip(c.brief, 60) })
  if (scenes.at(-1)?.kind !== 'cta') scenes.push({ kind: 'cta', kicker: c.brand, headline: 'Come and see', sub: 'Visit the site' })
  const out = scenes.slice(0, 8)
  // who reads what: voice ids the model picked, kept only if they exist
  const narrator = CAST[raw.cast?.narrator] ? raw.cast.narrator : null
  const second = CAST[raw.cast?.second] && raw.cast.second !== narrator ? raw.cast.second : null
  out.cast = { narrator, second }
  out.music = MOODS.includes(raw.music) ? raw.music : null
  return out
}

// Without a model: brand, each picture with its page title, a closing card.
export function fallbackStory(c) {
  const titles = c.copy.match(/^PAGE \S+ "([^"]+)"/gm)?.map(l => l.replace(/^PAGE \S+ "|"$/g, '').split(/\s[—–|:-]\s/).pop()) || []
  const scenes = [{ kind: 'open', kicker: '', headline: c.brand, sub: clip(c.brief, 60) }]
  c.images.slice(0, 3).forEach((img, i) => scenes.push({ kind: i % 2 ? 'split' : 'image', kicker: c.brand, headline: clip(titles[i + 1] || titles[0] || c.brand, 40), sub: '', image: img.n }))
  if (titles.length > 2) scenes.push({ kind: 'list', kicker: 'Inside', headline: c.brand, sub: '', items: titles.slice(1, 4).map(t => clip(t, 30)) })
  scenes.push({ kind: 'cta', kicker: c.brand, headline: 'Come and see', sub: 'Visit the site' })
  // without a writer, the narrator reads what is on screen
  for (const x of scenes) x.say = clip([x.headline, x.sub].filter(Boolean).join('. '), 140)
  return scenes
}

export async function writeStory({ provider, model, c, signal, style, idea }) {
  const res = await streamChat(provider, { model, messages: storyPrompt(c, { style, idea }), maxTokens: 1500, temperature: 0.7, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal })
  const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
  if (s < 0 || e <= s) throw new Error('no JSON in the storyboard')
  const scenes = checkStory(JSON.parse(res.text.slice(s, e + 1)), c)
  if (scenes.length < 3) throw new Error('the storyboard was too thin')
  return scenes
}

// ---------- the composition: one HTML file HyperFrames can render
const words = (s, cls = 'w') => esc(s).split(' ').map(w => `<span class="${cls}"><span>${w}</span></span>`).join(' ')
const size = (s, big) => { const n = s.length; return big ? (n <= 14 ? 190 : n <= 24 ? 150 : 118) : (n <= 20 ? 128 : n <= 36 ? 104 : 84) }

// Scene lengths: the template's own, stretched to fit a voiceover line when there is one.
export const sceneLength = (s, voice, pace = 1) => Math.max(Number((LENGTH[s.kind] * pace).toFixed(2)), voice ? Number((voice + 0.9).toFixed(2)) : 0)
export const VOICE_LEAD = 0.35

export function composition(scenes, c, lengths = [], transition = 'wipe') {
  const v = { '--background': '#f7f3ec', '--foreground': '#1b1714', '--primary': '#b4472a', '--primary-foreground': '#fff', '--muted': '#ece4d8', '--muted-foreground': '#6e5b4c', '--accent': '#1f5871', '--card': '#fffbf3', ...(c.theme.vars || {}) }
  const heading = c.theme.fonts?.heading || 'Fraunces', body = c.theme.fonts?.body || 'Inter'
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;600;700`
  const img = n => c.images.find(i => i.n === n)
  let t = 0, splits = 0
  const html = [], tl = []
  scenes.forEach((s, i) => {
    const d = lengths[i] || LENGTH[s.kind], id = `s${i}`, at = x => (t + x).toFixed(2)
    const kicker = s.kicker ? `<div class="kicker" id="${id}k">${esc(s.kicker)}</div>` : ''
    const enter = (sel, from, x, extra = '') => tl.push(`tl.fromTo('${sel}', ${from}, {opacity:1, x:0, y:0, scale:1, duration:.8, ease:'power3.out'${extra}}, ${at(x)})`)
    const rise = (x) => tl.push(`tl.fromTo('#${id} .w > span', {y:'110%'}, {y:'0%', duration:.75, ease:'power4.out', stagger:.07}, ${at(x)})`)
    if (s.kind === 'open') {
      html.push(`<div id="${id}" class="clip scene center" data-start="${t}" data-duration="${d}">${kicker}<h1 class="head" style="font-size:${size(s.headline, true)}px">${words(s.headline)}</h1><div class="rule" id="${id}r"></div><p class="sub" id="${id}s">${esc(s.sub)}</p></div>`)
      rise(0.25)
      tl.push(`tl.fromTo('#${id}r', {scaleX:0}, {scaleX:1, duration:.9, ease:'power2.inOut'}, ${at(0.9)})`)
      enter(`#${id}s`, '{opacity:0, y:30}', 1.2)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.1)
    } else if (s.kind === 'image') {
      html.push(`<div id="${id}" class="clip scene" data-start="${t}" data-duration="${d}"><img id="${id}i" class="full" src="${img(s.image).name}"><div class="shade"></div><div class="over">${kicker}<h2 class="head light" style="font-size:${size(s.headline)}px">${words(s.headline)}</h2>${s.sub ? `<p class="sub light" id="${id}s">${esc(s.sub)}</p>` : ''}</div></div>`)
      tl.push(`tl.fromTo('#${id}i', {scale:1.18}, {scale:1, duration:${d + 0.4}, ease:'none'}, ${at(0)})`)
      rise(0.45)
      if (kicker) enter(`#${id}k`, '{opacity:0, x:-30}', 0.3)
      if (s.sub) enter(`#${id}s`, '{opacity:0, y:24}', 1.1)
    } else if (s.kind === 'split') {
      const left = splits++ % 2 === 1
      html.push(`<div id="${id}" class="clip scene split${left ? ' flip' : ''}" data-start="${t}" data-duration="${d}"><div class="pic" id="${id}p"><img id="${id}i" src="${img(s.image).name}"></div><div class="copy">${kicker}<h2 class="head" style="font-size:${size(s.headline) * 0.82 | 0}px">${words(s.headline)}</h2>${s.sub ? `<p class="sub" id="${id}s">${esc(s.sub)}</p>` : ''}</div></div>`)
      tl.push(`tl.fromTo('#${id}p', {width:0}, {width:${W / 2}, duration:1, ease:'power3.inOut'}, ${at(0.05)})`)
      tl.push(`tl.fromTo('#${id}i', {scale:1.25}, {scale:1.02, duration:${d}, ease:'power1.out'}, ${at(0)})`)
      rise(0.6)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.5)
      if (s.sub) enter(`#${id}s`, '{opacity:0, y:24}', 1.3)
    } else if (s.kind === 'list') {
      html.push(`<div id="${id}" class="clip scene list" data-start="${t}" data-duration="${d}"><div class="copy">${kicker}<h2 class="head" style="font-size:${size(s.headline)}px">${words(s.headline)}</h2></div><ol>${s.items.map((x, j) => `<li id="${id}l${j}"><b>0${j + 1}</b>${esc(x)}</li>`).join('')}</ol></div>`)
      rise(0.2)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.1)
      s.items.forEach((_, j) => enter(`#${id}l${j}`, '{opacity:0, x:80}', 0.9 + j * 0.35))
    } else if (s.kind === 'quote') {
      html.push(`<div id="${id}" class="clip scene center tint" data-start="${t}" data-duration="${d}"><div class="mark" id="${id}m">“</div><h2 class="head quote" style="font-size:${size(s.headline) * 0.85 | 0}px">${words(s.headline)}</h2>${kicker ? `<div class="kicker" id="${id}k">— ${esc(s.kicker)}</div>` : ''}</div>`)
      enter(`#${id}m`, '{opacity:0, scale:.4}', 0.1, ", ease:'back.out(2)'")
      tl.push(`tl.fromTo('#${id} .w > span', {y:'110%'}, {y:'0%', duration:.6, ease:'power3.out', stagger:.05}, ${at(0.35)})`)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:20}', 1.4)
    } else {
      html.push(`<div id="${id}" class="clip scene center cta" data-start="${t}" data-duration="${d}">${kicker}<h2 class="head" style="font-size:${size(s.headline, true) * 0.8 | 0}px">${words(s.headline)}</h2>${s.sub ? `<div class="btn" id="${id}b">${esc(s.sub)}</div>` : ''}</div>`)
      rise(0.3)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.2)
      if (s.sub) enter(`#${id}b`, '{opacity:0, scale:.6}', 1.1, ", ease:'back.out(1.8)'")
    }
    // the cut into this scene
    if (i > 0) {
      if (transition === 'wipe') tl.push(`tl.fromTo('#wipe', {x:-${W}}, {x:${W}, duration:.7, ease:'power2.inOut'}, ${(t - 0.35).toFixed(2)})`)
      else if (transition === 'fade') tl.push(`tl.fromTo('#${id}', {opacity:0}, {opacity:1, duration:.7, ease:'power1.inOut'}, ${t.toFixed(2)})`)
      else if (transition === 'zoom') tl.push(`tl.fromTo('#${id}', {opacity:0, scale:1.22}, {opacity:1, scale:1, duration:.6, ease:'power3.out'}, ${t.toFixed(2)})`)
      else if (transition === 'slide') tl.push(`tl.fromTo('#${id}', {x:${W}}, {x:0, duration:.7, ease:'power3.inOut'}, ${t.toFixed(2)})`)
      else if (transition === 'flash') tl.push(`tl.fromTo('#wipe', {x:0, opacity:.95}, {x:0, opacity:0, duration:.35, ease:'power2.out', immediateRender:false}, ${t.toFixed(2)})`)
    }
    t += d
  })
  const total = Number(t.toFixed(2))
  return {
    seconds: total,
    html: `<!doctype html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam(heading)}&${fam(body)}&display=block">
<style>
:root{${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';')};--fh:'${heading}',Georgia,serif;--fb:'${body}',system-ui,sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--background);color:var(--foreground);font-family:var(--fb)}
.scene{position:absolute;inset:0;overflow:hidden;background:var(--background)}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 160px}
.head{font-family:var(--fh);font-weight:600;line-height:1.02;letter-spacing:-.02em;max-width:1500px}
.w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em}.w>span{display:inline-block}
.kicker{font:700 26px/1 var(--fb);letter-spacing:.22em;text-transform:uppercase;color:var(--primary);margin-bottom:36px}
.sub{font-size:40px;line-height:1.35;color:var(--muted-foreground);margin-top:34px;max-width:1100px}
.rule{width:220px;height:6px;background:var(--primary);margin-top:44px;transform-origin:left center;border-radius:3px}
.full{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.72))}
.over{position:absolute;left:140px;right:140px;bottom:130px}
.light{color:#fff}.over .kicker{color:#fff;opacity:.9}.sub.light{color:rgba(255,255,255,.88)}
.split .pic{position:absolute;top:0;bottom:0;right:0;width:${W / 2}px;overflow:hidden}.split.flip .pic{right:auto;left:0}
.split .pic img{width:${W / 2}px;height:100%;object-fit:cover}
.split .copy{position:absolute;top:0;bottom:0;left:130px;width:${W / 2 - 230}px;display:flex;flex-direction:column;justify-content:center}
.split.flip .copy{left:auto;right:130px}
.list .copy{position:absolute;left:140px;top:150px;right:140px}
.list ol{position:absolute;left:140px;right:140px;bottom:140px;list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
.list li{background:var(--card);border-top:6px solid var(--primary);border-radius:var(--radius,12px);padding:44px 40px;font:600 46px/1.15 var(--fh)}
.list li b{display:block;font:700 24px/1 var(--fb);letter-spacing:.16em;color:var(--accent);margin-bottom:22px}
.tint{background:var(--muted)}
.mark{font:700 260px/0.7 var(--fh);color:var(--primary);height:150px}
.quote{font-style:italic}
.cta{background:var(--primary)}.cta .head{color:var(--primary-foreground)}.cta .kicker{color:var(--primary-foreground);opacity:.8}
.btn{margin-top:60px;background:var(--primary-foreground);color:var(--primary);font:700 40px/1 var(--fb);padding:34px 64px;border-radius:999px}
#wipe{position:absolute;top:0;left:0;width:${W}px;height:${H}px;background:var(--primary);z-index:10;transform:translateX(-${W}px)${transition === 'flash' ? ';opacity:0' : ''}}
</style></head><body>
<div id="root" data-composition-id="promo" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
${html.join('\n')}
<div id="wipe" class="clip" data-start="0" data-duration="${total}"></div>
</div>
<script>
window.__timelines = window.__timelines || {}
const tl = gsap.timeline({ paused: true })
${tl.join('\n')}
window.__timelines.promo = tl
</script>
</body></html>
`
  }
}

// ---------- the renderer: HyperFrames plus ffmpeg, set up once
let tools = null
const run = (cmd, args, opts = {}) => new Promise((ok, fail) => execFile(cmd, args, { maxBuffer: 1 << 24, ...opts }, (err, out) => (err ? fail(err) : ok(out))))
const which = name => run('/usr/bin/which', [name]).then(p => p.trim()).catch(() => '')

export function videoTools(dataDir, onStage = () => {}) {
  return (tools ||= (async () => {
    const dir = join(dataDir, 'video-tools'), bin = join(dir, 'bin')
    const hf = join(dir, 'node_modules', '.bin', 'hyperframes')
    let ffmpeg = await which('ffmpeg'), ffprobe = await which('ffprobe')
    if (!existsSync(hf) || ((!ffmpeg || !ffprobe) && !existsSync(join(bin, 'ffprobe')))) {
      onStage('setting up the video renderer (first time only)')
      mkdirSync(dir, { recursive: true })
      if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{"private":true}\n')
      const npm = [join(dirname(process.execPath), 'npm'), 'npm'].find(p => p === 'npm' || existsSync(p))
      await run(npm, ['install', '--no-audit', '--no-fund', HYPERFRAMES, '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'], { cwd: dir, timeout: 600000 })
    }
    if (!ffmpeg || !ffprobe) {
      const req = createRequire(join(dir, 'package.json'))
      mkdirSync(bin, { recursive: true })
      for (const [name, pkg] of [['ffmpeg', '@ffmpeg-installer/ffmpeg'], ['ffprobe', '@ffprobe-installer/ffprobe']]) {
        const target = req(pkg).path, link = join(bin, name)
        chmodSync(target, 0o755) // npm may skip the package's own chmod script
        rmSync(link, { force: true })
        symlinkSync(target, link)
      }
    }
    return { hf, path: `${bin}:${process.env.PATH || '/usr/bin:/bin'}`, ffmpeg: ffmpeg || join(bin, 'ffmpeg') }
  })().catch(err => { tools = null; throw err }))
}

export function render({ tools: t, dir, out, quality = 'draft', onProgress = () => {}, signal }) {
  return new Promise((ok, fail) => {
    const child = spawn(t.hf, ['render', dir, '-o', out, '-q', quality, '-f', String(FPS)], { env: { ...process.env, PATH: t.path, HYPERFRAMES_SKIP_SKILLS: '1', NO_COLOR: '1' }, signal })
    let tail = ''
    const read = chunk => {
      const s = chunk.toString()
      tail = (tail + s).slice(-2000)
      for (const m of s.matchAll(/@hf-progress (\{.*\})/g)) {
        try { const p = JSON.parse(m[1]); onProgress(p.pct, p.code) } catch {}
      }
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', fail)
    child.on('close', code => (code === 0 && existsSync(out) ? ok() : fail(new Error(`render failed (${code}): ${tail.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter(l => /error|✗|fail/i.test(l)).slice(-3).join(' ') || 'see the run folder'}`))))
  })
}

// Copy the pictures next to the composition, named the way the composition uses them.
export function stagePictures(c, dir) {
  for (const i of c.images) {
    i.name = `p${i.n}${extname(i.file)}`
    copyFileSync(i.file, join(dir, i.name))
  }
}
