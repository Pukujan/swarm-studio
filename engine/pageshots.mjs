// Page shots for Post to Feed: every page of the exported site, as the Feed shows it in a landscape frame
// (desktop, 1280×800) and in a portrait one (a phone, 390×844 at 2×, so 780×1688). Viewport only, from the
// top, as WebP data URLs. Shot from the fresh static export on disk (file://), so it matches what is posted.
//
// Uses the puppeteer-core the video tools already installed and the Chrome engine/seo.mjs finds. With
// either missing it returns no shots, and the post goes without them (the Feed's fields are optional).
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { browserEnv } from './proc.mjs'
import { findChrome } from './seo.mjs'
import { chromePath } from './footage.mjs'

export const MAX_PAGES = 12
export const MAX_BYTES = 4 * 1024 * 1024
export const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function puppeteer(dataDir) {
  try { return createRequire(join(dataDir, 'video-tools', 'package.json'))('puppeteer-core') } catch { return null }
}

// fonts and pictures in, back at the top, and a fixed or sticky banner's accept or close button pressed
async function settle(page) {
  await page.evaluate(async () => {
    const wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))])
    await wait(document.fonts?.ready || Promise.resolve(), 4000)
    await wait(Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r }))), 5000)
    const pinned = el => { for (let e = el; e && e !== document.body; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) return true; return false }
    for (const b of document.querySelectorAll('button, a, [role=button]')) {
      if (/^\s*(accept( all)?|agree|i agree|got it|ok(ay)?|allow( all)?|close|dismiss|no thanks|×|✕)\s*$/i.test(b.textContent || b.getAttribute('aria-label') || '') && pinned(b)) {
        b.click()
        break
      }
    }
    scrollTo(0, 0)
  }).catch(() => {})
  // sections reveal as they scroll in (engine/motion.mjs): give the first screen its moment
  await sleep(900)
}

async function shoot(browser, url, view, ua, quality) {
  const page = await browser.newPage()
  try {
    if (ua) await page.setUserAgent(ua)
    await page.setViewport(view)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
    await settle(page)
    const buf = await page.screenshot({ type: 'webp', quality, captureBeyondViewport: false })
    return `data:image/webp;base64,${Buffer.from(buf).toString('base64')}`
  } finally {
    await page.close().catch(() => {})
  }
}

const bytesOf = dataUrl => (dataUrl ? Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4) : 0)
export const totalBytes = shots => shots.reduce((n, s) => n + bytesOf(s?.shot) + bytesOf(s?.phoneShot), 0)

// keep the total under the cap: drop the last pages' shots until it fits
export function fitBudget(shots, max = MAX_BYTES) {
  const out = shots.map(s => ({ ...s }))
  for (let i = out.length - 1; i >= 0 && totalBytes(out) > max; i--) { delete out[i].shot; delete out[i].phoneShot }
  return out
}

// htmlDir: the export's html folder. files: the page files in page order (index.html first).
// Returns [{ file, shot?, phoneShot? }] in the same order, at most MAX_PAGES with shots.
export async function pageShots({ htmlDir, files, dataDir }) {
  const pp = puppeteer(dataDir), chrome = findChrome() || chromePath()
  if (!pp || !chrome) return { shots: [], note: 'no browser to take page shots with' }
  const list = files.slice(0, MAX_PAGES).filter(f => existsSync(join(htmlDir, f)))
  const browser = await pp.launch({ executablePath: chrome, headless: true, env: browserEnv(), args: ['--hide-scrollbars', '--disable-gpu-sandbox', '--mute-audio'] })
  try {
    const run = async quality => {
      const shots = []
      for (const file of list) {
        const url = pathToFileURL(join(htmlDir, file)).href
        const one = { file }
        try { one.shot = await shoot(browser, url, DESKTOP, null, quality) } catch {}
        try { one.phoneShot = await shoot(browser, url, PHONE, PHONE_UA, quality) } catch {}
        shots.push(one)
      }
      return shots
    }
    let shots = await run(72)
    if (totalBytes(shots) > MAX_BYTES) shots = await run(50)
    return { shots: fitBudget(shots) }
  } finally {
    await browser.close().catch(() => {})
  }
}
