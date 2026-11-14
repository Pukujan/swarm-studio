// Projects (openspec/specs/projects/spec.md) beyond its machine gates (#461): the sidebar's views and their
// breadcrumb, loading and empty views, project cards, chats and the drawer at 390. The same steps read both Studios,
// so they find things by what a person reads (a name, a label, a line), not by either Studio's classes. A state the
// test Studio does not have (no projects, an empty folder, three versions) is the server's own answer to
// /api/projects, changed for that page only; whatever a step deletes is a project made for it.
import { bind, open, problems, readCrumb, reshape, step, threeVersions } from '../kit.mjs'

// a sidebar view (its count is part of the button's text: "All projects5"); the header's chats button is not one
// (visible: /next/ keeps a hidden copy of the sidebar for the desktop layout beside the drawer's)
const side = (page, name) => page.locator('button:not(.chats-btn)').filter({ hasText: new RegExp(`^\\s*${name}`) }).filter({ visible: true }).first()
// a project's card, found by its title (both Studios draw it as a div with data-id around a <b> of the title)
const card = (page, name) => page.locator('[data-id]').filter({ has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) }).first()
// the card's own control to focus: the card itself where it is the button, else its first button
const focusCard = c => c.evaluate(el => (el.matches('[tabindex]') ? el : el.querySelector('button')).focus())
// All projects, where every card shows (Recent holds only what was opened)
const allProjects = page => side(page, 'All projects').click()
const shown = loc => loc.isVisible().catch(() => false)
// waits until the breadcrumb reads `parts`, up to 5 s; what it reads then
const crumbAt = async (page, parts) => {
  for (let i = 0; i < 25; i++) { const now = await readCrumb(page); if (JSON.stringify(now) === JSON.stringify(parts)) return now; await page.waitForTimeout(200) }
  return readCrumb(page)
}
const projects = (width = 1440) => async ({ page, app, studio, seen }) => Object.assign(seen, { screen: 'projects' }, await open({ page, app, studio }, 'projects', width))

const VIEWS = ['Chats', 'Assets', 'Trash', 'Clients']
const BIND = {
  'projects › Breadcrumb › A view in the sidebar': [
    step('pick each sidebar view', async fx => {
      await projects()(fx)
      fx.seen.views = {}
      for (const v of VIEWS) { await side(fx.page, v).click(); fx.seen.views[v] = await crumbAt(fx.page, ['Home', 'Projects', v]) }
    }),
    step('each view in the breadcrumb', async ({ seen }) => problems(VIEWS.map(v => JSON.stringify(seen.views[v]) !== JSON.stringify(['Home', 'Projects', v]) && `${v}: the breadcrumb reads "${(seen.views[v] || ['nothing']).join(' › ')}"`)))
  ],
  'projects › Breadcrumb › The breadcrumb\'s parts go where they say': [
    step('Projects in the breadcrumb, from Trash', async fx => {
      await projects()(fx)
      await side(fx.page, 'Trash').click()
      await crumbAt(fx.page, ['Home', 'Projects', 'Trash'])
      // (a breadcrumb with no Projects part to press is the finding, not a wait)
      fx.seen.pressed = await fx.page.locator(':is(nav[aria-label="Breadcrumb" i], [class$="-crumb"]) :is(a, button)').filter({ hasText: /^\s*Projects\s*$/ }).first().click({ timeout: 3000 }).then(() => true, () => false)
      fx.seen.after = await crumbAt(fx.page, ['Home', 'Projects'])
      fx.seen.recent = await side(fx.page, 'Recent').evaluate(el => el.getAttribute('aria-current') || el.getAttribute('aria-selected') || (/\b(on|active|cur)\b/.test(el.className) ? 'on' : '')).catch(() => '')
    }),
    step('Recent shows; Esc stays', async ({ page, seen }) => {
      const url = page.url()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      problems([
        !seen.pressed && 'the breadcrumb has no Projects part to press',
        JSON.stringify(seen.after) !== '["Home","Projects"]' && `after Projects the breadcrumb reads "${(seen.after || []).join(' › ')}"`,
        !['page', 'true', 'on'].includes(seen.recent) && 'Recent is not the view shown',
        page.url() !== url && `Esc from Recent went to ${page.url()}`,
        JSON.stringify(await readCrumb(page)) !== '["Home","Projects"]' && 'Esc from Recent changed the breadcrumb'
      ])
    })
  ],
  'projects › Loading › Assets\' first visit': [
    step('Assets, its list held', async fx => {
      await projects()(fx)
      let release
      const gate = new Promise(r => { release = r })
      await fx.page.route(url => new URL(url).pathname === '/api/assets', async route => { await gate; await route.continue().catch(() => {}) })
      await side(fx.page, 'Assets').click()
      fx.seen.during = await fx.page.evaluate(() => new Promise(done => {
        const vis = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
        const m = { waiting: 0, empty: '' }
        const t0 = performance.now()
        const look = () => {
          m.waiting = Math.max(m.waiting, [...document.querySelectorAll('.wait-in, [aria-busy="true"] > *')].filter(vis).length)
          const line = [...document.querySelectorAll('.empty, [class*="empty"]')].find(vis)
          if (line && !m.empty) m.empty = line.innerText.trim().slice(0, 80)
          if (performance.now() - t0 < 2000) setTimeout(look, 50); else done(m)
        }
        look()
      }))
      release()
    }),
    step('waiting cards, no empty line', async ({ seen }) => problems([
      !seen.during.waiting && 'no waiting cards showed while Assets was held',
      seen.during.empty && `an empty line showed while Assets was held: "${seen.during.empty}"`
    ]))
  ],
  'projects › Loading › Hermia works on the skeleton': [
    step('a skeleton on screen, the list held', async fx => {
      let release
      const gate = new Promise(r => { release = r })
      await fx.page.route(url => new URL(url).pathname === '/api/projects', async route => { await gate; await route.continue().catch(() => {}) })
      await fx.page.goto(`${fx.studio.BASE}${fx.app ? '/next/' : '/'}`, { waitUntil: 'commit' })
      // where Hermia is, against the first skeleton, and whether her dots show, for 6 s
      fx.seen.pet = await fx.page.evaluate(() => new Promise(done => {
        const vis = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0'
        const m = { on: false, dots: false }
        const t0 = performance.now()
        const look = () => {
          const sk = [...document.querySelectorAll('.wait-in, [aria-busy="true"] > *')].find(vis)
          const pet = [...document.querySelectorAll('.pet')].find(vis)
          if (sk && pet) {
            const a = sk.getBoundingClientRect(), b = pet.getBoundingClientRect(), x = b.left + 4, y = b.top + 4
            if (x >= a.left && x <= a.right && y >= a.top && y <= a.bottom) m.on = true
            if (vis(pet.querySelector('.pet-dots'))) m.dots = true
          }
          if (performance.now() - t0 < 6000) setTimeout(look, 100); else done(m)
        }
        look()
      }))
      release()
    }),
    step('Hermia on it, with her dots', async ({ seen }) => problems([!seen.pet.on && "Hermia's cursor did not go onto the first skeleton", !seen.pet.dots && 'her three dots did not show']))
  ],
  'projects › Empty views › No projects yet': [
    step('no projects, Recent and All projects', async fx => {
      await reshape(fx.page, j => ({ ...j, projects: [] }))
      await projects()(fx)
      fx.seen.empty = {}
      for (const v of ['Recent', 'All projects']) {
        await side(fx.page, v).click()
        await fx.page.getByRole('button', { name: 'Make something' }).first().waitFor({ timeout: 5000 }).catch(() => {})
        fx.seen.empty[v] = await fx.page.evaluate(() => {
          // (upper-cased by the page's CSS, so innerText reads MAKE SOMETHING)
          const btn = [...document.querySelectorAll('button, a')].find(b => b.innerText.trim().toLowerCase() === 'make something' && b.getClientRects().length)
          let box = btn?.parentElement
          while (box && !box.querySelector('svg')) box = box.parentElement
          // (the icon of the view; the plus inside the Make something button is the button's)
          return { make: !!btn, lines: box ? box.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [], icons: box ? [...box.querySelectorAll('svg')].filter(i => !i.closest('button, a')).length : 0, cards: document.querySelectorAll('[data-id], .card').length }
        })
      }
    }),
    step('one icon, one line and Make something', async ({ seen }) => problems(Object.entries(seen.empty).flatMap(([v, e]) => [
      !e.make && `${v}: no Make something`,
      e.make && e.lines.length !== 2 && `${v}: the empty view reads ${JSON.stringify(e.lines)}, not one line and Make something`,
      e.make && e.icons !== 1 && `${v}: ${e.icons} icons in the empty view, not one`
    ])))
  ],
  'projects › Empty views › A search with no match': [
    step('a search with no match', async fx => {
      await projects()(fx)
      await fx.page.locator('button[aria-label="Search"]').filter({ visible: true }).first().click()
      const input = fx.page.locator('input[type="search"], input[aria-label^="Search"]').filter({ visible: true }).first()
      await input.fill('zz no such project')
      await fx.page.getByText('Nothing matches').first().waitFor({ timeout: 5000 }).catch(() => {})
    }),
    step('Nothing matches, no Make something', async ({ page }) => problems([
      !await shown(page.getByText('Nothing matches').first()) && 'Nothing matches does not show',
      await shown(page.getByRole('button', { name: 'Make something' }).first()) && 'Make something shows with it'
    ]))
  ],
  'projects › Empty views › Empty Chats, Trash and folder': [
    step('Chats, Trash and a folder with nothing', async fx => {
      await reshape(fx.page, j => ({ ...j, projects: (j.projects || []).filter(p => !p.trashed).map(p => ({ ...p, folder: null })) }))
      // no talks either: an earlier scenario's game talk (the Plan board's) is a chat the Studio keeps
      await fx.page.route(url => new URL(url).pathname === '/api/chats', route => route.fulfill({ json: { chats: [] } }))
      await projects()(fx)
      fx.seen.lines = {}
      for (const [v, line] of [['Chats', 'Talks with the planner that built nothing yet'], ['Trash', 'Deleted projects wait here until you empty Trash'], ['Clients', 'Drag a project here to file it']]) {
        await side(fx.page, v).click()
        const t = fx.page.getByText(line).first()
        await t.waitFor({ timeout: 5000 }).catch(() => {})
        fx.seen.lines[v] = { line: await shown(t), newChat: v === 'Chats' && await shown(fx.page.getByText('New chat').first()), empty: v === 'Trash' && await shown(fx.page.getByRole('button', { name: /^Empty( Trash)?$/ }).first()) }
      }
    }),
    step('each empty view says its line', async ({ seen }) => problems([
      !seen.lines.Chats.line && 'Chats does not read "Talks with the planner that built nothing yet"',
      !seen.lines.Chats.newChat && 'Chats has no New chat row',
      !seen.lines.Trash.line && 'Trash does not read "Deleted projects wait here until you empty Trash"',
      seen.lines.Trash.empty && 'an empty Trash still offers Empty',
      !seen.lines.Clients.line && 'the folder does not read "Drag a project here to file it"'
    ]))
  ],
  'projects › Project cards › Opening a project': [
    step('a card clicked, another by Enter', async fx => {
      const { ids } = fx.studio
      await projects()(fx)
      await allProjects(fx.page)
      await card(fx.page, 'Lantern Run').click()
      await fx.page.waitForURL(u => u.search.includes(`version=${ids.game}`), { timeout: 10000 }).catch(() => {})
      fx.seen.clicked = fx.page.url()
      await projects()(fx)
      await allProjects(fx.page)
      await focusCard(card(fx.page, 'River Hours'))
      await fx.page.keyboard.press('Enter')
      await fx.page.waitForURL(u => u.search.includes(`version=${ids.film}`), { timeout: 10000 }).catch(() => {})
      fx.seen.entered = fx.page.url()
    }),
    step("its Overview, on its newest version", async ({ seen, studio }) => {
      const room = u => new URL(u).searchParams.get('room')
      problems([
        !seen.clicked.includes(`version=${studio.ids.game}`) && `a click opened ${seen.clicked}`,
        !seen.entered.includes(`version=${studio.ids.film}`) && `Enter opened ${seen.entered}`,
        ![null, 'overview'].includes(room(seen.clicked)) && `a click opened the ${room(seen.clicked)} room, not the Overview`
      ])
    })
  ],
  'projects › Project cards › A stack of versions': [
    step('a card of three versions, its stack opened', async fx => {
      // Alpha Tea has two versions in the test Studio: the server's answer gets a third, newest
      await reshape(fx.page, j => ({ ...j, projects: (j.projects || []).map(threeVersions) }))
      await projects()(fx)
      await allProjects(fx.page)
      await card(fx.page, 'Alpha Tea').click()
      await fx.page.getByText('Version 1').first().waitFor({ timeout: 5000 }).catch(() => {})
      fx.seen.order = await fx.page.evaluate(() => [...document.querySelectorAll('[aria-label], b, span')].map(el => el.getAttribute('aria-label') || el.textContent.trim()).map(t => (t.match(/^(?:Open )?(Version \d)$/) || [])[1]).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i))
      fx.seen.back = await shown(fx.page.getByRole('button', { name: /^Back\b/ }).first())
    }),
    step('Version 3, 2, 1, with Back', async ({ seen }) => problems([
      JSON.stringify(seen.order) !== '["Version 3","Version 2","Version 1"]' && `the stack reads ${JSON.stringify(seen.order)}`,
      !seen.back && 'no Back to leave the stack'
    ]))
  ],
  'projects › Project cards › Moving to Trash can be undone': [
    step('a project deleted from its card', async fx => {
      const made = await fx.studio.api('/api/studio', { kind: 'site', idea: 'Tidy Pier, made to be deleted' })
      fx.seen.id = made.project.id
      fx.seen.name = made.project.title || made.project.name
      await projects()(fx)
      await allProjects(fx.page)
      const c = card(fx.page, fx.seen.name)
      await c.hover()
      const del = c.getByRole('button', { name: 'Delete' })
      if (await shown(del)) await del.click()
      else { await c.getByRole('button', { name: 'More' }).click(); await fx.page.getByRole('menuitem', { name: /Trash|Delete/ }).first().click() }
    }),
    step('gone from the view, Undo offered, in Trash', async ({ page, seen, studio }) => {
      await page.waitForTimeout(500)
      const list = await studio.api('/api/projects')
      const p = (list.projects || []).find(x => x.id === seen.id)
      problems([
        await shown(card(page, seen.name)) && 'the card is still in the view',
        !await shown(page.getByRole('button', { name: 'Undo' }).first()) && 'no toast offers Undo',
        !p && 'the project is gone, not in Trash',
        p && !p.trashed && 'the project is not in Trash'
      ])
    })
  ],
  'projects › Project cards › Deleting forever asks first': [
    step('Delete forever pressed on Old Pier, in Trash', async fx => {
      await projects()(fx)
      await side(fx.page, 'Trash').click()
      const c = card(fx.page, 'Old Pier')
      await c.hover()
      const purge = c.getByRole('button', { name: 'Delete forever' })
      if (await shown(purge)) await purge.click()
      else { await c.getByRole('button', { name: 'More' }).click(); await fx.page.getByRole('menuitem', { name: 'Delete forever' }).click() }
      const dlg = fx.page.locator('[role="dialog"], [role="alertdialog"], dialog[open]').last()
      await dlg.waitFor({ timeout: 5000 }).catch(() => {})
      fx.seen.dialog = await dlg.innerText().catch(() => '')
      await fx.page.keyboard.press('Escape')
    }),
    step('a dialog names it, nothing deleted', async ({ seen, studio }) => {
      const p = ((await studio.api('/api/projects')).projects || []).find(x => x.title === 'Old Pier')
      problems([
        !seen.dialog && 'no dialog opened',
        seen.dialog && !seen.dialog.includes('Old Pier') && `the dialog does not name what will be deleted: "${seen.dialog.replace(/\s+/g, ' ').slice(0, 120)}"`,
        seen.dialog && !/cannot be undone|can.t be undone|can.t be brought back|for good/i.test(seen.dialog) && 'the dialog does not say it cannot be undone',
        !p && 'Old Pier was deleted without a yes'
      ])
    })
  ],
  'projects › 390 px › The drawer': [
    step('Menu at 390, closed four ways', async fx => {
      const menu = fx.page.getByRole('button', { name: 'Menu' }).first()
      const sideShown = () => fx.page.evaluate(() => [...document.querySelectorAll('aside, [role="dialog"]')].some(el => el.getClientRects().length && el.getBoundingClientRect().right > 40 && el.getBoundingClientRect().left < 300 && /Recent/.test(el.innerText)))
      const scrim = () => fx.page.locator('.hm-scrim, [data-scrim], [class*="scrim"]').filter({ visible: true }).first()
      fx.seen.ways = {}
      for (const [way, close] of [['Esc', () => fx.page.keyboard.press('Escape')], ['the scrim', async () => { const sc = scrim(); if (await shown(sc)) await sc.click({ position: { x: 380, y: 400 } }); else throw new Error('no scrim') }], ['×', () => fx.page.getByRole('button', { name: /^(Close|×)$/ }).filter({ visible: true }).first().click({ timeout: 2000 })], ['a pick', () => side(fx.page, 'Trash').click({ timeout: 2000 })]]) {
        // each way starts from the page as it opens, so one that fails to close the drawer leaves nothing in the next's way
        await projects(390)(fx)
        await menu.click({ timeout: 5000 }).catch(() => {})
        await fx.page.waitForTimeout(400)
        const opened = await sideShown(), withScrim = await shown(scrim())
        let closed = false
        try { await close(); await fx.page.waitForTimeout(400); closed = !await sideShown() } catch {}
        fx.seen.ways[way] = { opened, withScrim, closed }
      }
    }),
    step('the drawer slides in over a scrim, each way closes it', async ({ seen }) => problems(Object.entries(seen.ways).flatMap(([way, w]) => [
      !w.opened && `Menu did not open the sidebar (before ${way})`,
      w.opened && !w.withScrim && `the sidebar opened without a scrim (before ${way})`,
      w.opened && !w.closed && `${way} did not close it`
    ])))
  ]
}

bind(BIND)
