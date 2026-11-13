#!/usr/bin/env node
// Open Design's library (decision 0016 point 1b, issue #447): its skills, design templates, plugin skills and
// prompt templates, pinned with their licences. A developer runs this by hand against a checkout of
// nexu-io/open-design at the pinned commit; what it writes is committed, and nothing is fetched or run when the
// plugin is installed or used.
//
//   node scripts/import-od-library.mjs <open-design checkout>
//
// It reads, and never runs, these files:
//   skills/<id>/SKILL.md                       169 skills
//   design-templates/<id>/SKILL.md, open-design.json      115 design templates
//   plugins/**/SKILL.md, open-design.json      272 plugin skills
//   prompt-templates/{image,video}/<id>.json   107 prompt templates
//   LICENSE files beside any of them
// and writes:
//   engine/opendesign/library.json         the catalogue: id, kind, name, one line, category, licence, source path
//   engine/opendesign/library-texts.json.gz  each entry's text (its SKILL.md, or its prompt template), and the
//                                             licence texts, gzipped (about 0.8 MB): read only when one is chosen
// How they are chosen is engine/odlibrary.mjs; the catalogue is what a planner reads, the text what it is given.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { COMMIT } from './import-od-systems.mjs'

const text = f => readFileSync(f, 'utf8').replace(/\r\n?/g, '\n')
const json = f => { try { return JSON.parse(text(f)) } catch { return null } }
const line = s => String(s || '').replace(/\s+/g, ' ').trim()
const short = (s, n) => { const t = line(s); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t }
// a SKILL.md's text is capped: what a planner is given, not a manual
const CAP = 12000

// the front matter a SKILL.md opens with: name, description (plain or a | block), triggers, od.category, upstream, license
export function frontOf(md) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  const out = { body: m ? md.slice(m[0].length) : md }
  if (!m) return out
  const lines = m[1].split('\n')
  for (let i = 0; i < lines.length; i++) {
    const kv = /^(\s*)([\w-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    const [, ind, k, v] = kv
    if (v === '|' || v === '>' || v === '|-' || v === '>-') {
      const block = []
      while (i + 1 < lines.length && (/^\s{2,}\S/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim())
      if (!ind) out[k] = block.join(' ').trim()
    } else if (v === '' && k === 'triggers') {
      const items = []
      while (i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, ''))
      out.triggers = items
    } else if (k === 'category' || k === 'upstream' || k === 'license' || !ind) {
      out[k === 'license' ? 'license' : k] ??= v.replace(/^["']|["']$/g, '')
    }
  }
  return out
}

function licenceOf(dir, root, meta, fallback) {
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map(f => join(dir, f)).find(existsSync)
  const declared = line(meta?.license || meta?.licence || '')
  return { licence: declared || (file ? 'see its LICENSE' : fallback), file: file ? relative(root, file).replace(/\\/g, '/') : null }
}

export function importLibrary(root) {
  const entries = [], texts = {}, licences = new Set()
  const add = (e, body, lic) => {
    entries.push({ ...e, licence: lic.licence, ...(lic.file ? { licenceFile: lic.file } : {}) })
    texts[e.id] = body.length > CAP ? `${body.slice(0, CAP)}\n…` : body
    if (lic.file) licences.add(lic.file)
  }
  const dirs = base => existsSync(base) ? readdirSync(base).filter(d => statSync(join(base, d)).isDirectory() && existsSync(join(base, d, 'SKILL.md'))).sort() : []

  // skills
  for (const d of dirs(join(root, 'skills'))) {
    const dir = join(root, 'skills', d), md = text(join(dir, 'SKILL.md')), f = frontOf(md)
    add({ id: `skill:${d}`, kind: 'skill', name: f.name || d, line: short(f.description || '', 140), category: f.category || '', triggers: (f.triggers || []).slice(0, 8), ...(f.upstream ? { upstream: f.upstream } : {}), path: `skills/${d}/` }, md, licenceOf(dir, root, f, 'Apache-2.0'))
  }
  // design templates: the person picks one
  for (const d of dirs(join(root, 'design-templates'))) {
    const dir = join(root, 'design-templates', d), md = text(join(dir, 'SKILL.md')), f = frontOf(md), meta = json(join(dir, 'open-design.json')) || {}
    add({ id: `template:${d}`, kind: 'template', name: meta.title || f.name || d, line: short(meta.description || f.description || '', 140), category: (meta.tags || []).slice(0, 4).join(', '), path: `design-templates/${d}/` }, md, licenceOf(dir, root, meta.license ? meta : f, 'Apache-2.0'))
  }
  // plugin skills, wherever they sit under plugins/
  const walk = (base, out = []) => { for (const n of readdirSync(base)) { const p = join(base, n); if (statSync(p).isDirectory()) { if (existsSync(join(p, 'SKILL.md'))) out.push(p); else walk(p, out) } } return out }
  for (const dir of existsSync(join(root, 'plugins')) ? walk(join(root, 'plugins')).sort() : []) {
    const md = text(join(dir, 'SKILL.md')), f = frontOf(md), meta = json(join(dir, 'open-design.json')) || {}, d = relative(join(root, 'plugins'), dir).replace(/\\/g, '/')
    add({ id: `plugin:${d}`, kind: 'plugin-skill', name: meta.title || f.name || d.split('/').pop(), line: short(meta.description || f.description || '', 140), category: (meta.tags || []).slice(0, 4).join(', '), path: `plugins/${d}/` }, md, licenceOf(dir, root, meta.license ? meta : f, 'Apache-2.0'))
  }
  // prompt templates: image and video briefs
  for (const surface of ['image', 'video']) {
    const base = join(root, 'prompt-templates', surface)
    for (const f of existsSync(base) ? readdirSync(base).filter(f => f.endsWith('.json')).sort() : []) {
      const t = json(join(base, f))
      if (!t?.prompt) continue
      add({ id: `prompt:${surface}/${t.id || f.replace(/\.json$/, '')}`, kind: 'prompt-template', surface, name: t.title || t.id, line: short(t.summary || '', 140), category: t.category || '', triggers: (t.tags || []).slice(0, 8), path: `prompt-templates/${surface}/${f}` }, JSON.stringify({ prompt: t.prompt, aspect: t.aspect || '', model: t.model || '' }), licenceOf(base, root, t, 'Apache-2.0'))
    }
  }
  for (const f of licences) texts[`licence:${f}`] = text(join(root, f))
  return { entries, texts }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) { console.error('usage: node scripts/import-od-library.mjs <open-design checkout>'); process.exit(2) }
  let at = ''
  try { at = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch {}
  if (at !== COMMIT) console.error(`warning: the checkout is at ${at || 'an unknown commit'}, not ${COMMIT}`)
  const { entries, texts } = importLibrary(root)
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'opendesign')
  const count = k => entries.filter(e => e.kind === k).length
  writeFileSync(join(out, 'library.json'), `{"source": ${JSON.stringify({ repo: 'nexu-io/open-design', commit: COMMIT, licence: 'Apache-2.0 unless an entry names its own' })},\n"entries": [\n${entries.map(e => JSON.stringify(e)).join(',\n')}\n]}\n`)
  writeFileSync(join(out, 'library-texts.json.gz'), gzipSync(JSON.stringify(texts), { level: 9 }))
  console.log(`${count('skill')} skills, ${count('template')} design templates, ${count('plugin-skill')} plugin skills, ${count('prompt-template')} prompt templates, ${Object.keys(texts).filter(k => k.startsWith('licence:')).length} licences`)
}
