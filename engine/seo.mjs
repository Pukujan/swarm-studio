// SEO for every build, written by the crew (owner, 2026-11-11: "they can all use seo",
// "their own seo, and our agents should support it").
//
// The page planner writes each page's search title, description and the facts for
// structured data in the call it already makes (one "seo" line after its layers).
// After the build the reviewer checks them (lengths, the same title or description
// on two pages, one h1, no empty alt) and fixes what fails without another model
// round. The export writes the head tags, JSON-LD, a share image sized 1200 x 630,
// a favicon, robots.txt, sitemap.xml and a 404 page; publish writes them again with
// the site's real address. Nothing is invented: a fact reaches the structured data
// only when the site's own copy says it, and ratings and reviews never do.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { navBrand } from './naming.mjs'

export const TITLE_MAX = 60
export const DESC_MIN = 70
export const DESC_MAX = 160

const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const attr = s => squash(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', euro: '€', pound: '£', copy: '©' }
const decode = s => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? ' ')
export const plain = html => squash(decode(String(html || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')))
const key = s => squash(s).toLowerCase()

// Clip at a sentence end when one fits, else at a word, with an ellipsis.
export function clipText(s, max) {
  const t = squash(s)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (end >= max * 0.55) return cut.slice(0, end + 1)
  const word = cut.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[\s,;:·—–-]+$/, '')
  return `${word}…`
}

// ---------- the planner's line

export const SCHEMA_TYPES = ['Organization', 'LocalBusiness', 'Restaurant', 'CafeOrCoffeeShop', 'Bakery', 'BarOrPub', 'Store', 'Hotel', 'TouristAttraction',
  'Event', 'MusicEvent', 'Festival', 'Product', 'Article', 'BlogPosting', 'Course', 'Book', 'Person', 'VideoGame', 'Movie', 'SoftwareApplication',
  'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'FAQPage']
const PLACE = new Set(['LocalBusiness', 'Restaurant', 'CafeOrCoffeeShop', 'Bakery', 'BarOrPub', 'Store', 'Hotel', 'TouristAttraction'])
const EVENT = new Set(['Event', 'MusicEvent', 'Festival'])
const PAGEISH = new Set(['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'FAQPage'])
// the facts each kind of thing may carry; anything else the planner writes is dropped
const FACTS = {
  org: ['email', 'telephone', 'address'],
  place: ['address', 'telephone', 'email', 'openingHours', 'servesCuisine'],
  event: ['startDate', 'endDate', 'location', 'organizer'],
  Product: ['brand', 'price', 'priceCurrency', 'material', 'color'],
  article: ['author', 'datePublished'],
  VideoGame: ['genre', 'gamePlatform'],
  Movie: ['director', 'genre'],
  SoftwareApplication: ['applicationCategory', 'operatingSystem'],
  Course: ['provider'],
  Book: ['author'],
  Person: ['jobTitle', 'email']
}
const factKeys = type => PLACE.has(type) ? FACTS.place : EVENT.has(type) ? FACTS.event : type === 'Article' || type === 'BlogPosting' ? FACTS.article : type === 'Organization' ? FACTS.org : FACTS[type] || []

export const SEO_LINE = `After the last layer, one more line for search engines and link previews (stop after it):
{"type":"seo","page":"<page id>","title":"<what someone would search for to find this page, then the site name; under 60 characters, unlike every other page's title>","description":"<120 to 155 characters for this page alone, from its own copy: what a visitor finds here>","schema":"<one of ${SCHEMA_TYPES.join(', ')}: what this page is about>","facts":{<only facts your copy above states, word for word: address, telephone, email, openingHours, servesCuisine, startDate and endDate (ISO, only with the year in the copy), location, price and priceCurrency, author, genre; leave out anything the copy does not say>},"lang":"<the copy's language, e.g. en, pt-PT>"}
Never write ratings, reviews, prices, addresses or dates the copy does not have.`

const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/
export function cleanSeo(raw = {}) {
  const out = {}
  if (squash(raw.title)) out.title = squash(raw.title).slice(0, 120)
  if (squash(raw.description)) out.description = squash(raw.description).slice(0, 400)
  if (SCHEMA_TYPES.includes(raw.schema)) out.schema = raw.schema
  if (LANG.test(squash(raw.lang))) out.lang = squash(raw.lang)
  if (/^[\w.-]{1,120}$/.test(squash(raw.image))) out.image = squash(raw.image)
  if (raw.facts && typeof raw.facts === 'object' && !Array.isArray(raw.facts)) {
    const facts = {}
    for (const [k, v] of Object.entries(raw.facts).slice(0, 20)) {
      if (!/^[a-zA-Z]{2,30}$/.test(k) || /rating|review/i.test(k)) continue
      const val = typeof v === 'number' ? String(v) : typeof v === 'string' ? squash(v).slice(0, 200) : Array.isArray(v) ? v.filter(x => typeof x === 'string').map(squash).join(', ').slice(0, 200) : ''
      if (val) facts[k] = val
    }
    if (Object.keys(facts).length) out.facts = facts
  }
  return out
}

// A page's SEO as the build's events leave it: the planner's line, then the
// reviewer's fixes, the crew's passes and the person's own edits, in order.
export function seoFromEvents(events = []) {
  const map = new Map()
  for (const e of events) {
    if (e.type !== 'seo' || typeof e.page !== 'string') continue
    const next = { ...(map.get(e.page) || {}), ...cleanSeo(e) }
    // a cleared field from the person goes back to the crew's version
    for (const f of ['title', 'description', 'image']) if (e[f] === '') delete next[f]
    map.set(e.page, next)
  }
  return map
}

// ---------- what a page says

// the page's own sentences, in order: paragraphs first, then any text
function sentencesOf(html) {
  const paras = [...String(html || '').matchAll(/<(p|li|blockquote|figcaption|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => plain(m[2])).filter(t => t.split(' ').length >= 7)
  return paras
}

export function describe({ html = '', purpose = '', title = '', brand = '' } = {}) {
  let out = ''
  for (const p of sentencesOf(html)) {
    if (key(out).includes(key(p))) continue
    out = squash(`${out} ${/[.!?…]$/.test(p) ? p : `${p}.`}`)
    if (out.length >= 120) break
  }
  if (out.length < DESC_MIN && squash(purpose)) out = squash(`${out} ${squash(purpose).replace(/[^.!?]$/, '$&.')}`)
  if (out.length < DESC_MIN && brand && title) out = squash(`${title} at ${brand}. ${out}`)
  return clipText(out, DESC_MAX - 5)
}

export function composeTitle({ title = '', pageTitle = '', brand = '', home = false } = {}) {
  let t = squash(title) || (home ? squash(brand) : squash(pageTitle))
  if (brand && !key(t).includes(key(brand))) {
    const both = `${t} · ${brand}`
    if (both.length <= TITLE_MAX || !t) t = t ? both : brand
  }
  return t.length > TITLE_MAX ? clipText(t, TITLE_MAX) : t
}

// ---------- the reviewer: check, then fix what fails, without a model round

// pages: [{ id, title, purpose, html, seo, home }]
export function checkSeo(pages, { brand = '' } = {}) {
  const issues = []
  const titles = new Map(), descs = new Map()
  for (const p of pages) {
    const s = p.seo || {}
    const t = squash(s.title), d = squash(s.description)
    if (!t) issues.push({ page: p.id, field: 'title', problem: 'no title' })
    else if (t.length > TITLE_MAX) issues.push({ page: p.id, field: 'title', problem: `title is ${t.length} characters, over ${TITLE_MAX}` })
    if (!d) issues.push({ page: p.id, field: 'description', problem: 'no description' })
    else if (d.length < DESC_MIN) issues.push({ page: p.id, field: 'description', problem: `description is ${d.length} characters, under ${DESC_MIN}` })
    else if (d.length > DESC_MAX) issues.push({ page: p.id, field: 'description', problem: `description is ${d.length} characters, over ${DESC_MAX}` })
    if (t) { const k = key(t); if (titles.has(k)) issues.push({ page: p.id, field: 'title', problem: `same title as ${titles.get(k)}`, dup: titles.get(k) }); else titles.set(k, p.id) }
    if (d) { const k = key(d); if (descs.has(k)) issues.push({ page: p.id, field: 'description', problem: `same description as ${descs.get(k)}`, dup: descs.get(k) }); else descs.set(k, p.id) }
    if (p.html != null) {
      const h1 = (String(p.html).match(/<h1\b/gi) || []).length
      if (h1 !== 1) issues.push({ page: p.id, field: 'h1', problem: h1 ? `${h1} main headings (h1)` : 'no main heading (h1)' })
      const bare = [...String(p.html).matchAll(/<img\b[^>]*>/gi)].filter(m => !/\salt="[^"]*\S[^"]*"/i.test(m[0]) && !/aria-hidden="true"|role="presentation"/i.test(m[0])).length
      if (bare) issues.push({ page: p.id, field: 'alt', problem: `${bare} picture${bare > 1 ? 's' : ''} without alt text` })
    }
    if (p.image === false) issues.push({ page: p.id, field: 'image', problem: 'no share image' })
  }
  return issues
}

// Fixes the title and description of every page that fails; headings and alt text
// are fixed in the exported pages (fixHtml). Returns the new SEO per page and what
// changed, in plain words.
export function fixSeo(pages, { brand = '' } = {}) {
  const next = new Map(pages.map(p => [p.id, { ...(p.seo || {}) }]))
  const notes = []
  const name = p => squash(p.title) || p.id
  for (let round = 0; round < 3; round++) {
    const issues = checkSeo(pages.map(p => ({ ...p, html: null, seo: next.get(p.id) })), { brand })
    if (!issues.length) break
    for (const i of issues) {
      const p = pages.find(x => x.id === i.page), s = next.get(i.page)
      if (i.field === 'title') {
        const was = s.title
        if (!was) s.title = composeTitle({ pageTitle: p.title, brand, home: p.home })
        else if (i.dup) s.title = composeTitle({ title: round ? `${name(p)} · ${p.id.replace(/-/g, ' ')}` : name(p), brand, home: false })
        else s.title = composeTitle({ title: was, brand })
        if (s.title === was) s.title = clipText(`${name(p)} · ${brand || p.id}`, TITLE_MAX)
        if (round === 0) notes.push({ page: p.id, field: 'title', text: `${name(p)}: ${i.problem}, now “${s.title}”` })
      } else if (i.field === 'description') {
        const was = s.description
        if (!was || i.dup || was.length < DESC_MIN) {
          const own = describe({ html: p.html, purpose: p.purpose, title: name(p), brand })
          s.description = i.dup && key(own) === key(was) ? clipText(`${name(p)}: ${own}`, DESC_MAX - 5) : own.length >= (was?.length || 0) || i.dup || !was ? own : was
          if (s.description.length < DESC_MIN && was && !i.dup) s.description = clipText(`${was} ${own}`, DESC_MAX - 5)
        } else s.description = clipText(was, DESC_MAX - 5)
        if (round === 0) notes.push({ page: p.id, field: 'description', text: `${name(p)}: ${i.problem}, rewritten from the page's own copy` })
      }
    }
  }
  return { seo: next, notes }
}

// The build's review: the planner's SEO checked and fixed for every page.
// pages: [{ id, title, purpose, seo, html (the page's sections with nav and footer) }]
export function reviewSeo(pages, { brand = '' } = {}) {
  const filled = pages.map((p, i) => ({ ...p, home: i === 0, seo: { ...(p.seo || {}), title: p.seo?.title ? composeTitle({ title: p.seo.title, brand }) : p.seo?.title } }))
  const before = checkSeo(filled, { brand })
  const { seo, notes } = fixSeo(filled, { brand })
  // headings and alt text: counted here, fixed in the exported pages
  for (const i of before) if (i.field === 'h1' || i.field === 'alt') notes.push({ page: i.page, field: i.field, text: `${squash(pages.find(p => p.id === i.page)?.title) || i.page}: ${i.problem}, fixed in the published pages` })
  const changed = filled.filter(p => ['title', 'description'].some(f => (seo.get(p.id)[f] || '') !== (pages.find(x => x.id === p.id).seo?.[f] || ''))).map(p => p.id)
  return { seo, notes, issues: before, changed, after: checkSeo(filled.map(p => ({ ...p, html: null, seo: seo.get(p.id) })), { brand }) }
}

// ---------- the page's HTML: one h1, alt text on every picture

const retag = (html, at, from, to) => {
  // the opening tag at `at`, and its matching close after it
  const open = new RegExp(`^<${from}\\b`, 'i')
  if (!open.test(html.slice(at))) return html
  const head = html.slice(0, at) + `<${to}` + html.slice(at + from.length + 1)
  const closeAt = head.toLowerCase().indexOf(`</${from}>`, at)
  return closeAt < 0 ? head : head.slice(0, closeAt) + `</${to}>` + head.slice(closeAt + from.length + 3)
}

export function fixHtml(body, { title = '' } = {}) {
  let html = String(body || '')
  const notes = []
  // the main heading is the first h1 outside the navigation; nav and footer get none
  const NAV = /<(nav|header|footer)\b[\s\S]*?<\/\1>/gi
  const inNav = i => [...html.matchAll(NAV)].some(m => i > m.index && i < m.index + m[0].length)
  const h1s = () => [...html.matchAll(/<h1\b/gi)].map(m => m.index)
  let all = h1s()
  const keep = all.find(i => !inNav(i)) ?? null
  if (all.length > 1 || (keep === null && all.length)) {
    const drop = all.filter(i => i !== keep).reverse()
    for (const i of drop) html = retag(html, i, 'h1', inNav(i) ? 'div' : 'h2')
    notes.push(`${drop.length} extra main heading${drop.length > 1 ? 's' : ''} made ${drop.length > 1 ? 'subheadings' : 'a subheading'}`)
  }
  if (!h1s().length) {
    const h2 = [...html.matchAll(/<h2\b/gi)].map(m => m.index).find(i => !inNav(i))
    if (h2 !== undefined) { html = retag(html, h2, 'h2', 'h1'); notes.push('the first heading is now the main heading') }
  }
  let alts = 0
  html = html.replace(/<img\b[^>]*>/gi, tag => {
    if (/\salt="[^"]*\S[^"]*"/i.test(tag) || /aria-hidden="true"|role="presentation"/i.test(tag)) return tag
    const gen = (tag.match(/data-gen="([^"]*)"/i) || [])[1]
    const alt = attr(clipText(gen ? decode(gen) : title || 'picture', 120))
    alts++
    return /\salt="/i.test(tag) ? tag.replace(/\salt="[^"]*"/i, ` alt="${alt}"`) : tag.replace(/^<img\b/i, `<img alt="${alt}"`)
  })
  if (alts) notes.push(`alt text added to ${alts} picture${alts > 1 ? 's' : ''}`)
  return { html, notes }
}

// ---------- structured data, from the site's own words only

const tokens = s => key(decode(s)).normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9€$£¥]+/).filter(Boolean)
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const CURRENCY = { EUR: /€|\beur\b|euro/i, USD: /\$|\busd\b/i, GBP: /£|\bgbp\b/i, JPY: /¥|\bjpy\b|円/, CHF: /\bchf\b/i, AUD: /\baud\b|a\$/i, CAD: /\bcad\b|c\$/i }

// keep a fact only when the copy says it: every word of it appears in the text
const PLACEHOLDER_PHONE = v => {
  const d = String(v).replace(/\D/g, '')
  return d.length < 6 || /0{5,}|1234567|(\d)\1{5,}/.test(d) || /555\D?01\d\d/.test(v)
}
export function honestFacts(facts = {}, text = '') {
  const words = new Set(tokens(text))
  const raw = String(text)
  const out = {}
  for (const [k, v] of Object.entries(facts)) {
    const val = squash(v)
    if (!val || /rating|review/i.test(k)) continue
    // a placeholder is not a fact, even when the page shows it: 22 000 0000, 555-0100, hello@example.com
    if (/phone|fax/i.test(k) && PLACEHOLDER_PHONE(val)) continue
    if (/email/i.test(k) && /@(example|test|domain|email|yourdomain|company)\.|^(you|name|user|email)@/i.test(val)) continue
    if (/Date$/.test(k)) {
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2})?)?$/)
      if (!m) continue
      const [, y, mo, d] = m
      const month = MONTHS[Number(mo) - 1]
      const hasMonth = [...words].some(w => w.startsWith(month || '~')) || raw.includes(`${Number(d)}/${Number(mo)}`) || raw.includes(`${Number(mo)}/${Number(d)}`) || raw.includes(`${y}-${mo}`)
      if (words.has(y) && hasMonth && (words.has(String(Number(d))) || words.has(d) || raw.includes(`${y}-${mo}-${d}`))) out[k] = val
      continue
    }
    if (k === 'priceCurrency') { if (CURRENCY[val.toUpperCase()]?.test(raw)) out[k] = val.toUpperCase(); continue }
    if (k === 'price') { const n = val.replace(/[^\d.,]/g, ''); if (n && raw.includes(n)) out[k] = n.replace(',', '.'); continue }
    const need = tokens(val)
    if (need.length && need.every(w => words.has(w))) out[k] = val
  }
  if (out.priceCurrency && !out.price) delete out.priceCurrency
  return out
}

// questions and answers the page shows (a FAQ), for FAQPage
function faqOf(html) {
  const out = []
  for (const m of String(html).matchAll(/<(summary|dt|h3|h4|button)\b[^>]*>([\s\S]*?)<\/\1>\s*(?:<[^>]+>\s*)*?<(p|dd|div)\b[^>]*>([\s\S]*?)<\/\3>/gi)) {
    const q = plain(m[2]), a = plain(m[4])
    if (/\?$/.test(q) && a.split(' ').length >= 4) out.push({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: clipText(a, 500) } })
    if (out.length >= 10) break
  }
  return out
}

export function guessSchema({ id = '', title = '', home = false, kind = 'site' } = {}) {
  if (kind === 'game') return 'VideoGame'
  if (kind === 'film') return 'Movie'
  if (home) return 'Organization'
  const s = `${id} ${title}`.toLowerCase()
  if (/about|story|team|who-we|people/.test(s)) return 'AboutPage'
  if (/contact|visit|find-us|location|book/.test(s)) return 'ContactPage'
  if (/faq|questions|help/.test(s)) return 'FAQPage'
  if (/menu|shop|product|collection|gallery|work|portfolio|catalog|lineup|events|programme|program/.test(s)) return 'CollectionPage'
  if (/journal|blog|article|essay|news/.test(s)) return 'Article'
  return 'WebPage'
}

// The JSON-LD for one page. url and image are absolute once the base is known.
export function jsonLd(e, { brand = '', base = null, siteText = '', home = false } = {}) {
  const type = SCHEMA_TYPES.includes(e.schema) ? e.schema : guessSchema({ id: e.id, title: e.pageTitle, home })
  const url = base ? new URL(e.path, base).href : undefined
  const image = e.image ? (base ? new URL(e.image, base).href : e.image) : undefined
  const facts = honestFacts(e.facts || {}, `${e.text || ''} ${siteText}`)
  const allowed = new Set(factKeys(type))
  const entity = { '@type': type }
  const pageish = PAGEISH.has(type)
  entity.name = pageish ? e.title : home || type === 'Organization' || PLACE.has(type) ? brand || e.title : (e.h1 || e.pageTitle || e.title)
  if (type === 'Article' || type === 'BlogPosting') { entity.headline = clipText(e.h1 || e.pageTitle || e.title, 110); delete entity.name }
  if (e.description) entity.description = e.description
  if (url) entity.url = url
  if (image) entity.image = image
  for (const [k, v] of Object.entries(facts)) {
    if (!allowed.has(k)) continue
    if (k === 'price' || k === 'priceCurrency') continue
    if (k === 'location') entity.location = { '@type': 'Place', name: v, ...(facts.address ? { address: facts.address } : {}) }
    else if (k === 'organizer' || k === 'author' || k === 'director' || k === 'provider') entity[k] = { '@type': k === 'provider' || k === 'organizer' ? 'Organization' : 'Person', name: v }
    else if (k === 'brand') entity.brand = { '@type': 'Brand', name: v }
    else entity[k] = v
  }
  if (type === 'Product' && allowed.has('price') && facts.price && facts.priceCurrency) entity.offers = { '@type': 'Offer', price: facts.price, priceCurrency: facts.priceCurrency, ...(url ? { url } : {}) }
  if (EVENT.has(type) && !entity.startDate) entity['@type'] = 'WebPage' // an event without its date in the copy is just a page
  if (type === 'FAQPage') { const qa = faqOf(e.html || ''); if (qa.length) entity.mainEntity = qa; else entity['@type'] = 'WebPage' }
  const site = { '@type': 'WebSite', name: brand || e.title, ...(base ? { url: new URL('./', base).href } : {}), ...(e.lang ? { inLanguage: e.lang } : {}) }
  if (home) return { '@context': 'https://schema.org', '@graph': [site, entity] }
  if (pageish || entity['@type'] === 'WebPage') return { '@context': 'https://schema.org', ...entity, isPartOf: site }
  return { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', name: e.title, ...(url ? { url } : {}), isPartOf: site }, entity] }
}

// ---------- the head block

const MARK_A = '<!-- seo -->', MARK_B = '<!-- /seo -->'
export function headBlock(e, { brand = '', base = null, siteText = '', home = false, theme = null, kind = 'site' } = {}) {
  const abs = p => (base && p ? new URL(p, base).href : p)
  const url = base ? new URL(e.path, base).href : null
  const color = theme?.vars?.['--primary'] || theme?.vars?.['--background']
  const ld = JSON.stringify(jsonLd(e, { brand, base, siteText, home })).replace(/</g, '\\u003c')
  const lines = [
    MARK_A,
    `<meta name="description" content="${attr(e.description)}">`,
    url ? `<link rel="canonical" href="${attr(url)}">` : '',
    `<meta property="og:type" content="${kind === 'film' || e.video ? 'video.movie' : home ? 'website' : /Article|BlogPosting/.test(e.schema || '') ? 'article' : 'website'}">`,
    brand ? `<meta property="og:site_name" content="${attr(brand)}">` : '',
    `<meta property="og:title" content="${attr(e.title)}">`,
    `<meta property="og:description" content="${attr(e.description)}">`,
    url ? `<meta property="og:url" content="${attr(url)}">` : '',
    /^[a-z]{2}-[A-Za-z]{2}$/.test(e.lang || '') ? `<meta property="og:locale" content="${attr(e.lang.slice(0, 2) + '_' + e.lang.slice(3).toUpperCase())}">` : '',
    e.image ? `<meta property="og:image" content="${attr(abs(e.image))}">` : '',
    e.image && e.imageSize ? `<meta property="og:image:width" content="${e.imageSize[0]}">\n<meta property="og:image:height" content="${e.imageSize[1]}">` : '',
    e.image && e.imageAlt ? `<meta property="og:image:alt" content="${attr(e.imageAlt)}">` : '',
    e.square ? `<meta property="og:image" content="${attr(abs(e.square))}">\n<meta property="og:image:width" content="600">\n<meta property="og:image:height" content="600">` : '',
    e.video ? `<meta property="og:video" content="${attr(abs(e.video))}">\n<meta property="og:video:type" content="video/mp4">` : '',
    `<meta name="twitter:card" content="${e.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${attr(e.title)}">`,
    `<meta name="twitter:description" content="${attr(e.description)}">`,
    e.image ? `<meta name="twitter:image" content="${attr(abs(e.image))}">` : '',
    e.image && e.imageAlt ? `<meta name="twitter:image:alt" content="${attr(e.imageAlt)}">` : '',
    e.favicon ? `<link rel="icon" href="${attr(e.favicon)}" type="image/svg+xml">` : '',
    color && /^#[0-9a-f]{3,8}$/i.test(color) ? `<meta name="theme-color" content="${color}">` : '',
    `<script type="application/ld+json">${ld}</script>`,
    MARK_B
  ]
  return lines.filter(Boolean).join('\n')
}

// Put the block into a page's head, replacing an older one, and set title and lang.
export function applyHead(html, e, opts) {
  let out = String(html)
  const block = headBlock(e, opts)
  const a = out.indexOf(MARK_A), b = out.indexOf(MARK_B)
  if (a >= 0 && b > a) out = out.slice(0, a) + block + out.slice(b + MARK_B.length)
  else out = /<title>[\s\S]*?<\/title>/i.test(out) ? out.replace(/(<title>[\s\S]*?<\/title>)/i, `$1\n${block}`) : out.replace(/<\/head>/i, `${block}\n</head>`)
  const title = `<title>${attr(e.title)}</title>`
  out = /<title>[\s\S]*?<\/title>/i.test(out) ? out.replace(/<title>[\s\S]*?<\/title>/i, title) : out.replace(/<head>/i, `<head>\n${title}`)
  if (e.lang) out = /<html\b[^>]*\slang=/i.test(out) ? out.replace(/(<html\b[^>]*\slang=")[^"]*(")/i, `$1${e.lang}$2`) : out.replace(/<html\b/i, `<html lang="${e.lang}"`)
  return out
}

// ---------- pictures: the share image, 1200 x 630, and the favicon

const PY_COVER = `import sys
from PIL import Image
src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB')
s = max(w / im.width, h / im.height)
im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
x, y = (im.width - w) // 2, int((im.height - h) * 0.4)
im.crop((x, y, x + w, y + h)).save(dst, 'JPEG', quality=86, optimize=True)
`
// fitted whole into w x h on its own edge colour (a card's square keeps all its words)
const PY_FIT = `import sys
from PIL import Image
src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB')
bg = im.getpixel((4, 4))
im.thumbnail((w, h), Image.LANCZOS)
out = Image.new('RGB', (w, h), bg); out.paste(im, ((w - im.width) // 2, (h - im.height) // 2)); out.save(dst, 'JPEG', quality=86)
`
const PY_CARD = `import sys
from PIL import Image, ImageDraw, ImageFont
dst, bg, fg, title, sub = sys.argv[1:6]
im = Image.new('RGB', (1200, 630), bg)
d = ImageDraw.Draw(im)
def font(n):
    for f in ['/System/Library/Fonts/Supplemental/Georgia Bold.ttf', '/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try: return ImageFont.truetype(f, n)
        except Exception: pass
    try: return ImageFont.load_default(n)
    except Exception: return ImageFont.load_default()
size = 96
while size > 40 and d.textlength(title, font=font(size)) > 1040: size -= 6
d.text((80, 250), title, fill=fg, font=font(size), anchor='ls')
words, line, y = sub.split(), '', 330
for w in words:
    if d.textlength(line + ' ' + w, font=font(34)) > 1040:
        d.text((80, y), line.strip(), fill=fg, font=font(34)); y += 48; line = ''
        if y > 520: break
    line += ' ' + w
if y <= 520 and line.strip(): d.text((80, y), line.strip(), fill=fg, font=font(34))
im.save(dst, 'JPEG', quality=88)
`
// -E: no PYTHONPATH; the temp folder as cwd so no stray module there loads (not -I: it hides a user-installed PIL)
const py = (code, args) => execFileSync('python3', ['-E', '-c', code, ...args], { stdio: 'ignore', timeout: 30000, cwd: tmpdir() })
export const squareOf = file => file.replace(/(\.[a-z]+)$/i, '-sq$1')
const has = cmd => { try { execFileSync('/bin/sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true } catch { return false } }
let tools = null
const toolsNow = () => tools || (tools = { python: has('python3') && (() => { try { py('import PIL', []); return true } catch { return false } })(), sips: has('sips'), ffmpeg: has('ffmpeg') })

// a picture cropped to fill 1200 x 630 (or w x h); false when no tool here can do it
export function shareCrop(src, dst, w = 1200, h = 630) {
  const t = toolsNow()
  try {
    if (t.python) { py(PY_COVER, [src, dst, String(w), String(h)]); return true }
    if (t.ffmpeg) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, '-q:v', '3', dst], { stdio: 'ignore', timeout: 30000 }); return true }
    if (t.sips) {
      const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src], { encoding: 'utf8' })
      const W = w, H = h, pw = Number(out.match(/pixelWidth: (\d+)/)?.[1]), ph = Number(out.match(/pixelHeight: (\d+)/)?.[1])
      if (!pw || !ph) return false
      const s = Math.max(W / pw, H / ph)
      execFileSync('sips', ['-s', 'format', 'jpeg', '-z', String(Math.ceil(ph * s)), String(Math.ceil(pw * s)), src, '--out', dst], { stdio: 'ignore', timeout: 30000 })
      execFileSync('sips', ['-c', String(H), String(W), dst], { stdio: 'ignore', timeout: 30000 })
      return true
    }
  } catch {}
  return false
}

// how big a picture is, [w, h], or null when nothing here can tell
export function pictureSize(file) {
  try {
    if (toolsNow().python) return execFileSync('python3', ['-E', '-c', 'import sys\nfrom PIL import Image\nprint(*Image.open(sys.argv[1]).size)', file], { encoding: 'utf8', timeout: 15000, cwd: tmpdir(), stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(' ').map(Number)
    if (toolsNow().sips) { const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' }); return [Number(o.match(/pixelWidth: (\d+)/)?.[1]), Number(o.match(/pixelHeight: (\d+)/)?.[1])] }
  } catch {}
  return null
}
// a picture worth sharing: a photo or painting (not an icon, a logo or an SVG)
const RASTER = /\.(jpe?g|png|webp|avif|gif)$/i
const shareable = file => RASTER.test(file) && (s => !s || (s[0] >= 400 && s[1] >= 250))(pictureSize(file))

// a headless Chrome for the page shot: SWARM_CHROME, a Playwright headless shell already
// downloaded, installed Chrome or Chromium; null when there is none
let chromeAt
export function findChrome() {
  if (chromeAt !== undefined) return chromeAt
  const list = [process.env.SWARM_CHROME]
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright')
  try { for (const d of readdirSync(cache).filter(d => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()) for (const sub of readdirSync(join(cache, d))) list.push(join(cache, d, sub, 'chrome-headless-shell')) } catch {}
  list.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium')
  for (const n of ['google-chrome', 'chromium', 'chromium-browser']) if (has(n)) list.push(n)
  return (chromeAt = list.find(f => f && (!f.includes('/') || existsSync(f))) || null)
}

// The top of the page as a share picture, for a site with no picture at all. The shot is cut
// at the last quiet row above 630 px, so no line of text is sliced, and the rest is the page's
// own background; the square fits the same top in 600 x 600.
const PY_SHOT = `import sys
from PIL import Image, ImageStat
src, dst, sq = sys.argv[1:4]
im = Image.open(src).convert('RGB')
im = im.crop((0, 0, 1200, min(im.height, 700)))
quiet = lambda y: max(ImageStat.Stat(im.crop((0, y, 1200, y + 1))).stddev) < 4
cut = min(630, im.height)
while cut > 380 and not all(quiet(y) for y in range(cut - 8, cut)): cut -= 2
if cut <= 380: cut = min(630, im.height)
top = im.crop((0, 0, 1200, cut))
bg = im.getpixel((4, cut - 1))
out = Image.new('RGB', (1200, 630), bg); out.paste(top, (0, 0)); out.save(dst, 'JPEG', quality=86, optimize=True)
t = top.copy(); t.thumbnail((600, 600), Image.LANCZOS)
s = Image.new('RGB', (600, 600), bg); s.paste(t, ((600 - t.width) // 2, (600 - t.height) // 2)); s.save(sq, 'JPEG', quality=86)
`
export function pageShot(page, dst) {
  const chrome = findChrome()
  if (!chrome || !toolsNow().python) return false
  const tmp = mkdtempSync(join(tmpdir(), 'swarm-shot-'))
  try {
    const png = join(tmp, 'shot.png')
    execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${join(tmp, 'profile')}`, '--window-size=1200,700', '--virtual-time-budget=4000', `--screenshot=${png}`, `file://${page}`], { stdio: 'ignore', timeout: 30000 })
    if (!existsSync(png)) return false
    py(PY_SHOT, [png, dst, squareOf(dst)])
    return existsSync(dst)
  } catch { return false } finally { rmSync(tmp, { recursive: true, force: true }) }
}

// a card in the site's colours with its name, for a page with no picture at all
export function shareCard(dst, { bg = '#111111', fg = '#ffffff', title = '', sub = '' } = {}) {
  if (!toolsNow().python) return false
  const hex = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map(x => x + x).join('')}` : null)
  try {
    py(PY_CARD, [dst, hex(bg) || '#111111', hex(fg) || '#ffffff', squash(title).slice(0, 60), clipText(sub, 140)])
    py(PY_FIT, [dst, squareOf(dst), '600', '600'])
    return true
  } catch { return false }
}

export function faviconSvg({ brand = '', bg = '#111111', fg = '#ffffff' } = {}) {
  const letter = attr((squash(brand).match(/[\p{L}\d]/u) || ['S'])[0].toUpperCase())
  const c = v => (/^#[0-9a-f]{3,8}$/i.test(v || '') ? v : null)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${c(bg) || '#111111'}"/><text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="700" fill="${c(fg) || '#ffffff'}">${letter}</text></svg>\n`
}

// ---------- the whole site: every page's head, robots.txt, sitemap.xml, 404.html

const IMG_SRC = /<img\b[^>]*?\ssrc="(?!data:)([^"]+)"[^>]*>/gi
function pictures(html) {
  return [...String(html).matchAll(IMG_SRC)].map(m => ({ src: m[1], alt: (m[0].match(/\salt="([^"]*)"/i) || [])[1] || '' }))
}
const localFile = (dir, src) => {
  if (/^[a-z]+:|^\/\//i.test(src)) return null
  const rel = decodeURIComponent(src.replace(/^\.?\//, '').split(/[?#]/)[0])
  if (rel.includes('..')) return null
  const f = join(dir, rel)
  return existsSync(f) ? rel : null
}

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// dir: the static site. pages: [{ id, file, title (the page's name), purpose, seo }], home first.
// base: the site's public address once it is known (publish), else null.
// Returns the manifest: what each page carries, and what the reviewer fixed in the files.
export function seoSite(dir, { brand = '', theme = null, pages = [], base = null, siteImage = null, kind = 'site', video = null } = {}) {
  if (base) base = String(base).replace(/\/?$/, '/')
  const files = new Map(pages.map(p => [p.id, readFileSync(join(dir, p.file), 'utf8')]))
  const bodyOf = html => (String(html).match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [, String(html)])[1]
  const notes = []
  // headings and alt text, fixed in the files
  for (const p of pages) {
    const html = files.get(p.id)
    const body = bodyOf(html)
    const fixed = fixHtml(body, { title: p.title })
    if (fixed.html !== body) { files.set(p.id, html.replace(body, () => fixed.html)); for (const n of fixed.notes) notes.push({ page: p.id, field: 'html', text: `${p.title}: ${n}` }) }
  }
  const text = new Map(pages.map(p => [p.id, plain(bodyOf(files.get(p.id)))]))
  // the shared bits (nav, footer) are on every page: their text counts as the site's
  const siteText = (() => {
    const first = [...text.values()]
    if (!first.length) return ''
    const words = first.map(t => new Set(t.split(' ')))
    return [...words[0]].filter(w => words.every(s => s.has(w))).join(' ')
  })()
  // titles and descriptions: the crew's, checked and fixed again here (old builds have none)
  const withHtml = pages.map((p, i) => ({ id: p.id, title: p.title, purpose: p.purpose, home: i === 0, html: bodyOf(files.get(p.id)), seo: { ...(p.seo || {}), title: p.seo?.title ? composeTitle({ title: p.seo.title, brand }) : composeTitle({ pageTitle: p.title, brand, home: i === 0 }), description: p.seo?.description || describe({ html: bodyOf(files.get(p.id)), purpose: p.purpose, title: p.title, brand }) } }))
  const fixed = fixSeo(withHtml, { brand })
  notes.push(...fixed.notes)
  // share images
  const shareDir = join(dir, 'img')
  const made = new Map()
  const homeImage = (() => {
    const own = siteImage && existsSync(siteImage) ? siteImage : null
    if (own) return { file: own, alt: brand }
    for (const p of pages) for (const pic of pictures(files.get(p.id))) { const rel = localFile(dir, pic.src); if (rel && !/^img\/share-/.test(rel) && shareable(join(dir, rel))) return { file: join(dir, rel), alt: pic.alt } }
    return null
  })()
  const shareOf = (file, alt) => {
    if (made.has(file)) return made.get(file)
    const name = `share-${createHash('sha1').update(file).digest('hex').slice(0, 10)}.jpg`
    mkdirSync(shareDir, { recursive: true })
    const out = join(shareDir, name)
    const sq = squareOf(out)
    const r = (existsSync(out) || shareCrop(file, out)) ? { image: `img/${name}`, imageSize: [1200, 630], imageAlt: alt, ...((existsSync(sq) || shareCrop(file, sq, 600, 600)) ? { square: `img/${squareOf(name)}` } : {}) } : (() => {
      // no tool to crop with: the picture as it is
      const ext = extname(file).toLowerCase() || '.jpg'
      const keep = `share-${createHash('sha1').update(file).digest('hex').slice(0, 10)}${ext}`
      if (!existsSync(join(shareDir, keep))) copyFileSync(file, join(shareDir, keep))
      return { image: `img/${keep}`, imageAlt: alt }
    })()
    made.set(file, r)
    return r
  }
  const v = theme?.vars || {}
  const card = (() => {
    let done = null
    return () => {
      if (done !== null) return done
      const out = join(shareDir, 'share-card.jpg')
      mkdirSync(shareDir, { recursive: true })
      done = existsSync(out) || shareCard(out, { bg: v['--primary'] || v['--background'], fg: v['--primary-foreground'] || v['--foreground'], title: brand, sub: fixed.seo.get(pages[0]?.id)?.description || '' }) ? { image: 'img/share-card.jpg', imageSize: [1200, 630], imageAlt: brand, ...(existsSync(squareOf(out)) ? { square: 'img/share-card-sq.jpg' } : {}) } : false
      return done
    }
  })()
  writeFileSync(join(dir, 'favicon.svg'), faviconSvg({ brand, bg: v['--primary'] || v['--foreground'], fg: v['--primary-foreground'] || v['--background'] }))
  const site = fixed.seo.get(pages[0]?.id) || {}
  const lang = site.lang || 'en'
  const manifest = { brand, base, lang, kind, pages: [], notes }
  pages.forEach((p, i) => {
    const s = fixed.seo.get(p.id) || {}
    const html = files.get(p.id)
    const path = p.file === 'index.html' ? './' : p.file
    // the page's own picture (the one the person picked, else its first), else the build's key art
    const own = s.image && localFile(dir, `img/${s.image}`) ? { file: join(dir, 'img', s.image), alt: (pictures(html).find(x => x.src.endsWith(s.image)) || {}).alt || p.title } : null
    // the share picture, picked with no one asked: the one the person chose, else the page's
    // own first picture (its hero), else the build's key art, else a shot of the top of the
    // page, else a card in the site's colours
    const first = pictures(html).map(x => ({ rel: localFile(dir, x.src), alt: x.alt })).find(x => x.rel && !/^img\/share-/.test(x.rel) && shareable(join(dir, x.rel)))
    const pick = own || (first ? { file: join(dir, first.rel), alt: first.alt } : homeImage)
    const shotOf = () => {
      const name = `share-page-${String(p.id).replace(/[^\w-]/g, '').slice(0, 40) || i}.jpg`, out = join(shareDir, name)
      mkdirSync(shareDir, { recursive: true })
      return existsSync(out) || pageShot(join(dir, p.file), out) ? { image: `img/${name}`, imageSize: [1200, 630], imageAlt: `${p.title} · ${brand}`, ...(existsSync(squareOf(out)) ? { square: `img/${squareOf(name)}` } : {}) } : null
    }
    const shot = pick ? shareOf(pick.file, pick.alt || p.title) : shotOf() || card()
    const h1 = plain((bodyOf(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '')
    const entry = { id: p.id, path, pageTitle: p.title, title: s.title, description: s.description, schema: s.schema, facts: s.facts, lang: s.lang || lang, h1, text: text.get(p.id), html: bodyOf(html), favicon: 'favicon.svg', ...(shot || {}), ...(p.video || (kind === 'film' && video) ? { video: p.video || video } : {}) }
    files.set(p.id, applyHead(html, entry, { brand, base, siteText, home: i === 0, theme, kind }))
    if (!shot) notes.push({ page: p.id, field: 'image', text: `${p.title}: no picture to share, and no way to draw a card here` })
    const ld = jsonLd(entry, { brand, base, siteText, home: i === 0 })
    manifest.pages.push({ id: p.id, file: p.file, path, title: entry.title, description: entry.description, image: entry.image || null, square: entry.square || null, schema: ld['@graph']?.[1]?.['@type'] || ld['@type'], lang: entry.lang })
  })
  for (const p of pages) writeFileSync(join(dir, p.file), files.get(p.id))
  // the site's thumbnail: the home page's share picture (the Feed poster and the project tile use it too)
  manifest.thumb = manifest.pages[0]?.image ? { image: manifest.pages[0].image, square: manifest.pages[0].square, ...(base ? { url: new URL(manifest.pages[0].image, base).href } : {}) } : null
  // the site's own files
  writeFileSync(join(dir, 'robots.txt'), `User-agent: *\nAllow: /\n${base ? `\nSitemap: ${new URL('sitemap.xml', base).href}\n` : ''}`)
  const day = new Date().toISOString().slice(0, 10)
  writeFileSync(join(dir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${manifest.pages.map(p => `  <url><loc>${xml(base ? new URL(p.path, base).href : p.path)}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`)
  notFound(dir, { brand, lang, home: files.get(pages[0]?.id), base, theme })
  return manifest
}

// 404.html: the site's own nav and footer around one line and a way home. With the
// base known, <base> keeps its links and pictures right at any depth.
function notFound(dir, { brand, lang, home, base }) {
  if (!home) return
  const body = (String(home).match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [])[1] || ''
  const nav = (body.match(/<nav\b[\s\S]*?<\/nav>|<header\b[\s\S]*?<\/header>/i) || [''])[0]
  const footer = (body.match(/<footer\b[\s\S]*?<\/footer>/i) || [''])[0]
  const script = (body.match(/<script>[\s\S]*<\/script>/i) || [''])[0]
  const head = String(home).match(/<head>([\s\S]*?)<\/head>/i)?.[1] || ''
  const keep = head.replace(/<!-- seo -->[\s\S]*?<!-- \/seo -->/, '').replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<base\b[^>]*>\s*/i, '')
  const html = `<!doctype html>
<html lang="${attr(lang || 'en')}">
<head>
${base ? `<base href="${attr(base)}">\n` : ''}<title>Page not found · ${attr(brand)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
${keep.trim()}
</head>
<body>
${nav}
<section class="max-w-3xl mx-auto px-6 py-32">
<h1 class="text-5xl md:text-7xl font-bold" style="font-family:var(--font-heading)">Page not found</h1>
<p class="mt-6 text-lg text-[var(--muted-foreground)]">That page is not here.</p>
<a href="./" class="inline-block mt-10 px-6 py-3 rounded-[var(--radius)] bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold">${attr(brand ? `Back to ${brand}` : 'Home')}</a>
</section>
${footer}
${script}
</body>
</html>
`
  writeFileSync(join(dir, '404.html'), html)
}

// An exported site that has no events behind it (an old export, a Feed sample):
// its pages read from the files, the brand from its nav, and the same SEO written in.
export function seoStatic(dir, { brand = '', base = null, lang = '' } = {}) {
  const list = readdirSync(dir).filter(f => f.endsWith('.html') && f !== '404.html')
  if (!list.length) throw new Error(`no pages in ${dir}`)
  const order = ['index.html', ...list.filter(f => f !== 'index.html').sort()]
  const pages = order.filter(f => list.includes(f)).map(file => {
    const html = readFileSync(join(dir, file), 'utf8')
    const title = plain(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '') || file.replace(/\.html$/, '')
    const name = /·/.test(title) && brand ? title.split('·')[0].trim() : title
    return { id: file === 'index.html' ? 'home' : file.replace(/\.html$/, ''), file, title: name, purpose: '', seo: lang ? { lang } : {} }
  })
  const home = readFileSync(join(dir, pages[0].file), 'utf8')
  const vars = Object.fromEntries([...home.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{3,8})/gi)].map(m => [m[1], m[2]]))
  const nav = (home.match(/<nav\b[\s\S]*?<\/nav>|<header\b[\s\S]*?<\/header>/i) || [''])[0]
  return seoSite(dir, { brand: brand || navBrand(nav) || pages[0].title, theme: { vars }, pages, base })
}

// ---------- the crew's SEO pass, on request: "improve the SEO", "a better description for
// the menu page", "target people searching for rain boots in Porto". One planner call reads
// every page's title, description and copy with the person's words; it returns new titles
// and descriptions, and at most two sections whose copy should change. The result is
// checked like the build's (lengths, the same text on two pages) before it is kept.
export async function seoPass({ streamChat, provider, model, ask, brand = '', pages = [], signal }) {
  const list = pages.map((p, i) => [
    `## ${p.id}${i === 0 ? ' (home)' : ''}: "${p.title}"`,
    `title: ${p.seo?.title || ''}`,
    `description: ${p.seo?.description || ''}`,
    `sections: ${(p.sections || []).map(s => s.key.split('/').pop()).join(', ')}`,
    `copy: ${clipText(p.copy || '', 1400)}`
  ].join('\n')).join('\n\n')
  const res = await streamChat(provider, {
    trace: { kind: 'seo' },
    model,
    messages: [
      { role: 'system', content: `You look after the search titles, descriptions and copy of a small website a team of agents built, so the right people find it and a shared link reads well. A person asked for a change. Do what they ask, on the pages it is about (all pages when they do not say).

Rules:
- A title is what someone would search for, then the site name ("${brand}"); under 60 characters; no two pages alike.
- A description is 120 to 155 characters, written for that page from its own copy: what a visitor finds there. No two alike.
- Use only facts the copy or the person's message gives. Never invent prices, ratings, reviews, addresses, dates or awards.
- Change the copy only when the person's aim needs words the page does not have (a place, the thing people search for), and only in the sections that need them: at most 2, each with a short instruction for the builder.

Return JSON only: {"reply":"what you changed, in plain words, first person, under 30 words","pages":[{"page":"<page id>","title":"...","description":"..."}],"copy":[{"page":"<page id>","section":"<section id>","ask":"<what to change in that section's words>"}]}` },
      { role: 'user', content: `The person: ${ask}\n\nPages:\n${list}` }
    ],
    maxTokens: 1600, temperature: 0.4, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal
  })
  const text = String(res.text || '')
  const raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  const ids = new Set(pages.map(p => p.id))
  const proposed = new Map(pages.map(p => [p.id, { ...(p.seo || {}) }]))
  for (const x of Array.isArray(raw.pages) ? raw.pages : []) {
    if (!ids.has(x?.page)) continue
    const s = proposed.get(x.page)
    if (squash(x.title)) s.title = squash(x.title).slice(0, 120)
    if (squash(x.description)) s.description = squash(x.description).slice(0, 400)
  }
  // checked like the build's: lengths and uniqueness
  const { seo } = fixSeo(pages.map((p, i) => ({ id: p.id, title: p.title, purpose: p.purpose, home: i === 0, html: p.html, seo: { ...proposed.get(p.id), title: proposed.get(p.id).title ? composeTitle({ title: proposed.get(p.id).title, brand }) : '' } })), { brand })
  const changes = []
  for (const p of pages) {
    const now = seo.get(p.id), was = p.seo || {}
    const diff = {}
    if ((now.title || '') !== (was.title || '')) diff.title = now.title
    if ((now.description || '') !== (was.description || '')) diff.description = now.description
    if (Object.keys(diff).length) changes.push({ page: p.id, name: p.title, ...diff })
  }
  const keys = new Set(pages.flatMap(p => (p.sections || []).map(s => s.key)))
  const copy = (Array.isArray(raw.copy) ? raw.copy : []).map(c => ({ key: `${c?.page}/${c?.section}`, ask: squash(c?.ask).slice(0, 300) }))
    .filter(c => keys.has(c.key) && c.ask).slice(0, 2)
  const said = changes.map(c => `${c.name}: ${[c.title ? `title “${c.title}”` : '', c.description ? 'new description' : ''].filter(Boolean).join(', ')}`)
  const reply = squash(raw.reply).slice(0, 220) || (said.length ? `Updated ${said.length} page${said.length > 1 ? 's' : ''}.` : 'Everything already fits; nothing changed.')
  return { reply, changes, copy, summary: said }
}

// Every page of a build as the SEO pass and the Design panel see it: its sections, copy
// and the title and description it carries now (the crew's, or the ones its export writes).
export function currentSeo(snap) {
  return snap.pages.map((p, i) => {
    const html = p.sections.map(s => s.html).join('\n')
    const own = p.sections.filter(s => s.page !== '*')
    const seo = { ...(p.seo || {}) }
    seo.title = seo.title ? composeTitle({ title: seo.title, brand: snap.brand }) : composeTitle({ pageTitle: p.title, brand: snap.brand, home: i === 0 })
    if (!seo.description) seo.description = describe({ html, purpose: p.purpose, title: p.title, brand: snap.brand })
    return { id: p.id, title: p.title, purpose: p.purpose, html, copy: plain(own.map(s => s.html).join('\n')), sections: own.map(s => ({ key: s.key, role: s.role })), seo }
  })
}

// An app's or a game's page (its index.html): a title, a description and a share picture,
// so a link shared on X or Discord shows a proper card. base: the address it deploys to.
export function shareApp(dir, { name = '', description = '', picture = null, base = null, kind = 'app', lang = 'en' } = {}) {
  const file = join(dir, 'index.html')
  if (!existsSync(file)) return false
  const pub = join(dir, 'public')
  mkdirSync(pub, { recursive: true })
  let image = null
  if (picture && existsSync(picture)) {
    if (existsSync(join(pub, 'share.jpg')) || shareCrop(picture, join(pub, 'share.jpg'))) image = { image: '/share.jpg', imageSize: [1200, 630] }
    else { const ext = extname(picture).toLowerCase(); copyFileSync(picture, join(pub, `share${ext}`)); image = { image: `/share${ext}` } }
  }
  if (!existsSync(join(pub, 'favicon.svg')) && !existsSync(join(pub, 'favicon.ico'))) writeFileSync(join(pub, 'favicon.svg'), faviconSvg({ brand: name }))
  const favicon = existsSync(join(pub, 'favicon.svg')) ? '/favicon.svg' : null
  const entry = { id: 'home', path: './', pageTitle: name, title: name, description: clipText(description || name, DESC_MAX - 5), schema: kind === 'game' ? 'VideoGame' : kind === 'film' ? 'Movie' : 'SoftwareApplication', lang, favicon, imageAlt: name, ...(image || {}) }
  // a page that is the app's own keeps its title; only the tags are added
  const html = readFileSync(file, 'utf8')
  const own = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]
  const next = applyHead(html, { ...entry, title: own ? plain(own) : name }, { brand: name, base, home: true, kind })
  if (next !== html) writeFileSync(file, next)
  return true
}

// The build's thumbnail as the studio shows it before export: the home page's share picture
// the person (or crew) chose, else its hero (the first picture painted on the home page).
// events: the run's; returns { page, src, chosen, pictures: [src] } or null.
export function thumbOf(events = []) {
  const home = events.find(e => e.type === 'page' && e.id)?.id
  if (!home) return null
  const pics = []
  for (const e of events) if (e.type === 'image' && e.src && !pics.includes(e.src)) pics.push(e.src)
  const name = src => String(src).split(/[?#]/)[0].split('/').pop()
  const chosen = seoFromEvents(events).get(home)?.image || ''
  // in the page's section order, as the export reads them (not the order they were painted in)
  const order = events.filter(e => e.type === 'layer:plan' && e.page === home).map(e => e.id)
  const at = e => (i => (i < 0 ? 1e6 : i))(order.indexOf(e.layer))
  const onHome = events.filter(e => e.type === 'image' && e.src && e.page === home).map((e, i) => ({ e, i })).sort((a, b) => at(a.e) - at(b.e) || a.i - b.i).map(x => x.e.src)
  const src = (chosen && pics.find(x => name(x) === chosen)) || onHome[0] || pics[0] || null
  return { page: home, src, chosen: !!chosen, pictures: pics.slice(0, 12) }
}
