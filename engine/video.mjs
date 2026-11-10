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
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, symlinkSync, chmodSync, rmSync } from 'node:fs'
import { dirname, join, extname, basename } from 'node:path'
import { streamChat } from './llm.mjs'
import { checkLook, lookPrompt, lookCss, paletteVars, paletteCss, textureLayer, revealTween, cutTween, cutLayer, cutCss, rng, hash, MOTIONS, CUTS } from './look.mjs'

const HYPERFRAMES = 'hyperframes@0.9.26'
const FPS = 30
// The film's shapes: the wide one for desktop and the tall one for phones, from the same storyboard.
// The tall one is laid out again for its frame (stacked pictures and words), not cropped.
export const SHAPES = { wide: { W: 1920, H: 1080, file: 'promo.mp4' }, tall: { W: 1080, H: 1920, file: 'promo-tall.mp4' } }
const KINDS = new Set(['open', 'image', 'split', 'list', 'quote', 'cta', 'stat', 'mosaic', 'clip', 'title', 'black'])
const LENGTH = { open: 3.2, image: 3.4, split: 3.6, list: 4.2, quote: 3.4, cta: 3.6, stat: 3.2, mosaic: 3.8, clip: 4.4, title: 1.6, black: 1 }

// Video plans: each one changes what the storyboard writer is asked for, the
// pace, the cut between scenes and the music. A person's own idea rides on top.
export const STYLES = {
  promo: { label: 'Promo', transition: 'wipe', pace: 1, rule: 'A classic promo: brand, best pictures, what is on offer, the invitation.' },
  kinetic: { label: 'Kinetic type', transition: 'flash', pace: 0.8, music: 'snappy', rule: 'Kinetic typography: mostly words, no more than one picture. Use open, quote, list and cta scenes with very short, punchy headlines (2 to 5 words) that hit like a beat. Short voice lines, 4 to 9 words.' },
  slideshow: { label: 'Slideshow', transition: 'fade', pace: 1.2, music: 'gentle', rule: 'A calm photo slideshow: show every picture, each as an image or split scene, with short captions. Unhurried, warm voice lines.' },
  teaser: { label: 'Teaser', transition: 'zoom', pace: 0.9, rule: 'A teaser: only 4 scenes, open first and cta last. Hint, do not explain; build curiosity and hold back details.' },
  story: { label: 'Customer story', transition: 'slide', pace: 1.05, rule: 'A short story told from one customer\'s point of view: their moment before, what they found here, how it felt. Use the second voice for the customer\'s own lines (two or three), the narrator for the rest.' },
}
export const TRANSITIONS = CUTS

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
  // footage recorded from the running app (gameplay, a scroll through the site), when there is some
  const clips = []
  try {
    for (const f of JSON.parse(readFileSync(join(runDir, 'footage', 'footage.json'), 'utf8')).clips || []) {
      const file = join(runDir, 'footage', basename(String(f.file || '')))
      if (f.file && existsSync(file)) clips.push({ n: clips.length + 1, what: clip(f.what, 160), label: clip(f.label, 20), seconds: Number(f.seconds) || 0, from: Number(f.from) || 0, file })
    }
  } catch {}
  return { brief: start.brief || '', agents: start.agents || [], theme, brand, copy: copy.slice(0, 5000), images, clips }
}

// ---------- the storyboard
function storyPrompt(c, { style = 'promo', idea = '', shots = false, seed = 0 } = {}) {
  const clips = c.clips || []
  return [
    {
      role: 'system',
      content: `You are a motion designer cutting a short promo video for a website a team of AI agents just built. You write the storyboard and its art direction; animation templates in the site's own colours play it. Every video you make should feel designed for this one build: pick a look, a rhythm and a scene order that fit it, and never fall back on the same safe layout every time.

Return JSON only:
{"look":{...},"cast":{"narrator":"<voice id>","second":"<voice id, or null>"},"music":"gentle|snappy","scenes":[{"kind":"open|image|split|mosaic|list|stat|quote${clips.length ? '|clip' : ''}|cta","kicker":"tiny label above, 1-3 words","headline":"the big line","sub":"one supporting line","image":1,"images":[1,2,3],${shots ? '"shot":"a new picture to make for this scene",' : ''}${clips.length ? '"clip":1,"from":0,' : ''}"items":["...","...","..."],"say":"what is said over this scene","who":"narrator|second"}],"fx":["sparkle|stars|fireworks|breeze|confetti|snow"]}

${lookPrompt()}

Scene kinds:
- open: the brand reveal. headline = the brand name; sub = what it is, under 9 words. No image.
- image: a full-screen picture with a short headline over it. Needs "image"${shots ? ' or "shot"' : ''}.
- split: picture on one side, headline and sub on the other. Needs "image"${shots ? ' or "shot"' : ''}.
- mosaic: 2 or 3 pictures side by side with one short headline. Needs "images" (numbers from the list).
- stat: one big number that is really on the site (a price, a count, a year, a distance), as the headline ("26", "$12", "4.9"); sub says what it counts. Skip it if the site has no real number.${clips.length ? `
- clip: real footage recorded from the running build (see Footage), with a short headline over it. Needs "clip" (a number from the Footage list) and optional "from" (seconds into the footage). Use every clip once; gameplay footage is the strongest proof the thing is real, so give it a scene of its own after the open.` : ''}
- list: headline plus exactly 3 short items (2-4 words each): features, steps, or offers from the site.
- quote: one short, punchy line in quotes (a promise or a customer-style line from the site's copy). headline = the quote, under 12 words.
- cta: the closing call to action. headline under 6 words; sub = the action, like "Subscribe at lumeroasters.pt" or "Book your first visit"; kicker can be the brand.

Rules:
- If the person gives an idea, it leads: its places, people, moments and mood come first and replace the site's own examples where they differ (if they say Hawaii, the video is about Hawaii, not other routes from the site). The site still gives the brand name, the offer and the call to action.${shots ? `
- "shot": a new picture made for this video, for an image or split scene, instead of "image". Use shots for what the idea asks to see that no listed picture shows (a plane in flight, a person on a beach), and to give a site with few pictures some: 2 to 4 shots, each a concrete photo description under 30 words (subject, place, light, mood, camera) with the brand's colours in the light or setting. A real scene, never a website, app, screen, sign or logo, and no brand names in it.` : ''}
- 5 to 8 scenes. First is open, last is cta. Vary the kinds; use each picture at most once and only numbers from the list.
- Use the site's real names, offers and voice. Headlines under 7 words except quotes. No exclamation marks, no emoji, no hashtags.
- "say" is the voiceover, read aloud by a warm narrator: one natural spoken sentence per scene, 5 to 14 words, that adds to the words on screen rather than repeating them. Write numbers and dates the way they are spoken ("March twentieth"). The last scene's line is the invitation.
- Cast the voices to fit the brand, the art direction and the audience: "narrator" reads most lines. A "second" voice is optional: use it for one or two lines that sound like a different person (a customer, a vendor, a host), never for the invitation. Voices:
${Object.entries(CAST).map(([id, d]) => `  ${id}: ${d}`).join('\n')}
- "music": snappy for loud, fast, nightlife, sport or tech brands; gentle for calm, warm, crafted or premium ones.
- "fx": effects drawn over the whole video: sparkle (twinkling glints), stars (a starfield), fireworks (bursts), breeze (drifting streaks of light), confetti, snow. Use the ones the person's idea asks for (up to 4); with no idea, pick at most one that fits the brand, or none.`
    },
    {
      role: 'user',
      content: `${idea ? `The person's idea for this video (it leads; follow it closely): ${idea}\n\n` : ''}${style === 'auto' ? 'Video plan: your choice. Pick the shape that suits this build best (a promo, kinetic type, a teaser, a story, a slideshow) and say which in "plan".' : `Video plan: ${(STYLES[style] || STYLES.promo).rule}`}\nVariation seed ${seed}: let it push you off the first idea that comes to mind (a different layout family, opening or rhythm than the obvious one).\n\nBrand: ${c.brand}\nBrief: ${c.brief}\nArt direction: ${c.theme.direction || ''}\n\nPictures:\n${c.images.map(i => `${i.n}. (${i.page}) ${i.gen}`).join('\n') || 'none'}${clips.length ? `\n\nFootage:\n${clips.map(x => `${x.n}. ${x.what} (${x.seconds.toFixed(0)} s)`).join('\n')}` : ''}\n\nThe site:\n${c.copy}`
    }
  ]
}

export function checkStory(raw, c, { shots = false, seed = Date.now() } = {}) {
  const used = new Set(), usedClips = new Set()
  let shot = 0
  const scenes = []
  for (const s of raw.scenes || []) {
    let kind = KINDS.has(s.kind) ? s.kind : 'quote'
    let image = Number(s.image)
    if (kind === 'image' || kind === 'split') {
      const fresh = shots && !c.images.some(i => i.n === image) && clip(s.shot, 220)
      if (fresh && shot < 4) shot++
      else if (!c.images.some(i => i.n === image) || used.has(image)) kind = 'quote'
      else used.add(image)
      if (fresh && kind !== 'quote') image = 0
    }
    const scene = { kind, kicker: clip(s.kicker, 28), headline: clip(s.headline, kind === 'quote' ? 90 : 56), sub: clip(s.sub, 90), say: clip(s.say, 140), who: s.who === 'second' ? 'second' : 'narrator' }
    if (kind === 'image' || kind === 'split') { if (image) scene.image = image; else scene.shot = clip(s.shot, 220) }
    if (kind === 'mosaic') {
      scene.images = [...new Set((Array.isArray(s.images) ? s.images : []).map(Number))].filter(n => c.images.some(i => i.n === n) && !used.has(n)).slice(0, 3)
      if (scene.images.length < 2) scene.kind = 'quote'
      else scene.images.forEach(n => used.add(n))
    }
    if (kind === 'stat' && !/\d/.test(scene.headline)) scene.kind = 'quote'
    if (kind === 'clip') {
      const n = Number(s.clip)
      if ((c.clips || []).some(x => x.n === n) && !usedClips.has(n)) { usedClips.add(n); scene.clip = n; scene.from = Math.max(0, Number(s.from) || 0) }
      else scene.kind = 'quote'
    }
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
  out.fx = (Array.isArray(raw.fx) ? raw.fx : []).filter(f => FX[f])
  out.look = checkLook(raw.look || {}, seed)
  if (STYLES[raw.plan]) out.plan = raw.plan
  // footage the writer forgot still makes the cut, right after the open
  for (const x of c.clips || []) if (!usedClips.has(x.n) && out.length < 9) out.splice(1, 0, { kind: 'clip', clip: x.n, from: x.from || 0, kicker: x.label || 'Live', headline: clip(x.what.split(/[.,;]/)[0], 40) || 'See it live', sub: '', say: '', who: 'narrator' })
  return out
}

// Without a model: brand, each picture with its page title, a closing card.
export function fallbackStory(c, seed = Date.now()) {
  const titles = c.copy.match(/^PAGE \S+ "([^"]+)"/gm)?.map(l => l.replace(/^PAGE \S+ "|"$/g, '').split(/\s[—–|:-]\s/).pop()) || []
  const scenes = [{ kind: 'open', kicker: '', headline: c.brand, sub: clip(c.brief, 60) }]
  c.images.slice(0, 3).forEach((img, i) => scenes.push({ kind: i % 2 ? 'split' : 'image', kicker: c.brand, headline: clip(titles[i + 1] || titles[0] || c.brand, 40), sub: '', image: img.n }))
  if (titles.length > 2) scenes.push({ kind: 'list', kicker: 'Inside', headline: c.brand, sub: '', items: titles.slice(1, 4).map(t => clip(t, 30)) })
  for (const x of c.clips || []) scenes.splice(1, 0, { kind: 'clip', clip: x.n, from: x.from || 0, kicker: x.label || 'Live', headline: clip(x.what.split(/[.,;]/)[0], 40) || 'See it live', sub: '' })
  scenes.push({ kind: 'cta', kicker: c.brand, headline: 'Come and see', sub: 'Visit the site' })
  scenes.look = checkLook({}, seed)
  // without a writer, the narrator reads what is on screen
  for (const x of scenes) x.say = clip([x.headline, x.sub].filter(Boolean).join('. '), 140)
  return scenes
}

export async function writeStory({ provider, model, c, signal, style, idea, shots = false, seed = Date.now() }) {
  const res = await streamChat(provider, { trace: { kind: 'video' }, model, messages: storyPrompt(c, { style, idea, shots, seed: seed % 1000 }), maxTokens: 2200, temperature: 0.95, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal })
  const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
  if (s < 0 || e <= s) throw new Error('no JSON in the storyboard')
  const scenes = checkStory(JSON.parse(res.text.slice(s, e + 1)), c, { shots, seed })
  if (scenes.length < 3) throw new Error('the storyboard was too thin')
  return scenes
}

// ---------- effects over the whole video
// The person's words turn effects on directly, so "sparkly with fireworks"
// always shows sparkles and fireworks, whatever the storyboard writer chose.
const FX = {
  sparkle: /sparkl|glitter|shimmer|shin|glint|magic/i,
  stars: /\bstar|night sky|galax|cosmic|twinkl/i,
  fireworks: /firework|celebrat|explo|burst/i,
  breeze: /breez|wind|drift|float|petal|airy/i,
  confetti: /confetti|party/i,
  snow: /snow|winter|frost/i
}
export const fxFor = (picked = [], idea = '') => [...new Set([...Object.keys(FX).filter(f => FX[f].test(idea)), ...picked.filter(f => FX[f])])].slice(0, 4)

function fxLayer(fx, total, v, W, H) {
  if (!fx?.length) return { html: '', tl: [] }
  let seed = 7
  const r = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647) }
  const colors = [v['--primary'], v['--accent'], '#ffffff', '#ffd76a'].filter(Boolean)
  const pick = () => colors[Math.floor(r(0, colors.length))]
  const html = [], tl = []
  let n = 0
  const el = (cls, style) => { const id = `fx${n++}`; html.push(`<i id="${id}" class="${cls}" style="${style}"></i>`); return `#${id}` }
  // never a negative position: GSAP would shift the whole timeline (and every scene) later
  const reps = d => Math.max(0, Math.ceil(total / d) - 1)
  if (fx.includes('stars')) for (let i = 0; i < 90; i++) {
    const z = r(2, 6), d = r(0.7, 2.2)
    const id = el('fx-dot', `left:${r(0, W)}px;top:${r(0, H)}px;width:${z}px;height:${z}px;background:#fff;box-shadow:0 0 ${z * 3}px #fff`)
    tl.push(`tl.fromTo('${id}', {opacity:.15}, {opacity:${r(0.6, 1).toFixed(2)}, duration:${d.toFixed(2)}, ease:'sine.inOut', yoyo:true, repeat:${reps(d)}}, ${r(0, 1).toFixed(2)})`)
    tl.push(`tl.fromTo('${id}', {y:0}, {y:${-r(20, 90) | 0}, duration:${total}, ease:'none'}, 0)`)
  }
  if (fx.includes('sparkle')) for (let i = 0; i < 26; i++) {
    const z = r(26, 70), d = r(1.4, 2.6), c = pick()
    const id = el('fx-glint', `left:${r(60, W - 60)}px;top:${r(60, H - 60)}px;width:${z}px;height:${z}px;background:${c};filter:drop-shadow(0 0 ${z / 3 | 0}px ${c})`)
    tl.push(`tl.fromTo('${id}', {scale:0, rotation:0, opacity:1}, {scale:1, rotation:90, duration:${(d / 2).toFixed(2)}, ease:'sine.inOut', yoyo:true, repeat:${reps(d / 2)}, repeatDelay:${r(0, 0.8).toFixed(2)}}, ${r(0, 2.5).toFixed(2)})`)
  }
  if (fx.includes('fireworks')) for (let t = 0.8; t < total - 0.5; t += r(2.2, 3.6)) {
    const cx = r(W * 0.15, W * 0.85), cy = r(H * 0.12, H * 0.5), c = pick(), rad = r(180, 320)
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + r(0, 0.2), z = r(9, 15)
      const id = el('fx-dot', `left:${cx}px;top:${cy}px;width:${z}px;height:${z}px;background:${c};box-shadow:0 0 ${z * 2}px ${z / 2 | 0}px ${c};opacity:0`)
      // fly out fast, stay bright, fade at the end
      tl.push(`tl.set('${id}', {opacity:1}, ${t.toFixed(2)})`)
      tl.push(`tl.fromTo('${id}', {x:0, y:0, scale:1}, {x:${(Math.cos(a) * rad) | 0}, y:${(Math.sin(a) * rad + 90) | 0}, scale:.4, duration:1.7, ease:'power3.out', immediateRender:false}, ${t.toFixed(2)})`)
      tl.push(`tl.fromTo('${id}', {opacity:1}, {opacity:0, duration:.7, ease:'power1.in', immediateRender:false}, ${(t + 1).toFixed(2)})`)
    }
    const id = el('fx-dot', `left:${cx}px;top:${cy}px;width:40px;height:40px;margin:-20px 0 0 -20px;background:#fff;box-shadow:0 0 80px 30px ${c};opacity:0`)
    tl.push(`tl.fromTo('${id}', {opacity:1, scale:.4}, {opacity:0, scale:1.6, duration:.5, ease:'power2.out', immediateRender:false}, ${t.toFixed(2)})`)
  }
  if (fx.includes('breeze')) for (let i = 0; i < 16; i++) {
    const w = r(160, 420), d = r(3.5, 6.5), y = r(0, H)
    const id = el('fx-streak', `left:-${w | 0}px;top:${y}px;width:${w}px;opacity:${r(0.25, 0.6).toFixed(2)}`)
    tl.push(`tl.fromTo('${id}', {x:0, y:0}, {x:${W + w + 200 | 0}, y:${-r(30, 140) | 0}, duration:${d.toFixed(2)}, ease:'sine.inOut', repeat:${reps(d)}}, ${r(0, Math.min(d, 2)).toFixed(2)})`)
  }
  for (const [name, count, fall] of [['confetti', 70, 1], ['snow', 80, 0]]) if (fx.includes(name)) for (let i = 0; i < count; i++) {
    const d = r(3, 7), z = fall ? r(10, 18) : r(5, 12)
    const id = el(fall ? 'fx-bit' : 'fx-dot', `left:${r(0, W)}px;top:-40px;width:${z}px;height:${fall ? z * 0.5 : z}px;background:${fall ? pick() : '#fff'}${fall ? '' : ';opacity:.8'}`)
    tl.push(`tl.fromTo('${id}', {y:0, x:0, rotation:0}, {y:${H + 80}, x:${r(-160, 160) | 0}, rotation:${fall ? r(-540, 540) | 0 : 0}, duration:${d.toFixed(2)}, ease:'none', repeat:${reps(d)}}, ${r(0, Math.min(d, 2)).toFixed(2)})`)
  }
  return { html: `<div id="fx" class="clip" data-start="0" data-duration="${total}">${html.join('')}</div>`, tl }
}

// ---------- the composition: one HTML file HyperFrames can render
const words = (s, cls = 'w', accent = '') => esc(s).split(' ').map(w => `<span class="${cls}${accent && w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === accent ? ' acc' : ''}"><span>${w}</span></span>`).join(' ')
const accentOf = s => String(s.accent || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// The camera on a beat's picture or footage: the storyboard's move, over the beat's length.
export const CAMERA_MOVES = ['push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'punch-in', 'drift', 'shake', 'hold']
export function cameraTween(sel, move, at, d, seed = 1) {
  const D = (d + 0.4).toFixed(2), A = Number(at).toFixed(2)
  const go = (from, to, ease = 'none') => [`tl.fromTo('${sel}', ${from}, {${to}, duration:${D}, ease:'${ease}'}, ${A})`]
  switch (move) {
    case 'pull-out': return go('{scale:1.24}', 'scale:1.02')
    case 'pan-left': return go('{scale:1.2, xPercent:5}', 'scale:1.2, xPercent:-5', 'sine.inOut')
    case 'pan-right': return go('{scale:1.2, xPercent:-5}', 'scale:1.2, xPercent:5', 'sine.inOut')
    case 'tilt-up': return go('{scale:1.2, yPercent:5}', 'scale:1.2, yPercent:-5', 'sine.inOut')
    case 'tilt-down': return go('{scale:1.2, yPercent:-5}', 'scale:1.2, yPercent:5', 'sine.inOut')
    case 'drift': return go('{scale:1.12, x:-24, y:12}', 'scale:1.16, x:24, y:-12', 'sine.inOut')
    case 'hold': return [`tl.set('${sel}', {scale:1.04}, ${A})`]
    case 'punch-in': return [
      `tl.fromTo('${sel}', {scale:1.02}, {scale:1.3, duration:.16, ease:'power4.out'}, ${A})`,
      `tl.fromTo('${sel}', {scale:1.3}, {scale:1.38, duration:${Math.max(0.2, d - 0.1).toFixed(2)}, ease:'none', immediateRender:false}, ${(Number(at) + 0.16).toFixed(2)})`,
    ]
    case 'shake': {
      let x = (Number(seed) >>> 0) % 2147483646 + 1
      const r = () => ((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1
      const steps = Math.max(4, Math.round(d / 0.09))
      return [`tl.set('${sel}', {scale:1.14}, ${A})`, `tl.to('${sel}', {keyframes:[${Array.from({ length: steps }, () => `{x:${(r() * 14) | 0}, y:${(r() * 9) | 0}, rotation:${(r() * 0.6).toFixed(2)}}`).join(',')}], duration:${D}, ease:'none'}, ${A})`]
    }
    default: return go('{scale:1.02}', 'scale:1.2')
  }
}
const size = (s, big) => { const n = s.length; return big ? (n <= 14 ? 190 : n <= 24 ? 150 : 118) : (n <= 20 ? 128 : n <= 36 ? 104 : 84) }

// ---------- the tall frame (9:16, for phones): the same scenes stacked instead of side by side.
// Words stay clear of the bottom 300 px, where a phone feed draws its own title and buttons.
const PIC_H = H => H * 0.56 | 0
const SAFE = 300

// mosaic tiles for 2 or 3 pictures stacked in the top of a tall frame
function tallTiles(n, W, H, look, r) {
  const g = 24, x = 60, w = W - 120, top = look.layout === 'cinematic' ? 190 : 110, h = H - top - 620
  if (n === 2) {
    const a = r() < 0.5 ? 0.55 : 0.45
    return [[x, top, w, (h - g) * a], [x, top + (h - g) * a + g, w, (h - g) * (1 - a)]]
  }
  return r() < 0.5
    ? [[x, top, w, (h - g) * 0.58], [x, top + (h - g) * 0.58 + g, (w - g) / 2, (h - g) * 0.42], [x + (w - g) / 2 + g, top + (h - g) * 0.58 + g, (w - g) / 2, (h - g) * 0.42]]
    : [[x, top, w, (h - 2 * g) / 3], [x, top + (h - 2 * g) / 3 + g, w, (h - 2 * g) / 3], [x, top + 2 * ((h - 2 * g) / 3 + g), w, (h - 2 * g) / 3]]
}

// Rules for the tall frame, laid over the wide ones: generic first, then per layout family.
export function tallCss(look, W, H) {
  const P = PIC_H(H), band = W * 9 / 16 | 0, bandTop = 420
  const L = `.T.L-${look.layout}`
  const generic = `
.T .center{padding:0 90px}
.T .head{max-width:100%}
.T .sub{font-size:36px;max-width:100%}
.T .kicker{font-size:24px;margin-bottom:28px}
.T .over{left:80px;right:80px;bottom:${SAFE}px}
.T .shade{background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.78))}
.T .split .pic{top:0;left:0;right:0;bottom:auto;width:${W}px;height:${P}px}
.T .split.flip .pic{top:auto;bottom:0;left:0;right:0}
.T .split .pic img{position:absolute;left:0;top:0;width:100%;min-width:0;height:${P}px;object-fit:cover}
.T .split.flip .pic img{top:auto;bottom:0}
.T .split .copy{left:90px;right:90px;width:auto;top:${P}px;bottom:${SAFE - 60}px}
.T .split.flip .copy{left:90px;right:90px;top:150px;bottom:${P + 40}px}
.T .list{display:flex;flex-direction:column;justify-content:center;padding:120px 90px ${SAFE}px}
.T .list .copy,.T .list ol{position:static}
.T .list ol{margin-top:70px;grid-template-columns:1fr;gap:28px}
.T .list li{padding:36px 44px;font-size:52px}
.T .list li b{margin-bottom:16px}
.T .mosaic .mcopy{left:80px;right:80px;bottom:${SAFE}px;flex-direction:column;align-items:flex-start;gap:0}
.T .footage{top:${bandTop}px;height:${band}px}
.T .clipscene .over{bottom:${SAFE + 40}px !important;left:80px !important;right:80px !important;max-width:none}
.T .clipscene .over .head{font-size:${look.layout === 'magazine' ? 96 : 84}px !important;color:var(--foreground)}
.T .clipscene .over .kicker{color:var(--primary)}
.T .clipscene .sub.light{color:var(--muted-foreground)}
.T .clipscene .shade{display:none !important}
.T .rec{top:${bandTop + 30}px;right:40px}
.T .btn{font-size:36px;padding:30px 54px;max-width:100%;text-align:center}
.T .mark{font-size:220px;height:130px}`
  const own = {
    editorial: `
${L} .center{padding:0 90px}
${L} .rule{width:${W - 180}px}
${L} .frame{inset:80px 60px 760px 60px}
${L} .over{flex-direction:column;align-items:flex-start;gap:18px;left:80px;right:80px;bottom:${SAFE}px}`,
    brutalist: `
${L} .center{padding:0 80px}
${L} .kicker{width:fit-content;max-width:100%}
${L} .rule{width:420px}
${L} .frame{inset:60px 60px 60px 60px}`,
    cinematic: `
${L} .over{text-align:center;bottom:${SAFE}px}
${L} .mosaic .mcopy{bottom:${SAFE}px;align-items:center;text-align:center}
${L} .head{letter-spacing:.08em}`,
    collage: `
${L} .frame{left:${W * 0.07 | 0}px;top:150px;width:${W * 0.86 | 0}px;height:${H * 0.5 | 0}px}
${L} .over{left:90px;right:90px;top:${H * 0.66 | 0}px;bottom:auto}
${L} .over .head{font-size:80px !important}
${L} .split .pic{inset:110px 90px auto 90px;width:auto;height:${P - 80}px}
${L} .split.flip .pic{inset:auto 90px ${SAFE}px 90px}
${L} .split.flip .copy{bottom:${P - 80 + SAFE + 40}px}`,
    swiss: `
${L} .center{justify-content:flex-end;padding:0 90px ${SAFE + 40}px}
${L} .kicker{position:static;margin-bottom:24px}
${L} .center>.kicker{position:absolute;top:${H * 0.34 + 50 | 0}px;right:90px}
${L} .rule{width:${W}px;height:${H * 0.34 | 0}px}
${L} .frame{inset:${H * 0.42 | 0}px 0 0 0}
${L} .over{left:90px;right:90px;width:auto;top:130px;bottom:auto}
${L} .list ol{grid-template-columns:1fr;gap:36px}
${L} .list li{display:flex;align-items:center;gap:36px;padding:0 30px}
${L} .list li b{font-size:96px;margin:0}`,
    magazine: `
${L} .over{top:140px;bottom:auto;left:80px;right:80px}
${L} .over .head{font-size:150px !important}
${L} .kicker{width:fit-content;max-width:100%}
${L} .center{padding:0 90px}`,
  }
  return generic + (own[look.layout] || '')
}

// Scene lengths: the template's own, stretched to fit a voiceover line when there is one.
export const sceneLength = (s, voice, pace = 1) => Math.max(Number(((LENGTH[s.kind] || 3.4) * pace).toFixed(2)), voice ? Number((voice + 0.9).toFixed(2)) : 0)
export const VOICE_LEAD = 0.35

export function composition(scenes, c, lengths = [], transition = 'wipe', lookIn = scenes.look, { shape = 'wide' } = {}) {
  const { W, H } = SHAPES[shape] || SHAPES.wide, tall = H > W
  // a plan's cut, when the person picked one, leads; otherwise the look's own cuts
  const look = lookIn || checkLook({ layout: 'classic', cuts: [transition] }, 1)
  const cuts = lookIn && !look.pinned ? look.cuts : [transition]
  // every cut a beat asks for is drawn too (a storyboard may pick its own per beat)
  const allCuts = [...new Set([...cuts, ...scenes.map(s => s.cut).filter(x => CUTS.includes(x))])]
  if (look.notesPalette?.length) look.notesPalette = look.notesPalette.filter(h => /^#[0-9a-f]{6}$/i.test(h))
  const r = rng(look.seed || 1)
  const base = { '--background': '#f7f3ec', '--foreground': '#1b1714', '--primary': '#b4472a', '--primary-foreground': '#fff', '--muted': '#ece4d8', '--muted-foreground': '#6e5b4c', '--accent': '#1f5871', '--card': '#fffbf3', ...(c.theme.vars || {}) }
  // a style reference's palette lends the accent and the highlight
  const vivid = (look.notesPalette || []).map(h => { const n = parseInt(h.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255]; return { h, s: Math.max(...c) - Math.min(...c), l: (c[0] + c[1] + c[2]) / 3 } }).filter(x => x.s > 60 && x.l > 50).sort((a, b) => b.s - a.s)
  if (vivid[0]) base['--primary'] = vivid[0].h
  if (vivid[1]) base['--accent'] = vivid[1].h
  const v = paletteVars(look, base)
  const heading = look.font && look.font !== 'theme' ? look.font : (c.theme.fonts?.heading || 'Fraunces'), body = c.theme.fonts?.body || 'Inter'
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;600;700;800`
  const img = n => c.images.find(i => i.n === n)
  const clipOf = n => (c.clips || []).find(x => x.n === n)
  const sz = (s, big) => size(s, big) * look.scale * (tall ? 0.72 : 1) | 0
  let t = 0, splits = 0
  const html = [], tl = []
  scenes.forEach((s, i) => {
    const d = lengths[i] || s.seconds || LENGTH[s.kind] || 3.4, id = `s${i}`, k = Math.min(1, d / 3.2), at = x => (t + x * k).toFixed(2)
    const acc = accentOf(s)
    const cam = (sel, def = 'push-in') => tl.push(...cameraTween(sel, s.camera || def, t, d, (look.seed || 1) + i))
    const pic = n => img(n) || {}
    const media = (n, cls, idAttr) => `<img id="${idAttr}"${cls ? ` class="${cls}"` : ''} src="${pic(n).name}">`
    const kicker = s.kicker ? `<div class="kicker" id="${id}k">${esc(s.kicker)}</div>` : ''
    const ease = MOTIONS[look.motion] || 'power3.out'
    const enter = (sel, from, x, extra = '') => tl.push(`tl.fromTo('${sel}', ${from}, {opacity:1, x:0, y:0, scale:1, duration:${(0.8 * Math.max(0.35, k)).toFixed(2)}, ease:'${look.motion === 'glitch' ? 'power3.out' : ease}'${extra}}, ${at(x)})`)
    const rise = (x, sel = `#${id} .head .w > span`) => tl.push(revealTween(look, sel, at(x), s.headline.split(' ').length))
    if (s.kind === 'title' || s.kind === 'black') {
      // a trailer card: black, the line typed on, one accent word lit
      html.push(`<div id="${id}" class="clip scene center card" data-start="${t}" data-duration="${d}">${s.kind === 'title' ? `${kicker}<h2 class="head" style="font-size:${sz(s.headline, true) * 0.78 | 0}px">${words(s.headline, 'w', acc)}</h2>${s.sub ? `<p class="sub" id="${id}s">${esc(s.sub)}</p>` : ''}` : ''}</div>`)
      if (s.kind === 'title') {
        tl.push(`tl.fromTo('#${id} .head .w > span', {opacity:0}, {opacity:1, duration:.01, ease:'none', stagger:${Math.min(0.12, (d * 0.45) / Math.max(1, s.headline.split(' ').length)).toFixed(3)}}, ${at(0.12)})`)
        if (acc) tl.push(`tl.fromTo('#${id} .acc > span', {scale:1.25}, {scale:1, duration:${(0.4 * Math.max(0.4, k)).toFixed(2)}, ease:'back.out(2)'}, ${at(0.3)})`)
        if (s.sub) enter(`#${id}s`, '{opacity:0, y:20}', 0.9)
      }
    } else if (s.kind === 'open') {
      html.push(`<div id="${id}" class="clip scene center" data-start="${t}" data-duration="${d}">${kicker}<h1 class="head" style="font-size:${sz(s.headline, true)}px">${words(s.headline, 'w', acc)}</h1><div class="rule" id="${id}r"></div><p class="sub" id="${id}s">${esc(s.sub)}</p></div>`)
      rise(0.25)
      tl.push(`tl.fromTo('#${id}r', {scaleX:0}, {scaleX:1, duration:.9, ease:'power2.inOut'}, ${at(0.9)})`)
      enter(`#${id}s`, '{opacity:0, y:30}', 1.2)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.1)
    } else if (s.kind === 'image') {
      html.push(`<div id="${id}" class="clip scene" data-start="${t}" data-duration="${d}"><div class="frame" id="${id}f">${media(s.image, 'full', `${id}i`)}</div>${s.headline ? `<div class="shade"></div><div class="over">${kicker}<div><h2 class="head light" style="font-size:${sz(s.headline)}px">${words(s.headline, 'w', acc)}</h2>${s.sub ? `<p class="sub light" id="${id}s">${esc(s.sub)}</p>` : ''}</div></div>` : ''}</div>`)
      cam(`#${id}i`, look.motion === 'drift' ? 'drift' : 'push-in')
      if (look.layout === 'collage' || look.layout === 'brutalist') enter(`#${id}f`, `{opacity:0, y:${r(-60, 60) | 0}, scale:.85}`, 0.05)
      rise(0.45)
      if (kicker) enter(`#${id}k`, '{opacity:0, x:-30}', 0.3)
      if (s.sub) enter(`#${id}s`, '{opacity:0, y:24}', 1.1)
    } else if (s.kind === 'split') {
      const left = splits++ % 2 === 1
      html.push(`<div id="${id}" class="clip scene split${left ? ' flip' : ''}" data-start="${t}" data-duration="${d}"><div class="pic" id="${id}p">${media(s.image, '', `${id}i`)}</div><div class="copy">${kicker}<h2 class="head" style="font-size:${sz(s.headline) * (tall ? 1 : 0.82) | 0}px">${words(s.headline, 'w', acc)}</h2>${s.sub ? `<p class="sub" id="${id}s">${esc(s.sub)}</p>` : ''}</div></div>`)
      if (look.layout === 'collage') enter(`#${id}p`, '{opacity:0, y:120, scale:.8}', 0.05, ", ease:'back.out(1.6)'")
      else if (tall) tl.push(`tl.fromTo('#${id}p', {height:0}, {height:${PIC_H(H)}, duration:1, ease:'power3.inOut'}, ${at(0.05)})`)
      else tl.push(`tl.fromTo('#${id}p', {width:0}, {width:${W / 2}, duration:1, ease:'power3.inOut'}, ${at(0.05)})`)
      cam(`#${id}i`, 'pull-out')
      rise(0.6)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.5)
      if (s.sub) enter(`#${id}s`, '{opacity:0, y:24}', 1.3)
    } else if (s.kind === 'list') {
      html.push(`<div id="${id}" class="clip scene list" data-start="${t}" data-duration="${d}"><div class="copy">${kicker}<h2 class="head" style="font-size:${sz(s.headline)}px">${words(s.headline)}</h2></div><ol>${s.items.map((x, j) => `<li id="${id}l${j}" style="--tilt:${r(-4, 4).toFixed(1)}deg"><b>0${j + 1}</b>${esc(x)}</li>`).join('')}</ol></div>`)
      rise(0.2)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.1)
      const from = look.layout === 'swiss' ? '{opacity:0, y:120}' : look.layout === 'collage' ? '{opacity:0, scale:.5}' : '{opacity:0, x:80}'
      s.items.forEach((_, j) => enter(`#${id}l${j}`, from, 0.9 + j * 0.35, look.layout === 'collage' ? ", ease:'back.out(2)'" : ''))
    } else if (s.kind === 'quote') {
      html.push(`<div id="${id}" class="clip scene center tint" data-start="${t}" data-duration="${d}"><div class="mark" id="${id}m">“</div><h2 class="head quote" style="font-size:${sz(s.headline) * 0.85 | 0}px">${words(s.headline)}</h2>${kicker ? `<div class="kicker" id="${id}k">— ${esc(s.kicker)}</div>` : ''}</div>`)
      enter(`#${id}m`, '{opacity:0, scale:.4}', 0.1, ", ease:'back.out(2)'")
      rise(0.35)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:20}', 1.4)
    } else if (s.kind === 'stat') {
      const m = s.headline.match(/^(\D*)(\d[\d,.]*)(.*)$/)
      const num = m ? Number(m[2].replace(/,/g, '')) : NaN
      html.push(`<div id="${id}" class="clip scene center stat" data-start="${t}" data-duration="${d}">${kicker}<div class="num head" id="${id}n">${Number.isFinite(num) ? esc(`${m[1]}0${m[3]}`) : words(s.headline)}</div>${s.sub ? `<p class="sub" id="${id}s">${esc(s.sub)}</p>` : ''}</div>`)
      if (Number.isFinite(num)) {
        const dec = (m[2].split('.')[1] || '').length
        tl.push(`tl.fromTo({v:0}, {v:0}, {v:${num}, duration:1.3, ease:'power2.out', onUpdate(){ document.getElementById('${id}n').textContent = ${JSON.stringify(m[1])} + this.targets()[0].v.toFixed(${dec}) + ${JSON.stringify(m[3])} }}, ${at(0.3)})`)
        enter(`#${id}n`, '{opacity:0, scale:.7}', 0.2)
      } else rise(0.3, `#${id} .w > span`)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.1)
      if (s.sub) enter(`#${id}s`, '{opacity:0, y:24}', 1.2)
    } else if (s.kind === 'mosaic') {
      const pics = s.images.map(img)
      const n = pics.length
      // tile boxes for 2 or 3 pictures, a little different every run
      const g = 28, top = look.layout === 'cinematic' ? 160 : 70, h = H - (look.layout === 'cinematic' ? 480 : 330)
      const boxes = tall ? tallTiles(n, W, H, look, r) : n === 2
        ? (r() < 0.5 ? [[70, top, W * 0.58, h], [70 + W * 0.58 + g, top, W - 140 - W * 0.58 - g, h]] : [[70, top, W * 0.4, h], [70 + W * 0.4 + g, top, W - 140 - W * 0.4 - g, h]])
        : (r() < 0.5 ? [[70, top, W * 0.5, h], [70 + W * 0.5 + g, top, W - 140 - W * 0.5 - g, (h - g) / 2], [70 + W * 0.5 + g, top + (h + g) / 2, W - 140 - W * 0.5 - g, (h - g) / 2]]
          : [[70, top, (W - 140 - 2 * g) / 3, h], [70 + (W - 140 - 2 * g) / 3 + g, top, (W - 140 - 2 * g) / 3, h], [70 + 2 * ((W - 140 - 2 * g) / 3 + g), top, (W - 140 - 2 * g) / 3, h]])
      html.push(`<div id="${id}" class="clip scene mosaic" data-start="${t}" data-duration="${d}">${pics.map((p, j) => `<div class="tile" id="${id}t${j}" style="left:${boxes[j][0] | 0}px;top:${boxes[j][1] | 0}px;width:${boxes[j][2] | 0}px;height:${boxes[j][3] | 0}px;--tilt:${r(-3, 3).toFixed(1)}deg"><img id="${id}i${j}" src="${p.name}"></div>`).join('')}<div class="mcopy">${kicker}<h2 class="head" style="font-size:${sz(s.headline) * (tall ? 0.95 : 0.7) | 0}px">${words(s.headline)}</h2></div></div>`)
      pics.forEach((_, j) => {
        enter(`#${id}t${j}`, look.layout === 'swiss' ? '{opacity:0, y:140}' : '{opacity:0, scale:.82}', 0.1 + j * 0.22, look.layout === 'collage' ? ", ease:'back.out(1.7)'" : '')
        tl.push(...cameraTween(`#${id}i${j}`, s.camera || 'pull-out', t, d, (look.seed || 1) + i * 7 + j))
      })
      rise(0.7)
      if (kicker) enter(`#${id}k`, '{opacity:0, x:-30}', 0.6)
    } else if (s.kind === 'clip') {
      const f = clipOf(s.clip)
      const from = s.speedName ? 0 : Math.max(0, Math.min(Number(s.from) || f.from || 0, Math.max(0, (f.seconds || d) - d)))
      // footage is timed by itself (HyperFrames times the <video>, never its wrapper); the scene's words sit over it
      html.push(`<video id="${id}v" class="clip footage" src="${s.speedName || f.name}" data-start="${t}" data-duration="${d}" data-media-start="${from.toFixed(2)}" muted playsinline></video>`)
      html.push(`<div id="${id}" class="clip scene clipscene" data-start="${t}" data-duration="${d}"><div class="shade"></div><div class="over">${kicker}<div><h2 class="head light" style="font-size:${sz(s.headline) * 0.9 | 0}px">${words(s.headline, 'w', acc)}</h2>${s.sub ? `<p class="sub light" id="${id}s">${esc(s.sub)}</p>` : ''}</div></div>${s.layer === 'story' ? '' : `<div class="rec">${s.speed > 1 ? `${s.speed}×` : `● ${esc(f.label || 'LIVE')}`}</div>`}</div>`)
      cam(`#${id}v`, 'pull-out')
      rise(0.5)
      if (kicker) enter(`#${id}k`, '{opacity:0, x:-30}', 0.35)
      if (s.sub) enter(`#${id}s`, '{opacity:0, y:24}', 1.1)
    } else {
      html.push(`<div id="${id}" class="clip scene center cta" data-start="${t}" data-duration="${d}">${kicker}<h2 class="head" style="font-size:${sz(s.headline, true) * 0.8 | 0}px">${words(s.headline)}</h2>${s.sub ? `<div class="btn" id="${id}b">${esc(s.sub)}</div>` : ''}</div>`)
      rise(0.3)
      if (kicker) enter(`#${id}k`, '{opacity:0, y:-20}', 0.2)
      if (s.sub) enter(`#${id}b`, '{opacity:0, scale:.6}', 1.1, ", ease:'back.out(1.8)'")
    }
    // the cut into this scene: the look's cuts take turns, picked by the seed
    if (i > 0 && s.cut !== 'hard') {
      const cut = CUTS.includes(s.cut) && !look.pinned ? s.cut : cuts.length === 1 ? cuts[0] : cuts[(i + (look.seed % cuts.length)) % cuts.length]
      tl.push(...cutTween(cut, s.kind === 'clip' ? `${id}, #${id}v` : id, t, W, H))
    }
    t += d
  })
  const total = Number(t.toFixed(2))
  const fx = fxLayer(scenes.fx, total, v, W, H)
  const tex = textureLayer(look, total)
  tl.push(...fx.tl, ...tex.tl)
  return {
    seconds: total,
    look,
    shape: tall ? 'tall' : 'wide',
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
.R-blur .w,.R-pop .w,.R-glitch .w,.R-slide .w{overflow:visible}
.kicker{font:700 26px/1 var(--fb);letter-spacing:.22em;text-transform:uppercase;color:var(--primary);margin-bottom:36px}
.sub{font-size:40px;line-height:1.35;color:var(--muted-foreground);margin-top:34px;max-width:1100px}
.rule{width:220px;height:6px;background:var(--primary);margin-top:44px;transform-origin:left center;border-radius:3px}
.frame{position:absolute;inset:0;overflow:hidden}
.full{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.72))}
.over{position:absolute;left:140px;right:140px;bottom:130px;z-index:3}
.light{color:#fff}.over .kicker{color:#fff;opacity:.9}.sub.light{color:rgba(255,255,255,.88)}
.split .pic{position:absolute;top:0;bottom:0;right:0;width:${W / 2}px;overflow:hidden}.split.flip .pic{right:auto;left:0}
.split .pic img{width:100%;min-width:${W / 2 - 240}px;height:100%;object-fit:cover}
.split .copy{position:absolute;top:0;bottom:0;left:130px;width:${W / 2 - 230}px;display:flex;flex-direction:column;justify-content:center}
.split.flip .copy{left:auto;right:130px}
.list .copy{position:absolute;left:140px;top:150px;right:140px}
.list ol{position:absolute;left:140px;right:140px;bottom:140px;list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
.list li{background:var(--card);border-top:6px solid var(--primary);border-radius:var(--radius,12px);padding:44px 40px;font:600 46px/1.15 var(--fh)}
.list li b{display:block;font:700 24px/1 var(--fb);letter-spacing:.16em;color:var(--accent);margin-bottom:22px}
.tint{background:var(--muted)}
.mark{font:700 260px/0.7 var(--fh);color:var(--primary);height:150px}
.quote{font-style:italic}
.stat .num{font-size:${300 * look.scale | 0}px;line-height:.9;color:var(--primary);font-weight:800;letter-spacing:-.05em}
.mosaic .tile{position:absolute;overflow:hidden;border-radius:var(--radius,12px)}.mosaic .tile img{width:100%;height:100%;object-fit:cover}
.mosaic .mcopy{position:absolute;left:90px;right:90px;bottom:60px;display:flex;align-items:flex-end;gap:40px}.mosaic .mcopy .kicker{margin:0 0 14px}
.footage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;object-fit:cover}
.clipscene{background:transparent}
.rec{position:absolute;top:70px;right:80px;font:700 24px/1 'JetBrains Mono',monospace;letter-spacing:.14em;color:#fff;background:rgba(0,0,0,.45);padding:12px 18px;border-radius:6px}
.card{background:#000;color:#fff}.card .head{color:#fff;-webkit-text-stroke:0;text-shadow:none}.card .sub{color:rgba(255,255,255,.7)}
.acc>span{color:var(--primary);font-style:italic}.card .acc>span,.light .acc>span{color:var(--hl,#ffd23f)}
.cta{background:var(--primary)}.cta .head{color:var(--primary-foreground)}.cta .kicker{color:var(--primary-foreground);opacity:.8}
.btn{margin-top:60px;background:var(--primary-foreground);color:var(--primary);font:700 40px/1 var(--fb);padding:34px 64px;border-radius:999px}
#fx{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden}#fx i{position:absolute;display:block}
.fx-dot{border-radius:50%}.fx-glint{margin:-35px 0 0 -35px;clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)}
.fx-streak{height:3px;border-radius:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.9),transparent);filter:blur(1px)}.fx-bit{border-radius:2px}
.tex{position:absolute;inset:0;z-index:9;pointer-events:none}
#wipe{position:absolute;top:0;left:0;width:${W}px;height:${H}px;background:var(--primary);z-index:10;transform:translateX(-${W}px)${allCuts.some(x => x === 'flash' || x === 'glitch') && !allCuts.includes('wipe') ? ';opacity:0' : ''}}
${cutCss(W, H)}
${lookCss(look, W, H)}
${paletteCss(look)}
${tall ? tallCss(look, W, H) : ''}
.clipscene .over{top:auto !important;bottom:90px !important;left:90px !important;right:auto !important;display:block;max-width:1200px}
.clipscene .over .head{font-size:92px !important;line-height:1 !important;color:#fff;-webkit-text-stroke:0}
.clipscene .w{padding-bottom:.16em}.clipscene .shade{display:block !important;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.65))}
</style></head><body class="L-${look.layout} R-${look.reveal} M-${look.motion}${tall ? ' T' : ''}">
<div id="root" data-composition-id="promo" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
${html.join('\n')}
${fx.html}
${tex.html}
${cutLayer(allCuts, total, W, H)}
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
  for (const x of c.clips || []) {
    x.name = `c${x.n}${extname(x.file)}`
    copyFileSync(x.file, join(dir, x.name))
  }
}
