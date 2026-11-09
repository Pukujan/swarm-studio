// Render Swarm's reference frames: every docs/ux/frames/src/<screen>.html at 1280×800 (DSF 1) and 390×844 (DSF 2).
// usage: node docs/ux/frames/src/render.mjs docs/ux/frames [screen ...]
// PLAYWRIGHT_CORE: path to playwright-core's index.mjs (default: the bare package); CHROMIUM: a Chromium binary (default: Playwright's own)
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const dir = resolve(process.argv[2]); const only = process.argv.slice(3);
const screens = readdirSync(join(dir, 'src')).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).filter(s => !only.length || only.includes(s));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--allow-file-access-from-files'] });
for (const [kind, w, h, dsf] of [['desktop', 1280, 800, 1], ['phone', 390, 844, 2]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  for (const s of screens) {
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('requestfailed', r => errs.push('failed ' + r.url()));
    await p.goto('file://' + join(dir, 'src', s + '.html'), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    await p.screenshot({ path: join(dir, `${s}-${kind}.jpg`), type: 'jpeg', quality: 82 });
    if (errs.length) console.log(s, kind, errs.join(' | '));
    await p.close();
  }
  await ctx.close();
}
await b.close(); console.log('rendered', screens.join(' '));
