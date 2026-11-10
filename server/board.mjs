// A project's canvas: everything one build made, grouped the way the Files panel shows it.
// Shared by the local server and the hosted studio.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as art from '../engine/artdirect.mjs'

const snapAt = (runsDir, id) => { try { return `/img/${id}/snap.jpg?v=${Math.round(statSync(join(runsDir, id, 'img', 'snap.jpg')).mtimeMs)}` } catch { return null } }

export function runBoard(id, events, runsDir, live = false) {
  const start = events.find(e => e.type === 'run:start') || {}
  const pages = events.filter(e => e.type === 'page').map(p => ({ id: p.id, title: p.title }))
  const titleOf = pid => pages.find(p => p.id === pid)?.title || ''
  const latest = new Map() // one picture per slot: the newest
  for (const e of events) if (e.type === 'image' && e.src) latest.set(`${e.page}/${e.layer}/${e.gen}`, e)
  const style = events.findLast(e => e.type === 'art')?.name || [...latest.values()].find(e => e.style)?.style || null
  const pics = [...latest.values()].map(e => ({ src: e.src, page: e.page, layer: e.layer, gen: e.gen, name: String(e.layer || 'picture').replace(new RegExp(`^${String(e.page || '').replace(/[^\w-]/g, '')}-`), '').replace(/[-_]+/g, ' '), used: titleOf(e.page), hero: art.isHero({ layer: e.layer }), style: e.style || style }))
  for (const p of pages) p.cover = pics.find(a => a.page === p.id && a.hero)?.src || pics.find(a => a.page === p.id)?.src || null
  const video = events.findLast(e => e.type === 'video:done')
  // tall: the 9:16 phone cut of the same film, when the run made one
  const tall = video && existsSync(join(runsDir, id, 'video', 'promo-tall.mp4')) ? `/video/${id}/promo-tall.mp4` : null
  const films = video ? [{ name: 'Promo', src: `/video/${id}/promo.mp4`, tall, poster: existsSync(join(runsDir, id, 'video', 'p1.webp')) ? `/video/${id}/live/p1.webp` : null, seconds: Number(video.seconds) || null }] : []
  const spec = events.findLast(e => e.type === 'game:spec')?.spec
  const isGame = start.kind === 'game' || !!spec
  const app = events.some(e => e.type === 'app:ready' || e.type === 'app:done')
  const th = events.findLast(e => e.type === 'theme')
  // pictures being made: each slot's latest word (queued, sent back, failed, or the picture itself);
  // the count ("3 of 8") is this batch: the slots asked for within five minutes of the oldest one still waiting
  const slots = new Map()
  for (const e of events) {
    if (!['image:queued', 'image:sent-back', 'image:failed', 'image'].includes(e.type) || !e.layer) continue
    const k = `${e.page}/${e.layer}/${e.gen}`
    const s = slots.get(k) || { page: e.page, layer: e.layer, gen: e.gen, n: 0 }
    if (e.type === 'image:queued') { if (s.state !== 'painting' && s.state !== 'again') s.from = e.t; s.state = 'painting'; s.n++ }
    else if (e.type === 'image:sent-back') { s.state = 'again'; s.problems = e.problems || null }
    else if (e.type === 'image:failed') { s.state = 'failed'; s.message = String(e.message || '').slice(0, 160) }
    else s.state = 'done'
    s.t = e.t
    slots.set(k, s)
  }
  const waiting = [...slots.values()].filter(s => s.state === 'painting' || s.state === 'again')
  const since = waiting.length ? Math.min(...waiting.map(s => s.from || s.t)) : Infinity
  const batch = [...slots.values()].filter(s => (s.from || s.t) >= since - 300000)
  const painting = [...slots.values()].filter(s => s.state !== 'done').map(s => ({ ...s, name: String(s.layer).replace(new RegExp(`^${String(s.page || '').replace(/[^\w-]/g, '')}-`), '').replace(/[-_]+/g, ' '), used: titleOf(s.page) }))
  // the review: pages checked one by one after a build (or from ☰ › Review); the latest round
  // a round is the run of review events with no quiet gap over three minutes (fixes between pages
  // do not end it); it starts at that run's first review:start
  const rvs = events.filter(e => e.type?.startsWith('review:'))
  let from = rvs.length
  for (let i = rvs.length - 1; i >= 0; i--) { if (i < rvs.length - 1 && rvs[i + 1].t - rvs[i].t > 180000) break; from = i }
  const firstRound = rvs.slice(from)
  const firstStart = firstRound.findIndex(e => e.type === 'review:start')
  let review = null
  if (firstStart >= 0) {
    const round = firstRound.slice(firstStart)
    const state = new Map(pages.map(p => [p.id, { id: p.id, state: 'queued', issues: [] }]))
    let current = null
    for (const e of round) {
      const p = state.get(e.page)
      if (e.type === 'review:start' && p) { p.state = 'checking'; current = e.page }
      if (e.type === 'review:issue' && p) p.issues.push({ layer: e.layer, problem: String(e.problem || '').slice(0, 160) })
      if (e.type === 'review:done' && p) { p.state = 'done'; p.t = e.t; if (current === e.page) current = null }
    }
    const last = round.at(-1)?.t || 0
    // running while a page is being checked, or while pages wait and the reviewer spoke in the last two minutes
    const active = (!!current && Date.now() - last < 300000) || ([...state.values()].some(p => p.state !== 'done') && Date.now() - last < 120000)
    const list = [...state.values()].filter(p => p.state !== 'queued' || active)
    review = { active, current, last, pages: list, done: list.filter(p => p.state === 'done').length, total: active ? state.size : list.length }
  }
  return {
    id, title: start.title || pages[0]?.title || '', kind: start.kind || 'site', live: live,
    brief: String(start.brief || '').split('\n\nThe owner uploaded these pictures.')[0].split('\n\nFor this version: ')[0].slice(0, 4000),
    pages, art: pics, films, style,
    theme: th?.vars ? { colors: ['--background', '--primary', '--accent', '--foreground'].map(k => th.vars[k]).filter(Boolean), fonts: th.fonts || null } : null,
    // a game's cover: its own picture, else its title screen from the play test
    game: isGame ? { title: (typeof spec === 'object' && spec?.title) || start.title || 'Game', pitch: (typeof spec === 'object' && String(spec?.pitch || '').slice(0, 200)) || '', cover: pics[0]?.src || snapAt(runsDir, id) } : null,
    app: app && !isGame, code: existsSync(join(runsDir, id, 'app')),
    painting, paintCount: { done: batch.filter(s => s.state === 'done').length, total: batch.length },
    review,
    // something is still happening on the canvas: the canvas checks back often
    busy: live || waiting.length > 0 || !!review?.active
  }
}
