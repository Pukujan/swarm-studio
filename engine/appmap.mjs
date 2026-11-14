// An app's plan as diagrams (spec 44, the app build wall's Map window): its screens and the ways between them as a
// Mermaid flowchart, its data as a Mermaid ER diagram. Pure: plan in, text out; the next UI draws it with Mermaid
// and marks the screen being built and the ones done itself (classDef lines it adds), so this text is the same for
// one plan and is cached by its version.
//
// The plan comes in either shape engine/appjob.mjs is given (saved by start() as runs/<id>/app-plan.json):
//   the advisor's      { summary, roles, data: [{ name, fields: string[] }], screens: [{ name, path, for, what }] }
//   an App kit's       the same through kitPlan (engine/appkit.mjs), plus flow: ['Home → Events', …]; or the kit
//                      itself, whose screens carry next: [screen ids]
// The ways between screens are the kit's flow (or next). The advisor's plan has none, so its flowchart is the
// screens alone. The data has no relations in either shape (fields are plain words), so one is drawn where a field
// is named after another table (member, members, memberId, member_id → Member): a reading, not the plan's words.
// Every label is the person's words: quotes, brackets and the like are taken out before they reach Mermaid.
import { createHash } from 'node:crypto'

export const words = s => String(s ?? '').replace(/["'`<>{}[\]()|#;\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
const slug = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'x'
// a field's own name, as one word Mermaid's ER attributes take
const field = s => String(s ?? '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field'
// one word, singular, for matching a field to a table
const stem = s => {
  const w = slug(s).replace(/_?ids?$/, '')
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`
  if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2)
  return /ss$/.test(w) ? w : w.replace(/s$/, '')
}

function screensOf(plan) {
  const list = Array.isArray(plan?.screens) ? plan.screens.slice(0, 40) : []
  const used = new Set()
  return list.map((s, i) => {
    let id = `s_${slug(s?.id || s?.name || s?.path || `screen ${i + 1}`)}`
    while (used.has(id)) id += '_'
    used.add(id)
    return { id, key: String(s?.id || ''), name: words(s?.name || s?.path || `Screen ${i + 1}`), path: words(s?.path || ''), next: Array.isArray(s?.next) ? s.next.map(String) : [] }
  })
}

function edgesOf(plan, screens) {
  const find = t => { const k = String(t ?? '').trim().toLowerCase(); return screens.find(s => s.key.toLowerCase() === k || s.name.toLowerCase() === k || (s.path && s.path.toLowerCase() === k)) }
  const out = new Map()
  const add = (a, b) => { if (a && b && a !== b) out.set(`${a.id}>${b.id}`, [a.id, b.id]) }
  for (const line of Array.isArray(plan?.flow) ? plan.flow : []) {
    const parts = String(line).split(/\s*(?:→|->|=>)\s*/)
    for (let i = 1; i < parts.length; i++) add(find(parts[i - 1]), find(parts[i]))
  }
  for (const s of screens) for (const n of s.next) add(s, find(n))
  return [...out.values()]
}

function dataOf(plan) {
  const list = Array.isArray(plan?.data) ? plan.data.slice(0, 30) : []
  const used = new Set()
  return list.map((d, i) => {
    let id = `E_${slug(d?.name || `table ${i + 1}`)}`
    while (used.has(id)) id += '_'
    used.add(id)
    const fields = [...new Set((Array.isArray(d?.fields) ? d.fields : []).map(field))].slice(0, 20)
    return { id, name: words(d?.name || `Table ${i + 1}`), stem: stem(d?.name || ''), fields }
  })
}

export function planMap(plan) {
  const screens = screensOf(plan), edges = edgesOf(plan, screens), data = dataOf(plan)
  const flow = ['flowchart LR',
    ...screens.map(s => `  ${s.id}["${s.name}${s.path && s.path !== s.name ? `<br/><small>${s.path}</small>` : ''}"]`),
    ...edges.map(([a, b]) => `  ${a} --> ${b}`)].join('\n')
  const rels = []
  for (const d of data) for (const f of d.fields) {
    const to = data.find(o => o !== d && o.stem && o.stem === stem(f))
    if (to) rels.push(`  ${d.id} }o--|| ${to.id} : "${field(f)}"`)
  }
  const er = data.length ? ['erDiagram',
    ...data.map(d => `  ${d.id}["${d.name}"] {\n${(d.fields.length ? d.fields : ['id']).map(f => `    string ${f}`).join('\n')}\n  }`),
    ...rels].join('\n') : ''
  const version = createHash('sha1').update(JSON.stringify({ s: plan?.screens, d: plan?.data, f: plan?.flow })).digest('hex').slice(0, 12)
  return {
    version, flow, er,
    screens: screens.map(({ id, name, path }) => ({ id, name, path })),
    data: data.map(({ id, name }) => ({ id, name })),
    // the advisor's plan names no ways between its screens: the Map says so instead of drawing none silently
    ...(screens.length > 1 && !edges.length ? { note: 'the plan names no ways between its screens' } : {})
  }
}
