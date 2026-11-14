// The UI audit gates (tools/dev/audit/audit.spec.mjs, docs/ux/AUDIT.md): every top-level screen at 1440 and 390 wide.
//
//   npm run --prefix tools/dev audit            fails on a violation not in .ui-audit-known-violations.json
//   npm run --prefix tools/dev audit:update     rewrites that file from what the run found
//
// On the owner's machine, through the queue (it runs in its own folder, so the path is absolute):
//   D:\MANAGED\devrun\devrun.cmd queue npm run --prefix D:\development\swarm-studio-repo\tools\dev audit
import { defineConfig } from '@playwright/test'

// audit:update (-u): the run writes what it found instead of failing, and the teardown makes it the known list
if (process.argv.some(a => a === '-u' || a.startsWith('--update-snapshots'))) process.env.AUDIT_UPDATE = '1'

export default defineConfig({
  testDir: 'audit',
  testMatch: '*.spec.mjs',
  outputDir: '../../test-results/audit',
  globalTeardown: 'audit/teardown.mjs',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  // each worker runs its own Studio and Chromium; one on a laptop already busy with other checks
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { reducedMotion: 'reduce', colorScheme: 'dark' },
  projects: [
    { name: '1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: '390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
})
