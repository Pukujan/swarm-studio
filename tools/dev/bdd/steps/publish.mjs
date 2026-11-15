// Publish (openspec/specs/publish/spec.md) beyond its machine gates (#461): what Publish says before there is
// anything to publish, the hosts being checked, a version with no app, a build that failed and the layer at 390. The
// same steps read both Studios by what a person sees (a button, a heading, a line). The test Studio never deploys and
// never posts, so everything that goes out (a deploy, a post to the Feed, to X, to Discord) is a Manual line in the
// spec: it needs a live link, a launch kit the model writes, or a gateway of Hermes's.
import { bind, problems, step } from '../kit.mjs'

const wait = (page, ms = 1000) => page.waitForTimeout(ms)
const BASE = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}`
const DECK = (fx, run) => `${BASE(fx)}?project=${run}&version=${run}&room=deck`
const publishBtn = page => page.getByRole('button', { name: /^Publish/ }).filter({ visible: true }).first()
// the layer Publish opens: the smallest element holding its heading (each Studio words it its own way)
const layerText = page => page.evaluate(() => {
  const heads = [...document.querySelectorAll('*')].filter(e => e.getClientRects().length && /put it online|publish the website/i.test(e.innerText || '') && e.innerText.length < 1500)
  const el = heads.sort((a, b) => a.innerText.length - b.innerText.length)[0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { text: el.innerText.replace(/\s+/g, ' ').trim(), left: r.left, right: r.right }
})
async function openPublish(fx, run, width = 1440) {
  await fx.page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await fx.page.goto(DECK(fx, run))
  await publishBtn(fx.page).waitFor({ timeout: 15_000 })
  await wait(fx.page, 1500)
  await publishBtn(fx.page).click({ timeout: 5000 })
}

const BIND = {
  'publish › One place to publish › Nothing to publish yet': [
    step('Publish on a version whose build is not done', async fx => {
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      await fx.page.goto(DECK(fx, fx.studio.ids.mid))
      await publishBtn(fx.page).waitFor({ timeout: 15_000 }); await wait(fx.page, 1500)
      fx.seen.disabled = await publishBtn(fx.page).isDisabled()
      await publishBtn(fx.page).click({ timeout: 3000, force: true }).catch(() => {}); await wait(fx.page, 1200)
      fx.seen.layer = await layerText(fx.page)
      fx.seen.why = await fx.page.evaluate(() => [...document.querySelectorAll('[role="menu"], [role="tooltip"], [role="status"]')].filter(e => e.getClientRects().length).map(e => e.innerText.trim()).filter(Boolean))
    }),
    step('Publish disabled, its menu saying in one line why', async ({ seen }) => problems([
      !seen.disabled && 'Publish is not disabled while the build is not done',
      !seen.why.length && 'its menu says nothing about why',
      seen.why.some(w => w.split('\n').length > 1) && 'the reason is more than one line'
    ]))
  ],
  'publish › Website › Checking hosts': [
    step('Website opened with the hosts\' states held back', async fx => {
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      let release; const gate = new Promise(r => { release = r })
      await fx.page.route(url => new URL(url).pathname === '/api/publish', async route => { await gate; await route.continue().catch(() => {}) })
      await fx.page.goto(DECK(fx, fx.studio.ids.site))
      await publishBtn(fx.page).waitFor({ timeout: 15_000 }); await wait(fx.page, 1200)
      await publishBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 1000)
      fx.seen.held = await fx.page.evaluate(() => ({
        checking: /checking…|checking\.\.\./i.test(document.body.innerText),
        busy: [...document.querySelectorAll('[aria-busy="true"]')].filter(e => e.getClientRects().length && !e.matches('#app-loading, .app-loading, .app-skel') && /checking/i.test(e.innerText)).length
      }))
      release(); await wait(fx.page, 1500); await fx.page.unrouteAll({ behavior: 'ignoreErrors' })
      fx.seen.after = await fx.page.evaluate(() => /checking…|checking\.\.\./i.test(document.body.innerText))
    }),
    step('Checking… with a busy marker until the states are known', async ({ seen }) => problems([
      !seen.held.checking && 'nothing reads Checking… while the hosts\' states are held',
      seen.held.checking && !seen.held.busy && 'Checking… has no busy marker',
      seen.after && 'Checking… stays after the states are known'
    ]))
  ],
  'publish › Working app › No app yet': [
    step('Publish on a version with no app', async fx => {
      await openPublish(fx, fx.studio.ids.site)
      await wait(fx.page, 1500)
      fx.seen.layer = await layerText(fx.page)
      fx.seen.working = await fx.page.evaluate(() => {
        const row = [...document.querySelectorAll('button, [role="button"], [role="menuitem"]')].find(b => b.getClientRects().length && /working app/i.test(b.innerText))
        return row ? { disabled: row.disabled || row.getAttribute('aria-disabled') === 'true', text: row.innerText.replace(/\s+/g, ' ').trim() } : null
      })
    }),
    step('Working app disabled with Build the app first', async ({ seen }) => problems([
      !seen.working && 'there is no Working app row',
      seen.working && !seen.working.disabled && 'Working app is not disabled',
      seen.working && !/build the app first/i.test(seen.working.text) && `its line reads "${seen.working.text}", not Build the app first`
    ]))
  ],
  'publish › The launch kit only for what is there › A failed build': [
    step('Publish on a version with no live link', async fx => {
      await openPublish(fx, fx.studio.ids.site)
      await wait(fx.page, 2000)
      fx.seen.text = await fx.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    }),
    step('no launch kit offered', async ({ seen }) => problems([
      /launch kit/i.test(seen.text) && 'a launch kit is offered',
      /post to x|post to discord/i.test(seen.text) && 'a post card is offered'
    ]))
  ],
  'publish › 390 px › The menu at 390': [
    step('Publish opened at 390 wide', async fx => {
      await openPublish(fx, fx.studio.ids.site, 390)
      await wait(fx.page, 1500)
      fx.seen.layer = await layerText(fx.page)
      fx.seen.sideways = await fx.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    }),
    step('the menu fits the width, no sideways scroll', async ({ seen }) => problems([
      !seen.layer && 'no menu opens',
      seen.layer && (seen.layer.left < -1 || seen.layer.right > 391) && `the menu runs from ${Math.round(seen.layer.left)} to ${Math.round(seen.layer.right)} px, outside the 390 px screen`,
      seen.sideways && 'the page scrolls sideways'
    ]))
  ]
}
bind(BIND)
