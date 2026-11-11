// Export a build as files people can take away: a static HTML site, a React +
// Vite + Tailwind project with one component per section, and a handoff for an
// app builder (ABA: a blueprint in its own format and a spec to build from).

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { MOTION_CSS, motionPreset, motionSource, swarmMotion } from './motion.mjs'
import { layoutSource, swarmLayout } from './layout.mjs'
import { isScreenName, packageName, projectName } from './naming.mjs'

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const text = html => String(html || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
const slug = s => clip(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'
const pascal = s => {
  const p = String(s).replace(/\*/g, 'shared').split(/[^a-zA-Z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')
  return /^[A-Z]/.test(p) ? p : `S${p}`
}
const PLACEHOLDER = alt => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#ddd"/><text x="400" y="300" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#888">${clip(alt, 40).replace(/[<&]/g, '')}</text></svg>`)}`

// ---------- the build as it stands: theme with edits, pages, sections in order
// name: the project's one name (engine/naming.mjs); without it, the brief's brand. Never a page title.
export function snapshot(events, given = [], { name = '' } = {}) {
  const theme = structuredClone(events.findLast(e => e.type === 'theme') || { vars: {}, fonts: {} })
  for (const e of events) {
    if (e.type !== 'edit') continue
    if (e.kind === 'var') theme.vars = { ...theme.vars, [e.name]: e.value }
    if (e.kind === 'font') theme.fonts = { ...theme.fonts, [e.role]: e.value }
    if (e.kind === 'radius') theme.radius = e.value
  }
  const start = events.find(e => e.type === 'run:start') || {}
  const pages = events.filter(e => e.type === 'page').sort((a, b) => a.index - b.index).map(p => ({ id: p.id, title: p.title, purpose: p.purpose || '' }))
  const plan = events.filter(e => e.type === 'layer:plan').map(e => ({ key: `${e.page}/${e.id}`, page: e.page, id: e.id, role: e.role || e.id }))
  const html = new Map()
  for (const e of events) if (e.type === 'layer:done' && e.html) html.set(`${e.page}/${e.layer}`, e.html)
  const imgs = new Map()
  for (const e of events) if (e.type === 'image' && e.src) imgs.set(`${e.page}/${e.layer}|${e.gen}`, e.src)
  // the canvas's copy has edits applied and pictures filled in
  for (const s of given) if (s && typeof s.key === 'string' && typeof s.html === 'string') html.set(s.key, s.html)
  const sections = plan.filter(s => html.has(s.key)).map(s => ({
    ...s,
    html: html.get(s.key).replace(/<img\b([^>]*?)data-gen="([^"]*)"([^>]*)>/g, (m, a, gen, b) => (/\ssrc=/.test(a + b) ? m : `<img${a}data-gen="${gen}"${b.replace(/\/$/, '')} src="${imgs.get(`${s.key}|${gen}`) || ''}">`))
  }))
  const shared = sections.filter(s => s.page === '*')
  const top = shared.filter(s => /nav|header|menu/i.test(`${s.id} ${s.role}`))
  const bottom = shared.filter(s => !top.includes(s))
  const brand = clip(name && !isScreenName(name) ? name : projectName({ brief: start.brief, title: start.title }), 40)
  return { brief: start.brief || '', brand, theme, pages: pages.map(p => ({ ...p, sections: [...top, ...sections.filter(s => s.page === p.id), ...bottom] })) }
}

// Pictures: server paths become files next to the site; empty ones get a placeholder.
function localImages(html, runId, runDir, imgDirs, prefix) {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]*)(")/g, (m, a, src, b) => {
    const own = src.match(new RegExp(`^/img/${runId}/([\\w.-]+)$`))
    if (own) {
      const file = join(runDir, 'img', own[1])
      if (existsSync(file)) for (const d of imgDirs) { mkdirSync(d, { recursive: true }); copyFileSync(file, join(d, own[1])) }
      return `${a}${prefix}${own[1]}${b}`
    }
    if (!src || src.startsWith('/')) return `${a}${PLACEHOLDER((m.match(/alt="([^"]*)"/) || [])[1] || 'image')}${b}`
    return m
  })
}

function rootCss(theme) {
  const v = theme.vars || {}
  const heading = theme.fonts?.heading || 'Georgia', body = theme.fonts?.body || 'Inter'
  return `:root {\n${Object.entries(v).map(([k, x]) => `  ${k}: ${x};`).join('\n')}\n  --font-heading: '${heading}', Georgia, serif;\n  --font-body: '${body}', system-ui, sans-serif;\n  --radius: ${theme.radius || '12px'};\n}\nhtml, body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-body); }\n`
}
const fontsHref = theme => {
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`
  return `https://fonts.googleapis.com/css2?${fam(theme.fonts?.heading || 'Georgia')}&${fam(theme.fonts?.body || 'Inter')}&display=swap`
}

// ---------- HTML to JSX: a small scanner, enough for the markup builders write
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const RENAME = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', autocomplete: 'autoComplete', autofocus: 'autoFocus', enctype: 'encType', crossorigin: 'crossOrigin', srcset: 'srcSet', novalidate: 'noValidate', contenteditable: 'contentEditable', spellcheck: 'spellCheck', frameborder: 'frameBorder', allowfullscreen: 'allowFullScreen', datetime: 'dateTime', inputmode: 'inputMode', viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', 'xlink:href': 'xlinkHref', 'xmlns:xlink': 'xmlnsXlink', 'xml:space': 'xmlSpace', value: 'defaultValue', checked: 'defaultChecked' }
const camel = s => s.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase())
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function styleObject(css) {
  const parts = decode(css).split(';').map(p => p.trim()).filter(Boolean).flatMap(p => {
    const i = p.indexOf(':')
    if (i < 1) return []
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim()
    return [`${k.startsWith('--') ? JSON.stringify(k) : camel(k.toLowerCase().replace(/^-ms-/, 'ms-'))}: ${JSON.stringify(v)}`]
  })
  return `{{ ${parts.join(', ')} }}`
}

function attrs(src) {
  const out = []
  for (const m of src.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const raw = m[1], v = m[2] ?? m[3] ?? m[4]
    const name = raw.toLowerCase()
    if (name.startsWith('on')) continue
    if (name === 'selected') continue
    if (name === 'style') { if (v) out.push(`style=${styleObject(v)}`); continue }
    const jsx = RENAME[name] || (/^(data|aria)-/.test(name) ? name : raw.includes('-') || raw.includes(':') ? camel(raw) : raw)
    if (v === undefined) out.push(jsx)
    else out.push(/["\\{}]/.test(v) || /&#?\w+;/.test(v) ? `${jsx}={${JSON.stringify(decode(v))}}` : `${jsx}="${v}"`)
  }
  return out.length ? ` ${out.join(' ')}` : ''
}

export function htmlToJsx(html) {
  let out = '', i = 0
  const stack = []
  const s = String(html).replace(/<script[\s\S]*?<\/script>/gi, '')
  while (i < s.length) {
    const lt = s.indexOf('<', i)
    const chunk = s.slice(i, lt < 0 ? s.length : lt)
    if (chunk) out += chunk.replace(/[{}]/g, c => `{'${c}'}`).replace(/>/g, '&gt;')
    if (lt < 0) break
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4)
      out += `{/* ${s.slice(lt + 4, end < 0 ? s.length : end).replace(/\*\//g, '* /').trim()} */}`
      i = end < 0 ? s.length : end + 3
      continue
    }
    const close = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(s.slice(lt))
    if (close) {
      const name = close[1]
      const at = stack.lastIndexOf(name)
      if (at >= 0) while (stack.length > at) out += `</${stack.pop()}>` // closes anything left open inside
      i = lt + close[0].length
      continue
    }
    const open = /^<([a-zA-Z][\w:-]*)/.exec(s.slice(lt))
    if (!open || s[lt + 1] === '!') { out += '&lt;'; i = lt + 1; continue }
    // the end of the tag, outside quotes
    let j = lt + open[0].length, q = ''
    for (; j < s.length; j++) {
      const c = s[j]
      if (q) { if (c === q) q = '' } else if (c === '"' || c === "'") q = c
      else if (c === '>') break
    }
    const body = s.slice(lt + open[0].length, j)
    const selfClose = /\/\s*$/.test(body)
    const name = open[1]
    if (name.toLowerCase() === 'style') {
      const end = s.toLowerCase().indexOf('</style>', j)
      const css = s.slice(j + 1, end < 0 ? s.length : end)
      out += `<style>{${JSON.stringify(css)}}</style>`
      i = end < 0 ? s.length : end + 8
      continue
    }
    const a = attrs(body.replace(/\/\s*$/, ''))
    if (selfClose || VOID.has(name.toLowerCase())) out += `<${name}${a} />`
    else { out += `<${name}${a}>`; stack.push(name) }
    i = j + 1
  }
  while (stack.length) out += `</${stack.pop()}>`
  return out
}

// ---------- the files
function staticSite(snap, dir, runId, runDir) {
  const file = (p, i) => (i === 0 ? 'index.html' : `${p.id}.html`)
  const routes = Object.fromEntries(snap.pages.map((p, i) => [p.id, file(p, i)]))
  snap.pages.forEach((p, i) => {
    const body = p.sections.map(s => `<!-- ${s.role} -->\n${localImages(s.html, runId, runDir, [join(dir, 'img')], 'img/')}`).join('\n\n')
    writeFileSync(join(dir, file(p, i)), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${clip(p.title, 120).replace(/</g, '&lt;')}</title>
<script src="https://cdn.tailwindcss.com/3.4.17"></script>
<link rel="stylesheet" href="${fontsHref(snap.theme)}">
<style>
${rootCss(snap.theme)}${MOTION_CSS}</style>
</head>
<body>
${body}
<script>
// layout: a text panel floated over a map or picture moves beside it when it would cover other text
${layoutSource()}

// motion: sections reveal as they scroll in
addEventListener('load', () => ${motionSource(motionPreset(snap.theme))})

// buttons and links made on the canvas name the page they go to
const pages = ${JSON.stringify(routes)}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-goto]')
  if (go && pages[go.dataset.goto]) { e.preventDefault(); location.href = pages[go.dataset.goto] }
})
document.addEventListener('submit', e => e.preventDefault())
</script>
</body>
</html>
`)
  })
  return Object.values(routes)
}

function reactApp(snap, dir, runId, runDir, name) {
  const src = join(dir, 'src'), secDir = join(src, 'sections'), pageDir = join(src, 'pages')
  for (const d of [secDir, pageDir]) mkdirSync(d, { recursive: true })
  const names = new Map(), used = new Set()
  const comp = s => {
    if (names.has(s.key)) return names.get(s.key)
    let n = pascal(s.page === '*' ? `shared-${s.id}` : s.id.startsWith(`${s.page}-`) ? s.id : `${s.page}-${s.id}`)
    while (used.has(n)) n += 'X'
    used.add(n)
    names.set(s.key, n)
    const html = localImages(s.html, runId, runDir, [join(dir, 'public', 'img')], '/img/')
    writeFileSync(join(secDir, `${n}.jsx`), `// ${s.role} (${s.page === '*' ? 'on every page' : `page ${s.page}`}), designed in Swarm Studio\nexport default function ${n}() {\n  return (\n    <>\n${htmlToJsx(html).split('\n').map(l => `      ${l}`).join('\n')}\n    </>\n  )\n}\n`)
    return n
  }
  const pageNames = snap.pages.map(p => {
    const n = `${pascal(p.id)}Page`
    const list = p.sections.map(comp)
    writeFileSync(join(pageDir, `${n}.jsx`), `${[...new Set(list)].map(c => `import ${c} from '../sections/${c}.jsx'`).join('\n')}\n\n// ${clip(p.title, 100)}${p.purpose ? `: ${clip(p.purpose, 140)}` : ''}\nexport default function ${n}() {\n  return (\n    <>\n${list.map(c => `      <${c} />`).join('\n')}\n    </>\n  )\n}\n`)
    return [p.id, n]
  })
  const first = snap.pages[0]?.id || 'home'
  writeFileSync(join(src, 'motion.js'), `// Sections reveal as they scroll in; clickable things lift under the pointer.\n// Idempotent: run it again whenever a page renders.\nexport const preset = ${JSON.stringify(motionPreset(snap.theme))}\n\nexport ${swarmMotion.toString()}\n`)
  writeFileSync(join(src, 'layout.js'), `// A text panel floated over a map or picture moves beside it when it would cover\n// other text at this width. Idempotent: run it again whenever a page renders.\nexport ${swarmLayout.toString()}\n`)
  writeFileSync(join(src, 'App.jsx'), `import { useEffect, useState } from 'react'
import { swarmLayout } from './layout.js'
import { swarmMotion, preset } from './motion.js'
${pageNames.map(([, n]) => `import ${n} from './pages/${n}.jsx'`).join('\n')}

const pages = { ${pageNames.map(([id, n]) => `${JSON.stringify(id)}: ${n}`).join(', ')} }
const current = () => decodeURIComponent(location.hash.slice(1)) || ${JSON.stringify(first)}

// One page at a time; buttons and links made on the canvas name their page in data-goto.
export default function App() {
  const [page, setPage] = useState(current)
  useEffect(() => {
    const onHash = () => { setPage(current()); window.scrollTo(0, 0) }
    const onClick = e => {
      const go = e.target.closest('[data-goto]')
      if (go && pages[go.dataset.goto]) { e.preventDefault(); location.hash = go.dataset.goto }
    }
    const onSubmit = e => e.preventDefault()
    window.addEventListener('hashchange', onHash)
    document.addEventListener('click', onClick)
    document.addEventListener('submit', onSubmit)
    return () => {
      window.removeEventListener('hashchange', onHash)
      document.removeEventListener('click', onClick)
      document.removeEventListener('submit', onSubmit)
    }
  }, [])
  useEffect(() => {
    const root = document.getElementById('root')
    swarmLayout(root)
    document.fonts?.ready.then(() => swarmLayout(root))
    swarmMotion(root, preset)
  }, [page])
  const Page = pages[page] || pages[${JSON.stringify(first)}]
  return <Page />
}
`)
  writeFileSync(join(src, 'main.jsx'), `import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App.jsx'\nimport './index.css'\n\ncreateRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)\n`)
  writeFileSync(join(src, 'index.css'), `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${rootCss(snap.theme)}${MOTION_CSS}`)
  writeFileSync(join(dir, 'index.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${clip(snap.brand, 80).replace(/</g, '&lt;')}</title>\n<link rel="stylesheet" href="${fontsHref(snap.theme)}">\n</head>\n<body>\n<div id="root"></div>\n<script type="module" src="/src/main.jsx"></script>\n</body>\n</html>\n`)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name, private: true, version: '0.1.0', type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { '@vitejs/plugin-react': '^4.3.4', autoprefixer: '^10.4.20', postcss: '^8.4.49', tailwindcss: '^3.4.17', vite: '^5.4.11' }
  }, null, 2) + '\n')
  writeFileSync(join(dir, 'vite.config.js'), `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`)
  writeFileSync(join(dir, 'tailwind.config.js'), `/** @type {import('tailwindcss').Config} */\nexport default { content: ['./index.html', './src/**/*.{js,jsx}'], theme: { extend: {} }, plugins: [] }\n`)
  writeFileSync(join(dir, 'postcss.config.js'), `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }\n`)
  return { sections: names.size, pages: pageNames.length }
}

// ---------- the design inside dyad's starter (React + TypeScript + shadcn), for the
// full-stack engine to build on. shadcn reads colours as "H S% L%" triplets through
// hsl(var(--x)); the sections were written against plain var(--x) colours, so their
// colour references are rewritten to hsl(...) and both share one set of variables.
const SHADCN = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring']
function hsl(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h6 = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h6.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  let h = 0, sat = 0
  if (d) {
    sat = d / (1 - Math.abs(2 * l - 1))
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return `${h.toFixed(1)} ${(sat * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`
}
function shadcnVars(theme) {
  const v = theme.vars || {}, get = k => hsl(v[`--${k}`])
  const fg = get('foreground') || '0 0% 98%', bg = get('background') || '0 0% 4%'
  const vals = {
    background: bg, foreground: fg,
    card: get('card') || bg, 'card-foreground': fg,
    popover: get('card') || bg, 'popover-foreground': fg,
    primary: get('primary') || fg, 'primary-foreground': get('primary-foreground') || bg,
    secondary: get('muted') || bg, 'secondary-foreground': fg,
    muted: get('muted') || bg, 'muted-foreground': get('muted-foreground') || fg,
    accent: get('accent') || get('primary') || fg, 'accent-foreground': get('primary-foreground') || bg,
    destructive: '0 72% 51%', 'destructive-foreground': '0 0% 98%',
    border: get('border') || get('muted') || bg, input: get('border') || get('muted') || bg, ring: get('primary') || fg,
  }
  return SHADCN.map(k => `    --${k}: ${vals[k]};`).join('\n')
}
const toHsl = html => html.replace(new RegExp(`(?<!hsl\\()var\\(--(${SHADCN.join('|')})\\)`, 'g'), 'hsl(var(--$1))')

// pnpm 10+ skips build scripts unless a project allows them, and Vite needs
// esbuild's: without this the app never starts and dyad can't screenshot it.
export function seedProject(scaffold, dir, name) {
  rmSync(dir, { recursive: true, force: true })
  cpSync(scaffold, dir, { recursive: true, filter: f => !/[\\/](node_modules|\.git)([\\/]|$)/.test(f) })
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies:\n  - "@swc/core"\n  - esbuild\nallowBuilds:\n  "@swc/core": true\n  esbuild: true\n')
  const pkg = join(dir, 'package.json'), json = JSON.parse(readFileSync(pkg, 'utf8'))
  writeFileSync(pkg, JSON.stringify({ ...json, name: packageName(name, json.name), pnpm: { ...json.pnpm, onlyBuiltDependencies: ['@swc/core', 'esbuild'] } }, null, 2) + '\n')
}

export function dyadApp(snap, dir, { runId, runDir, scaffold }) {
  seedProject(scaffold, dir, snap.brand)
  const src = join(dir, 'src'), secDir = join(src, 'components', 'swarm'), pageDir = join(src, 'pages')
  mkdirSync(secDir, { recursive: true })
  rmSync(join(src, 'pages', 'Index.tsx'), { force: true })
  rmSync(join(src, 'components', 'made-with-dyad.tsx'), { force: true })
  const names = new Map(), used = new Set(['Index', 'NotFound'])
  const comp = s => {
    if (names.has(s.key)) return names.get(s.key)
    let n = pascal(s.page === '*' ? `shared-${s.id}` : s.id.startsWith(`${s.page}-`) ? s.id : `${s.page}-${s.id}`)
    while (used.has(n)) n += 'X'
    used.add(n)
    names.set(s.key, n)
    const html = toHsl(localImages(s.html, runId, runDir, [join(dir, 'public', 'img')], '/img/'))
    writeFileSync(join(secDir, `${n}.tsx`), `// @ts-nocheck: markup converted from the Swarm Studio canvas\n// ${s.role} (${s.page === '*' ? 'on every page' : `page ${s.page}`})\nexport default function ${n}() {\n  return (\n    <>\n${htmlToJsx(html).split('\n').map(l => `      ${l}`).join('\n')}\n    </>\n  )\n}\n`)
    return n
  }
  const routes = snap.pages.map((p, i) => {
    const n = i === 0 ? 'Index' : `${pascal(p.id)}Page`
    const list = p.sections.map(comp)
    writeFileSync(join(pageDir, `${n}.tsx`), `${[...new Set(list)].map(c => `import ${c} from "@/components/swarm/${c}";`).join('\n')}\n\n// ${clip(p.title, 100)}${p.purpose ? `: ${clip(p.purpose, 140)}` : ''}\nconst ${n} = () => (\n  <>\n${list.map(c => `    <${c} />`).join('\n')}\n  </>\n);\n\nexport default ${n};\n`)
    return { id: p.id, path: i === 0 ? '/' : `/${p.id}`, n }
  })
  writeFileSync(join(src, 'lib', 'swarm-motion.ts'), `// @ts-nocheck: from Swarm Studio\n// Sections reveal as they scroll in; clickable things lift under the pointer.\nexport const preset = ${JSON.stringify(motionPreset(snap.theme))};\n\nexport ${swarmMotion.toString()}\n\n// A text panel floated over a map or picture moves beside it when it would cover other text.\nexport ${swarmLayout.toString()}\n`)
  writeFileSync(join(src, 'App.tsx'), `import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { swarmLayout, swarmMotion, preset } from "@/lib/swarm-motion";
${routes.map(r => `import ${r.n} from "./pages/${r.n}";`).join('\n')}
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// The design's buttons and links name the page they open in data-goto.
const PAGES: Record<string, string> = ${JSON.stringify(Object.fromEntries(routes.map(r => [r.id, r.path])))};

const SwarmDesign = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const go = (e.target as HTMLElement).closest<HTMLElement>("[data-goto]");
      const to = go && PAGES[go.dataset.goto || ""];
      if (to) { e.preventDefault(); navigate(to); window.scrollTo(0, 0); }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);
  useEffect(() => {
    const root = document.getElementById("root")!;
    swarmLayout(root, false);
    document.fonts?.ready.then(() => swarmLayout(root, false));
    swarmMotion(root, preset);
  }, [pathname]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SwarmDesign />
        <Routes>
${routes.map(r => `          <Route path="${r.path}" element={<${r.n} />} />`).join('\n')}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
`)
  const css = join(src, 'globals.css')
  const heading = snap.theme.fonts?.heading || 'Georgia', body = snap.theme.fonts?.body || 'Inter'
  writeFileSync(css, `${readFileSync(css, 'utf8')}
/* The Swarm Studio design: its colours, fonts and corners, for shadcn and the sections alike. */
@layer base {
  :root {
${shadcnVars(snap.theme)}
    --radius: ${snap.theme.radius || '12px'};
    --font-heading: '${heading}', Georgia, serif;
    --font-body: '${body}', system-ui, sans-serif;
  }
  body { font-family: var(--font-body); }
}
${MOTION_CSS}`)
  const index = join(dir, 'index.html')
  writeFileSync(index, readFileSync(index, 'utf8')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${clip(snap.brand, 80).replace(/</g, '&lt;')}</title>`)
    .replace('</head>', `  <link rel="stylesheet" href="${fontsHref(snap.theme)}" />\n  </head>`))
  return { sections: names.size, pages: routes.map(r => ({ id: r.id, path: r.path })) }
}

function abaHandoff(snap, dir) {
  const v = snap.theme.vars || {}
  const blueprint = {
    name: snap.brand,
    direction: clip(snap.theme.direction, 300),
    palette: { background: v['--background'], surface: v['--card'], ink: v['--foreground'], muted: v['--muted-foreground'], primary: v['--primary'], accent: v['--accent'] },
    type: { display: snap.theme.fonts?.heading, body: snap.theme.fonts?.body },
    sections: snap.pages.flatMap(p => p.sections.filter(s => s.page !== '*').map(s => `${p.title.split(/\s[—–|:-]\s/).pop()}: ${s.role}`)).slice(0, 40),
    source: 'swarm-studio'
  }
  writeFileSync(join(dir, 'blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n')
  const shared = snap.pages[0]?.sections.filter(s => s.page === '*') || []
  const pageSpec = snap.pages.map((p, i) => {
    const lines = p.sections.filter(s => s.page !== '*').map(s => {
      const head = (/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(s.html) || [])[1]
      const goes = [...new Set([...s.html.matchAll(/data-goto="([^"]+)"/g)].map(m => m[1]))]
      return `- **${s.role}**${head ? `: “${clip(text(head), 90)}”` : ''}${goes.length ? ` (links to ${goes.join(', ')})` : ''}`
    })
    return `### ${clip(p.title, 100)} — \`${i === 0 ? '/' : `/${p.id}`}\`\n${p.purpose}\n\n${lines.join('\n')}`
  }).join('\n\n')
  writeFileSync(join(dir, 'spec.md'), `# ${snap.brand}: build this design as a working React app

${snap.brief}

The design is finished: it was made in Swarm Studio, and \`../react\` holds it as a React + Vite + Tailwind project, one component per section (\`src/sections\`), one per page (\`src/pages\`). Keep that markup, the Tailwind classes and the CSS variables in \`src/index.css\` exactly; the look is decided. What is left is to make it a real app:

- Routing between the pages below (each \`data-goto\` names the page a button or link opens).
- Forms that submit somewhere, with validation and a success state.
- Real data where the design shows lists, prices or plans, from a typed data module rather than hard-coded markup.
- Responsive checks at 375 px and 1280 px; the sections were designed at 1280 px.

## Design

${snap.theme.name ? `**${snap.theme.name}.** ` : ''}${snap.theme.direction || ''}

- Fonts: headings ${snap.theme.fonts?.heading}, body ${snap.theme.fonts?.body}. Radius ${snap.theme.radius || '12px'}.
${Object.entries(v).map(([k, x]) => `- \`${k}\`: ${x}`).join('\n')}

\`blueprint.json\` is the same design in ABA's blueprint format.

## On every page

${shared.map(s => `- **${s.role}**`).join('\n') || '- (none)'}

## Pages

${pageSpec}
`)
}

const zip = (cwd, name) => new Promise(ok => execFile('zip', ['-qr', `${name}.zip`, name], { cwd }, err => ok(err ? null : join(cwd, `${name}.zip`))))

export async function exportRun({ events, runId, runDir, sections, name: given = '' }) {
  const snap = snapshot(events, sections, { name: given })
  if (!snap.pages.some(p => p.sections.length)) throw new Error('nothing built yet')
  const name = slug(snap.brand)
  const base = join(runDir, 'export'), root = join(base, name)
  rmSync(root, { recursive: true, force: true })
  for (const d of ['html', 'react', 'aba']) mkdirSync(join(root, d), { recursive: true })
  const htmlFiles = staticSite(snap, join(root, 'html'), runId, runDir)
  const react = reactApp(snap, join(root, 'react'), runId, runDir, name)
  abaHandoff(snap, join(root, 'aba'))
  writeFileSync(join(root, 'README.md'), `# ${snap.brand}

Designed in Swarm Studio from the brief: ${snap.brief}

- \`html/\`: the site as static pages. Open \`html/index.html\` in a browser; it uses Tailwind's CDN.
- \`react/\`: the same site as a React + Vite + Tailwind project, ${react.sections} section components across ${react.pages} pages. \`cd react && npm install && npm run dev\`.
- \`aba/\`: a handoff for an app builder: \`spec.md\` (what to build, page by page) and \`blueprint.json\` (the design in ABA's blueprint format).
`)
  const archive = await zip(base, name)
  return { dir: root, zip: archive, name, brand: snap.brand, pages: snap.pages.length, sections: react.sections, html: htmlFiles }
}

