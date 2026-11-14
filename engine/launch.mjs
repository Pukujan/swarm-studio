// The launch kit (spec 07 C): posts for every network, written from the run's own facts
// (the person's prompt, what was built, the counts, the link we deployed), and from the build's
// story when it has one (spec 39): its hook, moments and cards. Nothing here
// posts anything. The canvas shows each post as a card: Post opens the network's own share
// page, where the person presses Post themselves; a messaging send (Discord, Slack,
// Telegram) goes through Hermes's gateway only after the person confirms the exact text.
//
// The kit lives in the run (runs/<id>/launch.json) with a log of what was opened or sent.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { navBrand, projectName } from './naming.mjs'

export const NETWORKS = [
  { id: 'x', label: 'X', how: 'intent', limit: 280 },
  { id: 'linkedin', label: 'LinkedIn', how: 'intent', limit: 3000 },
  { id: 'threads', label: 'Threads', how: 'intent', limit: 500 },
  { id: 'bluesky', label: 'Bluesky', how: 'intent', limit: 300 },
  { id: 'instagram', label: 'Instagram', how: 'download', limit: 2200 },
  { id: 'tiktok', label: 'TikTok', how: 'download', limit: 2200 },
  { id: 'discord', label: 'Discord', how: 'gateway', limit: 2000 },
  { id: 'slack', label: 'Slack', how: 'gateway', limit: 3000 },
  { id: 'telegram', label: 'Telegram', how: 'gateway', limit: 4096 }
]

// No links or handles from anywhere but our own deploy: strip them from the prompt and titles.
const clean = s => String(s || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[@#](?=\w)/g, '').replace(/\s+/g, ' ').trim()
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 }
const clip = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'
const tag = s => '#' + clean(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').map(w => w[0]?.toUpperCase() + w.slice(1)).join('').slice(0, 30)

// The person's words to the crew are not a pitch: "do u wanna grill me first?", "dont build yet",
// "i need an air booking api or something?". Only the clauses that say what the product is are kept.
const TO_CREW = /\?|\b(grill|don'?t|dont|do not|let'?s|lets|talk|discuss|build|make me|i need|i want|can you|could you|please|u |wanna|gonna|something|first|yet|accounts?:|the admin sees)\b/i
export function pitchOf(prompt) {
  const parts = String(prompt || '').split(/(?<=[.!?])\s+|,\s+|\s+-\s+/).map(x => x.trim()).filter(Boolean)
  const keep = parts.filter(x => !TO_CREW.test(x) && /\p{L}{3}/u.test(x))
  const line = clip((keep[0] || '').replace(/[.!?]+$/, ''), 150)
  return line.charAt(0).toUpperCase() + line.slice(1)
}

// What happened in the run, from its events: the same numbers the summary card shows.
// pitch: one line on what the product is and who it is for (the planner writes it from the
// pages, server/server.mjs); without it, the clauses of the prompt that describe the product.
export function runFacts(events, id, { pitch: given = '' } = {}) {
  const ev = events || []
  const start = ev.find(e => e.type === 'run:start') || {}
  const auto = ev.findLast(e => e.type === 'auto') || null
  const pages = ev.filter(e => e.type === 'page')
  const sections = new Set(ev.filter(e => e.type === 'layer:done' && !e.restored).map(e => `${e.page}/${e.layer}`))
  const images = ev.filter(e => e.type === 'image')
  const prompt = clean(auto?.prompt || start.brief || '')
  // the product's one name (engine/naming.mjs): the brief's brand, else the wordmark the crew put in
  // the nav ("SkyLedger"); never the first page's title ("Flight Search" names a screen)
  const nav = ev.findLast(e => e.type === 'layer:done' && e.page === '*' && e.layer === 'nav' && e.html)
  const name = clean(projectName({ brief: prompt, brand: navBrand(nav?.html), title: start.title })).slice(0, 60)
  // the pitch, minus the name it may start with
  let pitch = clean(given) || pitchOf(prompt)
  pitch = pitch.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(is\\s+)?[—–:,-]?\\s*`, 'i'), '')
  pitch = clip(pitch.replace(/[.!?]+$/, ''), 150)
  pitch = pitch.charAt(0).toUpperCase() + pitch.slice(1)
  const steps = Object.fromEntries((auto?.steps || []).map(s => [s.id, s]))
  const url = auto?.url || ev.findLast(e => e.type === 'app:deployed')?.url || ev.findLast(e => e.type === 'publish:done' && e.url)?.url || null
  const video = ev.findLast(e => e.type === 'video:done')
  const games = steps.games?.state === 'done' ? (auto.games === 'big' ? 'big' : 'mini') : null
  return {
    run: id, name, pitch, prompt: clip(prompt, 600), url: url && /^https:\/\//.test(url) ? url : null,
    pages: pages.length, titles: pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(p => clean(p.title)).filter(Boolean).slice(0, 6), sections: sections.size, images: images.length, agents: (start.agents || []).length,
    minutes: auto?.ms ? Math.max(1, Math.round(auto.ms / 60000)) : start.t && ev.at(-1)?.t ? Math.max(1, Math.round((ev.at(-1).t - start.t) / 60000)) : null,
    games, shop: steps.shop?.state === 'done', data: steps.data?.state === 'done', pack: auto?.pack?.name || null,
    video: video ? `/video/${id}/promo.mp4` : null,
    videoTall: video?.tall ? `/video/${id}/promo-tall.mp4` : null,
    heroes: images.slice(0, 3).map(e => e.src).filter(s => typeof s === 'string' && s.startsWith('/img/'))
  }
}

// The story's words for the posts (docs/specs/39-story.md): its hook, what it is, its moments and how
// it was made, already checked there (no prompt, no zeros, "live" only with a link).
const dot = s => (s && !/[.!?…]$/.test(s) ? `${s}.` : s || '')
function storyWords(story) {
  const beats = story?.beats || []
  if (!beats.length) return null
  const of = role => beats.filter(b => b.role === role)
  const hook = beats[0], what = of('what')[0], making = of('making')[0]
  return {
    hook: dot(hook.headline),
    pitch: String((what || hook).headline === hook.headline ? hook.line || '' : what.headline).replace(/[.!?…]+$/, ''),
    moments: [...of('moment'), ...of('who')].map(b => clip(`${b.headline}${b.line ? `: ${b.line}` : ''}`.replace(/\.?$/, '.'), 270)),
    how: making ? [making.headline, making.line].filter(Boolean).map(dot).join(' ') : ''
  }
}

export function writePosts(f, story = null) {
  const told = storyWords(story)
  if (told) f = { ...f, pitch: told.pitch || f.pitch }
  const link = f.url || ''
  const play = f.url && f.games ? `${f.url.replace(/\/?$/, '/')}play` : ''
  const h = hash(f.name + f.pitch)
  const pick = list => list[h % list.length]
  // what is inside, by name (no counts: "0 images" sells nothing)
  const titles = (f.titles || []).slice(0, 4)
  const built = [
    titles.length ? (titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}` : titles[0]) : f.pages ? `${f.pages} page${f.pages === 1 ? '' : 's'}` : '',
    f.games === 'big' ? 'a playable game on /play' : f.games === 'mini' ? 'three mini games on /play' : '',
    f.shop ? 'a $2 credit pack (demo checkout)' : '',
    f.video ? 'a promo video' : ''
  ].filter(Boolean)
  const list = built.length > 1 ? `${built.slice(0, -1).join(', ')} and ${built.at(-1)}` : built[0] || 'the site'
  const how = f.minutes && f.agents ? `Built in about ${f.minutes} minute${f.minutes === 1 ? '' : 's'} by a swarm of ${f.agents} AI agents in Swarm Studio, from one prompt.` : 'Built by a swarm of AI agents in Swarm Studio, from one prompt.'
  const feature = told?.moments.length ? told.moments[0] : f.games === 'big' ? pick(['The trial on /play is a full run: fight, pick upgrades, beat the boss. Post your score.', 'Jump into /play: one full run, rooms, upgrades and a boss fight. Can you top the board?'])
    : f.games === 'mini' ? pick(['Three quick games on /play, each under a minute, with a leaderboard.', '/play has three tiny games. Beat my best score.'])
      : ''
  // "is live" only with a live link to go with it
  const hook = told?.hook || (link ? pick([`${f.name} is live.`, `Say hello to ${f.name}.`, `Just launched: ${f.name}.`]) : pick([`Say hello to ${f.name}.`, `Meet ${f.name}.`]))
  const tags = [tag(f.name), f.games ? '#indiegame' : '#webdesign', f.games ? '#gamedev' : '#buildinpublic', '#madewithAI'].filter(t => t.length > 1)
  const posts = []
  const add = (network, text, extra = {}) => {
    const n = NETWORKS.find(x => x.id === network)
    posts.push({ id: network, network, label: n.label, how: n.how, limit: n.limit, text, link, status: 'ready', ...extra })
  }
  // X: a thread of 3–5 posts (hook, what it is, a gameplay or feature line, the link)
  const thread = [
    `${hook} ${f.pitch ? `${f.pitch}.` : ''}`.trim(),
    built.length ? `What's inside: ${list}.` : '',
    ...(told ? told.moments.slice(0, 2) : [feature]),
    told?.how || how,
    link ? `Try it: ${play || link}` : ''
  ].filter(Boolean).map(s => clip(s, 270))
  add('x', thread[0], { thread })
  add('linkedin', [
    `${hook}`,
    f.pitch ? `${f.pitch}.` : '',
    `It ships with ${list}.${f.data ? ' Orders, sign-ups and scores save to a real database.' : ''}`,
    told?.how || how,
    link ? `Have a look: ${link}` : '',
    tags.slice(0, 3).join(' ')
  ].filter(Boolean).join('\n\n'))
  add('threads', clip([hook, f.pitch ? `${f.pitch}.` : '', feature, link ? play || link : ''].filter(Boolean).join(' '), 490))
  add('bluesky', clip(`${hook} ${f.pitch ? `${f.pitch}.` : ''}${link ? ` ${play || link}` : ''}`, 295))
  const caption = `${hook} ${f.pitch ? `${f.pitch}. ` : ''}${feature}`.trim() + `${link ? `\n\nLink in bio.` : ''}\n\n${tags.join(' ')}`
  add('instagram', caption)
  add('tiktok', clip([hook, feature, tags.join(' ')].filter(Boolean).join(' '), 300))
  const announce = `**${link ? `${f.name} is live!` : `Meet ${f.name}`}**\n${f.pitch ? `${f.pitch}.\n` : ''}${list[0].toUpperCase() + list.slice(1)}.${play ? `\n🎮 Play: ${play}` : ''}${link ? `\n🔗 ${link}` : ''}`
  add('discord', announce)
  add('slack', announce.replace(/\*\*(.+?)\*\*/g, '*$1*'))
  add('telegram', announce.replace(/\*\*(.+?)\*\*/g, '$1'))
  return posts
}

// The media to attach by hand: the promo clip, 3 hero images, the live link.
// and the story's cards: every beat as a phone card (a slide each), the first beat square and wide
const storyMedia = (runDir, id, story) => {
  if (!runDir || !story?.beats?.length) return []
  const has = n => existsSync(join(runDir, 'story', n))
  const b0 = story.beats[0].id
  return [
    ...story.beats.filter(b => has(`tall-${b.id}.jpg`)).map((b, i) => ({ kind: 'image', label: `Story ${i + 1}`, src: `/story/${id}/tall-${b.id}.jpg`, shape: 'tall' })),
    ...['square', 'wide'].filter(s => has(`${s}-${b0}.jpg`)).map(s => ({ kind: 'image', label: s === 'square' ? 'Story, square' : 'Story, wide', src: `/story/${id}/${s}-${b0}.jpg`, shape: s }))
  ]
}
const mediaOf = (f, extra = []) => [
  ...extra,
  ...(f.video ? [{ kind: 'video', label: 'Promo clip', src: f.video }] : []),
  ...(f.videoTall ? [{ kind: 'video', label: 'Phone clip', src: f.videoTall, shape: 'tall' }] : []),
  ...f.heroes.map((src, i) => ({ kind: 'image', label: `Hero image ${i + 1}`, src })),
  ...(f.url ? [{ kind: 'link', label: 'Live link', src: f.url }] : [])
]

export function writeLaunch(runDir, events, id, opts = {}) {
  const facts = runFacts(events, id, opts)
  const story = opts.story || null
  const kit = { v: 2, t: Date.now(), run: id, facts, media: mediaOf(facts, storyMedia(runDir, id, story)), posts: writePosts(facts, story), ...(story ? { story: story.t || true } : {}), log: [] }
  writeFileSync(join(runDir, 'launch.json'), JSON.stringify(kit, null, 2))
  return kit
}

export function readLaunch(runDir) {
  const file = join(runDir, 'launch.json')
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

// The person did something with a post: opened its share page, edited, skipped, copied, sent.
export function markLaunch(runDir, { post, action, text, target }) {
  const kit = readLaunch(runDir)
  if (!kit) throw new Error('no launch kit yet')
  const p = kit.posts.find(x => x.id === post)
  if (!p) throw new Error('no such post')
  if (!['opened', 'edited', 'skipped', 'copied', 'downloaded', 'sent', 'ready'].includes(action)) throw new Error('unknown action')
  if (action === 'edited') {
    if (Array.isArray(p.thread) && Array.isArray(text)) {
      p.thread = text.map(s => String(s).slice(0, 280)).filter(Boolean).slice(0, 5)
      p.text = p.thread[0] || ''
    } else p.text = String(text ?? '').slice(0, p.limit || 4096)
  } else p.status = action === 'copied' || action === 'downloaded' ? p.status : action
  kit.log.push({ t: Date.now(), post, action, ...(target ? { target } : {}) })
  writeFileSync(join(runDir, 'launch.json'), JSON.stringify(kit, null, 2))
  return kit
}
