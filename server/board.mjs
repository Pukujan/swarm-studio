// A project's canvas: everything one build made, grouped the way the Files panel shows it.
// Shared by the local server and the hosted studio.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as art from '../engine/artdirect.mjs'

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
  const films = video ? [{ name: 'Promo', src: `/video/${id}/promo.mp4`, poster: existsSync(join(runsDir, id, 'video', 'p1.webp')) ? `/video/${id}/live/p1.webp` : null, seconds: Number(video.seconds) || null }] : []
  const spec = events.findLast(e => e.type === 'game:spec')?.spec
  const isGame = start.kind === 'game' || !!spec
  const app = events.some(e => e.type === 'app:ready' || e.type === 'app:done')
  const th = events.findLast(e => e.type === 'theme')
  return {
    id, title: start.title || pages[0]?.title || '', kind: start.kind || 'site', live: live,
    brief: String(start.brief || '').split('\n\nThe owner uploaded these pictures.')[0].split('\n\nFor this version: ')[0].slice(0, 4000),
    pages, art: pics, films, style,
    theme: th?.vars ? { colors: ['--background', '--primary', '--accent', '--foreground'].map(k => th.vars[k]).filter(Boolean), fonts: th.fonts || null } : null,
    game: isGame ? { title: (typeof spec === 'object' && spec?.title) || start.title || 'Game', cover: pics[0]?.src || null } : null,
    app: app && !isGame, code: existsSync(join(runsDir, id, 'app'))
  }
}
