#!/usr/bin/env node
// Stitch a burst result into one page so we can look at what the swarm built.
//   node bench/assemble.mjs bench/results/<file>-burst.json  →  bench/pages/<file>.html

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const file = process.argv[2]
const { results, summary } = JSON.parse(readFileSync(file, 'utf8'))

const strip = html =>
  html
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

const body = results
  .filter(r => r.ok)
  .map(r => `<div data-layer="${r.layer}">\n${strip(r.text)}\n</div>`)
  .join('\n')

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Swarm burst — ${summary.model}</title>
<script src="https://cdn.tailwindcss.com/3.4.17"></script>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--background:#FAF7F2;--foreground:#1C1B19;--primary:#0F5C55;--primary-foreground:#FAF7F2;--muted:#EFE9DF;--muted-foreground:#5E5A52;--border:#DDD5C8;--accent:#C8643B}
body{background:var(--background);color:var(--foreground);font-family:Inter,sans-serif;margin:0}
h1,h2,h3{font-family:Fraunces,serif}
</style></head><body>
${body}
</body></html>`

const out = join(here, 'pages', basename(file).replace(/\.json$/, '.html'))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, page)
console.log(out)
