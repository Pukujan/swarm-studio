// The Studio scaffold (openspec/specs/studio/spec.md) beyond its machine gates (#461): the step path, what each step
// shows empty, files dropped on a step, the chat that leads a website's Studio and the Layers sheet at 390. The same
// steps read both Studios by what a person sees (a step's name, a button's label, a line the chat says). A project
// that a scenario changes (a step removed, a file dropped) is one made for that scenario; the planner and the
// builders need a model, which the test Studio has not, so what only they answer is a Manual line in the spec.
import { bind, problems, step } from '../kit.mjs'

const phone = page => page.setViewportSize({ width: 390, height: 844 })
const desktop = page => page.setViewportSize({ width: 1440, height: 900 })
const wait = (page, ms = 1200) => page.waitForTimeout(ms)
// a project of the scaffold's own kind, made for one scenario
const made = async studio => (await studio.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })).project.id
const scaffoldAt = ({ studio, app }, id, extra = '') => `${studio.BASE}${app ? '/next/' : '/'}?room=studio&project=${id}${extra}`
async function openScaffold(fx, { id, query = '&step=brand', width = 1440 } = {}) {
  await (width === 390 ? phone : desktop)(fx.page)
  fx.seen.id = id || await made(fx.studio)
  await fx.page.goto(scaffoldAt(fx, fx.seen.id, query))
  await fx.page.locator('nav[aria-label="Steps"] button').first().waitFor({ timeout: 15_000 })
  await wait(fx.page, 1500)
}
const stepPath = page => page.locator('nav[aria-label="Steps"]').first()
// the chips on the path, by name; one with no dot is a step taken off (the "+ Name" chip at the end)
const chips = page => page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Steps"] button')].map(b => ({ name: b.innerText.replace(/^\s*\+\s*/, '').trim(), on: !!b.querySelector('[role="img"]'), plus: !b.querySelector('[role="img"]') })))
const chip = (page, name) => stepPath(page).locator('button').filter({ hasText: new RegExp(`^\\s*\\+?\\s*${name}\\s*$`) }).first()
// presses a chip; one that is not on the path is what the scenario finds, not a wait
const press = async (fx, name) => {
  const c = chip(fx.page, name)
  if (!(await c.count())) { (fx.seen.missing ||= []).push(`no ${name} chip on the path`); return false }
  await c.click({ timeout: 5000 })
  return true
}
const names = list => list.filter(c => c.on).map(c => c.name)
const plusNames = list => list.filter(c => c.plus).map(c => c.name)
const offered = (page, label) => page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).filter({ visible: true }).count()
const remove = page => page.getByRole('button', { name: /^remove$/i }).filter({ visible: true }).first().click({ timeout: 5000 })
const stepOf = page => new URL(page.url()).searchParams.get('step')
const roomOf = page => new URL(page.url()).searchParams.get('room')
// what a section shows: where its heading is, and the text under it
const section = (page, label) => page.evaluate(label => {
  const head = [...document.querySelectorAll('.al, h2, h3, span, div')].find(e => !e.children.length && e.textContent.trim().toLowerCase() === label.toLowerCase() && e.getClientRects().length && e.getBoundingClientRect().top > 60)
  if (!head) return null
  const box = head.closest('section, .pj-sec, [data-sec]') || head.parentElement
  return { text: box.innerText.replace(/\s+/g, ' ').trim(), top: head.getBoundingClientRect().top, height: innerHeight }
}, label)
const dotOf = (page, name) => page.evaluate(name => {
  const b = [...document.querySelectorAll('nav[aria-label="Steps"] button')].find(b => b.innerText.replace(/^\s*\+\s*/, '').trim() === name)
  return b?.querySelector('[role="img"]')?.getAttribute('aria-label') || null
}, name)
// the cards on the board (not the Layers rows, which carry the same keys)
const cardKeys = page => page.evaluate(() => [...document.querySelectorAll('.ab[data-key]')].filter(e => e.getClientRects().length).map(e => e.getAttribute('data-key')))
const chatBox = (page, app) => app ? page.locator('textarea[aria-label="Message"]') : page.locator('#brief')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const BIND = {
  'studio › Breadcrumb › Esc goes up one step': [
    step('References in view, nothing selected, Esc pressed twice', async fx => {
      await openScaffold(fx, { query: '&step=references' })
      // nothing selected, the focus on the board and not in the chat box (where Esc is the box's own)
      await fx.page.mouse.click(760, 500); await wait(fx.page, 500)
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 1200)
      fx.seen.first = { step: stepOf(fx.page), room: roomOf(fx.page) }
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 1800)
      fx.seen.second = { step: stepOf(fx.page), room: roomOf(fx.page), url: fx.page.url() }
    }),
    step('Brand, then Projects', async ({ seen }) => problems([
      seen.first.step !== 'brand' && `the first Esc leaves the address on step ${seen.first.step}, not Brand`,
      seen.second.room === 'studio' && `the second Esc leaves the Studio open (${seen.second.url.replace(/^.*\?/, '?')}), not Projects`
    ]))
  ],
  'studio › Step path › Opening a step': [
    step('the Assets chip pressed', async fx => {
      await openScaffold(fx)
      if (!await press(fx, 'Assets')) return
      await wait(fx.page)
      fx.seen.step = stepOf(fx.page)
      fx.seen.assets = await section(fx.page, 'Assets')
      fx.seen.skip = await offered(fx.page, 'skip'); fx.seen.remove = await offered(fx.page, 'remove')
    }),
    step('Assets in view, step=assets, Skip and Remove in the inspector', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      seen.step !== 'assets' && `the address's step is ${seen.step}, not assets`,
      !seen.assets && 'no Assets section on the board',
      seen.assets && !(seen.assets.top >= 0 && seen.assets.top < seen.assets.height) && `the Assets section is out of view (it starts ${Math.round(seen.assets.top)} px down a ${seen.assets.height} px window)`,
      !seen.skip && 'the inspector offers no Skip', !seen.remove && 'the inspector offers no Remove'
    ]))
  ],
  'studio › Step path › Removing and bringing back a step': [
    step('References removed, then + References pressed', async fx => {
      await openScaffold(fx)
      if (!await press(fx, 'References')) return
      await wait(fx.page, 800)
      await remove(fx.page); await wait(fx.page)
      fx.seen.removed = await chips(fx.page)
      fx.seen.refSection = await section(fx.page, 'References')
      const at = fx.seen.removed.findIndex(c => c.plus && c.name === 'References')
      if (at < 0) { (fx.seen.missing ||= []).push('no + References chip appears'); return }
      await stepPath(fx.page).locator('button').nth(at).click({ timeout: 5000 }); await wait(fx.page)
      fx.seen.back = await chips(fx.page)
      fx.seen.dot = await dotOf(fx.page, 'References')
    }),
    step('gone from the path and board, + References at the end, then back after Brand with an Empty dot', async ({ seen }) => {
      if (seen.missing) return problems(seen.missing)
      const after = names(seen.back)
      return problems([
        names(seen.removed).includes('References') && 'References stays on the path after Remove',
        seen.refSection && 'References stays on the board after Remove',
        seen.removed.at(-1)?.name !== 'References' && 'the + References chip is not the last one',
        after.indexOf('References') !== after.indexOf('Brand') + 1 && `References returns at ${after.indexOf('References') + 1}, not right after Brand (${after.join(', ')})`,
        after.indexOf('References') >= 0 && after.indexOf('Assets') !== after.indexOf('References') + 1 && 'References does not come back before Assets',
        seen.dot !== 'Empty' && `its dot reads ${seen.dot}, not Empty`
      ])
    })
  ],
  'studio › Step path › Lock cannot be removed': [
    step('the Lock chip pressed', async fx => {
      await openScaffold(fx, { query: '' })
      fx.seen.before = { skip: await offered(fx.page, 'skip'), remove: await offered(fx.page, 'remove') }
      await press(fx, 'Lock'); await wait(fx.page)
      fx.seen.after = { skip: await offered(fx.page, 'skip'), remove: await offered(fx.page, 'remove') }
    }),
    step('no Skip or Remove', async ({ seen }) => problems([
      ...(seen.missing || []),
      seen.after.remove > seen.before.remove && 'Remove is offered for Lock',
      seen.after.skip > seen.before.skip && 'Skip is offered for Lock'
    ]))
  ],
  'studio › Step path › A project with only its Plan step': [
    step('Brand, References and Assets removed, then the project opened again', async fx => {
      await openScaffold(fx)
      for (const n of ['Brand', 'References', 'Assets']) {
        if (!await press(fx, n)) continue
        await wait(fx.page, 700)
        await remove(fx.page); await wait(fx.page, 900)
      }
      await fx.page.goto(scaffoldAt(fx, fx.seen.id, '&step=plan'))
      await stepPath(fx.page).locator('button').first().waitFor({ timeout: 15_000 }); await wait(fx.page, 1500)
      fx.seen.path = await chips(fx.page)
    }),
    step('Plan and Lock, then + Brand, + References, + Assets', async ({ seen }) => problems([
      ...(seen.missing || []),
      JSON.stringify(names(seen.path).sort()) !== JSON.stringify(['Lock', 'Plan']) && `the path shows ${names(seen.path).join(', ') || 'nothing'}, not Plan and Lock`,
      JSON.stringify(plusNames(seen.path).sort()) !== JSON.stringify(['Assets', 'Brand', 'References']) && `the + chips are ${plusNames(seen.path).join(', ') || 'none'}, not Brand, References and Assets`
    ]))
  ],
  'studio › Empty steps › A new project': [
    step('a new website project opened in the Studio', async fx => {
      await openScaffold(fx)
      fx.seen.text = await fx.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
      fx.seen.dots = await Promise.all(['Brand', 'References', 'Assets'].map(async n => [n, await dotOf(fx.page, n)]))
      fx.seen.cards = await cardKeys(fx.page)
    }),
    step('one Brand sheet card, Add reference, Add asset, each dot Empty', async ({ seen }) => problems([
      seen.cards.filter(k => k === 'brand:open').length !== 1 && `${seen.cards.filter(k => k === 'brand:open').length} Brand sheet cards, not one`,
      !/Add reference/i.test(seen.text) && 'References does not show Add reference',
      !/Add asset/i.test(seen.text) && 'Assets does not show Add asset',
      ...seen.dots.map(([n, d]) => d !== 'Empty' && `${n}'s dot reads ${d}, not Empty`)
    ]))
  ],
  'studio › Empty steps › Files dropped on a step': [
    step('two images dropped on the Assets section', async fx => {
      await openScaffold(fx)
      // the Assets step brought into view, as a person would to drop on it
      await press(fx, 'Assets'); await wait(fx.page, 1200)
      fx.seen.missing = null
      const target = fx.page.locator('.ab[data-key="asset:add"]').first()
      if (!await target.count()) { fx.seen.missing = ['no Add asset card on the board']; return }
      const box = await target.boundingBox()
      const hit = await fx.page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y), { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      if (!hit) { fx.seen.missing = [`the Add asset card is out of view (${Math.round(box.x)}, ${Math.round(box.y)} in the window)`]; return }
      await fx.page.evaluate(async ({ b64, x, y }) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        const files = ['one.png', 'two.png'].map(n => new File([bytes], n, { type: 'image/png' }))
        const dt = new DataTransfer(); files.forEach(f => dt.items.add(f))
        const el = document.elementFromPoint(x, y)
        for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }))
      }, { b64: png.toString('base64'), x: box.x + box.width / 2, y: box.y + box.height / 2 })
      await wait(fx.page, 2500)
      fx.seen.cards = await cardKeys(fx.page)
      fx.seen.dotAssets = await dotOf(fx.page, 'Assets')
    }),
    step('both as asset cards, the dot Done, nothing in References', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      seen.cards.filter(k => /^asset:(?!add)/.test(k)).length !== 2 && `${seen.cards.filter(k => /^asset:(?!add)/.test(k)).length} asset cards (${seen.cards.filter(k => /^asset/.test(k)).join(', ')}), not two`,
      seen.dotAssets !== 'Done' && `the Assets dot reads ${seen.dotAssets}, not Done`,
      seen.cards.some(k => /^ref:(?!add|link)/.test(k)) && `a file went to References (${seen.cards.filter(k => /^ref:/.test(k)).join(', ')})`
    ]))
  ],
  'studio › The chat leads a website\'s Studio › Build with nothing said': [
    step('Build pressed, and "build" typed, on a new website project with no pages and no pictures chosen', async fx => {
      const look = async () => ({
        text: await fx.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')),
        focus: await fx.page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName),
        room: roomOf(fx.page)
      })
      await openScaffold(fx)
      await fx.page.getByRole('button', { name: /^build$/i }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(fx.page, 2500)
      fx.seen.pressed = await look()
      await openScaffold(fx)
      await chatBox(fx.page, fx.app).fill('build'); await chatBox(fx.page, fx.app).press('Enter'); await wait(fx.page, 2500)
      fx.seen.typed = await look()
    }),
    step('nothing builds, the chat asks which pages, the chat box has the focus', async ({ seen, app }) => problems(['pressed', 'typed'].flatMap(how => [
      seen[how].room !== 'studio' && `${how} Build: the Studio moved on to the ${seen[how].room} room: a build started`,
      !/which pages/i.test(seen[how].text) && `${how} Build: the chat does not ask which pages`,
      seen[how].focus !== (app ? 'Message' : 'brief') && `${how} Build: the focus is on ${seen[how].focus}, not the chat box`
    ])))
  ],
  'studio › 390 px › Layers as a sheet': [
    step('Layers pressed at 390 wide', async fx => {
      await openScaffold(fx, { width: 390 })
      const layers = () => fx.page.getByRole('button', { name: /^layers$/i }).filter({ visible: true }).first()
      const sheet = () => fx.page.locator('[role="tree"], [role="treegrid"], .pj-layers').filter({ visible: true }).count()
      const tap = async loc => { await loc.click({ timeout: 3000 }).catch(() => {}); await wait(fx.page, 800) }
      fx.seen.before = await sheet()
      await tap(layers())
      fx.seen.opened = await sheet()
      const close = fx.page.getByRole('button', { name: /^(×|close layers|close)$/i }).filter({ visible: true }).first()
      fx.seen.closeBtn = await close.count()
      await tap(close)
      fx.seen.byButton = await sheet()
      await tap(layers())
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 800)
      fx.seen.byEsc = await sheet()
      await tap(layers())
      await fx.page.mouse.click(380, 800); await wait(fx.page, 800)
      fx.seen.byOutside = await sheet()
    }),
    step('the sheet opens; ×, Esc or a click outside closes it', async ({ seen }) => problems([
      seen.before && 'the Layers are open before the button is pressed',
      !seen.opened && 'the Layers sheet does not open',
      seen.opened && !seen.closeBtn && 'no × on the sheet',
      seen.opened && seen.byButton && '× does not close it',
      seen.opened && seen.byEsc && 'Esc does not close it',
      seen.opened && seen.byOutside && 'a click outside does not close it'
    ]))
  ]
}
bind(BIND)
