#!/usr/bin/env node
// Add SEO to a build made before the crew wrote it (engine/seo.mjs), without a rebuild.
//
//   node scripts/seo.mjs <run id | run folder> [--base https://…/]   re-export a saved build
//   node scripts/seo.mjs <site folder> --base https://…/ [--brand "Name"]   an exported site's
//                                         HTML only (an old export, a Swarm Feed sample)
//
// A run is exported again from its events: every page gets its title, description,
// share picture, JSON-LD and favicon, and the site robots.txt, sitemap.xml and a 404.
// --base is the address the site is served at; without it canonical links and the
// sitemap wait for publish. A folder of HTML is rewritten in place.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportRun } from '../engine/export.mjs'
import { seoStatic } from '../engine/seo.mjs'

const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : '' }
const base = flag('base'), brand = flag('brand')
const target = args[0]
if (!target) { console.error('usage: node scripts/seo.mjs <run id | run folder | site folder> [--base URL] [--brand NAME]'); process.exit(2) }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const runsDir = process.env.SWARM_RUNS_DIR || join(root, 'runs')
const dir = existsSync(target) ? resolve(target) : join(runsDir, target)
if (!existsSync(dir)) { console.error(`no such run or folder: ${target}`); process.exit(1) }

let manifest
if (existsSync(join(dir, 'events.jsonl'))) {
  const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
  const runId = dir.split('/').pop()
  const out = await exportRun({ events, runId, runDir: dir, sections: [], name: brand })
  manifest = base ? out.rebase(base) : out.seo
  console.log(`exported ${out.dir}/html`)
} else {
  if (!readdirSync(dir).some(f => f.endsWith('.html'))) { console.error(`${dir} has no events.jsonl and no .html pages`); process.exit(1) }
  manifest = seoStatic(dir, { brand, base: base || null })
  console.log(`wrote SEO into ${dir}`)
}
for (const p of manifest.pages) console.log(`${p.file}\t${p.title}\t${p.description.length} chars\t${p.image || 'no share picture'}\t${p.schema}`)
for (const n of manifest.notes) console.log(`fixed: ${n.text}`)
