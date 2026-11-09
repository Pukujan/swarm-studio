// The launch kit (spec 07 C): posts for every network, written from the run's own facts
// (the person's prompt, what was built, the counts, the link we deployed). Nothing here
// posts anything. The canvas shows each post as a card: Post opens the network's own share
// page, where the person presses Post themselves; a messaging send (Discord, Slack,
// Telegram) goes through Hermes's gateway only after the person confirms the exact text.
//
// The kit lives in the run (runs/<id>/launch.json) with a log of what was opened or sent.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

// What happened in the run, from its events: the same numbers the summary card shows.
export function runFacts(events, id) {
  const ev = events || []
  const start = ev.find(e => e.type === 'run:start') || {}
  const auto = ev.findLast(e => e.type === 'auto') || null
  const pages = ev.filter(e => e.type === 'page')
  const sections = new Set(ev.filter(e => e.type === 'layer:done' && !e.restored).map(e => `${e.page}/${e.layer}`))
  const images = ev.filter(e => e.type === 'image')
  const first = pages.find(p => p.index === 0) || pages[0]
  const name = clean((first?.title || start.brief || 'Our new site').split(/\s+[—–|:-]\s+/)[0]).slice(0, 60) || 'Our new site'
  const prompt = clean(auto?.prompt || start.brief || '')
  // the pitch: the prompt's first clause, minus the name it may start with
  let pitch = prompt.split(/(?<=[.!?])\s/)[0].replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—–:,-]?\\s*`, 'i'), '')
  pitch = clip(pitch.replace(/[.!?]+$/, ''), 150)
  pitch = pitch.charAt(0).toUpperCase() + pitch.slice(1)
  const steps = Object.fromEntries((auto?.steps || []).map(s => [s.id, s]))
  const url = auto?.url || ev.findLast(e => e.type === 'app:deployed')?.url || ev.findLast(e => e.type === 'publish:done' && e.url)?.url || null
  const video = ev.findLast(e => e.type === 'video:done')
  const games = steps.games?.state === 'done' ? (auto.games === 'big' ? 'big' : 'mini') : null
  return {
    run: id, name, pitch, prompt: clip(prompt, 600), url: url && /^https:\/\//.test(url) ? url : null,
    pages: pages.length, sections: sections.size, images: images.length, agents: (start.agents || []).length,
    minutes: auto?.ms ? Math.max(1, Math.round(auto.ms / 60000)) : start.t && ev.at(-1)?.t ? Math.max(1, Math.round((ev.at(-1).t - start.t) / 60000)) : null,
    games, shop: steps.shop?.state === 'done', data: steps.data?.state === 'done', pack: auto?.pack?.name || null,
    video: video ? `/video/${id}/promo.mp4` : null,
    heroes: images.slice(0, 3).map(e => e.src).filter(s => typeof s === 'string' && s.startsWith('/img/'))
  }
}

export function writePosts(f) {
  const link = f.url || ''
  const play = f.url && f.games ? `${f.url.replace(/\/?$/, '/')}play` : ''
  const h = hash(f.name + f.pitch)
  const pick = list => list[h % list.length]
  const built = [
    `${f.pages} page${f.pages === 1 ? '' : 's'}`,
    f.games === 'big' ? 'a playable game on /play' : f.games === 'mini' ? 'three mini games on /play' : '',
    f.shop ? 'a $2 credit pack (demo checkout)' : '',
    f.video ? 'a promo video' : ''
  ].filter(Boolean)
  const list = built.length > 1 ? `${built.slice(0, -1).join(', ')} and ${built.at(-1)}` : built[0] || 'the site'
  const how = f.minutes && f.agents ? `Built in about ${f.minutes} minute${f.minutes === 1 ? '' : 's'} by a swarm of ${f.agents} AI agents in Swarm Studio, from one prompt.` : 'Built by a swarm of AI agents in Swarm Studio, from one prompt.'
  const feature = f.games === 'big' ? pick(['The trial on /play is a full run: fight, pick upgrades, beat the boss. Post your score.', 'Jump into /play: one full run, rooms, upgrades and a boss fight. Can you top the board?'])
    : f.games === 'mini' ? pick(['Three quick games on /play, each under a minute, with a leaderboard.', '/play has three tiny games. Beat my best score.'])
      : `${f.sections} sections, ${f.images} images, every page designed and checked.`
  const hook = pick([`${f.name} is live.`, `Say hello to ${f.name}.`, `Just launched: ${f.name}.`])
  const tags = [tag(f.name), f.games ? '#indiegame' : '#webdesign', f.games ? '#gamedev' : '#buildinpublic', '#madewithAI'].filter(t => t.length > 1)
  const posts = []
  const add = (network, text, extra = {}) => {
    const n = NETWORKS.find(x => x.id === network)
    posts.push({ id: network, network, label: n.label, how: n.how, limit: n.limit, text, link, status: 'ready', ...extra })
  }
  // X: a thread of 3–5 posts (hook, what it is, a gameplay or feature line, the link)
  const thread = [
    `${hook} ${f.pitch ? `${f.pitch}.` : ''}`.trim(),
    `What's inside: ${list}.`,
    feature,
    how,
    link ? `Try it: ${play || link}` : ''
  ].filter(Boolean).map(s => clip(s, 270))
  add('x', thread[0], { thread })
  add('linkedin', [
    `${hook}`,
    f.pitch ? `${f.pitch}.` : '',
    `It ships with ${list}.${f.data ? ' Orders, sign-ups and scores save to a real database.' : ''}`,
    how,
    link ? `Have a look: ${link}` : '',
    tags.slice(0, 3).join(' ')
  ].filter(Boolean).join('\n\n'))
  add('threads', clip(`${hook} ${f.pitch ? `${f.pitch}. ` : ''}${feature}${link ? ` ${play || link}` : ''}`, 490))
  add('bluesky', clip(`${hook} ${f.pitch ? `${f.pitch}.` : ''}${link ? ` ${play || link}` : ''}`, 295))
  const caption = `${hook} ${f.pitch ? `${f.pitch}. ` : ''}${feature}${link ? `\n\nLink in bio.` : ''}\n\n${tags.join(' ')}`
  add('instagram', caption)
  add('tiktok', clip(`${hook} ${feature} ${tags.join(' ')}`, 300))
  const announce = `**${f.name} is live!**\n${f.pitch ? `${f.pitch}.\n` : ''}${list[0].toUpperCase() + list.slice(1)}.${play ? `\n🎮 Play: ${play}` : ''}${link ? `\n🔗 ${link}` : ''}`
  add('discord', announce)
  add('slack', announce.replace(/\*\*(.+?)\*\*/g, '*$1*'))
  add('telegram', announce.replace(/\*\*(.+?)\*\*/g, '$1'))
  return posts
}

// The media to attach by hand: the promo clip, 3 hero images, the live link.
const mediaOf = f => [
  ...(f.video ? [{ kind: 'video', label: 'Promo clip', src: f.video }] : []),
  ...f.heroes.map((src, i) => ({ kind: 'image', label: `Hero image ${i + 1}`, src })),
  ...(f.url ? [{ kind: 'link', label: 'Live link', src: f.url }] : [])
]

export function writeLaunch(runDir, events, id) {
  const facts = runFacts(events, id)
  const kit = { t: Date.now(), run: id, facts, media: mediaOf(facts), posts: writePosts(facts), log: [] }
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
