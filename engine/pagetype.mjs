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
    grid: 'Cut-and-paste zine layout: cards set at slight angles (rotate-1, -rotate-2), tape-strip labels, mixed type sizes on one line, hand-drawn SVG doodles and arrows, thick borders with hard offset shadows (shadow-[6px_6px_0_var(--foreground)]), elements that overlap a little in the normal flow (negative margins, not absolute text). max-w-6xl px-6, broken often.',
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

// The lines the sitemap planner reads: the page type, and the palette to move away from.
export function lookBrief(key, recent = []) {
  const t = PAGE_TYPES[key]
  const lines = [
    `Page type: ${t.name}. ${t.grid}`,
    `Voice: ${t.voice}`,
    `Pick each page's sections from this kind of list (rename or swap to fit, keep the character): ${t.sections}.`
  ]
  const fonts = [...new Set(recent.map(r => r.font).filter(Boolean))].slice(0, 4)
  if (fonts.length) lines.push(`Recent builds used these heading fonts, so use a different one: ${fonts.join(', ')}.`)
  const cols = recent.filter(r => r.background || r.primary).slice(0, 4)
  if (cols.length) {
    const dark = cols.filter(r => isDark(r.background)).length
    const hues = [...new Set(cols.map(r => hueName(r.primary)).filter(Boolean))]
    if (dark >= 2) lines.push('The last builds were dark: use a light background this time.')
    else if (cols.length - dark >= 2) lines.push('The last builds were light: a dark or strongly coloured background is welcome this time.')
    const cream = cols.filter(r => !isDark(r.background) && hueName(r.background) !== 'white or grey').length
    if (cream) lines.push('Avoid a cream, beige or paper-coloured background: a recent build used one.')
    if (hues.length) lines.push(`The last builds used ${hues.join(', ')} for the main colour: pick a clearly different main colour.`)
  }
  return lines.join('\n')
}

// Every page type: no stock formula headlines. These came up on nearly every site.
export const VOICE_RULES = `- Headlines: no two-beat fragment formula ("Twelve Seats. Take One.", "Nothing added. Nothing hidden.", "One broth. That's it."), no counted openers ("Three ways to...", "Four reasons..."), no "Save your seat", "Start with a ...", "Your X starts here". At most one headline per page may end in a full stop.
- Each headline sounds like this page type's voice, not like an ad.`
