// A Chrome for the site walk, the page shots, a deck's PDF and the story cards (engine/seo.mjs findChrome), on
// every OS, and what the walk says when there is none (issue #543). A Windows path has no "/": it was taken for a
// command name and handed over unchecked, and Windows' own Chrome and Edge were never looked for.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromeCandidates, findChrome, CHROME_MISSING } from '../engine/seo.mjs'
import { walkSite, TOOLS_MISSING } from '../engine/sitelook.mjs'

const WIN = { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local', PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)' }
const none = () => { throw new Error('no folder') }

test('Windows: a Playwright shell that is not there is skipped, and the installed Chrome is found', () => {
  // the shell's folder is listed, but the .exe inside it is gone
  const list = d => (/ms-playwright$/.test(d) ? ['chromium_headless_shell-1254'] : /1254$/.test(d) ? ['chrome-headless-shell-win64'] : [])
  const chrome = join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  const got = findChrome({ env: WIN, platform: 'win32', home: 'C:\\Users\\ana', list, exists: f => f === chrome, onPath: () => assert.fail('Windows paths are files, not commands') })
  assert.equal(got, chrome)
})

test('Windows: Playwright\'s cache is in %LOCALAPPDATA%, and its shell is an .exe', () => {
  const list = d => (d === join(WIN.LOCALAPPDATA, 'ms-playwright') ? ['chromium_headless_shell-1248'] : /1248$/.test(d) ? ['chrome-headless-shell-win64'] : [])
  const c = chromeCandidates({ env: WIN, platform: 'win32', home: 'C:\\Users\\ana', list })
  assert.equal(c[0], join(WIN.LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1248', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))
  assert.ok(c.includes(join('C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')), 'Edge, which every Windows has')
})

test('Windows with no browser at all: null, never a path that is not there', () => {
  assert.equal(findChrome({ env: WIN, platform: 'win32', home: 'C:\\Users\\ana', list: none, exists: () => false }), null)
})

test('SWARM_CHROME comes first, and is checked like any path', () => {
  const env = { ...WIN, SWARM_CHROME: 'D:\\tools\\chrome.exe' }
  assert.equal(findChrome({ env, platform: 'win32', list: none, exists: f => f === 'D:\\tools\\chrome.exe' }), 'D:\\tools\\chrome.exe')
  assert.notEqual(findChrome({ env, platform: 'win32', list: none, exists: f => f.endsWith('msedge.exe') }), 'D:\\tools\\chrome.exe', 'a SWARM_CHROME that is not there is passed over')
})

test('macOS finds Chrome, then Edge; Linux asks PATH for each command', () => {
  assert.equal(findChrome({ env: {}, platform: 'darwin', home: '/Users/ana', list: none, exists: f => f.includes('Microsoft Edge') }), '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
  const asked = []
  assert.equal(findChrome({ env: {}, platform: 'linux', home: '/home/ana', list: none, exists: () => false, onPath: c => { asked.push(c); return c === 'chromium' } }), 'chromium')
  assert.deepEqual(asked.slice(0, 3), ['google-chrome', 'google-chrome-stable', 'chromium'])
})

test('the walk says plainly what is missing, never the launcher\'s own words', async () => {
  // no film tools here (no puppeteer-core): the walk cannot drive a browser
  const dataDir = mkdtempSync(join(tmpdir(), 'nowalk-'))
  try {
    const w = await walkSite('http://127.0.0.1:9/', { dataDir, allow: ['http://127.0.0.1:9/'] })
    assert.equal(w.note, TOOLS_MISSING)
    assert.equal(w.tokens, null)
  } finally { rmSync(dataDir, { recursive: true, force: true }) }
  // a browser that is not where it was said to be
  const missing = () => Promise.reject(new Error('Browser was not found at the configured executablePath (D:\\cache\\chrome-headless-shell)'))
  await assert.rejects(walkSite('http://127.0.0.1:9/', { launch: missing, allow: ['http://127.0.0.1:9/'] }), err => err.message === CHROME_MISSING)
  // any other failure keeps its own reason
  await assert.rejects(walkSite('http://127.0.0.1:9/', { launch: () => Promise.reject(new Error('out of memory')), allow: ['http://127.0.0.1:9/'] }), /out of memory/)
})
