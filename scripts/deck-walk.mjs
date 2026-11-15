// The next UI's Design deck, used end to end as a person uses it (#404, the React UI as the default): every act the
// deck offers is tried on a throwaway Studio (scripts/walkthrough-fixtures.mjs) and what happened is written down,
// so a control that does nothing, or a stand-in, shows. It reads; it does not judge: each act prints what it saw.
//
//   npm run --prefix ui build && node scripts/deck-walk.mjs      (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check)
//
// The Studio's model always fails (no model here), so an act that needs the crew (a comment, the chat's change,
// visitors written afresh) is judged by whether it reached the server and said what happened, not by a new section.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { studio } from './walkthrough-fixtures.mjs'

async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: npm i --no-save playwright, or set PLAYWRIGHT_DIR')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}

const wait = ms => new Promise(r => setTimeout(r, ms))
const rows = []
const note = (act, ok, saw) => { rows.push({ act, ok, saw }); console.log(`${ok === true ? '✓' : ok === false ? '✗' : '?'} ${act}: ${saw}`) }

// one more build: a first build that stopped for a reason before any page was planned (the model did not answer,
// #541), as server/server.mjs records it
const FAILED = '2026-11-01T20-00-00-000Z'
const s = await studio({ setup: ({ runs, T0 }) => {
  const t = T0 + 20 * 3600e3
  mkdirSync(join(runs, FAILED))
  writeFileSync(join(runs, FAILED, 'events.jsonl'), [
    { type: 'run:start', t, run: FAILED, brief: 'Tide Table, the tides for a harbour town', agents: [{ id: 'a0', name: 'Ada', color: '#d4d4d8' }] },
    { type: 'run:stopped', t: t + 4000, run: FAILED, reason: { code: 'model', message: "The model didn't answer (no model here).", action: 'Try again, or pick another model in `hermes model`.' } }
  ].map(e => JSON.stringify(e)).join('\n') + '\n')
} })
// the Setup sheet seen, as the BDD kit does (it would cover the deck on a first run)
await s.api('/api/setup', { seen: true })
const pw = await loadPlaywright()
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const page = await ctx.newPage()
const errors = [], calls = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
page.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`) })
const since = n => calls.slice(n)
const tryAct = async (act, fn) => { const n = calls.length; try { await fn(n) } catch (e) { note(act, false, `threw: ${String(e.message).split('\n')[0]} · calls ${since(n).join(', ') || 'none'}`) } }
const deck = async (run, extra = '') => {
  await page.goto(`${s.BASE}/next/?version=${run}&room=deck${extra}`)
  await page.locator('[role="region"][aria-label="Canvas"]').waitFor({ timeout: 30000 })
  // a page shows as its frame, or on the image-first board as its photo (or its place) until it goes live
  await page.waitForFunction(() => document.querySelectorAll('iframe, [data-page]').length > 0, null, { timeout: 30000 })
  await wait(2500)
}

try {
  await deck(s.ids.site2)
  note('open the deck', true, `${await page.locator('iframe').count()} frames · status "${await page.locator('.deck-status').innerText().catch(() => '-')}"`)

  // the bottom toolbar: are its tools pressable?
  await tryAct('toolbar tools', async () => {
    const tools = await page.locator('[aria-label="Tools"] > li').evaluateAll(els => els.map(e => ({ name: e.getAttribute('aria-label'), button: !!e.querySelector('button') || e.getAttribute('role') === 'button' || e.tabIndex >= 0 })))
    note('toolbar tools', tools.some(t => t.button) ? true : false, tools.map(t => `${t.name}${t.button ? '' : ' (not a button)'}`).join(', '))
  })

  // the person's tools: Text and Comment wait for the next section clicked (web/canvas/marks.js)
  const sectionPoint = async () => { const f = await page.locator('iframe').first().boundingBox(); return [f.x + f.width / 2, f.y + Math.min(f.height / 3, 60)] }
  await tryAct('Text tool', async () => {
    await page.locator('[aria-label="Tools"]').getByRole('button', { name: /^Text/ }).click(); await wait(300)
    const [x, y] = await sectionPoint()
    await page.mouse.click(x, y); await wait(800)
    const focused = await page.evaluate(() => { const a = document.activeElement; return a?.closest('section[aria-label="Design"]') ? (a.getAttribute('aria-label') || a.closest('[class]')?.textContent || a.tagName).slice(0, 40) : null })
    const words = await page.getByRole('textbox', { name: 'Words' }).count()
    note('Text tool', words > 0, `Words field ${words ? 'shown' : 'missing'} · focus ${focused ?? 'not in the Design tab'} · Move pressed again ${await page.locator('[aria-label="Tools"]').getByRole('button', { name: /^Move/ }).getAttribute('aria-pressed')}`)
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(300)
  })
  await tryAct('Comment tool (C)', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await page.keyboard.press('c'); await wait(300)
    const [x, y] = await sectionPoint()
    await page.mouse.click(x, y); await wait(800)
    const open = await page.locator('[role="dialog"][aria-label^="Comment on"]').count()
    note('Comment tool (C)', open > 0, open ? 'the picked section comment opened' : 'no comment opened')
    if (open) await page.locator('[role="dialog"][aria-label^="Comment on"]').getByRole('button', { name: 'Close' }).click()
    await page.keyboard.press('Escape'); await wait(300)
  })

  // select a section from Layers, then its Design tab
  await tryAct('select a section (Layers)', async () => {
    const tree = page.locator('aside[aria-label="Pages and layers"] [role="treegrid"], aside[aria-label="Pages and layers"] [role="tree"]').first()
    const open = tree.getByRole('button', { name: /^Open / }).first()
    if (await open.count()) { await open.click(); await wait(300) }
    const layer = tree.locator('[role="row"][aria-level="2"], [role="treeitem"][aria-level="2"]').first()
    await layer.click()
    await wait(800)
    const tab = await page.locator('section[aria-label="Design"]').count()
    note('select a section (Layers)', tab > 0, tab ? `Design tab open: ${(await page.locator('section[aria-label="Design"]').innerText()).replace(/\s+/g, ' ').slice(0, 120)}` : 'no Design tab')
  })

  // select a section by clicking it on the canvas
  await tryAct('select a section (canvas click)', async () => {
    await page.keyboard.press('Escape'); await wait(300)
    const f = await page.locator('iframe').first().boundingBox()
    await page.mouse.click(f.x + f.width / 2, f.y + Math.min(f.height / 3, 60))
    await wait(800)
    const tab = await page.locator('section[aria-label="Design"]').count()
    note('select a section (canvas click)', tab > 0, tab ? 'Design tab open' : 'nothing picked')
  })

  // Edit: a part's words
  await tryAct('edit words (Open Design patch)', async n => {
    const parts = page.locator('ul[aria-label="Parts"] button')
    const count = await parts.count()
    if (!count) return note('edit words (Open Design patch)', false, 'no parts listed')
    // the first part is the section itself; the next is its first element (a heading here)
    await parts.nth(Math.min(1, count - 1)).click(); await wait(400)
    const words = page.getByRole('textbox', { name: 'Words' }).first()
    if (!await words.count()) return note('edit words (Open Design patch)', false, `part has no Words field: ${(await page.locator('section[aria-label="Design"]').innerText()).replace(/\s+/g, ' ').slice(0, 160)}`)
    await words.fill('Edited by the deck walk'); await words.press('Enter'); await wait(1500)
    let inFrame = false
    for (const fr of page.frames()) if (await fr.evaluate(() => document.body?.innerText.includes('Edited by the deck walk')).catch(() => false)) inFrame = true
    const undo = await page.getByRole('button', { name: /^Undo/ }).first().isEnabled().catch(() => false)
    // a hand edit is a section version: a layer:done in the build's events (POST /restore)
    const events = await s.api(`/api/runs/${s.ids.site2}/events`).catch(() => null)
    const saved = JSON.stringify(events || []).includes('Edited by the deck walk')
    note('edit words (Open Design patch)', inFrame && saved, `in the frame ${inFrame} · saved on the server ${saved} · Undo ${undo} · calls ${since(n).join(', ') || 'none'}`)
    if (undo) {
      const m = calls.length
      await page.getByRole('button', { name: /^Undo/ }).first().click(); await wait(1500)
      let still = false
      for (const fr of page.frames()) if (await fr.evaluate(() => document.body?.innerText.includes('Edited by the deck walk')).catch(() => false)) still = true
      note('undo the edit', !still, `words gone from the frame ${!still} · calls ${since(m).join(', ') || 'none'}`)
    }
  })

  // Comment on the picked section
  await tryAct('comment on a section', async n => {
    const pin = page.getByRole('button', { name: /^Comment on/ }).first()
    if (!await pin.count()) return note('comment on a section', false, 'no Comment button on the picked section')
    await pin.click(); await wait(400)
    const box = page.locator('[role="dialog"][aria-label^="Comment on"] textarea').first()
    await box.fill('Make the heading shorter')
    await page.locator('[role="dialog"][aria-label^="Comment on"]').getByRole('button', { name: 'Send' }).click()
    await wait(2500)
    const thread = await page.locator('[role="dialog"][aria-label^="Comment on"] [aria-label="Thread"]').innerText().catch(() => '')
    note('comment on a section', since(n).some(c => /comment|fix|mark/i.test(c)), `calls ${since(n).join(', ') || 'none'} · thread "${thread.replace(/\s+/g, ' ').slice(0, 120)}"`)
    await page.locator('[role="dialog"][aria-label^="Comment on"]').getByRole('button', { name: 'Close' }).click()
    await wait(300)
    note('comment closes', await page.locator('[role="dialog"][aria-label^="Comment on"]').count() === 0, 'Close pressed')
  })

  // the chat driving a change to the picked section
  await tryAct('chat: change the picked section', async n => {
    const msg = page.getByRole('textbox', { name: 'Message' })
    await msg.fill('make this section darker'); await msg.press('Enter')
    await wait(3000)
    const chat = (await page.locator('section[aria-label="Chat"]').innerText()).replace(/\s+/g, ' ')
    note('chat: change the picked section', since(n).length > 0, `calls ${since(n).join(', ') || 'none'} · chat ends "${chat.slice(-160)}"`)
  })

  // Tweaks and Draw (decision 0010): present?
  for (const name of ['Tweaks', 'Draw']) {
    const where = await page.locator('button, [role="tab"]').evaluateAll((els, name) => els.filter(e => new RegExp(`\b${name}\b`, 'i').test(e.getAttribute('aria-label') || e.textContent || '')).map(e => `${(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 40)} in ${e.closest('[aria-label]')?.getAttribute('aria-label') || '?'}`), name)
    note(`${name} present`, null, where.join('; ') || 'none')
  }

  // Export
  await tryAct('export', async n => {
    await page.keyboard.press('Escape'); await wait(300)
    await page.locator('aside[aria-label="Design"]').getByRole('button', { name: 'Build', exact: true }).click(); await wait(300)
    await page.getByRole('menuitem', { name: 'Export' }).click(); await wait(4000)
    const dlg = (await page.getByRole('dialog').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
    const zip = await page.getByRole('link', { name: /Download/ }).count()
    note('export', zip > 0, `dialog "${dlg.slice(0, 160)}" · calls ${since(n).join(', ') || 'none'}`)
    await page.keyboard.press('Escape'); await wait(500)
  })

  // Publish on this computer, then Post to Feed
  await tryAct('publish', async n => {
    await page.getByRole('button', { name: /^(Publish|Live)$/ }).first().click(); await wait(2000)
    const hosts = (await page.getByRole('dialog').first().innerText()).replace(/\s+/g, ' ')
    const local = page.getByRole('dialog').getByRole('button', { name: /this computer|local/i }).first()
    if (!await local.count()) return note('publish', false, `no local host: ${hosts.slice(0, 200)}`)
    await local.click()
    await page.getByRole('dialog').getByText('Live').first().waitFor({ timeout: 30000 }).catch(() => {})
    const after = (await page.getByRole('dialog').first().innerText()).replace(/\s+/g, ' ')
    note('publish', /Live/.test(after), `"${after.slice(0, 200)}" · calls ${since(n).join(', ') || 'none'}`)
    const feed = page.getByRole('dialog').getByRole('button', { name: 'Post to Feed' })
    if (await feed.count()) {
      const m = calls.length
      await feed.click(); await wait(4000)
      const said = (await page.getByRole('dialog').first().innerText()).replace(/\s+/g, ' ')
      note('post to feed', null, `"${said.slice(-200)}" · calls ${since(m).join(', ') || 'none'} (the Feed here is 127.0.0.1:9: a clear failure is right)`)
    } else note('post to feed', false, 'no Post to Feed button')
    await page.keyboard.press('Escape'); await wait(500)
  })

  // a build no one has touched in this walk (a comment above set the other one reworking, which holds Replay back)
  await deck(s.ids.site)
  // Replay from the menu
  await tryAct('replay', async n => {
    await page.locator('aside[aria-label="Design"]').getByRole('button', { name: 'Build', exact: true }).click(); await wait(300)
    await page.getByRole('menuitem', { name: 'Replay' }).click(); await wait(3000)
    const st = await page.locator('.deck-status').innerText().catch(() => '-')
    const url = page.url()
    // the menu's Replay plays the saved build again at 1x from its start: the status counts the sections up again
    note('replay', /building|planning|replay/i.test(st), `address ${url.replace(s.BASE, '')} · status "${st}" · cursors ${await page.locator('.deck-crew .cursor').count()}`)
    await wait(6000)
    note('replay, later', null, `status "${await page.locator('.deck-status').innerText().catch(() => '-')}" · address ${page.url().replace(s.BASE, '')}`)
  })

  // a failed first build: why, and Try again, in the chat (#541)
  await deck(FAILED).catch(() => {})
  await tryAct('a failed first build: Try again', async () => {
    await page.locator('section[aria-label="Chat"]').waitFor({ timeout: 15000 })
    const chat = (await page.locator('section[aria-label="Chat"]').innerText()).replace(/\s+/g, ' ')
    const again = page.locator('section[aria-label="Chat"]').getByRole('button', { name: 'Try again' })
    const n = await again.count()
    if (!n) return note('a failed first build: Try again', false, `no Try again · chat "${chat.slice(-200)}"`)
    const m = calls.length
    await again.first().click(); await wait(2500)
    note('a failed first build: Try again', since(m).some(c => /^POST \/api\/run /.test(c)), `why shown ${/didn't answer/.test(chat)} · calls ${since(m).join(', ') || 'none'} · address ${page.url().replace(s.BASE, '')}`)
  })

  // the image-first board (?board=tiers): a click on a page, a photo until then, picks the section under it
  await deck(s.ids.site, '&board=tiers')
  await tryAct('select on the image-first board', async () => {
    const r = await page.locator('[role="region"][aria-label="Canvas"] [data-page]').first().boundingBox()
    await page.mouse.click(r.x + r.width / 2, r.y + 40); await wait(4000)
    const tab = await page.locator('section[aria-label="Design"]').count(), outline = await page.locator('[data-picked]').count()
    const pin = await page.getByRole('button', { name: /^Comment on/ }).count()
    note('select on the image-first board', tab > 0 && outline > 0, `Design tab ${tab > 0} · outline ${outline > 0} · Comment pin ${pin > 0}`)
    await page.keyboard.press('Escape'); await wait(300)
  })

  // Play, then Watch a visitor on the build with a visitor (opened afresh: the replay above may still be playing)
  await deck(s.ids.site)
  await tryAct('play', async n => {
    await page.getByRole('button', { name: 'Play' }).first().click(); await wait(3000)
    const frames = await page.locator('.deck-play-frame, iframe').count()
    const url = page.url()
    note('play', /player|play/.test(url), `address ${url.replace(s.BASE, '')} · frames ${frames}`)
    const link = page.frames().find(f => f !== page.mainFrame() && f.url() !== 'about:blank')
    note('play: the page in the player', null, link ? `a frame at ${link.url().slice(0, 80)}` : 'no frame with an address (srcdoc)')
  })
  await tryAct('watch a visitor', async n => {
    await page.getByRole('button', { name: 'Watch a visitor' }).click(); await wait(6000)
    const think = await page.locator('.deck-think').first().innerText().catch(() => '')
    note('watch a visitor', !!think.trim(), `thought "${think.slice(0, 80)}" · address ${page.url().replace(s.BASE, '')} · calls ${since(n).join(', ') || 'none'}`)
    await page.getByRole('button', { name: 'Stop watching' }).click().catch(() => {})
    await page.keyboard.press('Escape'); await wait(500)
  })
} finally {
  console.log(`\nconsole errors (${errors.length}):\n  ${[...new Set(errors)].slice(0, 15).join('\n  ')}`)
  console.log(`\napi calls that failed:\n  ${[...new Set(calls.filter(c => / [45]\d\d$/.test(c)))].join('\n  ') || 'none'}`)
  await browser.close()
  s.stop()
}
