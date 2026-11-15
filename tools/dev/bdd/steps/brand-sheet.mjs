// The Brand sheet (openspec/specs/brand-sheet/spec.md) beyond its machine gates (#461): going back, the options
// landing, picking a palette, a pack in part, Lock and the options that could not be made. The same steps read both
// Studios by what a person sees (a card by its key, a button by its label). A scenario that changes a sheet's picks
// opens one of a project made for it, from the scaffold's Brand card as a person does; what a model writes (the
// brief under a chat, a palette from the person's words) is a Manual line in the spec.
import { bind, open, problems, step } from '../kit.mjs'

const wait = (page, ms = 1000) => page.waitForTimeout(ms)
const BASE = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}`
const made = async studio => (await studio.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })).project.id
const card = (page, key) => page.locator(`.ab[data-key="${key}"]`).filter({ visible: true }).first()
const roomOf = page => new URL(page.url()).searchParams.get('room')
const stepOf = page => new URL(page.url()).searchParams.get('step')
// a project of the scaffold's kind, its sheet opened from the Brand card (Enter on it), as the way in is
async function fromScaffold(fx, { ready = true, before } = {}) {
  await fx.page.setViewportSize({ width: 1440, height: 900 })
  fx.seen.id = await made(fx.studio)
  if (before) await before(fx.page)
  await fx.page.goto(`${BASE(fx)}?room=studio&project=${fx.seen.id}&step=brand`)
  await card(fx.page, 'brand:open').waitFor({ timeout: 15_000 })
  await card(fx.page, 'brand:open').press('Enter')
  if (ready) { await card(fx.page, 'palette:p2').waitFor({ timeout: 20_000 }); await wait(fx.page, 1200) }
}
// what is picked on the sheet, by kind (palette, type, voice, pictures)
const picks = page => page.evaluate(() => {
  const out = {}
  for (const e of document.querySelectorAll('.ab[data-key]')) {
    if (!e.getClientRects().length) continue
    const [kind, id] = e.getAttribute('data-key').split(':')
    if (!['palette', 'type', 'voice', 'pictures'].includes(kind)) continue
    if (e.getAttribute('aria-pressed') === 'true' || e.classList.contains('on')) out[kind] = id
  }
  return out
})
// how each type pairing's sample is drawn: its background and text colour
const samples = page => page.evaluate(() => [...document.querySelectorAll('.ab[data-key^="type:"]')].filter(e => e.getClientRects().length).map(e => {
  const sample = e.querySelector('[style*="background"]') || e
  const c = getComputedStyle(sample)
  return `${c.backgroundColor}/${c.color}`
}))
const inspectorText = page => page.evaluate(() => [...document.querySelectorAll('aside, [aria-label="Inspector"]')].filter(e => e.getClientRects().length).map(e => e.innerText).join(' '))

const BIND = {
  'brand-sheet › Breadcrumb › Going back where it came from': [
    step('the sheet opened from the scaffold\'s Brand step, Esc with nothing selected', async fx => {
      await fromScaffold(fx)
      // the stage's bottom corner, where nothing is drawn
      await fx.page.mouse.click(1420, 880); await wait(fx.page, 500)
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 2000)
      fx.seen.room = roomOf(fx.page); fx.seen.step = stepOf(fx.page)
      fx.seen.steps = await fx.page.locator('nav[aria-label="Steps"] button').count()
    }),
    step('the scaffold shows again on its Brand step', async ({ seen }) => problems([
      seen.room !== 'studio' && `Esc leaves the address's room at ${seen.room}, not the scaffold`,
      seen.room === 'studio' && !seen.steps && 'the scaffold\'s step path does not show',
      seen.room === 'studio' && seen.step !== 'brand' && `the scaffold is on step ${seen.step}, not Brand`
    ]))
  ],
  'brand-sheet › Loading › The options land': [
    step('the sheet opened, its options held then arriving', async fx => {
      fx.seen.screen = 'brand-sheet'
      Object.assign(fx.seen, await open(fx, 'brand-sheet', 1440, p => /^\/api\/projects\/[^/]+\/brand$/.test(p)))
      await wait(fx.page, 1500)
      fx.seen.after = await fx.page.evaluate(() => ({
        waits: [...document.querySelectorAll('.br-wait, [aria-busy="true"].card, .card.wait-in')].filter(e => e.getClientRects().length).length,
        busyStage: [...document.querySelectorAll('[aria-busy="true"]')].filter(e => e.getClientRects().length && !e.matches('#app-loading, .app-loading, .app-skel')).map(e => String(e.className).slice(0, 24)),
        story: [...document.querySelectorAll('.ab[data-key^="story:"]')].filter(e => e.getClientRects().length).length,
        palettes: [...document.querySelectorAll('.ab[data-key^="palette:"]')].filter(e => e.getClientRects().length).length,
        types: [...document.querySelectorAll('.ab[data-key^="type:"]')].filter(e => e.getClientRects().length).length
      }))
    }),
    step('each skeleton replaced by its card, the stage not busy', async ({ seen }) => problems([
      seen.during && !(seen.during.busy || seen.during.brandParts) && 'nothing waited while the options were held',
      seen.after.waits && `${seen.after.waits} skeletons are still showing`,
      seen.after.busyStage.length && `the stage is still marked busy (${seen.after.busyStage.join(', ')})`,
      !(seen.after.story && seen.after.palettes && seen.after.types) && `the cards are not all there (${seen.after.story} story, ${seen.after.palettes} palettes, ${seen.after.types} types)`
    ]))
  ],
  'brand-sheet › Options side by side › Picking a palette': [
    step('the second palette clicked', async fx => {
      await fromScaffold(fx)
      fx.seen.before = { picks: await picks(fx.page), samples: await samples(fx.page) }
      await card(fx.page, 'palette:p2').click({ timeout: 5000 }); await wait(fx.page, 900)
      fx.seen.pressed = await card(fx.page, 'palette:p2').getAttribute('aria-pressed')
      fx.seen.after = { picks: await picks(fx.page), samples: await samples(fx.page) }
      fx.seen.inspector = await inspectorText(fx.page)
    }),
    step('it is picked, every type sample redraws, the inspector shows its colours', async ({ seen }) => problems([
      seen.pressed !== 'true' && `the palette's aria-pressed is ${seen.pressed}, not true`,
      seen.after.picks.palette !== 'p2' && `the picked palette is ${seen.after.picks.palette}, not the second`,
      seen.after.samples.some((s, i) => s === seen.before.samples[i]) && 'a type sample does not redraw in the new palette',
      !(/background/i.test(seen.inspector) && /accent/i.test(seen.inspector)) && 'the inspector shows no colours'
    ]))
  ],
  'brand-sheet › Options side by side › A pack in part': [
    step('a pack selected and Type pressed in the inspector', async fx => {
      await fromScaffold(fx)
      await card(fx.page, 'palette:p2').click({ timeout: 5000 }); await wait(fx.page, 700)
      fx.seen.before = await picks(fx.page)
      await card(fx.page, 'pack:od-cafe').click({ timeout: 5000 }); await wait(fx.page, 700)
      await fx.page.getByRole('button', { name: /^type$/i }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(fx.page, 900)
      fx.seen.after = await picks(fx.page)
    }),
    step('only the type pairing changes to the pack\'s', async ({ seen }) => problems([
      seen.after.type === seen.before.type && 'the type pairing does not change',
      seen.after.palette !== seen.before.palette && `the palette changes too (${seen.before.palette} to ${seen.after.palette})`,
      seen.after.voice !== seen.before.voice && `the voice changes too (${seen.before.voice} to ${seen.after.voice})`,
      seen.after.pictures !== seen.before.pictures && `the pictures change too (${seen.before.pictures} to ${seen.after.pictures})`
    ]))
  ],
  'brand-sheet › Lock › Locking from the Studio': [
    step('Lock pressed on a sheet opened from the scaffold', async fx => {
      await fromScaffold(fx)
      await card(fx.page, 'palette:p2').click({ timeout: 5000 }); await wait(fx.page, 700)
      await fx.page.getByRole('button', { name: /^lock$/i }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(fx.page, 3000)
      fx.seen.room = roomOf(fx.page)
      fx.seen.card = await card(fx.page, 'brand:open').evaluate(e => ({ swatches: e.querySelectorAll('.br-sw i').length, type: !!e.querySelector('.sc-type'), text: e.innerText.replace(/\s+/g, ' ') })).catch(() => null)
      fx.seen.dot = await fx.page.evaluate(() => {
        const b = [...document.querySelectorAll('nav[aria-label="Steps"] button')].find(b => b.innerText.replace(/^\s*\+\s*/, '').trim() === 'Brand')
        return b?.querySelector('[role="img"]')?.getAttribute('aria-label') || null
      })
    }),
    step('the scaffold again, its Brand card showing the colours and type, the dot Done', async ({ seen }) => problems([
      seen.room !== 'studio' && `the address's room is ${seen.room}, not the scaffold`,
      !seen.card && 'the Brand card is not on the scaffold',
      seen.card && !seen.card.swatches && 'the Brand card shows no colours',
      seen.card && !seen.card.type && 'the Brand card shows no type',
      seen.dot !== 'Done' && `the Brand dot reads ${seen.dot}, not Done`
    ]))
  ],
  'brand-sheet › Empty state › The options could not be made': [
    step('the sheet opened with the brand request failing', async fx => {
      await fromScaffold(fx, { ready: false, before: page => page.route(url => /^\/api\/projects\/[^/]+\/brand$/.test(new URL(url).pathname), route => route.fulfill({ status: 500, json: { error: 'the model did not answer' } })) })
      await wait(fx.page, 4000)
      fx.seen.toast = await fx.page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], .toast, .tst')].filter(e => e.getClientRects().length && e.getAttribute('aria-busy') !== 'true').map(e => e.innerText.trim()).filter(Boolean))
      fx.seen.busy = await fx.page.evaluate(() => [...document.querySelectorAll('[aria-busy="true"]')].filter(e => e.getClientRects().length && !e.matches('#app-loading, .app-loading, .app-skel')).map(e => String(e.className).slice(0, 24)))
    }),
    step('a one-line toast says what failed, the stage no longer busy', async ({ seen }) => problems([
      !seen.toast.length && 'no toast says what failed',
      seen.toast.some(t => t.split('\n').length > 2) && 'the toast is more than one line',
      seen.busy.length && `the stage is still marked busy (${seen.busy.join(', ')})`
    ]))
  ]
}
bind(BIND)
