// The walkthrough's screens, in the order a person meets them (scripts/walkthrough.mjs runs them).
// Each step leaves the page on the screen to photograph. Steps that need a fresh start load an
// address (web/nav.js restores state from it), so one that fails does not spoil the next.
// The throwaway Studio has no Hermes and a model that always fails, so the steps past the Make box
// stub `swarm.hermesReady` to see the screens a person with Hermes would see; they say so in `flow`.

import { studio } from './walkthrough-fixtures.mjs'

const vis = (page, sel, timeout = 6000) => page.locator(sel).first().waitFor({ state: 'visible', timeout })
const click = async (page, sel, timeout) => { await vis(page, sel, timeout); await page.locator(sel).first().click() }
// clicks it only if it is there (a phone's sheet buttons)
const tap = async (page, sel) => { const l = page.locator(sel).first(); if (await l.isVisible().catch(() => false)) await l.click({ timeout: 2000 }).catch(() => {}) }
const esc = page => page.keyboard.press('Escape')
async function open(env, addr = '/', root = '.home') {
  await env.page.goto(env.BASE + addr)
  await vis(env.page, root, 15000)
  await env.wait(700)
}
// the Projects sidebar: on a phone it is a drawer behind ☰
async function side(env, sel) {
  const { page } = env
  if (await page.locator('.hm-burger').first().isVisible().catch(() => false)) { await page.locator('.hm-burger').first().click(); await env.wait(300) }
  await click(page, sel)
}
// a second throwaway Studio whose Hermes is not running, for the "no Hermes" screens; `after` ends it
async function noHermes(env, addr, root) {
  env.nh = await studio({ noHermes: true })
  await env.page.goto(env.nh.BASE + '/')
  await env.page.locator('.su-start, .ui-dialog-close').first().click({ timeout: 8000 }).catch(() => {})
  await open({ ...env, BASE: env.nh.BASE, ids: env.nh.ids }, addr, root)
}
const endNoHermes = env => { env.nh?.stop(); env.nh = null }
const hermesOn = page => page.evaluate(() => { window.swarm.hermesReady = async () => null })
async function makeText(env, text, kind) {
  const { page } = env
  if (kind) { await click(page, '.hm-kind'); await click(page, `.hm-menu [data-k="${kind}"]`) }
  await page.locator('.home input').first().fill(text)
  await page.locator('.hm-make').first().click()
}
const deck = (env, run) => open(env, `/?version=${run}&room=deck`, '#viewport')
const overview = env => open(env, `/?project=${env.ids.site}&version=${env.ids.site2}`, '.project:not(.plan) .pj-world')

export const STEPS = [
  // 1. First open
  { id: 'setup', flow: 'First open', title: 'Setup opens by itself', run: async env => { await env.page.goto(env.BASE + '/'); await vis(env.page, '.ui-dialog.su', 15000) }, settle: 1500 },
  { id: 'setup-models', flow: 'First open', title: 'Setup: the Models row', run: async ({ page }) => { if (!(await page.locator('.su-head[data-row="models"] + .su-body, .su-body').first().isVisible().catch(() => false))) await click(page, '.su-head[data-row="models"]') } },
  { id: 'setup-account', flow: 'First open', title: 'Setup: the Account row', run: ({ page }) => click(page, '.su-head[data-row="account"]') },

  // 2. Projects
  { id: 'home', flow: 'Projects', title: 'Projects, Recent', run: async env => { await esc(env.page); await env.page.locator('.su-start, .ui-dialog-close').first().click({ timeout: 2000 }).catch(() => {}); await open(env) }, settle: 1200 },
  { id: 'drawer', flow: 'Projects', title: 'The sidebar drawer', only: 'phone', run: env => click(env.page, '.hm-burger') },
  { id: 'all', flow: 'Projects', title: 'All projects', run: async env => { await open(env); await side(env, '.hm-nav [data-v="all"]') } },
  { id: 'chats', flow: 'Projects', title: 'Chats', run: async env => { await open(env); await side(env, '.hm-nav [data-v="chats"]') } },
  { id: 'assets', flow: 'Projects', title: 'Assets', run: async env => { await open(env); await side(env, '.hm-nav [data-v="assets"]') } },
  { id: 'trash', flow: 'Projects', title: 'Trash', run: async env => { await open(env); await side(env, '.hm-nav [data-v="trash"]') } },
  { id: 'purge', flow: 'Projects', title: 'Empty Trash: the confirmation', run: ({ page }) => click(page, '.hm-empty, [data-act="purge"]') },
  { id: 'folder', flow: 'Projects', title: 'A folder', run: async env => { await open(env); await side(env, '.hm-folders [data-folder="Clients"]') } },
  { id: 'new-folder', flow: 'Projects', title: 'New folder', run: async env => { await open(env); await side(env, '.hm-addf'); await vis(env.page, '.hm-rename') } },
  { id: 'card-menu', flow: 'Projects', title: 'A card’s menu', run: async env => { await open(env); await env.page.locator('.card[data-id]').first().click({ button: 'right' }); await vis(env.page, '.hm-menu') } },
  { id: 'versions', flow: 'Projects', title: 'A project with versions', run: async env => { await open(env); await env.page.locator('.card[data-id]', { hasText: 'Alpha Tea' }).first().click() } },
  { id: 'search', flow: 'Projects', title: 'Search', run: async env => { await open(env); await click(env.page, '.hm-find'); await env.page.keyboard.type('tea') } },
  { id: 'list', flow: 'Projects', title: 'List view', run: async env => { await open(env); await click(env.page, '.hm-list') }, after: ({ page }) => page.locator('.hm-grid').first().click().catch(() => {}) },
  { id: 'user-menu', flow: 'Projects', title: 'The user menu', run: async env => { await open(env); await side(env, '.hm-who'); await vis(env.page, '.hm-menu') } },
  { id: 'settings', flow: 'Projects', title: 'Settings', run: async env => { await click(env.page, '.hm-menu [data-k="settings"]'); await vis(env.page, '.ui-dialog.set') } },

  // 3. The Make box
  { id: 'kind-menu', flow: 'Make', title: 'What to make', run: async env => { await open(env); await click(env.page, '.hm-kind'); await vis(env.page, '.hm-menu') } },
  { id: 'kind-pics', flow: 'Make', title: 'What to make › Pictures', run: async ({ page }) => { await page.locator('.hm-menu [data-k="pics"]').first().hover(); await page.locator('.hm-menu [data-k="pics"]').first().click().catch(() => {}) } },
  { id: 'ideas', flow: 'Make', title: 'The lightbulb', run: async env => { await open(env); await click(env.page, '.hm-ideas'); await vis(env.page, '.hm-pop.show') } },
  { id: 'make-empty', flow: 'Make', title: 'Make with nothing typed', run: async env => { await open(env); await click(env.page, '.hm-make') } },
  { id: 'no-hermes', flow: 'Make', title: 'Make with no Hermes', run: async env => { await noHermes(env); await makeText(env, 'A site for a bike repair shop', 'site'); await vis(env.page, '.hm-toast', 15000) }, settle: 800, after: endNoHermes },
  { id: 'studio-first', flow: 'Make (Hermes stubbed on)', title: 'Make: Studio first or Build now', run: async env => { await open(env); await hermesOn(env.page); await makeText(env, 'A site for a bike repair shop', 'site'); await vis(env.page, '.hm-pop.grill.start') } },
  { id: 'thorough', flow: 'Make (Hermes stubbed on)', title: 'Studio first, Thorough: the questions', run: async env => { await env.page.locator('.hm-depth [data-d="thorough"]').first().click().catch(() => {}); await click(env.page, '.hm-choice[data-studio]') }, settle: 4000 },
  { id: 'build-now', flow: 'Make (Hermes stubbed on)', title: 'Build now: the brief', run: async env => { await open(env); await hermesOn(env.page); await makeText(env, 'A site for a bike repair shop', 'site'); await click(env.page, '.hm-choice[data-now]') }, settle: 5000 },
  { id: 'make-app', flow: 'Make (Hermes stubbed on)', title: 'Make an App', run: async env => { await open(env); await hermesOn(env.page); await makeText(env, 'An app for swapping nurse shifts', 'app') }, settle: 2500 },
  { id: 'make-game', flow: 'Make (Hermes stubbed on)', title: 'Make a Game: the Plan board', run: async env => { await open(env); await hermesOn(env.page); await makeText(env, 'A platformer through a night market', 'game') }, settle: 4000 },
  { id: 'make-video', flow: 'Make (Hermes stubbed on)', title: 'Make a Video', run: async env => { await open(env); await hermesOn(env.page); await makeText(env, 'A 30 second film for a riverside cafe', 'video') }, settle: 2500 },
  { id: 'make-brand', flow: 'Make (Hermes stubbed on)', title: 'Make a Brand: the brand sheet', run: async env => { await open(env); await hermesOn(env.page); await makeText(env, 'A brand for a riverside cafe', 'brand') }, settle: 4000 },
  { id: 'studio', flow: 'Studio', title: 'The Studio scaffold (spec 37)', run: env => open(env, `/?room=studio&project=${env.ids.site}&step=plan`, 'body') , settle: 2000 },

  // 4. A project's Overview
  { id: 'overview', flow: 'Overview', title: 'A project’s Overview', run: overview, settle: 2500 },
  { id: 'layers', flow: 'Overview', title: 'Overview: Layers', run: async env => { await overview(env); await tap(env.page, '[data-tool="files"]'); await click(env.page, '.pj-tab[data-tab="layers"]') } },
  { id: 'add', flow: 'Overview', title: 'Overview: Add', run: async env => { await overview(env); await tap(env.page, '[data-tool="files"]'); await click(env.page, '.pj-add'); await vis(env.page, '.hm-menu') } },
  { id: 'inspector', flow: 'Overview', title: 'Overview: a page selected', run: async env => { await overview(env); await env.page.locator('.pj-world .ab[data-key^="page:"]').first().click(); await vis(env.page, '.pj-insp') }, settle: 1200 },
  { id: 'scribble', flow: 'Overview', title: 'Overview: Scribble', run: async env => { await overview(env); await click(env.page, '.pj-dock [data-tool="scribble"]') } },
  { id: 'version-menu', flow: 'Overview', title: 'Overview: the name menu', run: async env => { await overview(env); await click(env.page, '.pj-crumb .pj-name'); await vis(env.page, '.hm-menu') } },
  { id: 'ov-chat', flow: 'Overview', title: 'Overview: the chat', run: async env => { await overview(env); await click(env.page, '.pj-dock [data-tool="comment"]') }, settle: 1200 },
  { id: 'ov-log', flow: 'Overview', title: 'The chat: Log', run: ({ page }) => click(page, '.side .tabs [data-tab="log"]') },
  { id: 'chats-pop', flow: 'Overview', title: 'The chat: Chats', run: async ({ page }) => { await page.locator('.side .tabs [data-tab="chat"]').first().click().catch(() => {}); await click(page, '#chats-btn'); await vis(page, '.chats-pop') } },
  { id: 'no-hermes-chat', flow: 'Overview', title: 'Tell the crew with no Hermes', run: async env => { await noHermes(env); await open({ ...env, BASE: env.nh.BASE }, `/?project=${env.nh.ids.site}&version=${env.nh.ids.site2}`, '.pj-world'); await env.page.locator('form.pj-ask input[name=q]').first().fill('Make the hero darker'); await env.page.keyboard.press('Enter') }, settle: 6000, after: endNoHermes },

  // 5. The Design deck
  { id: 'deck', flow: 'Design deck', title: 'The Design deck', run: env => deck(env, env.ids.site2), settle: 2500 },
  { id: 'mode-menu', flow: 'Design deck', title: 'The mode menu', run: ({ page }) => click(page, '.mode-btn') },
  { id: 'design-panel', flow: 'Design deck', title: 'Design panel', run: async env => { await deck(env, env.ids.site2); await env.page.keyboard.press('d'); await vis(env.page, 'aside.design') } },
  { id: 'vars', flow: 'Design deck', title: 'Variables', run: ({ page }) => click(page, '[data-dtab="vars"]') },
  { id: 'comment', flow: 'Design deck', title: 'Comment mode', run: async env => { await deck(env, env.ids.site2); await env.page.keyboard.press('c'); await env.page.mouse.click(env.W.viewport.width / 2, env.W.viewport.height / 2) }, settle: 1000 },
  { id: 'text-edit', flow: 'Design deck', title: 'Editing by hand (Text)', run: async env => { await deck(env, env.ids.site2); await env.page.keyboard.press('t'); await env.page.mouse.click(env.W.viewport.width / 2, env.W.viewport.height / 2) }, settle: 1000 },
  { id: 'follow', flow: 'Design deck', title: 'Follow the crew turned off', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#camera-hint') } },
  { id: 'more-menu', flow: 'Design deck', title: 'The ☰ menu', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#more-btn'); await vis(env.page, '#more-menu') } },
  { id: 'models', flow: 'Design deck', title: 'Models', run: ({ page }) => click(page, '#models-btn'), settle: 1500 },
  { id: 'review', flow: 'Design deck', title: 'Review with no reviewer model', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#more-btn'); await click(env.page, '#review-btn') }, settle: 1500 },
  { id: 'sound', flow: 'Design deck', title: 'Sound', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#more-btn'); await click(env.page, '#cosmos-sound') } },
  { id: 'mid-build', flow: 'Design deck', title: 'A build left half done', run: env => deck(env, env.ids.mid), settle: 2500 },
  { id: 'replay', flow: 'Design deck', title: 'Replay', run: async env => { await deck(env, env.ids.site); await click(env.page, '#more-btn'); await click(env.page, '#replay-btn') }, settle: 3000 },
  { id: 'stop-chip', flow: 'Design deck', title: 'Stop (while agents work)', run: async env => { await deck(env, env.ids.site2); await vis(env.page, '.work-stop', 3000) } },

  // 6. Play, Watch a visitor
  { id: 'play', flow: 'Play', title: 'Play', run: async env => { await deck(env, env.ids.site); await click(env.page, '#play-btn'); await vis(env.page, '#player') }, settle: 2000 },
  { id: 'play-menu', flow: 'Play', title: 'Play’s menu', run: async env => { await deck(env, env.ids.site); await click(env.page, '#play-more'); await vis(env.page, '#play-menu') } },
  { id: 'visitor', flow: 'Play', title: 'Watch a visitor', run: async env => { await deck(env, env.ids.site); await click(env.page, '#play-btn'); await click(env.page, '#pl-tours') }, settle: 4000 },
  { id: 'visitor-list', flow: 'Play', title: 'Watch a visitor: the list', run: ({ page }) => click(page, '#pl-tour-list') },

  // 7. Publish
  { id: 'publish', flow: 'Publish', title: 'Publish', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#publish-btn'); await vis(env.page, '#pub-menu') } },
  { id: 'publish-site', flow: 'Publish', title: 'Publish the site', run: ({ page }) => click(page, '#pub-menu [data-pub="site"]'), settle: 1500 },
  { id: 'feed', flow: 'Publish', title: 'Post to Feed', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#publish-btn'); await click(env.page, '#pub-menu [data-pub="feed"]') }, settle: 2500 },
  { id: 'export', flow: 'Publish', title: 'Export', run: async env => { await deck(env, env.ids.site2); await click(env.page, '#more-btn'); await click(env.page, '#export-btn') }, settle: 2500 },

  // 8. The rooms
  { id: 'app-room', flow: 'Rooms', title: 'The App room', run: env => open(env, `/?version=${env.ids.app}&room=app`, '#appview'), settle: 2500 },
  { id: 'app-code', flow: 'Rooms', title: 'The App room: Code', run: ({ page }) => click(page, '#app-mode [data-mode="code"]') },
  { id: 'game-room', flow: 'Rooms', title: 'The Game room', run: env => open(env, `/?version=${env.ids.game}&room=game`, 'body'), settle: 3000 },
  { id: 'film-room', flow: 'Rooms', title: 'The Film room (a failed film)', run: env => open(env, `/?version=${env.ids.film}&room=video`, 'body'), settle: 3000 },
  { id: 'plan', flow: 'Rooms', title: 'The Plan board', run: async env => { await open(env); await env.page.evaluate(() => window.swarmCosmos.talkGame({ text: 'A platformer through a night market' })) }, settle: 4000 },
  { id: 'brand', flow: 'Rooms', title: 'The brand sheet', run: async env => { await open(env); await env.page.evaluate(() => window.swarmCosmos.brand({ brief: 'Alpha Tea, a tea subscription for night-shift workers', kind: 'site' })) }, settle: 4000 },
  { id: 'launch-kit', flow: 'Rooms', title: 'The Launch kit', run: async env => { await deck(env, env.ids.app); await vis(env.page, '.ap-kit', 3000); await click(env.page, '.ap-kit') } }
]
