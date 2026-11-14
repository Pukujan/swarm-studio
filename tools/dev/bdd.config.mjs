// The OpenSpec scenarios as Playwright tests (decision 0019, point 2; issue #461), through playwright-bdd.
//
//   npm run --prefix tools/dev bdd       tests/bdd/gen.mjs writes the features from openspec/specs/, bddgen binds
//                                        their steps (and fails on a step with no binding), then Playwright runs them
//
// Two projects: the current Studio at / and the next UI at /next/, which runs a screen's scenarios once the
// screen has moved (it is in ui/src/screens/index.ts's SCREENS) and needs ui/dist/ built. Scenarios marked
// pending (tests/bdd/pending.json) are left out.
import { defineConfig } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const testDir = defineBddConfig({
  featuresRoot: `${ROOT}tests/bdd/features`,
  features: `${ROOT}tests/bdd/features/*.feature`,
  steps: `${ROOT}tools/dev/bdd/steps/*.mjs`,
  // inside tools/dev, a "type": "module" package, so the generated tests load as modules
  outputDir: `${ROOT}tools/dev/bdd/.gen`,
  tags: 'not @pending',
  missingSteps: 'fail-on-gen'
})

// the screens that have moved to /next/, by the machine's room, as their spec's name
const SPEC = { home: 'projects', overview: 'overview', deck: 'design-deck', studio: 'studio', plan: 'plan-board', brand: 'brand-sheet', draft: 'make' }
const block = readFileSync(`${ROOT}ui/src/screens/index.ts`, 'utf8').match(/export const SCREENS[^=]*=\s*\{([^}]*)\}/)?.[1] || ''
const moved = [...block.matchAll(/^\s*(\w+)\s*:/gm)].map(m => SPEC[m[1]]).filter(Boolean)

export default defineConfig({
  testDir,
  outputDir: '../../test-results/bdd',
  timeout: 90_000,
  retries: 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { reducedMotion: 'reduce', colorScheme: 'dark' },
  projects: [
    { name: 'current', use: { app: '' } },
    // no screen moved: the project matches nothing and runs nothing
    { name: 'next', use: { app: 'next' }, grep: new RegExp(`@screen-(${moved.join('|') || 'none-moved'})\\b`) }
  ]
})
