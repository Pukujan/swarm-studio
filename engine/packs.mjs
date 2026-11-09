// Pro packs: a pack turns Auto into a tool for one market (docs/specs/09-demo-modes.md).
// A pack is packs/<id>/pack.json plus small tool modules in packs/<id>/tools/.
// Tools do real, deterministic work (a seat map, an SKU sheet, three visual
// directions…) and write files into the app; the app engine then wires them in.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs')

export function listPacks() {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(root, d.name, 'pack.json')))
    .map(d => loadPack(d.name)).filter(Boolean).sort((a, b) => (a.order || 99) - (b.order || 99))
}

export function loadPack(id) {
  if (!/^[a-z0-9-]+$/.test(String(id || ''))) return null
  const f = join(root, id, 'pack.json')
  if (!existsSync(f)) return null
  const p = JSON.parse(readFileSync(f, 'utf8'))
  return { ...p, id }
}

// what the canvas shows: no file paths
export const packSummary = p => ({ id: p.id, name: p.name, market: p.market, icon: p.icon, pitch: p.pitch, intake: p.intake, deliverables: p.deliverables, connectors: p.connectors, games: p.games || 'none', tools: (p.tools || []).map(t => ({ id: t.id, label: t.label })) })

// the person's answers, with each question's default filled in and values trimmed
export function intakeValues(p, given = {}) {
  const out = {}
  for (const q of p.intake || []) {
    let v = given[q.id]
    if (v === undefined || v === null || String(v).trim() === '') v = q.default
    if (q.type === 'number') v = Math.max(q.min ?? 0, Math.min(q.max ?? 1e6, Number(v) || Number(q.default) || 0))
    else v = String(v).slice(0, 300)
    if (q.type === 'choice' && q.choices && !q.choices.includes(v)) v = q.default
    out[q.id] = v
  }
  return out
}

const fill = (s, vars) => String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

export function packBrief(p, prompt, intake) {
  const facts = (p.intake || []).map(q => `${q.label || q.q}: ${intake[q.id]}`).join('; ')
  return `${prompt}\n\n${fill(p.brief, { ...intake, prompt })}${facts ? `\nFacts: ${facts}.` : ''}`.trim()
}

export const packAsk = (p, step, intake) => p.asks?.[step] ? fill(p.asks[step], intake) : ''

// Run the pack's tools against the app folder. Each tool returns
// { files: [...], ask: 'how the app should use them', note }.
export async function runTools(p, { appDir, runDir, prompt, intake, say = () => {} }) {
  const done = []
  for (const t of p.tools || []) {
    const mod = await import(pathToFileURL(join(root, p.id, 'tools', `${t.id}.mjs`)).href)
    say(`${t.label}…`)
    const write = (rel, text) => {
      const f = join(appDir, rel)
      if (!f.startsWith(appDir)) throw new Error(`a tool may only write inside the app: ${rel}`)
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, typeof text === 'string' ? text : JSON.stringify(text, null, 2))
      return rel
    }
    const r = await mod.run({ intake, prompt, runDir, appDir, write })
    done.push({ id: t.id, label: t.label, files: r.files || [], ask: r.ask || '', note: r.note || '' })
  }
  return done
}

// GET each check path on the running app; the pack's own definition of done
export async function runChecks(p, baseUrl) {
  const out = []
  for (const c of p.checks || []) {
    const url = new URL(c.path, baseUrl).href
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(err => ({ ok: false, status: String(err.message || err), text: async () => '' }))
    const body = r.ok && c.contains ? await r.text().catch(() => '') : ''
    const ok = r.ok && (!c.contains || body.includes(c.contains))
    out.push({ label: c.label, path: c.path, ok, status: r.status })
  }
  return out
}
