// The Deck kind (docs/specs/35-open-design.md, section 7): 16:9 slides made from the brand and the story.
//
// A deck is data: { title, look, slides: [{ layout, kicker, title, lede, points, stats, quote, by, image, notes }] }.
// The project's locked brand gives the colours and fonts; a deck look (engine/opendesign/decks.json, converted
// from html-ppt, MIT) gives the shape: corners, shadows and its decoration. The slide markup uses html-ppt's class
// names (.slide, .kicker, .lede, .card, .grid.g3, .pill, .divider-accent), so their decoration rules apply.
//
// Out: one self-contained HTML file that presents itself (arrow keys, space, Page Up/Down, Home/End, F for full
// screen, Esc), and a PDF printed by the headless Chrome the plugin already uses for page shots (engine/seo.mjs).
// PowerPoint is left out: a clean .pptx needs a zip writer and a slide-by-slide drawing model we do not have, and
// a .pptx of screenshots cannot be edited, which is the only reason to want one.
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from './proc.mjs'
import { findChrome } from './seo.mjs'
import { brandTheme } from './brand.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DATA = (() => { try { return JSON.parse(readFileSync(join(here, 'opendesign', 'decks.json'), 'utf8')) } catch { return { themes: [] } } })()
export const DECK_LOOKS = DATA.themes
export const DECK_SOURCE = DATA.source
export const lookOf = slug => DECK_LOOKS.find(t => t.slug === slug) || DECK_LOOKS[0] || null
export const LAYOUTS = ['title', 'section', 'points', 'stats', 'quote', 'picture', 'two', 'steps', 'end']
export const W = 1920, H = 1080

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s }
// a picture is a web address or one of the project's own files; nothing else reaches the page
const safeUrl = u => /^(https:\/\/|assets\/|\.\/)[^"'<>\s]*$/.test(String(u || '')) ? u : ''

// ---------- the outline: one line per slide ----------

// From the film storyboard's beats (engine/storyboard.mjs: kind, kicker, headline, sub, image), the brand sheet's
// story and storyboard frames, or the brief alone. Always a title slide first and an end slide last.
export function outlineFrom({ title, brief = '', story = {}, beats = [], frames = [], cta = '' } = {}) {
  const name = clip(title || story.what || brief || 'Untitled', 60)
  const slides = [{ layout: 'title', kicker: clip(story.who ? `For ${story.who}` : '', 40), title: name, lede: clip(story.what && story.what !== name ? story.what : brief, 140) }]
  const middle = beats.filter(b => !['open', 'title', 'cta'].includes(b.kind) && (b.headline || b.sub || b.say))
  if (middle.length) {
    for (const b of middle) slides.push(b.image || b.picture
      ? { layout: 'picture', kicker: clip(b.kicker, 30), title: clip(b.headline || b.sub, 70), lede: clip(b.headline ? b.sub : '', 120), image: { url: safeUrl(b.image || b.picture), alt: clip(b.headline, 80) } }
      : { layout: b.say && !b.sub ? 'quote' : 'section', kicker: clip(b.kicker, 30), title: clip(b.headline || b.sub, 70), lede: clip(b.headline ? b.sub : '', 120), quote: b.say && !b.sub ? clip(b.say, 160) : undefined })
  } else {
    const lines = frames.length ? frames : (story.pages || []).map(p => `${p}`)
    for (const f of lines.slice(0, 8)) slides.push({ layout: 'section', title: clip(f, 70) })
  }
  const last = beats.find(b => b.kind === 'cta')
  slides.push({ layout: 'end', title: clip(last?.headline || name, 60), lede: clip(last?.sub || cta, 100) })
  return { title: name, slides: slides.map(cleanSlide) }
}

// what the outline shows: one line per slide
export const outlineLines = deck => deck.slides.map((s, i) => `${i + 1}. ${s.title || s.quote || s.layout}`)

export function cleanSlide(s = {}) {
  const layout = LAYOUTS.includes(s.layout) ? s.layout : 'section'
  const items = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map(x => typeof x === 'string' ? { head: clip(x, 60), text: '' } : { head: clip(x.head, 60), text: clip(x.text, 160) }).filter(x => x.head || x.text)
  const out = { layout, kicker: clip(s.kicker, 40), title: clip(s.title, 90), lede: clip(s.lede, 220) }
  if (s.points) out.points = items(s.points, 4)
  if (s.steps) out.steps = items(s.steps, 5)
  if (s.left || s.right) { out.left = items([s.left || {}], 1)[0] || { head: '', text: '' }; out.right = items([s.right || {}], 1)[0] || { head: '', text: '' } }
  if (s.stats) out.stats = (Array.isArray(s.stats) ? s.stats : []).slice(0, 4).map(x => ({ value: clip(x.value, 12), label: clip(x.label, 40), note: clip(x.note, 40) })).filter(x => x.value)
  if (s.quote) { out.quote = clip(s.quote, 220); out.by = clip(s.by, 60) }
  if (s.image?.url && safeUrl(s.image.url)) out.image = { url: safeUrl(s.image.url), alt: clip(s.image.alt, 120) }
  if (s.notes) out.notes = clip(s.notes, 600)
  return out
}

// ---------- the look: brand colours and fonts, the look's shape ----------

export function deckVars(brand, look = lookOf()) {
  const th = brand ? brandTheme(brand) : null
  const vars = { ...(look?.colours || {}), ...(look?.shape || {}) }
  let heading = look?.fonts?.heading || 'Inter', body = look?.fonts?.body || 'Inter'
  if (th) {
    const v = th.vars
    Object.assign(vars, {
      bg: v['--background'], 'bg-soft': v['--muted'], surface: v['--card'], 'surface-2': v['--muted'],
      border: v['--border'], 'border-strong': `color-mix(in srgb, ${v['--foreground']} 30%, ${v['--background']})`,
      'text-1': v['--foreground'], 'text-2': v['--muted-foreground'], 'text-3': v['--muted-foreground'],
      accent: v['--primary'], 'accent-2': v['--link'], 'accent-3': v['--primary'], 'on-accent': v['--primary-foreground'],
      grad: `linear-gradient(135deg, ${v['--primary']}, ${v['--link']})`
    })
    // the plain look takes the brand's corners; the others keep their own (a Bauhaus deck stays square)
    if (!look || look.slug === 'minimal-white') vars.radius = th.radius
    heading = th.fonts.heading; body = th.fonts.body
  }
  return { vars, fonts: { heading, body } }
}

const fam = f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;600;700;800`

// ---------- slides ----------

const card = (x, cls = 'card') => `<div class="${cls}"><h4>${esc(x.head)}</h4>${x.text ? `<p class="dim">${esc(x.text)}</p>` : ''}</div>`
const head = s => `${s.kicker ? `<p class="kicker">${esc(s.kicker)}</p>` : ''}${s.title ? `<h2 class="h2">${esc(s.title)}</h2>` : ''}${s.lede ? `<p class="lede">${esc(s.lede)}</p>` : ''}`

export function slideHtml(s, i, total) {
  const n = `<div class="deck-footer"><span></span><span>${i + 1} / ${total}</span></div>`
  const notes = s.notes ? `<aside class="notes">${esc(s.notes)}</aside>` : ''
  const at = (cls, inner) => `<section class="slide ${cls}" data-layout="${s.layout}" aria-label="Slide ${i + 1}">${inner}${n}${notes}</section>`
  switch (s.layout) {
    case 'title': return at('', `${s.kicker ? `<p class="kicker">${esc(s.kicker)}</p>` : ''}<h1 class="h1 title">${esc(s.title)}</h1><div class="divider-accent mb-m"></div>${s.lede ? `<p class="lede">${esc(s.lede)}</p>` : ''}`)
    case 'section': return at('center tc', `<div style="max-width:1200px">${s.kicker ? `<p class="kicker">${esc(s.kicker)}</p>` : ''}<h1 class="h1">${esc(s.title)}</h1><div class="divider-accent" style="margin:24px auto"></div>${s.lede ? `<p class="lede" style="margin:0 auto">${esc(s.lede)}</p>` : ''}</div>`)
    case 'points': { const p = s.points || []; return at('', `${head(s)}<div class="grid g${Math.max(2, Math.min(4, p.length))} mt-l">${p.map(x => card(x, 'card card-accent')).join('')}</div>`) }
    case 'steps': { const p = s.steps || []; return at('', `${head(s)}<ol class="grid g${Math.max(2, Math.min(5, p.length))} mt-l steps">${p.map((x, k) => `<li class="card"><p class="kicker">${k + 1}</p><h4>${esc(x.head)}</h4>${x.text ? `<p class="dim">${esc(x.text)}</p>` : ''}</li>`).join('')}</ol>`) }
    case 'stats': { const p = s.stats || []; return at('', `${head(s)}<div class="grid g${Math.max(2, Math.min(4, p.length))} mt-l">${p.map(x => `<div class="card"><p class="eyebrow">${esc(x.label)}</p><div class="stat">${esc(x.value)}</div>${x.note ? `<p class="dim">${esc(x.note)}</p>` : ''}</div>`).join('')}</div>`) }
    case 'two': return at('', `${head(s)}<div class="grid g2 mt-l">${card(s.left || {})}${card(s.right || {})}</div>`)
    case 'quote': return at('center tc', `<div style="max-width:1300px"><div class="serif qmark">“</div><blockquote class="serif big-quote">${esc(s.quote || s.title)}</blockquote>${s.by ? `<p class="dim">— ${esc(s.by)}</p>` : ''}</div>`)
    case 'picture': return at('picture', `${s.image?.url ? `<img class="bg-img" src="${esc(s.image.url)}" alt="${esc(s.image.alt)}">` : ''}<div class="caption">${head(s)}</div>`)
    case 'end': return at('center tc', `<div>${s.kicker ? `<p class="kicker">${esc(s.kicker)}</p>` : ''}<h1 class="h1">${esc(s.title || 'Thank you')}</h1>${s.lede ? `<p class="lede" style="margin:0 auto">${esc(s.lede)}</p>` : ''}</div>`)
  }
  return at('', head(s))
}

// The slide system, ours: html-ppt's type, grid and card classes (MIT, see engine/opendesign/NOTICE) on a fixed
// 1920 × 1080 stage that is scaled to the window, one slide shown at a time, every slide one page in print.
const BASE = `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;background:#000;height:100%}
body{font-family:var(--font-sans);color:var(--text-1);-webkit-font-smoothing:antialiased;line-height:1.6;letter-spacing:-.01em}
img{max-width:100%;display:block}
.deck{position:fixed;left:50%;top:50%;width:${W}px;height:${H}px;transform-origin:0 0;background:var(--bg);overflow:hidden}
.slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:96px 128px;background:var(--bg);overflow:hidden}
.slide.is-active{display:flex}
.eyebrow{font-size:20px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text-3);margin:0 0 8px}
.kicker{font-size:20px;font-weight:600;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin:0 0 16px}
.h1,h1.title{font-family:var(--font-display);font-size:104px;line-height:1.04;font-weight:800;letter-spacing:var(--letter-tight,-.03em);margin:0 0 24px;color:var(--text-1)}
.h2{font-family:var(--font-display);font-size:72px;line-height:1.1;font-weight:700;letter-spacing:var(--letter-tight,-.03em);margin:0 0 18px;color:var(--text-1)}
h4{font-family:var(--font-display);font-size:40px;line-height:1.25;font-weight:600;margin:0 0 10px}
.lede{font-size:32px;line-height:1.5;color:var(--text-2);font-weight:300;max-width:62ch;margin:0}
.dim{color:var(--text-2);font-size:28px;line-height:1.45;margin:0}.serif{font-family:var(--font-display)}
.grid{display:grid;gap:32px;padding:0;margin:0;list-style:none}.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}.g5{grid-template-columns:repeat(5,1fr)}
.center{align-items:center;justify-content:center}.tc{text-align:center}.mt-l{margin-top:48px}.mb-m{margin-bottom:24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius,18px);padding:44px 48px;box-shadow:var(--shadow,none);position:relative;overflow:hidden}
.card-accent{border-top:4px solid var(--accent)}
.pill{display:inline-block;padding:6px 16px;border-radius:999px;font-size:18px;background:var(--surface-2);color:var(--text-2);border:1px solid var(--border)}
.divider-accent{height:4px;width:96px;background:var(--accent);border-radius:2px}
.stat{font-family:var(--font-display);font-size:120px;font-weight:800;line-height:1.05;color:var(--text-1)}
.qmark{font-size:200px;line-height:.8;color:var(--accent);opacity:.6}.big-quote{font-size:68px;line-height:1.25;font-style:italic;font-weight:600;margin:-40px 0 32px;color:var(--text-1)}
.slide.picture{justify-content:flex-end;padding:0}.slide.picture .bg-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.slide.picture .caption{position:relative;padding:72px 128px;background:linear-gradient(transparent,color-mix(in srgb,var(--bg) 92%,transparent) 40%)}
.deck-footer{position:absolute;bottom:32px;left:128px;right:128px;display:flex;justify-content:space-between;font-size:16px;color:var(--text-3);pointer-events:none}
.notes{display:none}
@page{size:${W}px ${H}px;margin:0}
@media print{html,body{background:none;height:auto}.deck{position:static;transform:none!important;width:auto;height:auto;overflow:visible}
.slide{display:flex!important;position:relative;width:${W}px;height:${H}px;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`

// present mode: the keys a presenter expects, the slide number in the address, the stage fitted to the window
const PRESENT = `(()=>{const d=document.querySelector('.deck'),s=[...d.querySelectorAll('.slide')];let i=0;
const fit=()=>{const k=Math.min(innerWidth/${W},innerHeight/${H});d.style.transform='scale('+k+') translate(-50%,-50%)'};
const go=n=>{i=Math.max(0,Math.min(s.length-1,n));s.forEach((x,j)=>x.classList.toggle('is-active',j===i));history.replaceState(null,'','#'+(i+1))};
addEventListener('resize',fit);addEventListener('keydown',e=>{const k=e.key;
if(['ArrowRight','ArrowDown','PageDown',' '].includes(k)){go(i+1);e.preventDefault()}
else if(['ArrowLeft','ArrowUp','PageUp'].includes(k)){go(i-1);e.preventDefault()}
else if(k==='Home')go(0);else if(k==='End')go(s.length-1);
else if(k==='f'||k==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.()}
else if(k==='Escape'&&document.fullscreenElement)document.exitFullscreen()});
d.addEventListener('click',e=>go(i+(e.clientX<innerWidth/3?-1:1)));
fit();go((parseInt(location.hash.slice(1))||1)-1)})()`

export function deckHtml(deck, { brand = null, look = lookOf(deck.look) } = {}) {
  const { vars, fonts } = deckVars(brand, look)
  const root = Object.entries(vars).map(([k, v]) => `--${k}:${v}`).join(';')
  const fontVars = `--font-display:'${fonts.heading}',Georgia,serif;--font-sans:'${fonts.body}',system-ui,sans-serif;--font-serif:'${fonts.heading}',Georgia,serif`
  const slides = deck.slides.map(cleanSlide)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deck.title || 'Deck')}</title>
<!-- Made with Swarm Studio. Deck look "${esc(look?.name || 'Plain')}" from html-ppt (MIT, Copyright (c) 2026 lewis), via nexu-io/open-design. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam(fonts.heading)}&${fam(fonts.body)}&display=swap">
<style>:root{${root};${fontVars}}
${BASE}
${look?.rules || ''}</style></head>
<body><div class="deck">
${slides.map((s, i) => slideHtml(s, i, slides.length)).join('\n')}
</div><script>${PRESENT}</script></body></html>
`
}

// PDF: the same file printed by headless Chrome, one 1920 × 1080 page a slide. False when there is no Chrome.
export function deckPdf(html, dst, { chrome = findChrome() } = {}) {
  if (!chrome) return false
  const tmp = mkdtempSync(join(tmpdir(), 'swarm-deck-'))
  try {
    const page = join(tmp, 'deck.html')
    writeFileSync(page, html)
    execFileSync(chrome, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(tmp, 'profile')}`, '--no-pdf-header-footer', '--print-to-pdf-no-header', '--virtual-time-budget=4000', `--print-to-pdf=${dst}`, `file://${page}`], { stdio: 'ignore', timeout: 60000 })
    return existsSync(dst)
  } catch { return false } finally { rmSync(tmp, { recursive: true, force: true }) }
}
