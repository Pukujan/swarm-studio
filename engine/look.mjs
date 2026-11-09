// The video's art direction: a "look" the storyboard writer picks per build
// (layout family, motion, text reveal, cuts, texture, palette, type), plus a
// per-run seed, so two builds never cut the same video even from the same plan.

export const LAYOUTS = {
  classic: 'clean centred titles, cards, full-bleed pictures with a soft shade',
  editorial: 'left-aligned, airy, thin rules, framed pictures with captions under them, like a print feature',
  brutalist: 'huge uppercase blocks, thick black borders, hard offset shadows, mono labels, loud',
  cinematic: 'dark, letterboxed bars, wide-spaced titles like film credits, slow push-ins, grain',
  collage: 'tilted polaroid pictures, tape, scattered cards and highlighter marks on paper',
  neon: 'night-time dark, glowing outlined type, scanlines, electric colour',
  swiss: 'strict grid, big bold sans, giant numbers, asymmetric blocks of colour',
  magazine: 'cover style: giant headline over the picture, issue labels, bold serif',
}
export const MOTIONS = { smooth: 'power3.out', snappy: 'expo.out', drift: 'sine.inOut', elastic: 'elastic.out(1,0.55)', glitch: 'steps(5)' }
export const REVEALS = ['rise', 'blur', 'pop', 'slide', 'type', 'glitch']
export const CUTS = ['wipe', 'fade', 'zoom', 'slide', 'flash', 'iris', 'blinds', 'split', 'push', 'glitch', 'whip']
export const TEXTURES = ['grain', 'scanlines', 'halftone', 'paper', 'vignette']
export const PALETTES = ['brand', 'dark', 'invert', 'duotone', 'mono']
export const FONTS = ['theme', 'Archivo Black', 'League Gothic', 'Oswald', 'Playfair Display', 'EB Garamond', 'Space Mono', 'Montserrat', 'Outfit', 'Poppins']

// Each family's own defaults, used when the writer leaves a field out.
const DEFAULTS = {
  classic: { motion: 'smooth', reveal: 'rise', cuts: ['wipe'], texture: [], palette: 'brand' },
  editorial: { motion: 'drift', reveal: 'blur', cuts: ['fade', 'slide'], texture: ['paper'], palette: 'brand', font: 'Playfair Display' },
  brutalist: { motion: 'snappy', reveal: 'slide', cuts: ['blinds', 'push'], texture: ['halftone'], palette: 'brand', font: 'Archivo Black' },
  cinematic: { motion: 'drift', reveal: 'blur', cuts: ['fade', 'iris'], texture: ['grain', 'vignette'], palette: 'dark', font: 'Oswald' },
  collage: { motion: 'elastic', reveal: 'pop', cuts: ['whip', 'zoom'], texture: ['paper'], palette: 'brand' },
  neon: { motion: 'glitch', reveal: 'glitch', cuts: ['glitch', 'flash'], texture: ['scanlines', 'vignette'], palette: 'dark', font: 'Outfit' },
  swiss: { motion: 'snappy', reveal: 'slide', cuts: ['split', 'push'], texture: [], palette: 'brand', font: 'Montserrat' },
  magazine: { motion: 'smooth', reveal: 'type', cuts: ['zoom', 'whip'], texture: ['grain'], palette: 'brand', font: 'Playfair Display' },
}

// A tiny seeded random, so a look can be replayed from its seed.
export function rng(seed) {
  let s = (Number(seed) >>> 0) % 2147483646 + 1
  return (a = 0, b = 1) => { s = (s * 16807) % 2147483647; return a + (b - a) * ((s - 1) / 2147483646) }
}
export const hash = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 }
const pickOf = (r, list) => list[Math.floor(r(0, list.length)) % list.length]

// A look from whatever the writer returned; anything missing or unknown comes from the seed.
export function checkLook(raw = {}, seed = Date.now()) {
  const r = rng(seed)
  const layout = LAYOUTS[raw.layout] ? raw.layout : pickOf(r, Object.keys(LAYOUTS))
  const d = DEFAULTS[layout]
  const list = (x, ok, max) => (Array.isArray(x) ? x : x ? [x] : []).filter(v => ok.includes(v)).slice(0, max)
  const cuts = list(raw.cuts ?? raw.transitions ?? raw.transition, CUTS, 3)
  const texture = list(raw.texture, TEXTURES, 2)
  const scale = Number(raw.scale)
  return {
    layout,
    motion: MOTIONS[raw.motion] ? raw.motion : d.motion,
    reveal: REVEALS.includes(raw.reveal) ? raw.reveal : d.reveal,
    cuts: cuts.length ? cuts : d.cuts,
    texture: raw.texture === undefined ? d.texture : texture,
    palette: PALETTES.includes(raw.palette) ? raw.palette : d.palette,
    font: FONTS.includes(raw.font) ? raw.font : (d.font || 'theme'),
    scale: scale >= 0.75 && scale <= 1.3 ? scale : 1,
    seed: Number(seed) >>> 0,
  }
}

export function lookPrompt() {
  return `"look": the art direction for this one video. Make it fit the brand and the person's idea, and make it feel made for this build, not a template:
  {"layout":"${Object.keys(LAYOUTS).join('|')}","motion":"${Object.keys(MOTIONS).join('|')}","reveal":"${REVEALS.join('|')}","cuts":["1 to 3 of: ${CUTS.join(', ')}"],"texture":["0 to 2 of: ${TEXTURES.join(', ')}"],"palette":"${PALETTES.join('|')}","font":"${FONTS.join('|')}","scale":0.8-1.25}
  Layouts: ${Object.entries(LAYOUTS).map(([k, v]) => `${k} (${v})`).join('; ')}.
  Motion is how things move (snappy for loud brands, drift for calm ones, glitch for tech or night, elastic for playful). Reveal is how headlines appear. Palette: brand keeps the site's colours, dark puts them on black, invert swaps the background and text, duotone tints the pictures in the brand colour, mono makes them black and white. font: "theme" keeps the site's heading font.`
}

// CSS per layout family, scoped by a class on <body>. W and H are the frame size.
export function lookCss(look, W, H) {
  const L = `.L-${look.layout}`
  const css = {
    classic: '',
    editorial: `
${L} .center{align-items:flex-start;text-align:left;padding:0 220px}
${L} .head{font-weight:400;letter-spacing:-.035em}
${L} .kicker{letter-spacing:.32em;font-weight:500;border-top:2px solid currentColor;padding-top:20px;color:var(--foreground)}
${L} .rule{height:2px;width:1480px;border-radius:0;background:var(--foreground)}
${L} .frame{inset:80px 80px 300px 80px}
${L} .shade{display:none}
${L} .over{bottom:70px;left:80px;right:80px;display:flex;align-items:flex-end;gap:60px}
${L} .over .head{color:var(--foreground)}${L} .over .kicker{color:var(--foreground)}${L} .sub.light{color:var(--muted-foreground);margin:0}
${L} .list li{background:none;border-top:2px solid var(--foreground);border-radius:0;padding:36px 0 0}
${L} .cta{background:var(--background)}${L} .cta .head{color:var(--foreground)}${L} .cta .kicker{color:var(--foreground)}
${L} .btn{background:none;border:2px solid var(--foreground);color:var(--foreground);border-radius:0}
${L} .mosaic .tile{border-radius:0}`,
    brutalist: `
${L} .head{text-transform:uppercase;font-weight:900;letter-spacing:-.045em;line-height:.88}
${L} .center{align-items:flex-start;text-align:left;padding:0 140px}
${L} .kicker{font-family:'Space Mono',monospace;background:var(--foreground);color:var(--background);padding:12px 20px;letter-spacing:.08em}
${L} .over .kicker{color:var(--background);opacity:1}
${L} .rule{height:22px;width:640px;border-radius:0;background:var(--foreground)}
${L} .frame{inset:70px 70px 70px 70px;border:14px solid var(--foreground);box-shadow:28px 28px 0 var(--foreground)}
${L} .shade{background:linear-gradient(180deg,transparent 50%,rgba(0,0,0,.6))}
${L} .list li{border:10px solid var(--foreground);border-radius:0;box-shadow:20px 20px 0 var(--foreground);background:var(--card)}
${L} .btn{border-radius:0;border:8px solid var(--primary-foreground);box-shadow:16px 16px 0 var(--foreground)}
${L} .tint{background:var(--primary)}${L} .tint .head,${L} .tint .mark{color:var(--primary-foreground)}
${L} .mosaic .tile{border:10px solid var(--foreground);border-radius:0}
${L} .stat .num{-webkit-text-stroke:0}`,
    cinematic: `
${L} .scene::after{content:'';position:absolute;left:0;right:0;top:0;height:130px;background:#000;z-index:4;box-shadow:0 ${H - 130}px 0 #000}
${L} .head{font-weight:400;letter-spacing:.14em;text-transform:uppercase;line-height:1.1}
${L} .kicker{letter-spacing:.5em;font-weight:400;color:var(--muted-foreground)}
${L} .sub{font-style:italic}
${L} .rule{height:1px;width:420px}
${L} .over{text-align:center;bottom:190px}
${L} .mosaic .mcopy{bottom:150px}
${L} .shade{background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.75))}
${L} .list li{background:none;border:1px solid rgba(255,255,255,.25);border-radius:0}
${L} .cta{background:#000}${L} .cta .head{color:#fff}
${L} .btn{background:none;color:#fff;border:1px solid #fff;letter-spacing:.2em;text-transform:uppercase;font-size:30px}`,
    collage: `
${L} .frame{inset:auto;left:${W * 0.06 | 0}px;top:110px;width:${W * 0.52 | 0}px;height:${H * 0.68 | 0}px;border:22px solid #fff;border-bottom-width:96px;box-shadow:0 30px 60px rgba(0,0,0,.35);transform:rotate(-3deg)}
${L} .frame::before{content:'';position:absolute;left:42%;top:-46px;width:180px;height:56px;background:rgba(255,240,180,.75);transform:rotate(4deg);z-index:2}
${L} .shade{display:none}
${L} .over{left:${W * 0.63 | 0}px;right:100px;bottom:auto;top:${H * 0.3 | 0}px}
${L} .over .head{font-size:96px !important}
${L} .over .head{color:var(--foreground)}${L} .over .kicker{color:var(--primary)}${L} .sub.light{color:var(--muted-foreground)}
${L} .w>span{background:linear-gradient(transparent 62%,color-mix(in srgb,var(--accent) 45%,transparent) 62%)}
${L} .list li{transform:rotate(var(--tilt,0deg));box-shadow:0 18px 40px rgba(0,0,0,.18);border-top:0;border-radius:4px}
${L} .split .pic{inset:90px 90px 90px auto;width:${W / 2 - 120}px;border:18px solid #fff;box-shadow:0 30px 60px rgba(0,0,0,.3);transform:rotate(2deg)}
${L} .split.flip .pic{inset:90px auto 90px 90px;transform:rotate(-2deg)}
${L} .mosaic .tile{border:16px solid #fff;box-shadow:0 20px 50px rgba(0,0,0,.3);transform:rotate(var(--tilt,0deg))}`,
    neon: `
${L} .head{color:transparent;-webkit-text-stroke:3px var(--primary);text-shadow:0 0 28px var(--primary),0 0 60px var(--primary);font-weight:800}
${L} .light,${L} .cta .head{color:#fff;-webkit-text-stroke:0;text-shadow:0 0 30px var(--primary),0 0 80px var(--primary)}
${L} .kicker{color:var(--accent);text-shadow:0 0 18px var(--accent)}
${L} .rule{box-shadow:0 0 30px 6px var(--primary)}
${L} .list li{background:rgba(255,255,255,.03);border:2px solid var(--accent);box-shadow:0 0 30px color-mix(in srgb,var(--accent) 60%,transparent),inset 0 0 30px color-mix(in srgb,var(--accent) 30%,transparent)}
${L} .frame img,${L} .split img{filter:saturate(1.4) contrast(1.15)}
${L} .cta{background:radial-gradient(circle at 50% 60%,color-mix(in srgb,var(--primary) 50%,#000),#000 70%)}
${L} .btn{background:none;color:#fff;border:3px solid var(--accent);box-shadow:0 0 40px var(--accent)}
${L} .mosaic .tile{border:2px solid var(--primary);box-shadow:0 0 40px var(--primary)}`,
    swiss: `
${L} .center{align-items:flex-start;justify-content:flex-end;text-align:left;padding:0 140px 150px}
${L} .head{font-weight:800;letter-spacing:-.05em;line-height:.92}
${L} .kicker{position:absolute;top:110px;right:140px;font-size:30px;letter-spacing:.1em;color:var(--foreground)}
${L} .rule{position:absolute;left:0;top:0;width:${W * 0.36 | 0}px;height:${H}px;margin:0;border-radius:0;z-index:0;opacity:.95}
${L} .center>*:not(.rule):not(.kicker){position:relative;z-index:1}
${L} .over .kicker{position:static;margin-bottom:24px}
${L} .frame{inset:0 0 0 ${W * 0.4 | 0}px}
${L} .shade{display:none}
${L} .over{left:120px;right:auto;width:${W * 0.33 | 0}px;bottom:120px}
${L} .over .head{color:var(--foreground)}${L} .over .kicker{color:var(--primary)}${L} .sub.light{color:var(--muted-foreground)}
${L} .list ol{grid-template-columns:repeat(3,1fr);gap:0}
${L} .list li{background:none;border:0;border-left:4px solid var(--foreground);border-radius:0;padding:0 40px}
${L} .list li b{font:800 150px/1 var(--fh);color:var(--primary);letter-spacing:-.04em}
${L} .btn{border-radius:0}`,
    magazine: `
${L} .frame{inset:0}
${L} .shade{background:linear-gradient(180deg,rgba(0,0,0,.55),transparent 45%,transparent 70%,rgba(0,0,0,.5))}
${L} .over{top:90px;bottom:auto;left:90px;right:90px}
${L} .over .head{font-size:220px !important;line-height:.85;letter-spacing:-.05em;mix-blend-mode:normal}
${L} .over .kicker{display:inline-block;background:var(--primary);color:var(--primary-foreground);padding:10px 18px;opacity:1}
${L} .over .sub{max-width:900px;font-size:36px}
${L} .head{font-weight:700;font-style:italic}
${L} .kicker{border:2px solid currentColor;padding:8px 16px;letter-spacing:.24em}
${L} .center{padding:0 120px}
${L} .list li{background:none;border-top:10px solid var(--primary);border-radius:0;padding:30px 0}`,
  }
  return css[look.layout] || ''
}

export function paletteVars(look, v) {
  const o = { ...v }
  if (look.palette === 'dark' || look.layout === 'neon' || look.layout === 'cinematic') Object.assign(o, { '--background': '#08080d', '--foreground': '#f4f1ea', '--muted': '#111118', '--card': '#15151d', '--muted-foreground': '#aaa6b8' })
  if (look.palette === 'invert') Object.assign(o, { '--background': v['--foreground'], '--foreground': v['--background'], '--muted': v['--primary'], '--card': v['--foreground'], '--muted-foreground': v['--muted'] })
  return o
}

export function paletteCss(look) {
  if (look.palette === 'duotone') return `.frame img,.split img,.tile img,.footage{filter:grayscale(1) contrast(1.15)}.frame::after,.split .pic::after,.tile::after{content:'';position:absolute;inset:0;background:var(--primary);mix-blend-mode:color;opacity:.85;pointer-events:none}`
  if (look.palette === 'mono') return `.frame img,.split img,.tile img{filter:grayscale(1) contrast(1.2)}`
  return ''
}

// A texture laid over the whole video.
export function textureLayer(look, total) {
  const noise = (f, o) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${o} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`
  const layers = {
    grain: `background:${noise(0.9, 0.55)};opacity:.22;mix-blend-mode:overlay;inset:-60px`,
    paper: `background:${noise(0.04, 0.35)},linear-gradient(rgba(255,244,220,.10),rgba(255,244,220,.10));opacity:.5;mix-blend-mode:multiply`,
    scanlines: `background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 2px,transparent 2px 5px);opacity:.6`,
    halftone: `background:radial-gradient(circle,rgba(0,0,0,.35) 1.6px,transparent 2px) 0 0/11px 11px;opacity:.18;mix-blend-mode:multiply`,
    vignette: `background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.6));`,
  }
  const html = [], tl = []
  look.texture.forEach((t, i) => {
    if (!layers[t]) return
    html.push(`<div id="tx${i}" class="clip tex" data-start="0" data-duration="${total}" style="${layers[t]}"></div>`)
    // grain moves every frame-ish so it reads as film, not a dirty screen
    if (t === 'grain') tl.push(`tl.fromTo('#tx${i}', {x:0, y:0}, {x:-40, y:30, duration:.24, ease:'steps(3)', repeat:${Math.max(0, Math.ceil(total / 0.24) - 1)}, yoyo:true}, 0)`)
  })
  return { html: html.join(''), tl }
}

// How a headline's words come in. sel picks the word spans; at is the time.
export function revealTween(look, sel, at, n = 1) {
  const ease = MOTIONS[look.motion] || 'power3.out'
  const k = look.motion === 'drift' ? 1.35 : look.motion === 'snappy' ? 0.7 : 1
  const d = x => (x * k).toFixed(2)
  switch (look.reveal) {
    case 'blur': return `tl.fromTo('${sel}', {opacity:0, filter:'blur(24px)', y:20}, {opacity:1, filter:'blur(0px)', y:0, duration:${d(0.9)}, ease:'${ease}', stagger:${d(0.09)}}, ${at})`
    case 'pop': return `tl.fromTo('${sel}', {opacity:0, scale:.2}, {opacity:1, scale:1, duration:${d(0.7)}, ease:'${look.motion === 'elastic' ? ease : 'back.out(2.2)'}', stagger:${d(0.08)}}, ${at})`
    case 'slide': return `tl.fromTo('${sel}', {opacity:0, x:-120}, {opacity:1, x:0, duration:${d(0.7)}, ease:'${ease}', stagger:${d(0.06)}}, ${at})`
    case 'type': return `tl.fromTo('${sel}', {opacity:0}, {opacity:1, duration:.01, ease:'none', stagger:${d(Math.min(0.14, 1.1 / Math.max(1, n)))}}, ${at})`
    case 'glitch': return `tl.fromTo('${sel}', {opacity:0, x:i=>((i * 67) % 180) - 90, skewX:40}, {opacity:1, x:0, skewX:0, duration:${d(0.55)}, ease:'steps(6)', stagger:${d(0.05)}}, ${at})`
    default: return `tl.fromTo('${sel}', {y:'110%'}, {y:'0%', duration:${d(0.75)}, ease:'${look.motion === 'smooth' ? 'power4.out' : ease}', stagger:${d(0.07)}}, ${at})`
  }
}

// The cut into scene id at time t. Returns timeline lines; extra elements are made once by cutLayer.
export function cutTween(cut, id, t, W, H) {
  const at = t.toFixed(2), before = (t - 0.35).toFixed(2)
  switch (cut) {
    case 'wipe': return [`tl.fromTo('#wipe', {x:-${W}, opacity:1}, {x:${W}, duration:.7, ease:'power2.inOut', immediateRender:false}, ${before})`]
    case 'fade': return [`tl.fromTo('#${id}', {opacity:0}, {opacity:1, duration:.7, ease:'power1.inOut'}, ${at})`]
    case 'zoom': return [`tl.fromTo('#${id}', {opacity:0, scale:1.22}, {opacity:1, scale:1, duration:.6, ease:'power3.out'}, ${at})`]
    case 'slide': return [`tl.fromTo('#${id}', {x:${W}}, {x:0, duration:.7, ease:'power3.inOut'}, ${at})`]
    case 'push': return [`tl.fromTo('#${id}', {y:${H}}, {y:0, duration:.65, ease:'power4.inOut'}, ${at})`]
    case 'whip': return [`tl.fromTo('#${id}', {x:-${W * 0.6 | 0}, filter:'blur(40px)', opacity:.4}, {x:0, filter:'blur(0px)', opacity:1, duration:.45, ease:'expo.out'}, ${at})`]
    case 'iris': return [`tl.fromTo('#${id}', {clipPath:'circle(0% at 50% 50%)'}, {clipPath:'circle(75% at 50% 50%)', duration:.8, ease:'power3.inOut'}, ${at})`]
    case 'flash': return [`tl.fromTo('#wipe', {x:0, opacity:.95}, {x:0, opacity:0, duration:.35, ease:'power2.out', immediateRender:false}, ${at})`]
    case 'glitch': return [
      `tl.fromTo('#${id}', {x:-60, skewX:20, filter:'hue-rotate(90deg) saturate(3)'}, {x:0, skewX:0, filter:'hue-rotate(0deg) saturate(1)', duration:.4, ease:'steps(7)'}, ${at})`,
      `tl.fromTo('#wipe', {x:0, opacity:.7, scaleY:.08}, {opacity:0, scaleY:.08, duration:.25, ease:'steps(4)', immediateRender:false}, ${at})`,
    ]
    case 'blinds': return [
      `tl.fromTo('#blinds i', {scaleY:0}, {scaleY:1, duration:.3, ease:'power2.in', stagger:.04, immediateRender:false}, ${(t - 0.42).toFixed(2)})`,
      `tl.fromTo('#blinds i', {scaleY:1}, {scaleY:0, duration:.3, ease:'power2.out', stagger:.04, immediateRender:false}, ${(t + 0.02).toFixed(2)})`,
    ]
    case 'split': return [
      `tl.fromTo('#halves i', {scaleX:0}, {scaleX:1, duration:.32, ease:'power3.in', immediateRender:false}, ${(t - 0.34).toFixed(2)})`,
      `tl.fromTo('#halves i', {scaleX:1}, {scaleX:0, duration:.4, ease:'power3.out', immediateRender:false}, ${(t + 0.02).toFixed(2)})`,
    ]
    default: return []
  }
}

export function cutLayer(cuts, total, W, H) {
  const out = []
  if (cuts.includes('blinds')) out.push(`<div id="blinds" class="clip" data-start="0" data-duration="${total}">${Array.from({ length: 6 }, (_, i) => `<i style="top:${(H / 6) * i}px;height:${H / 6 + 1}px"></i>`).join('')}</div>`)
  if (cuts.includes('split')) out.push(`<div id="halves" class="clip" data-start="0" data-duration="${total}"><i style="left:0;transform-origin:left center"></i><i style="right:0;transform-origin:right center"></i></div>`)
  return out.join('\n')
}

export const cutCss = (W, H) => `
#blinds,#halves{position:absolute;inset:0;z-index:11;pointer-events:none}
#blinds i{position:absolute;left:0;width:${W}px;background:var(--primary);transform:scaleY(0);display:block}
#blinds i:nth-child(even){background:var(--foreground)}
#halves i{position:absolute;top:0;width:${W / 2 + 1}px;height:${H}px;background:var(--primary);transform:scaleX(0);display:block}
#halves i+i{background:var(--foreground)}`
