// Brand packs (docs/specs/31-brand-sheet.md, slice 2): ready-made sets for the brand sheet. Each pack is
// a picture style with real sample pictures, a mood and feel (palette, type and corners), a brand voice
// with sample lines, and a storyboard (one rough frame per kind of page). Picking a pack fills the board;
// every part stays swappable, and parts of different packs mix.
//
// Packs are data. A pack's slug has the Feed's form (swarm-feed `swarm.packs.slug`, the `pack` a build is
// posted with), so a build made from a pack can carry it to the Feed once the Feed lists that slug.
// The pictures are the shipped stock library (engine/stock/library.json: Pexels photos with tags, moods
// and people counts, credit kept) and the art director's STYLES (engine/artdirect.mjs). Websites mostly get
// realistic people or a mature painted look; anime is one option, never the default.
import { readFileSync } from 'node:fs'
import { STYLES } from './artdirect.mjs'
import { fixPalette } from './brand.mjs'

export const PACK_SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/

export const BRAND_PACKS = [
  {
    slug: 'warm-editorial', name: 'Warm editorial',
    for: 'a local place, a maker, a story told slowly',
    words: /\b(bakery|caf[eé]|coffee|restaurant|food|kitchen|shop|maker|craft|journal|magazine|blog|editorial|story|local|neighbou?rhood|farm|wine|books?|care|guide)\b/i,
    palette: { name: 'Warm editorial', bg: '#f5efe6', text: '#2e2a26', accent: '#b5523b', link: '#2f5d50' },
    type: { name: 'Warm editorial', heading: 'Fraunces', body: 'Source Sans 3' },
    radius: '6px',
    voice: { name: 'Warm and unhurried', lines: ['Made slowly, by people who care how it turns out.', 'Come by on a Saturday. The door is open from eight.'] },
    pictures: { style: 'photo', tags: ['bakery', 'coffee', 'kitchen', 'market', 'books', 'craft'], mood: ['warm', 'cozy', 'rustic', 'friendly', 'relaxed'], people: true },
    storyboard: ['A wide photo with one warm line', 'The story in two short columns', 'Three things worth knowing', 'Where to find us']
  },
  {
    slug: 'clean-product', name: 'Clean product',
    for: 'an app, a tool, a service with a clear job',
    words: /\b(app|saas|software|tool|platform|dashboard|product|startup|service|api|tech|finance|bank|crm|booking|tracker|ai)\b/i,
    palette: { name: 'Clean product', bg: '#ffffff', text: '#16181d', accent: '#2453d4', link: '#2453d4' },
    type: { name: 'Clean product', heading: 'Inter Tight', body: 'Inter' },
    radius: '12px',
    voice: { name: 'Plain and exact', lines: ['Set it up in five minutes. Keep it for years.', 'Everything you need, and nothing you will have to learn twice.'] },
    pictures: { style: 'photo', tags: ['laptop', 'workspace', 'office', 'desk', 'phone', 'technology'], mood: ['clean', 'minimal', 'modern', 'focused', 'professional'], people: null },
    storyboard: ['One promise and the product beside it', 'Three things it does', 'A real person using it', 'Start for free']
  },
  {
    slug: 'bold-event', name: 'Bold event',
    for: 'a launch, a festival, a drop, a night out',
    words: /\b(event|festival|concert|party|launch|drop|sneakers?|sport|race|tickets?|tour|gig|club night|conference|summit|countdown)\b/i,
    palette: { name: 'Bold event', bg: '#121212', text: '#f4f1ea', accent: '#ff4d2e', link: '#ffd23f' },
    type: { name: 'Bold event', heading: 'Anton', body: 'Archivo' },
    radius: '0px',
    voice: { name: 'Loud and short', lines: ['One night. No repeats.', 'Doors at nine. Bring everyone.'] },
    pictures: { style: 'photo', tags: ['concert', 'crowd', 'party', 'night', 'music', 'festival'], mood: ['energetic', 'social', 'busy', 'joyful', 'active'], people: true },
    storyboard: ['The date, huge, over a crowd', 'Who is on, in a grid', 'Tickets', 'How to get there']
  },
  {
    slug: 'quiet-portfolio', name: 'Quiet portfolio',
    for: 'a studio, an artist, a practice that lets the work speak',
    words: /\b(portfolio|studio|architect\w*|artist|photograph\w*|gallery|designer|interior|practice|minimal|calm|quiet|ceramics?|therap\w+)\b/i,
    palette: { name: 'Quiet portfolio', bg: '#f6f5f2', text: '#1c1c1c', accent: '#1c1c1c', link: '#6b5a48' },
    type: { name: 'Quiet portfolio', heading: 'Cormorant Garamond', body: 'Karla' },
    radius: '2px',
    voice: { name: 'Quiet and sure', lines: ['Selected work, 2019 to now.', 'For commissions, write a few lines about the room.'] },
    pictures: { style: 'photo', tags: ['interior', 'architecture', 'studio', 'design', 'ceramics', 'gallery'], mood: ['calm', 'quiet', 'minimal', 'serene', 'peaceful'], people: false },
    storyboard: ['One picture, almost alone', 'The work, in a quiet grid', 'A short note about the practice', 'Contact']
  },
  {
    slug: 'playful-community', name: 'Playful community',
    for: 'a club, a group, a community people join',
    words: /\b(community|club|group|members?|meetups?|volunteer|school|kids|famil(y|ies)|pets?|rats?|dogs?|cats?|hobby|friends|neighbou?rs|charity|nonprofit)\b/i,
    palette: { name: 'Playful community', bg: '#fff8ec', text: '#2b2340', accent: '#e8553a', link: '#2a7d6f' },
    type: { name: 'Playful community', heading: 'Bricolage Grotesque', body: 'Nunito' },
    radius: '18px',
    voice: { name: 'Friendly and open', lines: ['New here? Say hi, everyone was new once.', 'Next meetup is Sunday. Snacks are on us.'] },
    pictures: { style: 'photo', tags: ['community', 'volunteers', 'friends', 'group', 'park', 'picnic'], mood: ['playful', 'friendly', 'joyful', 'social', 'collaborative'], people: true },
    storyboard: ['People together, and a warm hello', 'What we do, in three cards', 'The next meetup', 'Join us']
  }
]

export const packOf = slug => BRAND_PACKS.find(p => p.slug === slug) || null

// ---------- the sample pictures: three stock photos that fit the pack's mood (and the brief, when it says)
let photos = null
function library() {
  if (photos) return photos
  try { photos = JSON.parse(readFileSync(new URL('./stock/library.json', import.meta.url), 'utf8')).photos || [] } catch { photos = [] }
  photos = photos.filter(p => p.url && p.photo !== false)
  return photos
}
const wordsOf = s => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || [])
export function packPhotos(pack, brief = '', { taken = new Set(), n = 3, list = library() } = {}) {
  const want = wordsOf(brief), mood = new Set(pack.pictures.mood), subj = new Set(pack.pictures.tags || [])
  const scored = []
  for (const p of list) {
    if (taken.has(p.url)) continue
    if (pack.pictures.people === true && !(p.people > 0)) continue
    if (pack.pictures.people === false && p.people > 0) continue
    let s = 0
    for (const m of p.mood || []) if (mood.has(m)) s += 2
    for (const t of [...(p.tags || []), ...(p.businesses || []).flatMap(b => b.split(' '))]) { const w = String(t).toLowerCase(); if (want.has(w)) s += 1; if (subj.has(w)) s += 1.5 }
    s += (p.quality || 3) / 5
    if (s >= 2) scored.push([s, p])
  }
  scored.sort((a, b) => b[0] - a[0])
  // never two of the same shot (two takes of hands kneading dough)
  const seen = new Set(), pick = []
  for (const x of scored) { const k = String(x[1].alt || x[1].caption || '').toLowerCase().slice(0, 24); if (seen.has(k)) continue; seen.add(k); pick.push(x); if (pick.length === n) break }
  return pick.map(([, p]) => ({ url: p.url, alt: String(p.alt || p.caption || '').slice(0, 140), credit: p.credit || 'Pexels', aspect: p.aspect || 'wide' }))
}

// ---------- the cards the board shows: every pack, its look, its photos and, when suggested, why
export function packCards(brief = '', suggest = []) {
  const taken = new Set()
  const why = new Map((suggest || []).map(s => [s.slug, s.why]))
  const order = [...BRAND_PACKS].sort((a, b) => (why.has(b.slug) ? 1 : 0) - (why.has(a.slug) ? 1 : 0))
  return order.map(p => {
    const pics = packPhotos(p, brief, { taken })
    pics.forEach(x => taken.add(x.url))
    return {
      slug: p.slug, name: p.name, for: p.for, why: why.get(p.slug) || '', suggested: why.has(p.slug),
      palette: fixPalette({ ...p.palette }), type: p.type, radius: p.radius, voice: p.voice,
      pictures: { style: p.pictures.style, name: STYLES[p.pictures.style]?.name || p.pictures.style, photos: pics },
      storyboard: p.storyboard
    }
  })
}

// ---------- which packs fit a brief, with one line each: by the brief's words, when there is no planner
export function suggestByWords(brief = '') {
  const hits = BRAND_PACKS.map(p => [(String(brief).match(new RegExp(p.words.source, 'gi')) || []).length, p]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0])
  const pick = hits.slice(0, 3).map(([, p]) => p)
  for (const slug of ['warm-editorial', 'clean-product', 'playful-community']) if (pick.length < 2 && !pick.some(p => p.slug === slug)) pick.push(packOf(slug))
  return pick.map(p => ({ slug: p.slug, why: `For ${p.for}.` }))
}

// the planner's picks, kept only when they name real packs; at most three, at least two
export function cleanSuggest(list, brief = '') {
  const seen = new Set()
  const out = (Array.isArray(list) ? list : []).map(x => ({ slug: String(x?.slug || '').trim(), why: String(x?.why || '').trim().replace(/\s+/g, ' ').slice(0, 120) }))
    .filter(x => packOf(x.slug) && x.why && !seen.has(x.slug) && seen.add(x.slug)).slice(0, 3)
  if (out.length >= 2) return out
  for (const x of suggestByWords(brief)) if (out.length < 2 && !out.some(o => o.slug === x.slug)) out.push(x)
  return out
}

// ---------- applying a pack (or some of its parts) to a sheet. parts: palette (with its corners), type,
// voice, pictures. A pack's palette and type join the sheet's options, so another pack's part, or the
// sheet's own options, can still be picked: that is the mix.
export const PARTS = ['palette', 'type', 'voice', 'pictures']
export function applyPack(brand, slug, parts = PARTS, brief = '') {
  const p = packOf(slug)
  if (!p) return false
  const want = PARTS.filter(x => parts.includes(x))
  const id = `k-${slug}`
  if (want.includes('palette')) {
    if (!brand.palettes.some(x => x.id === id)) brand.palettes.push({ ...fixPalette({ ...p.palette }), id, by: 'pack' })
    brand.pick.palette = id
    brand.radius = p.radius
  }
  if (want.includes('type')) {
    if (!brand.types.some(x => x.id === id)) brand.types.push({ ...p.type, id, by: 'pack' })
    brand.pick.type = id
  }
  if (want.includes('voice')) brand.voice = { pack: slug, name: p.voice.name, lines: [...p.voice.lines] }
  if (want.includes('pictures')) {
    const taken = new Set()
    brand.pictures = { pack: slug, style: p.pictures.style, name: STYLES[p.pictures.style]?.name || p.pictures.style, photos: packPhotos(p, brief || brand.brief, { taken }) }
  }
  if (want.length === PARTS.length) { brand.pack = slug; brand.storyboard = { pack: slug, frames: [...p.storyboard] } }
  return true
}

// what the build is told about the voice and the pictures, when the sheet has them
export function packBrief(brand) {
  const out = []
  if (brand?.voice?.lines?.length) out.push(`The voice: ${brand.voice.name.toLowerCase()}. Write the copy the way these lines sound: "${brand.voice.lines.join('" "')}"`)
  const st = brand?.pictures && STYLES[brand.pictures.style]
  if (st) out.push(`Pictures: ${st.name}. ${st.guide}`)
  return out.join('\n')
}
