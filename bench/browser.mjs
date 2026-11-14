// Runs a page in a local headless Chromium (Chrome for Testing from the Playwright cache, or CHROME_BIN)
// over the DevTools protocol, waits for window.benchResult and returns it. No npm packages needed.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export function chromeBin() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cache)) return null
  for (const d of readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
    for (const app of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
      const f = join(cache, d, app)
      if (existsSync(f)) return f
    }
  }
  return null
}

export async function pageResult(url, { timeout = 120000, port = 9333 } = {}) {
  const bin = chromeBin()
  if (!bin) throw new Error('no Chromium: set CHROME_BIN')
  const profile = mkdtempSync(join(tmpdir(), 'bench-chrome-'))
  const proc = spawn(bin, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,720', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' })
  try {
    let ws = null
    for (let i = 0; i < 150 && !ws; i++) {
      await new Promise(r => setTimeout(r, 200))
      const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null)
      const page = tabs?.find(t => t.type === 'page')
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl)
    }
    if (!ws) throw new Error('Chromium did not start')
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
    let n = 0
    const waiting = new Map()
    ws.onmessage = e => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id) }
    const call = (method, params = {}) => new Promise(ok => { const id = ++n; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })) })
    await call('Page.navigate', { url })
    const gpu = await call('Runtime.evaluate', { expression: "(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown' })()", returnByValue: true })
    const end = Date.now() + timeout
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 1000))
      const r = await call('Runtime.evaluate', { expression: 'window.benchResult || null', returnByValue: true })
      if (r.result?.result?.value) { ws.close(); return { ...r.result.result.value, gpu: gpu.result?.result?.value } }
    }
    throw new Error('no benchResult before the timeout')
  } finally { proc.kill(); rmSync(profile, { recursive: true, force: true }) }
}
