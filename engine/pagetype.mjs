// Page types: each build picks one before planning, and it sets the grid, the
// section shapes and the voice. Without this every site came out the same shape
// (centred column, hero, "three things", schedule, story, CTA) with the same
// two-beat headlines, and only the colours changed. The pick skips the types and
// palettes the last few builds used, so builds side by side look different.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const PAGE_TYPES = {
  poster: {
    name: 'Poster',
    words: /festival|club|party|night|gig|concert|launch|drop|rave|show|tour|fest|jam|con\b|convention|premiere/i,
    sections: 'hero, manifesto, lineup, big-number, poster-wall, ticket, final-call',
    grid: 'Poster layout. Sections run edge to edge with no centred card column: full-bleed colour fields, alternating bg-[var(--primary)] and bg-[var(--background)]. Huge display type (headlines text-6xl on phones, text-8xl to text-9xl at desktop, leading-[0.9]), set left or off-centre, never centred in a box. Few words per section. Inner text width max-w-7xl px-6.',
    voice: 'Loud and short, like a printed poster: a name, a date, a place, a dare. Single strong phrases, not slogans.'
  },
  editorial: {
    name: 'Magazine',
    words: /magazine|journal|story|stories|essay|culture|food|restaurant|chef|wine|coffee|roast|bakery|travel|hotel|studio|craft|book/i,
    sections: 'cover-story, standfirst, feature, pull-quote, photo-essay, interview, field-notes',
    grid: 'Magazine layout on an asymmetric 12-column grid (max-w-7xl px-6): body text sits in a narrow column (md:col-span-5) set against a wide picture or pull quote (md:col-span-7), and the side swaps from section to section. Big serif-style headlines, a drop cap on the first paragraph of a feature, thin rules (border-t) between sections, small-caps captions under pictures. Nothing centred except the pull quote.',
    voice: 'Magazine headlines: a pun, a question or a scene, followed by a one-sentence standfirst. Body copy in full sentences with real detail.'
  },
  shop: {
    name: 'Shop',
    words: /shop|store|buy|merch|product|brand|apparel|clothing|sneaker|skincare|candle|plant|bike|gear|sell|market\b|bag|tea/i,
    sections: 'drop-hero, product-grid, bundle, materials, size-guide, reviews, shipping-faq',
    grid: 'Shop layout, product first: dense grids of product cards (2 across on phones, 3 to 4 at desktop) with name, price and an add button on every card; tight spacing and small UI type; a short hero (under 520px tall) built around one product. max-w-7xl px-6. Filters and tabs as a row of small pills.',
    voice: 'Plain retail: product names, prices, materials and sizes. No slogans; the most a heading says is what the shelf is.'
  },
  tool: {
    name: 'Tool',
    words: /book|booking|search|flight|find|compare|calculator|plan|planner|schedule|track|app|dashboard|saas|finance|budget|tracker|rent|reserve/i,
    sections: 'search-panel, results, comparison-table, calendar, how-it-works, faq',
    grid: 'Works like an app, not a brochure: the hero is a real working-looking form or widget (search, picker, calculator or calendar) in a card, and the other sections are panels with tabs, tables, filters and toggles. Compact sans-serif UI type, text-sm to text-base, headings no bigger than text-4xl. max-w-6xl px-6.',
    voice: 'Functional: field labels, short instructions, numbers. Headings say what the panel does ("Fares this month"), never a tagline.'
  },
  zine: {
    name: 'Zine',
    words: /zine|diy|punk|craft|collage|kids|school|club|community|volunteer|garden|skate|thrift|sticker|handmade|workshop|art/i,
    sections: 'cover, cut-and-paste, list, letters, map-sketch, back-page',
    grid: 'Pasted-up zine spread, pictures first: every section is led by a big picture (full-bleed, or at least half the width at desktop), and the words sit on it or beside it like a cut-out caption. Pictures pasted at slight angles (rotate-1, -rotate-2) and overlapping a little in the normal flow (negative margins, not absolute text), torn or rough edges drawn with clip-path, a tape strip on a corner, giant mixed-size display type, hand-drawn SVG doodles and arrows. No boxed text cards: never a grid of bordered boxes, never hard offset drop shadows, no monospace label chips. Few words per section. max-w-7xl px-6, broken often.',
    voice: 'First person, chatty, a bit scrappy; lowercase headings are fine. Write like a person handing you a flyer.'
  },
  gallery: {
    name: 'Gallery',
    words: /portfolio|gallery|photograph|artist|illustrat|design studio|architect|exhibit|museum|archive|film|director|animation/i,
    sections: 'index, work-grid, case, process-strip, about, contact',
    grid: 'Gallery layout, pictures first: an uneven grid of large pictures (mix of tall and wide tiles, some spanning two columns), very little text, small captions under each piece; a narrow left column (md:col-span-3) for labels with the work on the right. Lots of empty space, small type. max-w-7xl px-6.',
    voice: 'Understated: titles, years, materials, one-line captions. Let the work talk.'
  },
  longform: {
    name: 'Longform',
    words: /history|memoir|story|non-?profit|charity|mission|campaign|cause|heritage|documentary|journey|founder|origin|river|ocean|climate/i,
    sections: 'opening, chapter-one, full-bleed-break, timeline, chapter-two, epilogue',
    grid: 'Longform reading layout: text in one narrow column (max-w-2xl mx-auto px-6, text-lg leading-relaxed), broken up by full-bleed colour or picture breaks between chapters. Numbered chapter openers with a big numeral. A vertical timeline. No card grids.',
    voice: 'Narrative: chapter titles and full sentences that tell what happened, in order. Headings name a moment, not a benefit.'
  },
  index: {
    name: 'Index',
    words: /conference|summit|agency|consult|law|clinic|school|course|program|residency|lab|research|guide|directory|list|schedule|timetable/i,
    sections: 'masthead, index-list, schedule-table, specs, people, contact',
    grid: 'Swiss index layout: everything in rows separated by 1px rules (border-t border-[var(--border)]), a 12-column grid with a mono label column on the left (md:col-span-3) and content on the right; no cards, no shadows, square corners (rounded-none), no big pictures, only small thumbnails. max-w-7xl px-6.',
    voice: 'Terse and informational: labels and values, dates, names. No marketing lines at all.'
  },
  arcade: {
    name: 'Arcade',
    words: /game|play|arcade|level|quest|rpg|platformer|puzzle|pixel|steam|itch|console|player|boss|dungeon/i,
    sections: 'key-art, trailer, characters, levels, how-to-play, wishlist',
    grid: 'Game landing: a full-bleed key-art hero, then framed panels with thick borders like game UI windows, chunky display type, stat bars and level cards in a strip, character cards with a name plate, one huge Play or Wishlist button. max-w-6xl px-6 inside the panels.',
    voice: 'Game voice: in-world names, level titles and short calls to play. Talk to the player.'
  }
}

const KEYS = Object.keys(PAGE_TYPES)

// The type that fits the brief best, skipping the ones used lately. Ties and
// briefs that fit nothing go to a random type, so two similar briefs still differ.
export function pickPageType(brief = '', recent = [], rand = Math.random) {
  const avoid = new Set(recent.slice(0, 4))
  const open = KEYS.filter(k => !avoid.has(k))
  const pool = open.length ? open : KEYS
  const scored = pool.map(k => ({ k, n: (String(brief).match(new RegExp(PAGE_TYPES[k].words.source, 'gi')) || []).length }))
  const best = Math.max(...scored.map(s => s.n))
  const top = best > 0 ? scored.filter(s => s.n === best) : scored
  return top[Math.floor(rand() * top.length)].k
}

// --- palettes the last builds used, so the next one moves away from them
const hex = h => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(h || '').trim())
  if (!m) return null
  const s = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255)
}
export function isDark(h) {
  const c = hex(h)
  return c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 0.45 : false
}
export function hueName(h) {
  const c = hex(h)
  if (!c) return ''
  const [r, g, b] = c
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.12) return max > 0.6 ? 'white or grey' : 'black or grey'
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  hue = (hue * 60 + 360) % 360
  return hue < 15 || hue >= 345 ? 'red' : hue < 45 ? 'orange or amber' : hue < 70 ? 'yellow' : hue < 160 ? 'green' : hue < 200 ? 'teal or cyan' : hue < 255 ? 'blue' : hue < 290 ? 'violet' : 'pink or magenta'
}

// What the last few saved runs used: page type and theme colours, newest first.
export function recentLooks(runsDir, n = 4) {
  let ids = []
  try { ids = readdirSync(runsDir).filter(d => /^\d{4}-/.test(d)).sort().reverse() } catch { return [] }
  const out = []
  for (const id of ids) {
    if (out.length >= n) break
    const file = join(runsDir, id, 'events.jsonl')
    if (!existsSync(file)) continue
    let type = '', vars = null, font = ''
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.includes('"type":"theme"') && !line.includes('"type":"pagetype"')) continue
        const e = JSON.parse(line)
        if (e.type === 'pagetype') type = e.key
        if (e.type === 'theme' && !vars) { vars = e.vars || null; font = e.fonts?.heading || '' }
        if (vars && type) break
      }
    } catch { continue }
    if (vars || type) out.push({ type, font, background: vars?.['--background'] || '', primary: vars?.['--primary'] || '' })
  }
  return out
}

// The ground (background family) of a theme: dark, cream, white or colour.
export function groundOf(h) {
  const c = hex(h)
  if (!c) return ''
  const [r, g, b] = c
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max - min >= 0.25 && max > 0.3) return 'colour'
  if (isDark(h)) return 'dark'
  if (max - min < 0.12) return r - b > 0.025 ? 'cream' : 'white'
  return max > 0.85 && r >= b && (max - min) < 0.2 ? 'cream' : 'colour'
}

const GROUNDS = {
  dark: 'a dark background: near-black or a very deep colour (lightness under 15%), with light text',
  white: 'a clean white or cool light-grey background (#ffffff to #eef0f2), dark text; not cream, not beige',
  colour: 'a strongly coloured background: one saturated or deep hue fills the page (not white, cream, beige or black), text in white or near-black for contrast'
}
const HUES = ['red', 'orange or amber', 'yellow', 'green', 'teal or cyan', 'blue', 'violet', 'pink or magenta']

// The look this build must take, decided in code so a small planner cannot drift back
// to the same cream page: a ground the last two builds did not use, and a main colour
// none of the last four used.
// A brief that names its own colours or mood (dark, pastel, neon, black and gold…) keeps them.
const COLOUR_WORDS = /\b(dark|light|black|white|cream|beige|pastel|neon|monochrome|mono|colou?rs?|palette|red|orange|amber|yellow|gold|green|teal|cyan|blue|navy|violet|purple|pink|magenta|brown)\b/i
export function pickLook(recent = [], rand = Math.random, brief = '') {
  if (COLOUR_WORDS.test(brief)) return { ground: '', hue: '' }
  const grounds = recent.map(r => groundOf(r.background)).filter(Boolean)
  const last = grounds.slice(0, 2)
  const free = Object.keys(GROUNDS).filter(g => !last.includes(g))
  const count = g => grounds.filter(x => x === g).length
  const least = Math.min(...free.map(count))
  const pool = free.filter(g => count(g) === least)
  const ground = pool[Math.floor(rand() * pool.length)] || 'dark'
  const used = new Set(recent.slice(0, 4).map(r => hueName(r.primary)))
  const hues = HUES.filter(h => !used.has(h))
  const hue = hues.length ? hues[Math.floor(rand() * hues.length)] : ''
  return { ground, hue }
}

// The lines the sitemap planner reads: the page type, and the look this build must take.
export function lookBrief(key, recent = [], look = pickLook(recent)) {
  const t = PAGE_TYPES[key]
  const lines = [
    `Page type: ${t.name}. ${t.grid}`,
    `Voice: ${t.voice}`,
    `Pick each page's sections from this kind of list (rename or swap to fit, keep the character): ${t.sections}.`
  ]
  const fonts = [...new Set(recent.map(r => r.font).filter(Boolean))].slice(0, 4)
  if (fonts.length) lines.push(`Recent builds used these heading fonts, so use a different one: ${fonts.join(', ')}.`)
  if (look?.ground) lines.push(`Required for this build's theme: --background is ${GROUNDS[look.ground]}.`)
  if (look?.hue) lines.push(`Required: --primary is a ${look.hue} colour. Never a cream, beige or paper-coloured background.`)
  return lines.join('\n')
}

// --- hsl helpers for the fallback below
const toHex = (h, s, l) => {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0')
  return `#${f(0)}${f(8)}${f(4)}`
}
const hueDeg = h => {
  const c = hex(h)
  if (!c) return 30
  const [r, g, b] = c
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 30
  const x = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (x * 60 + 360) % 360
}

// When the planner ignores the required ground anyway, the surface colours are rebuilt
// around its own main colour. The primary, fonts and name stay the planner's.
export function fitTheme(theme, look) {
  const vars = theme?.vars
  if (!vars || !look?.ground || groundOf(vars['--background']) === look.ground) return theme
  // a coloured ground keeps the planner's own background hue when it chose one (its "deep
  // midnight blue" stays blue); only a grey or black one takes the main colour's hue
  const own = hsl(vars['--background'])
  const h = Math.round(look.ground === 'colour' && own && own.s >= 0.25 ? own.h : hueDeg(vars['--primary']))
  const set = look.ground === 'dark'
    ? { bg: toHex(h, 22, 7), card: toHex(h, 18, 11), muted: toHex(h, 14, 15), border: toHex(h, 12, 22), fg: '#f3f1ee', mfg: toHex(h, 8, 68) }
    : look.ground === 'white'
      ? { bg: '#ffffff', card: '#f5f6f7', muted: '#eef0f2', border: '#dfe2e6', fg: '#121314', mfg: '#5b6068' }
      : { bg: toHex(h, 62, 24), card: toHex(h, 55, 30), muted: toHex(h, 45, 34), border: toHex(h, 40, 42), fg: '#fbf9f6', mfg: toHex(h, 30, 80) }
  const out = { ...vars, '--background': set.bg, '--card': set.card, '--muted': set.muted, '--border': set.border, '--foreground': set.fg, '--muted-foreground': set.mfg }
  if (look.ground === 'colour') {
    // the main colour cannot vanish into a field of its own hue: a light accent instead, unless its
    // own hue is already far from the ground
    const away = Math.abs(((hueDeg(vars['--primary']) - h + 540) % 360) - 180)
    if (away < 60) {
      out['--primary'] = toHex((h + 180) % 360, 85, 62)
      out['--primary-foreground'] = '#121314'
    }
  }
  return { ...theme, vars: out, fitted: look.ground }
}

// The colours a brief or a talk names, as families a theme can be checked against. A colour named
// after no / not / without / avoid / hate is one they do not want, so it is not asked for.
const FAMILIES = [
  ['black', /\b(black|charcoal|jet)\b/, c => c.l < 0.2],
  ['white', /\b(white|off-white)\b/, c => c.l > 0.9],
  ['grey', /\b(gr[ae]y|slate|stone)\b/, c => c.s < 0.2 || (c.l < 0.6 && c.s < 0.3)],
  ['cream', /\b(cream|beige|ivory|sand|paper|oat)\b/, c => c.l > 0.8 && (c.s < 0.15 || (c.h >= 20 && c.h <= 65))],
  ['terracotta', /\b(terracotta|rust|brick|clay|coral)\b/, c => c.s > 0.25 && (c.h <= 35 || c.h >= 350) && c.l > 0.25 && c.l < 0.75],
  ['red', /\bred\b/, c => c.s > 0.3 && (c.h < 18 || c.h >= 340)],
  ['orange', /\b(orange|amber|peach)\b/, c => c.s > 0.3 && c.h >= 15 && c.h < 48],
  ['yellow', /\b(yellow|gold|golden|mustard|ochre)\b/, c => c.s > 0.25 && c.h >= 35 && c.h < 68],
  ['olive', /\b(olive)\b/, c => c.s > 0.15 && c.h >= 45 && c.h < 100],
  ['green', /\b(green|forest|sage|mint|emerald|moss)\b/, c => c.s > 0.12 && c.h >= 68 && c.h < 168],
  ['teal', /\b(teal|cyan|turquoise|aqua)\b/, c => c.s > 0.2 && c.h >= 160 && c.h < 205],
  ['blue', /\b(blue|navy|cobalt|azure|indigo|midnight)\b/, c => c.s > 0.2 && c.h >= 195 && c.h < 258],
  ['purple', /\b(purple|violet|lavender|lilac|plum)\b/, c => c.s > 0.15 && c.h >= 250 && c.h < 300],
  ['pink', /\b(pink|magenta|rose|blush|fuchsia)\b/, c => c.s > 0.25 && (c.h >= 290 || c.h < 12) && c.l > 0.35]
]
const NOT_WANTED = /\b(no|not|never|without|avoid|hate|dislike|instead of|except)\b[^.;:!?]{0,24}$/i
export function namedColours(text = '') {
  const s = String(text).toLowerCase()
  const out = []
  for (const [name, re] of FAMILIES) {
    const g = new RegExp(re.source, 'g')
    let m, wanted = false
    while ((m = g.exec(s))) if (!NOT_WANTED.test(s.slice(Math.max(0, m.index - 40), m.index))) wanted = true
    if (wanted) out.push(name)
  }
  return out
}
function hsl(hx) {
  const c = hex(hx)
  if (!c) return null
  const [r, g, b] = c, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d) h = (((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360
  return { h, s, l }
}
// the named colours a theme does not have anywhere in its main colours (the reviewer's check)
export function missingColours(text, vars = {}) {
  const cols = ['--background', '--foreground', '--primary', '--accent', '--card', '--muted', '--border', '--muted-foreground'].map(k => hsl(vars[k])).filter(Boolean)
  const want = namedColours(text)
  return want.filter(name => {
    const test = FAMILIES.find(f => f[0] === name)[2]
    return !cols.some(test)
  })
}

// Every page type: no stock formula headlines. These came up on nearly every site.
export const VOICE_RULES = `- Headlines: no two-beat fragment formula ("Twelve Seats. Take One.", "Nothing added. Nothing hidden.", "One broth. That's it."), no counted openers ("Three ways to...", "Four reasons..."), no "Save your seat", "Start with a ...", "Your X starts here". At most one headline per page may end in a full stop.
- Each headline sounds like this page type's voice, not like an ad.`
