// The brand sheet (docs/specs/31-brand-sheet.md): before a website or app is designed, the story and
// two or three palettes and type pairings side by side. What is picked and locked becomes the build's
// theme as it is (engine/run.mjs), and checkBrand is the reviewer's check that the build kept it.
// Kept on the chat record as `brand` (engine/chats.mjs); server/brand.mjs serves it.
import { namedColours, missingColours } from './pagetype.mjs'
import { BRAND_PACKS, cleanSuggest, suggestByWords, packBrief, packOf, systemOf, applyPack } from './brandpacks.mjs'

const HEX = /^#[0-9a-f]{6}$/i
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
const toHex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`
const norm = h => {
  const s = String(h || '').trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map(c => c + c).join('')}`
  return HEX.test(s) ? s : null
}
export const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t))
const lum = h => { const [r, g, b] = rgb(h).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const light = h => lum(h) > 0.4
// move a colour toward black or white until it reads on the background
function readable(c, bg, need) {
  if (contrast(c, bg) >= need) return c
  const to = light(bg) ? '#000000' : '#ffffff'
  for (let t = 0.1; t <= 1; t += 0.1) { const m = mix(c, to, t); if (contrast(m, bg) >= need) return m }
  return to
}

// one shade for each colour family a person can name (engine/pagetype.mjs FAMILIES)
const SHADE = {
  black: '#16161a', white: '#ffffff', grey: '#4a4541', cream: '#f6f0e4', terracotta: '#b85c3e', red: '#c0392b',
  orange: '#d9772b', yellow: '#d9a62b', olive: '#6f6f32', green: '#2f5a3c', teal: '#1f6f6c', blue: '#2b4a86',
  purple: '#5f4386', pink: '#c85584'
}
const LIGHT_GROUND = ['cream', 'white']
const NEUTRAL = ['black', 'white', 'grey', 'cream']

// A short built-in list, for a board with no model and for the options around what was named
export const PALETTES = [
  { name: 'Paper and ink', bg: '#faf7f2', text: '#1f1d1a', accent: '#b5462f', link: '#2f5a3c' },
  { name: 'Night print', bg: '#141519', text: '#ecebe6', accent: '#e3a33b', link: '#e9c9a0' },
  { name: 'Clean white', bg: '#ffffff', text: '#17191d', accent: '#d2462e', link: '#17191d' },
  { name: 'Sea glass', bg: '#eef3f0', text: '#1d2a27', accent: '#1f6f6c', link: '#a34a32' },
  { name: 'Rose clay', bg: '#f7ece7', text: '#3a2522', accent: '#b85c3e', link: '#5c3a52' },
  { name: 'Deep field', bg: '#1e3a2c', text: '#f3efe4', accent: '#e6b85c', link: '#f3c9a8' }
]
export const TYPES = [
  { name: 'Editorial', heading: 'Fraunces', body: 'Inter', words: /\b(editorial|magazine|soft|warm|story|journal|community|care|blog|press)\b/i },
  { name: 'Classic', heading: 'Playfair Display', body: 'Source Sans 3', words: /\b(classic|elegant|luxury|wine|hotel|restaurant|wedding)\b/i },
  { name: 'Product', heading: 'Space Grotesk', body: 'Inter', words: /\b(app|product|saas|tool|dashboard|tech|startup|clean)\b/i },
  { name: 'Bold', heading: 'Archivo Black', body: 'Archivo', words: /\b(bold|event|festival|sport|drop|sneaker|launch|loud)\b/i },
  { name: 'Quiet', heading: 'Cormorant Garamond', body: 'Lato', words: /\b(quiet|portfolio|minimal|calm|studio|gallery|art)\b/i },
  { name: 'Friendly', heading: 'Bricolage Grotesque', body: 'Figtree', words: /\b(playful|friendly|fun|kids|pets?|club|community|rats?)\b/i }
]

// the colours as the words name them, in the order they are said
function namedInOrder(text) {
  const s = String(text).toLowerCase(), names = namedColours(s)
  const at = n => { const m = new RegExp(`\\b${n === 'grey' ? 'gr[ae]y' : n}`).exec(s); return m ? m.index : 1e9 }
  return names.sort((a, b) => at(a) - at(b))
}

// A palette from a person's words ("cream, warm grey, terracotta and forest green"), or null when
// they name no colour. A light family is the ground; the first strong colour is the accent (buttons),
// the next the links; a dark one, or grey, is the text.
export function paletteFromWords(text, name = 'Your words') {
  const names = namedInOrder(text)
  if (!names.length) return null
  const dark = /\b(dark|night|black background|moody)\b/i.test(text)
  const strong = names.filter(n => !NEUTRAL.includes(n))
  const ground = dark ? (names.includes('black') ? SHADE.black : strong.length ? mix(SHADE[strong.at(-1)], '#000000', 0.55) : SHADE.black)
    : SHADE[names.find(n => LIGHT_GROUND.includes(n))] || '#fbfaf7'
  const text0 = dark ? (names.includes('cream') ? SHADE.cream : '#f1efe9') : names.includes('grey') ? SHADE.grey : names.includes('black') ? SHADE.black : '#1f1d1a'
  const accent = SHADE[strong[0]] || (names.includes('black') && !dark ? SHADE.black : '#b5462f')
  const link = SHADE[strong[1]] || accent
  return fixPalette({ name, bg: ground, text: text0, accent, link, by: 'words' })
}

// every palette reads: text on the ground, the accent as a button, the links as text
export function fixPalette(p) {
  const bg = norm(p.bg) || '#ffffff'
  const text = readable(norm(p.text) || (light(bg) ? '#1a1a1a' : '#f2f2f2'), bg, 7)
  const accent = readable(norm(p.accent) || text, bg, 3)
  const link = readable(norm(p.link) || accent, bg, 4.5)
  return { ...p, name: String(p.name || 'Palette').slice(0, 40), bg, text, accent, link }
}

const story0 = brief => {
  const s = String(brief || '').replace(/\s+/g, ' ').trim()
  let what = s.split(/(?<=[.!?])\s/)[0].replace(/[:;].*$/, '').replace(/^(please\s+)?(build|make|create|design)\s+(me\s+)?/i, '').slice(0, 160)
  what = what && what[0].toUpperCase() + what.slice(1)
  const who = /\b(?:for|serves)\s+([^.,;:]{3,80})/i.exec(s)?.[1] || ''
  return { what, who, pages: ['Home'] }
}

// The board with no model: the named colours first, then variations and the built-in list
export function fallbackOptions(brief = '') {
  const named = paletteFromWords(brief, 'As said')
  const pals = []
  if (named) {
    pals.push(named)
    // the same colours with the roles swapped, and a dark version
    pals.push(fixPalette({ ...named, name: 'Swapped', accent: named.link, link: named.accent, by: 'planner' }))
    const dark = paletteFromWords(`${brief} dark`, 'After dark')
    if (dark && dark.bg !== named.bg) pals.push({ ...dark, by: 'planner' })
  }
  for (const p of PALETTES) if (pals.length < 3 && !pals.some(x => x.bg === p.bg)) pals.push({ ...fixPalette(p), by: 'planner' })
  const fit = TYPES.filter(t => t.words.test(brief))
  const types = [...fit, ...TYPES.filter(t => !fit.includes(t))].slice(0, 3).map(({ name, heading, body }) => ({ name, heading, body }))
  return { story: story0(brief), palettes: pals.slice(0, 3), types }
}

const ids = (list, p) => list.map((x, i) => ({ ...x, id: `${p}${i + 1}` }))
const FONT = /^[A-Z][\w ]{1,38}$/

// One planner call: the story, three palettes and three pairings, validated; the colours the brief
// names are always in the first palette. chat: async messages => text (or null: the built-in list).
export async function brandOptions({ brief = '', chat = null } = {}) {
  const base = fallbackOptions(brief)
  let out = base
  if (chat) {
    const named = namedColours(brief)
    const sys = `You set up a brand sheet for a website before it is designed. Reply with one JSON object and nothing else:
{"story":{"what":"<one line: what it is>","who":"<one line: who it is for>","pages":["<page name>", "..."]},
 "palettes":[{"name":"<2-3 words>","bg":"#hex","text":"#hex","accent":"#hex","link":"#hex"}, two more],
 "types":[{"name":"<1-2 words>","heading":"<Google Font family>","body":"<Google Font family>"}, two more],
 "packs":[{"slug":"<a pack below>","why":"<one short line: why it fits this brief>"}, one or two more]}
The packs: ${BRAND_PACKS.map(p => `${p.slug} (${p.for})`).join('; ')}.
Three palettes that differ from each other (light and dark grounds), three type pairings that differ. 3 to 6 pages.${named.length ? `\nThe first palette uses the colours the brief names: ${named.join(', ')}. Never a colour they say they do not want.` : ''}`
    try {
      const text = String(await chat([{ role: 'system', content: sys }, { role: 'user', content: String(brief).slice(0, 4000) }]) || '')
      const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
      const pals = (Array.isArray(j.palettes) ? j.palettes : []).filter(p => norm(p?.bg) && norm(p?.text) && norm(p?.accent)).slice(0, 3).map(p => fixPalette({ ...p, by: 'planner' }))
      const types = (Array.isArray(j.types) ? j.types : []).filter(t => FONT.test(String(t?.heading || '')) && FONT.test(String(t?.body || ''))).slice(0, 3).map(t => ({ name: String(t.name || t.heading).slice(0, 30), heading: t.heading, body: t.body }))
      const st = j.story || {}
      const story = {
        what: String(st.what || base.story.what).slice(0, 200), who: String(st.who || base.story.who).slice(0, 200),
        pages: (Array.isArray(st.pages) ? st.pages : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 8)
      }
      if (!story.pages.length) story.pages = base.story.pages
      // the model lost the named colours: the words' own palette goes first
      const words = base.palettes.find(p => p.by === 'words')
      if (words && !pals.some(p => !missingIn(brief, p).length)) pals.unshift(words)
      out = { story, palettes: [...pals, ...base.palettes].slice(0, 3), types: [...types, ...base.types].slice(0, 3), suggest: cleanSuggest(j.packs, brief) }
    } catch { out = base }
  }
  return { story: out.story, palettes: ids(out.palettes, 'p'), types: ids(out.types, 't'), suggest: out.suggest || suggestByWords(brief) }
}

// the colour families of the words a palette lacks
const missingIn = (text, p) => missingColours(text, { '--background': p.bg, '--foreground': p.text, '--primary': p.accent, '--accent': p.link })

const picked = (brand, part) => {
  const list = part === 'palette' ? brand?.palettes : brand?.types
  return (list || []).find(x => x.id === brand?.pick?.[part]) || null
}

// the picked palette and type as the build's theme: every variable the pages read
export function brandTheme(brand) {
  const p = picked(brand, 'palette'), t = picked(brand, 'type')
  if (!p || !t) return null
  const lightGround = light(p.bg)
  const card = lightGround ? mix(p.bg, '#ffffff', 0.55) : mix(p.bg, p.text, 0.05)
  const onAccent = contrast('#ffffff', p.accent) >= contrast('#111111', p.accent) ? '#ffffff' : '#111111'
  // a look from Open Design brings its whole system: its tokens go on the page beside the colours (every page
  // sets the theme's variables), and the builders are told to use them (engine/prompts.mjs)
  const slug = brand.pack || (String(p.id || '').startsWith('k-od-') ? p.id.slice(2) : '')
  const sys = slug ? systemOf(slug) : null
  return {
    name: p.name, direction: [String(brand.story?.what || '').replace(/[.\s]+$/, ''), `${p.name}, ${t.heading} and ${t.body}`].filter(Boolean).join('. '),
    vars: {
      ...(sys?.tokens || {}),
      '--background': p.bg, '--foreground': p.text, '--primary': p.accent, '--primary-foreground': onAccent,
      '--muted': mix(p.bg, p.text, 0.07), '--muted-foreground': readable(mix(p.text, p.bg, 0.3), p.bg, 4.5),
      '--border': mix(p.bg, p.text, 0.16), '--accent': p.link, '--card': card, '--link': p.link
    },
    fonts: { heading: t.heading, body: t.body },
    radius: brand.radius || '12px',
    ...(sys ? { system: { slug, name: packOf(slug)?.name || slug, tokens: Object.keys(sys.tokens), rules: sys.rules, components: sys.components } } : {}),
    locked: true
  }
}

// The design system a build asks for by name (decision 0016 point 3: the request, then the project, then the
// default): a pack's whole look as a brand of its own for this build, as if picked and locked on the sheet
export function requestedBrand(slug, brief = '') {
  if (typeof slug !== 'string' || !packOf(slug)) return null
  const b = { palettes: [], types: [], pick: {}, brief, story: {} }
  if (!applyPack(b, slug)) return null
  const theme = brandTheme(b)
  return theme ? { theme, brief: brandBrief(b) } : null
}

// what the sitemap planner is told when the sheet is locked
export function brandBrief(brand) {
  const th = brandTheme(brand)
  if (!th) return ''
  const s = brand.story || {}
  return [
    'The look is locked by the person\'s brand sheet. Use exactly these in the theme line:',
    `background ${th.vars['--background']}, text ${th.vars['--foreground']}, main colour ${th.vars['--primary']}, links ${th.vars['--accent']}; headings in ${th.fonts.heading}, body in ${th.fonts.body}.`,
    s.what ? `What it is: ${s.what}` : '', s.who ? `Who it is for: ${s.who}` : '',
    s.pages?.length ? `Pages: ${s.pages.join(', ')}.` : '',
    packBrief(brand)
  ].filter(Boolean).join('\n')
}

// The reviewer's check: the locked colours and fonts the theme does not have
export function checkBrand(theme, locked) {
  const want = locked?.vars || {}, have = theme?.vars || {}
  const off = ['--background', '--foreground', '--primary', '--accent'].filter(k => want[k] && norm(have[k]) !== norm(want[k]))
  const fonts = !!locked?.fonts && (theme?.fonts?.heading !== locked.fonts.heading || theme?.fonts?.body !== locked.fonts.body)
  return { off, fonts }
}

export { picked as pickedOf }
