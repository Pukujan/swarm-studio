// Copy the look of a site the person likes (docs/decisions/0022-copy-the-look-from-a-link.md). The crew opens the link in a
// real browser, walks a few of its pages, scrolls each one and takes shots, and measures the look from what the
// browser drew: colours by how much of the screen they cover, the fonts and their sizes, corners, small labels,
// what moves and how, and any 3D canvas. A vision model then writes the look as a style prompt, leaning on what
// the person said they want from it. The site is learned from, never copied: no words, names, logos, pictures or
// font files go on; a 3D piece gets a flat 2D stand-in for now.
//
// Every look keeps where it came from (`from`): the reference, its address, where the person gave it (the
// References card or a chat, and when) and what they wrote about it, so the Studio and the brief can trace it.
//
// Uses the puppeteer-core the video tools install and the Chrome engine/seo.mjs finds (engine/pageshots.mjs).
// Without them the walk says so; it never pretends it looked.
import { publicUrl } from './chatmedia.mjs'
import { puppeteer, settle } from './pageshots.mjs'
import { findChrome } from './seo.mjs'
import { chromePath } from './footage.mjs'
import { browserEnv } from './proc.mjs'
import { scrubber } from './reference.mjs'

export const WALK = { pages: 3, shots: 3, view: { width: 1280, height: 800, deviceScaleFactor: 1 }, quality: 68, timeout: 20000 }
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }

// literal private hosts a page may ask for (its own requests are not resolved one by one)
const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.ts\.net|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[)/i

// ---------- measured in the page: what the browser drew, weighted by how much of the screen it covers
export const MEASURE = `(() => {
  const H = innerHeight * 3, W = innerWidth
  const hex = c => { const m = String(c).match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/); if (!m || (m[4] !== undefined && +m[4] < 0.5)) return null; return '#' + [m[1], m[2], m[3]].map(x => Math.round(+x).toString(16).padStart(2, '0')).join('') }
  const add = (o, k, n) => { if (k) o[k] = (o[k] || 0) + n }
  const fill = {}, ink = {}, fam = {}, radius = {}, texts = []
  for (const el of document.querySelectorAll('body, body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue
    const area = Math.min(r.width, W) * Math.min(r.height, H)
    add(fill, hex(cs.backgroundColor), area)
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim()
    if (own) {
      const size = parseFloat(cs.fontSize), n = own.length
      add(ink, hex(cs.color), n * size)
      const f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      add(fam, f, n * size)
      if (texts.length < 400) texts.push({ f, size, weight: +cs.fontWeight || 400, upper: cs.textTransform === 'uppercase', track: (parseFloat(cs.letterSpacing) || 0) / (size || 16), italic: cs.fontStyle === 'italic', n, tag: el.tagName.toLowerCase() })
    }
    if (/^(button|a|input|img|figure|article|section|div)$/i.test(el.tagName) && r.width > 30) { const rr = parseFloat(cs.borderTopLeftRadius) || 0; add(radius, rr >= 999 ? 'pill' : String(Math.round(rr)), 1) }
  }
  const page = hex(getComputedStyle(document.body).backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || '#ffffff'
  add(fill, page, W * H * 0.5)
  const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([x]) => x)
  const big = texts.slice().sort((a, b) => b.size - a.size)[0] || null
  const anims = (document.getAnimations ? document.getAnimations() : []).slice(0, 40).map(a => { const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return { kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', ms: typeof t.duration === 'number' ? Math.round(t.duration) : null, easing: t.easing || '', loops: t.iterations === Infinity } })
  const moves = [...document.querySelectorAll('a, button, [role=button]')].slice(0, 40).map(e => getComputedStyle(e)).filter(cs => parseFloat(cs.transitionDuration) > 0).map(cs => ({ ms: Math.round(parseFloat(cs.transitionDuration) * (/ms/.test(cs.transitionDuration) ? 1 : 1000)), easing: cs.transitionTimingFunction.split(',')[0] }))
  const canvases = [...document.querySelectorAll('canvas')].map(c => { const r = c.getBoundingClientRect(); let gl = false; try { gl = !!(c.getContext('webgl2') || c.getContext('webgl')) } catch {} return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), gl } }).filter(c => c.w > 80 && c.h > 80)
  const libs = ['gsap', 'ScrollTrigger', 'THREE', 'Lenis', 'lottie', 'anime', 'Swiper', 'Splitting', 'barba', 'PIXI', 'p5'].filter(k => k in window)
  const nav = [...document.querySelectorAll('header a[href], nav a[href], a[href]')].map(a => a.href).filter(h => { try { const u = new URL(h); return u.origin === location.origin && u.pathname !== location.pathname && !/\\.(pdf|zip|png|jpe?g|webp|svg|mp4)$/i.test(u.pathname) } catch { return false } })
  return { page, fills: top(fill, 8), inks: top(ink, 5), fonts: top(fam, 4), radius: top(radius, 3), texts, big, anims, moves, canvases, libs, nav: [...new Set(nav.map(h => h.split('#')[0]))].slice(0, 12), height: document.documentElement.scrollHeight, title: document.title }
})()`

// ---------- the measurements as a look: tokens and plain words, no model needed
const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const sat = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0 }
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null }
const kindOfFont = f => /mono|code|courier|jetbrains|ibm plex mono|space mono/i.test(f) ? 'mono' : /serif|garamond|playfair|times|georgia|baskerville|caslon|didot|bodoni|fraunces|lora|merriweather/i.test(f) && !/sans/i.test(f) ? 'serif' : /condensed|narrow|compressed|oswald|bebas|anton|league gothic|big shoulders|barlow condensed|archivo narrow/i.test(f) ? 'condensed sans' : /display|black|grotesk|grotesque/i.test(f) ? 'display sans' : 'sans'

export function tokensOf(pages = []) {
  const m = pages.map(p => p.measured).filter(Boolean)
  if (!m.length) return null
  const first = m[0]
  const fills = [...new Set(m.flatMap(x => x.fills))]
  const inks = [...new Set(m.flatMap(x => x.inks))]
  const bg = first.page
  const text = inks.find(c => Math.abs(lum(c) - lum(bg)) > 0.45) || (lum(bg) < 0.5 ? '#f5f5f5' : '#111111')
  const accent = [...fills, ...inks].find(c => sat(c) > 0.45 && Math.abs(lum(c) - lum(bg)) > 0.15) || null
  const texts = m.flatMap(x => x.texts)
  const display = first.big?.f || first.fonts[0] || ''
  const body = first.fonts.find(f => f !== display) || first.fonts[0] || ''
  const labels = texts.filter(t => t.size <= 14 && (t.upper || t.track >= 0.05))
  const label = labels.length >= 3 ? { font: labels[0].f, kind: kindOfFont(labels[0].f), upper: labels.some(t => t.upper), tracking: Math.round(Math.max(...labels.map(t => t.track)) * 100) / 100 } : null
  const sizes = [...new Set(texts.map(t => Math.round(t.size)))].sort((a, b) => b - a)
  const radius = first.radius[0] === 'pill' ? 'pill' : `${first.radius[0] || 0}px`
  const palette = [...new Set([bg, text, accent, ...fills, ...inks].filter(Boolean))].slice(0, 6)
  return {
    palette, bg, text, accent,
    fonts: { display: { name: display, kind: kindOfFont(display), weight: first.big?.weight || null, upper: !!first.big?.upper }, body: { name: body, kind: kindOfFont(body) }, label },
    sizes: { biggest: sizes[0] || null, body: median(texts.filter(t => /^(p|li)$/.test(t.tag)).map(t => t.size)) || median(texts.map(t => t.size)) || 16, steps: sizes.slice(0, 6) },
    radius, dark: lum(bg) < 0.35,
  }
}

export function motionOf(pages = []) {
  const m = pages.map(p => p.measured).filter(Boolean)
  const anims = m.flatMap(x => x.anims), moves = m.flatMap(x => x.moves)
  const canvases = m.flatMap(x => x.canvases)
  const libs = [...new Set(m.flatMap(x => x.libs))]
  const ms = [...anims.map(a => a.ms), ...moves.map(a => a.ms)].filter(n => n > 0 && n < 20000)
  const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null
  const easings = [...new Set([...anims, ...moves].map(a => a.easing).filter(e => e && e !== 'linear'))].slice(0, 3)
  return {
    animations: anims.length, loops: anims.filter(a => a.loops).length, hovers: moves.length, avgMs: avg, easings, libs,
    smoothScroll: libs.includes('Lenis'), scrollDriven: libs.includes('ScrollTrigger'),
    threeD: [...new Map(canvases.filter(c => c.gl).map(c => [`${c.w}x${c.h}@${c.top}`, { w: c.w, h: c.h, top: c.top }])).values()],
  }
}

// plain words when no model can look
export function plainLook(tokens, motion) {
  if (!tokens) return null
  const t = tokens, f = t.fonts
  const type = [`${f.display.upper ? 'uppercase ' : ''}${f.display.kind} headings${f.display.weight >= 700 ? ', heavy' : ''}`, f.body.name && f.body.name !== f.display.name ? `${f.body.kind} body text` : '', f.label ? `small ${f.label.upper ? 'uppercase ' : ''}${f.label.kind} labels${f.label.tracking >= 0.05 ? ' with wide tracking' : ''}` : ''].filter(Boolean).join(', ')
  const pace = motion.avgMs == null ? '' : motion.avgMs < 250 ? 'quick, snappy' : motion.avgMs < 700 ? 'smooth' : 'slow, drifting'
  const moving = [motion.animations ? `${pace} animations` : '', motion.hovers ? 'hover effects' : '', motion.smoothScroll ? 'smooth scrolling' : '', motion.scrollDriven ? 'things that move as you scroll' : ''].filter(Boolean).join(', ')
  const flat = motion.threeD.length ? 'a 3D piece on the page; for now a flat stand-in: a soft glow or gradient shape in the accent colour, gently moving' : ''
  return {
    prompt: clip(`A ${t.dark ? 'dark' : 'light'} site. Background ${t.bg}, text ${t.text}${t.accent ? `, ${t.accent} as the one accent` : ''}. ${type}. Corners ${t.radius === 'pill' ? 'fully round' : t.radius === '0px' ? 'square' : `rounded about ${t.radius}`}.${moving ? ` Motion: ${moving}.` : ''}`, 600),
    type, motion: moving, mood: [t.dark ? 'dark' : 'light', t.accent ? 'one bright accent' : 'quiet colour'].join(', '), threeD: flat, by: 'measured',
  }
}

// ---------- the walk
// url: the link. Returns { url, host, pages: [{ url, shots: [Buffer] , measured }], tokens, motion, note? }
// allowPrivate is for the tests' local fixture page only; the server never sets it.
export async function walkSite(url, { dataDir, pages = WALK.pages, shots = WALK.shots, lookup, launch, signal, allowPrivate = false } = {}) {
  const check = u => (allowPrivate ? new URL(u) : publicUrl(u, lookup ? { lookup } : {}))
  const start = await check(url)
  const pp = launch ? null : puppeteer(dataDir), chrome = launch ? 'given' : findChrome() || chromePath()
  if (!launch && (!pp || !chrome)) return { url: start.href, host: hostOf(start.href), pages: [], tokens: null, motion: null, note: 'no browser here to open the site with' }
  const browser = launch ? await launch() : await pp.launch({ executablePath: chrome, headless: true, env: browserEnv(), args: ['--hide-scrollbars', '--disable-gpu-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'] })
  const out = { url: start.href, host: hostOf(start.href), pages: [] }
  try {
    const queue = [start.href], seen = new Set()
    while (queue.length && out.pages.length < pages) {
      if (signal?.aborted) break
      const next = queue.shift()
      if (seen.has(next)) continue
      seen.add(next)
      if (out.pages.length) { try { await check(next) } catch { continue } }
      const page = await browser.newPage()
      try {
        await page.setViewport(WALK.view)
        await page.setRequestInterception(true)
        page.on('request', req => { let h = ''; try { h = new URL(req.url()).hostname } catch {} if (/^(data|blob):/.test(req.url()) || (h && (allowPrivate || !PRIVATE_HOST.test(h)))) req.continue().catch(() => {}); else req.abort().catch(() => {}) })
        await page.goto(next, { waitUntil: 'load', timeout: WALK.timeout }).catch(() => {})
        // a page that keeps drawing (a 3D scene, a ticker) is never fully idle: wait a little, not forever
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {})
        await settle(page)
        const one = { url: page.url(), shots: [] }
        const h = await page.evaluate('document.documentElement.scrollHeight').catch(() => WALK.view.height)
        for (let i = 0; i < shots && i * WALK.view.height < h; i++) {
          if (i) { await page.evaluate(y => scrollTo(0, y), i * WALK.view.height).catch(() => {}); await sleep(900) }
          one.shots.push(Buffer.from(await page.screenshot({ type: 'jpeg', quality: WALK.quality })))
          // the second screen is measured too, so a hero alone does not set the look
          if (i === 0) await page.evaluate(() => scrollTo(0, innerHeight)).then(() => sleep(500)).then(() => page.evaluate(() => scrollTo(0, 0))).catch(() => {})
        }
        await page.evaluate(() => scrollTo(0, 0)).catch(() => {})
        one.measured = await page.evaluate(MEASURE).catch(() => null)
        if (one.measured) { for (const n of one.measured.nav) if (!seen.has(n)) queue.push(n); delete one.measured.nav }
        out.title = out.title || one.measured?.title || ''
        if (one.measured) delete one.measured.title
        out.pages.push(one)
      } finally { await page.close().catch(() => {}) }
    }
  } finally { await browser.close().catch(() => {}) }
  out.tokens = tokensOf(out.pages)
  out.motion = motionOf(out.pages)
  if (!out.pages.length || !out.tokens) out.note = 'the site did not open'
  return out
}

// ---------- describing: the shots and the numbers into a style prompt, leaning on what the person wants
export const LOOK_RULES = `You are an art director. A person likes this website's LOOK and wants an ORIGINAL site in a similar style, about their own work. Describe only how it looks and moves, in general terms a designer can follow. Never name the site, its owner, brands, people or products; never quote its words; never describe its logo or its pictures' subjects. If the person said what they want from it, describe that part most and say in "left" what you left out. If there is a 3D or WebGL piece, do not ask for 3D: describe a flat 2D stand-in (CSS or SVG) with the same feel. Return JSON only:
{"prompt":"the style as a prompt for a designer, 40 to 80 words","type":"the typography, under 16 words","layout":"the layout and spacing, under 16 words","motion":"how things move, under 16 words","mood":"3 to 6 mood words","threeD":"the 2D stand-in for a 3D piece, under 24 words, or empty","left":"what of the site you did not take, under 14 words, or empty"}`

export function lookMessages({ tokens, motion, want = '', shots = [] }) {
  const facts = { tokens, motion: motion && { ...motion, threeD: motion.threeD?.length ? `${motion.threeD.length} 3D canvas` : 'none' } }
  const content = [{ type: 'text', text: `${want ? `What the person wants from this site: ${clip(want, 300)}\n` : ''}Measured from the rendered pages: ${JSON.stringify(facts).slice(0, 3000)}` }]
  for (const s of shots.slice(0, 4)) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(s).toString('base64')}` } })
  return [{ role: 'system', content: LOOK_RULES }, { role: 'user', content }]
}

// chat(messages) -> text, or null for no model. Returns the look's words, scrubbed of the site's names.
export async function describeLook(walk, { want = '', chat = null } = {}) {
  const plain = plainLook(walk.tokens, walk.motion || motionOf([]))
  if (!plain) return null
  const clean = scrubber([walk.title, walk.host, walk.url])
  let said = null
  if (chat) {
    try {
      const shots = walk.pages.flatMap(p => p.shots.slice(0, 2)).slice(0, 4)
      const t = String(await chat(lookMessages({ tokens: walk.tokens, motion: walk.motion, want, shots })) || '')
      said = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))
    } catch { said = null }
  }
  const pick = k => clip(clean(said?.[k] || plain[k] || ''), k === 'prompt' ? 700 : 200)
  return { prompt: pick('prompt'), type: pick('type'), layout: clip(clean(said?.layout || ''), 200), motion: pick('motion'), mood: pick('mood'), threeD: walk.motion?.threeD?.length ? pick('threeD') || plain.threeD : '', left: clip(clean(said?.left || ''), 160), by: said ? 'model' : 'measured' }
}

// ---------- what the crew's brief says about one look, with where it came from
export function lookBrief(ref) {
  const L = ref.look
  if (!L || L.state !== 'ready' || !L.words) return ''
  const t = L.tokens || {}, f = t.fonts || {}
  const src = [`reference ${ref.id}`, L.from?.host, L.from?.source === 'chat' ? 'given in the chat' : 'given in References', ref.use ? `the owner wants: "${clip(ref.use, 120)}"` : ''].filter(Boolean).join('; ')
  return [
    `A look to learn from (${src}). Make an original site in this style; never use that site's words, names, logo, pictures or font files.`,
    `- Style: ${L.words.prompt}`,
    t.palette?.length ? `- Colours: background ${t.bg}, text ${t.text}${t.accent ? `, accent ${t.accent}` : ''} (palette ${t.palette.join(', ')})` : '',
    f.display?.name ? `- Type: headings like ${f.display.name} (${f.display.kind}${f.display.upper ? ', uppercase' : ''}), body like ${f.body?.name || f.display.name} (${f.body?.kind || f.display.kind})${f.label ? `, small labels in ${f.label.kind}${f.label.tracking >= 0.05 ? ', wide tracking' : ''}` : ''}. Use the closest font you can load (Google Fonts), not theirs.` : '',
    t.radius ? `- Corners: ${t.radius}` : '',
    L.words.motion ? `- Motion: ${L.words.motion}` : '',
    L.words.threeD ? `- Instead of their 3D piece: ${L.words.threeD}` : '',
  ].filter(Boolean).join('\n')
}
