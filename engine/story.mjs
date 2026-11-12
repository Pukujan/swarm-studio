// The story (docs/specs/37-story.md): what a build is, told in five to eight beats instead of a pile of
// pictures. Written from the project's locked brand (what it is, who it is for), its theme and what was
// built (pages, pictures, the live link), never from the person's words to the crew.
//
// One format, read by the Story cards (engine/storycards.mjs), the Overview's Story lane, Post to Feed,
// the launch kit's captions and the Story film (engine/director.mjs):
//   runs/<id>/story.json = { v, run, type, name, url, brand, beats: [{ id, role, kicker, headline, line,
//   picture: { kind: image|screen|clip, src, page }, seconds, say }], edited, t }
// A model writes the beats when there is one; rules write them when there is none or its answer fails
// checkStory, so there is always a story. checkStory also guards the person's own edits.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runFacts } from './launch.mjs'

export const STORY_TYPES = {
  launch: { label: 'Launch', roles: ['hook', 'what', 'who', 'moment', 'moment', 'making', 'next'] },
  about: { label: 'About me', roles: ['hook', 'what', 'moment', 'moment', 'who', 'next'] },
  walkthrough: { label: 'Walkthrough', roles: ['hook', 'what', 'moment', 'moment', 'moment', 'who', 'next'] },
  trailer: { label: 'Trailer', roles: ['hook', 'moment', 'moment', 'what', 'moment', 'next'] },
  event: { label: 'Event', roles: ['hook', 'what', 'who', 'moment', 'next'] },
  making: { label: 'How it was made', roles: ['hook', 'what', 'making', 'making', 'moment', 'next'] }
}
export const ROLES = ['hook', 'what', 'who', 'moment', 'making', 'next']
export const MIN_BEATS = 5
export const MAX_BEATS = 8
export const HEADLINE_MAX = 60
export const LINE_MAX = 140
const SECONDS = { hook: 3, what: 3, who: 3, moment: 2.5, making: 2.5, next: 3 }

const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const clip = (s, n) => { s = squash(s); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' }
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const noDot = s => squash(s).replace(/[.!?…]+$/, '')

// ---------- what the story is written from

// The project's facts, plus what the brand sheet says it is and who it is for. brand: the chat's
// brand record ({ story: { what, who } }); theme: the run's last theme event.
export function storyFacts(events = [], id = '', { brand = null, pitch = '' } = {}) {
  const f = runFacts(events, id, { pitch })
  const theme = events.findLast(e => e.type === 'theme') || null
  const start = events.find(e => e.type === 'run:start') || {}
  const pages = events.filter(e => e.type === 'page').sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(p => ({ id: String(p.id || p.page || ''), title: squash(p.title), purpose: squash(p.purpose), ...wordsOf(events, p.id) })).filter(p => p.id && p.title).slice(0, 8)
  const images = [...new Set(events.filter(e => e.type === 'image' && typeof e.src === 'string' && e.src.startsWith('/img/')).map(e => e.src))].slice(0, 12)
  const game = !!(f.games || start.game || events.some(e => e.type === 'game:done' || e.type === 'game'))
  const app = events.some(e => e.type === 'app:deployed' || e.type === 'app:start') || start.kind === 'app'
  return {
    ...f,
    what: noDot(brand?.story?.what || f.pitch || ''),
    who: noDot(brand?.story?.who || ''),
    // spec 37: the brand's voice (how it talks), when the project has one
    voice: squash(typeof brand?.voice === 'string' ? brand.voice : brand?.voice?.tone || brand?.voice?.words || '').slice(0, 200),
    pages, images, game, app,
    theme: theme ? { vars: theme.vars || {}, fonts: theme.fonts || {} } : null
  }
}

// a page's own words as the crew wrote them: its first heading and the line under it
const text = html => squash(String(html || '').replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'").replace(/&[a-z]+;/g, ' '))
function wordsOf(events, page) {
  const layers = events.filter(e => e.type === 'layer:done' && e.page === page && typeof e.html === 'string')
  for (const l of layers) {
    const h = l.html.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i)
    if (!h) continue
    const after = l.html.slice(h.index + h[0].length).match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)
    return { heading: text(h[1]).slice(0, 120), lede: after ? text(after[1]).slice(0, 220) : '' }
  }
  return { heading: '', lede: '' }
}

// ---------- the type

const ABOUT = /\b(about me|portfolio|my work|resume|résumé|\bcv\b|personal site|freelanc\w*|photographer|illustrator|designer|my name is)\b/i
const EVENT = /\b(event|festival|conference|meetup|wedding|concert|gig|workshop|summit|tickets?|rsvp|launch party|exhibition)\b/i
export function pickType(f = {}) {
  const words = [f.name, f.what, f.who, f.pitch, ...(f.pages || []).map(p => `${p.title} ${p.purpose}`)].join(' ')
  if (f.game) return 'trailer'
  if (ABOUT.test(words)) return 'about'
  if (EVENT.test(words)) return 'event'
  if (f.app) return 'walkthrough'
  return 'launch'
}

// ---------- the brand: colours and type the cards use

const HEX = /^#[0-9a-f]{6}$/i
const hex = v => { const s = squash(v).toLowerCase(); return HEX.test(s) ? s : /^#[0-9a-f]{3}$/.test(s) ? `#${[...s.slice(1)].map(c => c + c).join('')}` : null }
export function storyBrand(theme) {
  const v = theme?.vars || {}
  const bg = hex(v['--background']) || '#111111', text = hex(v['--foreground']) || '#f4f4f5'
  const accent = hex(v['--primary']) || hex(v['--accent']) || text
  const ink = hex(v['--primary-foreground']) || (accent === text ? bg : '#ffffff')
  const font = s => (/^[A-Za-z][\w ]{1,38}$/.test(String(s || '')) ? String(s) : '')
  return { bg, text, accent, ink, heading: font(theme?.fonts?.heading) || 'Georgia', body: font(theme?.fonts?.body) || 'Helvetica' }
}

// ---------- the pictures a beat may use

// screens (a page of the build) and images (art painted for it), in the order a story wants them
export function picturesOf(f) {
  const screens = (f.pages || []).map(p => ({ kind: 'screen', page: p.id, src: null, title: p.title }))
  const images = (f.images || []).map(src => ({ kind: 'image', src, page: null }))
  return { screens, images, all: [...images, ...screens] }
}
const sameShot = (a, b) => !!a && !!b && a.kind === b.kind && (a.kind === 'screen' ? a.page === b.page : a.src === b.src)
const known = (pic, pics) => pics.all.find(p => sameShot(p, pic)) || null

// ---------- rules: a story with no model

const host = url => { try { return new URL(url).host.replace(/^www\./, '') } catch { return '' } }
const listOf = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || '')

function rulesText(role, f, type, n = 0) {
  const name = f.name || 'This'
  const titles = (f.pages || []).map(p => p.title)
  const page = f.pages?.[n % Math.max(1, f.pages?.length || 1)]
  switch (role) {
    case 'hook':
      if (type === 'about') return { kicker: '', headline: `Hi, this is ${name}`, line: f.what ? `${cap(f.what)}.` : '' }
      if (type === 'trailer') return { kicker: '', headline: name, line: f.what ? `${cap(f.what)}.` : '' }
      if (type === 'event') return { kicker: '', headline: name, line: f.what ? `${cap(f.what)}.` : '' }
      if (type === 'making') return { kicker: '', headline: `How ${name} was made`, line: '' }
      return { kicker: '', headline: f.url ? `${name} is live` : `Meet ${name}`, line: f.what ? `${cap(f.what)}.` : '' }
    case 'what':
      return { kicker: type === 'about' ? 'What I do' : 'What it is', headline: clip(cap(f.what) || name, HEADLINE_MAX), line: titles.length > 1 ? clip(`Inside: ${listOf(titles.slice(0, 4))}.`, LINE_MAX) : '' }
    case 'who':
      return { kicker: type === 'about' ? 'Who I work with' : 'Who it is for', headline: clip(cap(f.who), HEADLINE_MAX), line: '' }
    case 'moment': {
      // the moments are the pages after the home page, each in its own words
      const pg = f.pages?.length > 1 ? f.pages[1 + (n % (f.pages.length - 1))] : f.pages?.[0]
      return pg ? { kicker: pg.heading && pg.heading !== pg.title ? pg.title : '', headline: clip(pg.heading || pg.title, HEADLINE_MAX), line: clip(pg.lede, LINE_MAX), page: pg.id } : { kicker: '', headline: name, line: '' }
    }
    case 'making': {
      const lines = [
        f.agents ? `Planned, designed and built by ${f.agents} AI agents` : 'Planned, designed and built by a crew of AI agents',
        titles.length ? `Every page drawn in its own colours and type` : 'Drawn in its own colours and type'
      ]
      return { kicker: 'How it was made', headline: lines[n % lines.length], line: n % lines.length === 0 ? 'Made in Swarm Studio.' : '' }
    }
    case 'next':
      if (f.url) return { kicker: type === 'trailer' ? 'Play it' : 'See it', headline: host(f.url) || name, line: '' }
      return { kicker: '', headline: type === 'about' ? 'Say hello' : type === 'trailer' ? 'Coming soon' : `${name}, coming soon`, line: '' }
  }
  return { kicker: '', headline: name, line: '' }
}

// the picture each role wants: the hook and the end on art, the middle on the build's own screens
function pickPicture(role, pics, used, n) {
  const fresh = list => list.find(p => !used.some(u => sameShot(u, p)))
  const order = role === 'moment' || role === 'what' || role === 'making'
    ? [pics.screens, pics.images] : [pics.images, pics.screens]
  for (const list of order) { const p = fresh(list); if (p) return p }
  const all = pics.all
  return all.length ? all[n % all.length] : null
}

export function rulesStory(f, type = pickType(f)) {
  // with no word on who it is for, that beat becomes one more moment
  const roles = (STORY_TYPES[type]?.roles || STORY_TYPES.launch.roles).map(r => (r === 'who' && !f.who ? 'moment' : r))
  const pics = picturesOf(f)
  const used = [], counts = {}
  const beats = roles.map((role, i) => {
    const n = counts[role] = (counts[role] ?? -1) + 1
    const { page, ...words } = rulesText(role, f, type, n)
    const own = page && pics.screens.find(p => p.page === page && !used.some(u => sameShot(u, p)))
    const pic = own || pickPicture(role, pics, used, i)
    if (pic) used.push(pic)
    return { id: `b${i + 1}`, role, ...words, picture: pic ? { kind: pic.kind, src: pic.src, page: pic.page } : null, seconds: SECONDS[role], say: '' }
  })
  return finish({ type, beats }, f)
}

// ---------- the model's prompt

export function storyPrompt(f, type = pickType(f)) {
  const pics = picturesOf(f)
  const list = pics.all.map((p, i) => `${i + 1}. ${p.kind === 'screen' ? `screen: the "${p.title}" page` : `picture: ${p.src.split('/').pop()}`}`).join('\n')
  const sys = `You write a short visual story about a finished website, app or game: ${MIN_BEATS} to ${MAX_BEATS} beats, each one card (and one shot of a film). Reply with one JSON object and nothing else:
{"type":"${Object.keys(STORY_TYPES).join('|')}","beats":[{"role":"${ROLES.join('|')}","kicker":"0-4 words","headline":"under ${HEADLINE_MAX} characters","line":"under ${LINE_MAX} characters or empty","picture":<number from the list>,"seconds":2.5}]}
The first beat is the hook, the last is next (where to go). In between: what it is, who it is for, its best moments (each on a different screen or picture), and for a "making" story how it was made.
Plain, concrete words from what it is and who it is for. Never quote or repeat the person's instructions to the builders, never mention prompts. No counts of zero, no made-up numbers, prices, dates or reviews.${f.url ? '' : ' Nothing is published yet: never say it is live, launched or available now.'}`
  const user = [
    `Story type: ${type} (${STORY_TYPES[type].label})`,
    `Name: ${f.name}`,
    f.what ? `What it is: ${f.what}` : '',
    f.who ? `Who it is for: ${f.who}` : '',
    f.voice ? `Its voice: ${f.voice}` : '',
    f.pages?.length ? `Pages:\n${f.pages.map(p => `- ${p.title}${p.heading ? `: "${p.heading}"` : ''}${p.lede ? ` ${p.lede}` : ''}`).join('\n')}` : '',
    f.url ? `Live at: ${f.url}` : 'Not published yet.',
    f.agents ? `Made by ${f.agents} AI agents in Swarm Studio.` : '',
    `Pictures you can use:\n${list || '(none)'}`
  ].filter(Boolean).join('\n')
  return [{ role: 'system', content: sys }, { role: 'user', content: user }]
}

// ---------- the check: every story, from a model, from rules or edited, passes through here

// the person's words to the crew ("do u wanna grill me first"), and any six of their words in a row
const TO_CREW = /\?$|\b(grill me|don'?t build|dont build|let'?s talk|make me|i need|i want|can you|could you|please|wanna|gonna|build (it|me|this))\b/i
function echoes(text, prompt) {
  const words = squash(prompt).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (words.length < 6) return false
  const t = ` ${squash(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')} `
  for (let i = 0; i + 6 <= words.length; i++) if (t.includes(` ${words.slice(i, i + 6).join(' ')} `)) return true
  return false
}
const ZERO = /(^|[^\d.,])0\s+[\p{L}]|\bzero\b|\bnone yet\b|\bno (pages|images|pictures|users|sign-?ups|orders)\b/iu
const LIVE = /\b(is live|are live|now live|live now|went live|go live|just launched|launched today|available now|out now)\b/i

export function checkStory(raw = {}, f = {}, { edited = false } = {}) {
  const fixes = []
  const type = STORY_TYPES[raw.type] ? raw.type : pickType(f)
  const pics = picturesOf(f)
  const fallback = rulesStory(f, type)
  let list = Array.isArray(raw.beats) ? raw.beats.slice(0, MAX_BEATS) : []
  const beats = []
  const used = []
  list.forEach((b, i) => {
    if (!b || typeof b !== 'object') return
    const role = ROLES.includes(b.role) ? b.role : i === 0 ? 'hook' : 'moment'
    const n = beats.filter(x => x.role === role).length
    let _p, text = { kicker: clip(b.kicker, 32), headline: clip(b.headline, HEADLINE_MAX), line: clip(b.line, LINE_MAX) }
    const all = `${text.kicker} ${text.headline} ${text.line}`
    if (!text.headline) { ({ page: _p, ...text } = rulesText(role, f, type, n)); fixes.push(`beat ${i + 1}: no headline, wrote one`) }
    else if (TO_CREW.test(text.headline) || TO_CREW.test(text.line) || echoes(all, f.prompt)) { ({ page: _p, ...text } = rulesText(role, f, type, n)); fixes.push(`beat ${i + 1}: it repeated the person's words to the crew`) }
    for (const k of ['kicker', 'headline', 'line']) {
      if (ZERO.test(text[k])) { text[k] = k === 'headline' ? rulesText(role, f, type, n).headline : ''; fixes.push(`beat ${i + 1}: a count of zero`) }
      if (!f.url && LIVE.test(text[k])) { text[k] = k === 'headline' ? squash(text[k].replace(LIVE, '').replace(/^[\s,:—–-]+|[\s,:—–-]+$/g, '')) || `Meet ${f.name}` : text[k].replace(LIVE, '').trim(); fixes.push(`beat ${i + 1}: said it is live with nothing published`) }
    }
    // the picture: a number from the model's list, or a { kind, src, page } from the format; only real ones
    let pic = typeof b.picture === 'number' ? pics.all[b.picture - 1] || null : b.picture && typeof b.picture === 'object' ? known(b.picture, pics) : null
    if (b.picture === null && edited) pic = null
    else if (!pic && pics.all.length) { pic = pickPicture(role, pics, used, i); if (b.picture != null) fixes.push(`beat ${i + 1}: no such picture, used another`) }
    if (pic) used.push(pic)
    const seconds = Math.max(1.5, Math.min(6, Number(b.seconds) || SECONDS[role]))
    beats.push({ id: `b${beats.length + 1}`, role, ...text, picture: pic ? { kind: pic.kind, src: pic.src, page: pic.page } : null, seconds, say: clip(b.say, 120) })
  })
  // the shape: a hook first, a next last, five to eight beats
  if (!beats.length) return { story: fallback, fixes: ['no beats, wrote them from the build'] }
  if (beats[0].role !== 'hook') { beats.unshift({ ...fallback.beats[0] }); fixes.push('no hook first, added one') }
  if (beats.at(-1).role !== 'next') { if (beats.length >= MAX_BEATS) beats.pop(); beats.push({ ...fallback.beats.at(-1) }); fixes.push('no ending, added where to go next') }
  for (const fb of fallback.beats) if (beats.length < MIN_BEATS && !beats.some(b => b.role === fb.role && b.headline === fb.headline)) beats.splice(beats.length - 1, 0, { ...fb })
  while (beats.length > MAX_BEATS) beats.splice(beats.length - 2, 1)
  return { story: finish({ type, beats, edited }, f), fixes }
}

function finish({ type, beats, edited = false }, f) {
  return {
    v: 1, run: f.run || '', type, name: f.name || '', url: f.url || null, brand: storyBrand(f.theme),
    beats: beats.map((b, i) => ({ ...b, id: `b${i + 1}` })), edited: !!edited, t: Date.now()
  }
}

// ---------- writing it

// chat: async messages => text, or null for rules only
export async function writeStory(f, { type = null, chat = null } = {}) {
  const want = STORY_TYPES[type] ? type : pickType(f)
  if (chat) {
    try {
      const text = String(await chat(storyPrompt(f, want)) || '')
      const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
      const { story, fixes } = checkStory({ ...j, type: want }, f)
      return { story, fixes, by: 'planner' }
    } catch {}
  }
  return { story: rulesStory(f, want), fixes: [], by: 'rules' }
}

// ---------- on disk

export const storyFile = runDir => join(runDir, 'story.json')
export function readStory(runDir) {
  try { return JSON.parse(readFileSync(storyFile(runDir), 'utf8')) } catch { return null }
}
export function saveStory(runDir, story) {
  writeFileSync(storyFile(runDir), JSON.stringify(story, null, 2) + '\n')
  return story
}

// The person's edits: reword a beat, swap its picture, reorder, switch the type. Each goes through
// checkStory, so an edit can never put the crew's instructions, a zero or a false "live" on a card.
export function editStory(story, f, op = {}) {
  const beats = story.beats.map(b => ({ ...b }))
  const at = beats.findIndex(b => b.id === op.beat)
  if (op.op === 'type') {
    if (!STORY_TYPES[op.type]) throw new Error('unknown story type')
    return rulesStory(f, op.type)
  }
  if (op.op === 'reword') {
    if (at < 0) throw new Error('no such beat')
    for (const k of ['kicker', 'headline', 'line']) if (typeof op[k] === 'string') beats[at][k] = op[k]
  } else if (op.op === 'picture') {
    if (at < 0) throw new Error('no such beat')
    beats[at].picture = op.picture ?? null
  } else if (op.op === 'move') {
    if (at < 0) throw new Error('no such beat')
    const to = Math.max(0, Math.min(beats.length - 1, at + (op.by === -1 ? -1 : 1)))
    const [b] = beats.splice(at, 1); beats.splice(to, 0, b)
  } else if (op.op === 'order') {
    const ids = Array.isArray(op.order) ? op.order : []
    if (ids.length !== beats.length || !ids.every(id => beats.some(b => b.id === id))) throw new Error('the order must name every beat once')
    beats.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  } else throw new Error('unknown edit')
  // a reorder keeps the hook first and the ending last by giving them those roles where they land
  if (op.op === 'move' || op.op === 'order') { beats[0].role = 'hook'; beats.at(-1).role = 'next'; for (const b of beats.slice(1, -1)) if (b.role === 'hook' || b.role === 'next') b.role = 'moment' }
  const { story: out, fixes } = checkStory({ type: story.type, beats }, f, { edited: true })
  return { ...out, fixes }
}

// ---------- the beats as text, for the Feed and for captions

export function storyText(story) {
  return (story?.beats || []).map(b => [b.kicker, b.headline, b.line].filter(Boolean).join(' — ')).join('\n')
}
