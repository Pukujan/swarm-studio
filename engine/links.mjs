// Web addresses a build's code points at that nobody gave it. A model asked for
// "a button back to the site" with no address invents one (searchflights.com),
// and that domain is someone else's. Fonts, the starter's own links and the
// addresses the studio passed in are fine; anything else is reported.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const KNOWN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.dyad.sh', 'dyad.sh', 'www.w3.org', 'localhost', '127.0.0.1', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'files.design-bakery.com', 'swarm.design-bakery.com', 'openapi.vercel.sh', 'json.schemastore.org', 'ui.shadcn.com']
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.css', '.json', '.md'])
const SKIP = new Set(['node_modules', 'dist', '.git', '.engine', 'public'])

const hostOf = u => { try { return new URL(u).hostname.toLowerCase() } catch { return '' } }

// [{ host, url, file }] for addresses whose host is neither known nor allowed
export function strangeLinks(dir, allowed = []) {
  const ok = new Set([...KNOWN, ...allowed.map(hostOf).filter(Boolean)])
  const out = [], seen = new Set()
  const walk = (d, rel = '') => {
    for (const name of readdirSync(d)) {
      if (SKIP.has(name) || name.startsWith('.')) continue
      const p = join(d, name), r = rel ? `${rel}/${name}` : name
      const st = statSync(p)
      if (st.isDirectory()) walk(p, r)
      else if (EXT.has(extname(name)) && st.size < 400000 && !/^(package|pnpm-lock|components)\.json$|lock/.test(name) && !/^(README|AI_RULES)\.md$/.test(name)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/https?:\/\/[^\s"'`)<>\]}]+/g)) {
          const host = hostOf(m[0])
          if (!host || ok.has(host) || seen.has(host)) continue
          seen.add(host)
          out.push({ host, url: m[0], file: r })
        }
      }
    }
  }
  walk(dir)
  return out
}
