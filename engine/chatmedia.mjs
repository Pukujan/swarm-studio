// Media in a chat (docs/specs/29-chats-references-marks.md, "Media in and out"): pictures, clips, sounds
// and links a person gives the planner in a talk, and how each one was read. Reading is honest: a ref's
// `read.by` says what looked at it (vision, page or none), and the line the planner gets says so, so it
// never claims to have seen or heard what nothing read.
//
//   ref  { id, kind: image | video | audio | link, name, file, url, src, read: { by, text }, at }
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { extname } from 'node:path'

export const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' }
// the most a file may weigh, by kind (spec 29's table)
export const MEDIA_MAX = { image: 12e6, video: 200e6, audio: 50e6 }
export const MEDIA_FILE = /^[\w][\w .()+-]{0,118}\.[a-z0-9]{1,5}$/i
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export function mediaKind(name) {
  const t = MEDIA_TYPES[extname(String(name || '')).slice(1).toLowerCase()] || ''
  return t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : null
}

// a safe file name for a chat's media/ folder
export function mediaName(name) {
  let n = clip(String(name || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, ''), 120)
  if (!MEDIA_FILE.test(n)) n = `media-${Date.now()}${extname(n).toLowerCase() || '.bin'}`
  return n
}

// the links in a message, at most `max`, without trailing punctuation
export function linksIn(text, max = 2) {
  const out = []
  for (const m of String(text || '').matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)) {
    const u = m[0].replace(/[.,;:!?]+$/, '')
    if (!out.includes(u)) out.push(u)
    if (out.length >= max) break
  }
  return out
}

// ---------- links: read only public pages. The Studio also runs hosted, so a link must never reach the
// machine's own services, the tailnet or a private network: every address it resolves to is checked,
// and each redirect again.
export function privateAddress(ip) {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    if (s === '::' || s === '::1') return true
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return privateAddress(mapped[1])
    return /^(fc|fd|fe[89ab]|ff)/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8')
  }
  return true
}

export async function publicUrl(raw, { lookup = dnsLookup } = {}) {
  let u
  try { u = new URL(String(raw || '').trim()) } catch { throw new Error('that is not a link') }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error('that is not a link')
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('only ordinary web links')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.ts\.net)$/i.test(host)) throw new Error('only public web pages')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length || addrs.some(a => privateAddress(a.address))) throw new Error('only public web pages')
  return u
}

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
const meta = (html, names) => {
  for (const n of names) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*>`, 'i'))
    const c = m?.[0].match(/content=["']([^"']*)["']/i)?.[1]
    if (c) return decode(c)
  }
  return ''
}

// a page's title, description, main words and main picture, from its HTML
export function pageFacts(html, base) {
  const h = String(html || '')
  const title = clip(meta(h, ['og:title', 'twitter:title']) || decode(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), 160)
  const description = clip(meta(h, ['og:description', 'description', 'twitter:description']), 400)
  let image = meta(h, ['og:image', 'twitter:image'])
  try { image = image ? new URL(image, base).href : '' } catch { image = '' }
  const body = (h.match(/<main[\s\S]*?<\/main>/i) || h.match(/<article[\s\S]*?<\/article>/i) || h.match(/<body[\s\S]*<\/body>/i) || [h])[0]
  const text = clip(decode(body.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')), 1500)
  return { title, description, image, text }
}

// fetch a public page (redirects followed by hand, each checked), at most 1.5 MB of it
export async function readPage(raw, { fetch: f = fetch, lookup = dnsLookup, timeout = 8000 } = {}) {
  let u = await publicUrl(raw, { lookup })
  for (let hop = 0; hop < 4; hop++) {
    const res = await f(u.href, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (compatible; SwarmStudio/1.0)', accept: 'text/html,*/*;q=0.5' } })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = await publicUrl(new URL(res.headers.get('location'), u).href, { lookup }); continue }
    if (!res.ok) throw new Error(`the page answered ${res.status}`)
    const type = res.headers.get('content-type') || ''
    if (!/html|xml|text\/plain/i.test(type)) return { url: u.href, title: '', description: '', image: '', text: '', type }
    const reader = res.body?.getReader?.()
    let html = ''
    if (reader) {
      const dec = new TextDecoder()
      let n = 0
      for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; html += dec.decode(value, { stream: true }); if (n > 1.5e6) { reader.cancel().catch(() => {}); break } }
    } else html = (await res.text()).slice(0, 1.5e6)
    return { url: u.href, ...pageFacts(html, u.href), type }
  }
  throw new Error('too many redirects')
}

// what the page reader keeps as the link's read
export function pageRead(p) {
  const parts = [p.title && `Title: ${p.title}`, p.description && `Description: ${p.description}`, p.text && `Words on the page: ${clip(p.text, 700)}`].filter(Boolean)
  return parts.length ? { by: 'page', text: clip(parts.join('\n'), 1400) } : { by: 'none', text: '' }
}

// ---------- pictures: the vision model describes one in a few lines the planner can use
export function pictureMessages(image) {
  return [
    { role: 'system', content: 'A person gave this picture to a designer as a reference for a website or app. Describe it for the designer in at most 60 words: what it shows, the colours (name them), the mood, the style (photo, illustration, screenshot of a site…), and any words in it. Plain sentences, no preamble.' },
    { role: 'user', content: [{ type: 'text', text: 'The reference picture.' }, { type: 'image_url', image_url: { url: image } }] }
  ]
}

// ---------- what the planner is told about a turn's media, one line each, honest about how it was read
export function refLine(r) {
  const what = r.kind === 'link' ? `the link ${r.url}` : `a ${r.kind === 'image' ? 'picture' : r.kind === 'video' ? 'video' : 'sound'} "${r.name}"`
  const by = r.read?.by || 'none'
  if (by === 'vision') return `They attached ${what}. The vision model looked at it: ${r.read.text}`
  if (by === 'page') return `They gave ${what}. Its page was read (not seen):\n${r.read.text}`
  if (r.kind === 'video' || r.kind === 'audio') return `They attached ${what}. Nothing here could ${r.kind === 'video' ? 'watch' : 'listen to'} it, so it is kept but not read.`
  return `They gave ${what}. It could not be read${r.read?.text ? ` (${r.read.text})` : ''}.`
}

export function withRefs(text, refs = []) {
  if (!refs.length) return String(text || '')
  return `${String(text || '').trim()}\n\n[What they attached, and how it was read]\n${refs.map(refLine).join('\n')}\n[Say in plain words how you read each one ("I looked at the picture", "I only read the page's words", "I couldn't open the video"). Never describe what was not read.]`
}
