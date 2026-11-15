// throwaway probe (#530): the classic replay's Hermia at load, frozen clock as motion-parity has it
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { studio } from './walkthrough-fixtures.mjs'
const req = createRequire(join(resolve('tools/dev'), 'package.json'))
const { chromium } = req('playwright')
const s = await studio()
await s.api('/api/setup', { seen: true })
const b = await chromium.launch()
for (const app of ['', 'next/']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  await ctx.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await ctx.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
  const p = await ctx.newPage()
  await p.goto(`${s.BASE}/${app}?replay=${s.ids.mid}&speed=2`, { waitUntil: 'load' })
  await new Promise(r => setTimeout(r, 150))
  console.log(app || 'classic', JSON.stringify(await p.evaluate(() => ({ pets: [...document.querySelectorAll('.pet')].map(e => { const r = e.getBoundingClientRect(); return { cls: e.className, op: getComputedStyle(e).opacity, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), parent: e.parentElement?.id || e.parentElement?.className } }), view: window.swarmCosmos?.nav?.view && { room: window.swarmCosmos.nav.view.room, replay: window.swarmCosmos.nav.view.replay }, state: window.swarmCosmos?.pet?.state }))))
  await ctx.close()
}
await b.close(); s.stop()
