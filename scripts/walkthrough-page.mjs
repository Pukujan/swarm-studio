// Builds docs/ux/walkthrough/index.html from shots.json (what scripts/walkthrough.mjs captured and
// measured) and notes.json (the review: a verdict per screen, the faults seen, and the fixes).
//
//   node scripts/walkthrough-page.mjs [--out docs/ux/walkthrough]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const OUT = resolve(ROOT, arg('out', 'docs/ux/walkthrough'))
const shots = JSON.parse(readFileSync(join(OUT, 'shots.json'), 'utf8'))
const notes = JSON.parse(readFileSync(join(OUT, 'notes.json'), 'utf8'))
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const SEV = { block: 'Blocks a newcomer', confusing: 'Confusing', cosmetic: 'Cosmetic' }
const RANK = { block: 0, confusing: 1, cosmetic: 2 }

// the measured faults, one line per kind per picture, each marked where it is
const AUTO = {
  tips: { rule: 'Standing rule 1: never tooltips', sev: 'confusing', say: a => `${a.length} tooltip${a.length > 1 ? 's' : ''} (title=): ${a.slice(0, 3).map(x => `“${x.tip}”`).join(', ')}` },
  raw: { rule: 'Rule 10: errors are a marker first; raw errors only behind Details', sev: 'confusing', say: a => `Raw error text on screen: “${a[0].text}”` },
  internal: { rule: 'No internal names shown to a person', sev: 'confusing', say: a => `Internal words on screen: ${a.slice(0, 3).map(x => `“${x.text}”`).join(', ')}` },
  colour: { rule: 'Standing rule 3: no blue, purple or green in the chrome', sev: 'cosmetic', say: a => `${[...new Set(a.map(x => x.hue))].join(' and ')} in the chrome: ${a.slice(0, 3).map(x => `${x.label || x.what} (${x.value})`).join(', ')}` },
  small: { rule: 'Rule 16: targets at least 40 px (44 on touch)', sev: 'cosmetic', say: a => `${a.length}${a.length >= 14 ? '+' : ''} targets too small: ${a.slice(0, 4).map(x => `${x.label || 'unnamed'} ${x.size}`).join(', ')}` },
  unnamed: { rule: 'Rule 12: every control has a name (aria-label)', sev: 'cosmetic', say: a => `${a.length} control${a.length > 1 ? 's' : ''} with no name` },
  sentences: { rule: 'Rule 8: at rest, names only; no helper sentences', sev: 'cosmetic', say: a => `Sentences at rest: ${a.slice(0, 2).map(x => `“${x.text}”`).join(', ')}` }
}

const byId = new Map()
for (const s of shots) { if (!byId.has(s.id)) byId.set(s.id, {}); byId.get(s.id)[s.width] = s }
const order = [...byId.keys()].sort((a, b) => (byId.get(a).desk?.n ?? byId.get(a).phone?.n) - (byId.get(b).desk?.n ?? byId.get(b).phone?.n))

let mark = 0
function picture(s, faults) {
  if (!s) return ''
  if (!s.reached) return `<figure class="miss"><figcaption>${s.width === 'desk' ? '1440' : '390'} wide: not reached (${esc(s.why)})</figcaption></figure>`
  const marks = faults.filter(f => f.box && f.width === s.width).map(f => {
    const [x, y, w, h] = f.box
    const st = `left:${(x / s.w * 100).toFixed(2)}%;top:${(y / s.h * 100).toFixed(2)}%;width:${Math.max(0.8, w / s.w * 100).toFixed(2)}%;height:${Math.max(0.8, h / s.h * 100).toFixed(2)}%`
    return `<i class="mk ${f.sev}" style="${st}"><b>${f.no}</b></i>`
  }).join('')
  return `<figure class="${s.width}"><div class="shot"><img src="${esc(s.file)}" alt="${esc(s.title)}, ${s.width === 'desk' ? '1440' : '390'} wide" loading="lazy">${marks}</div><figcaption>${s.width === 'desk' ? '1440' : '390'} wide</figcaption></figure>`
}

const rows = [], sections = []
for (const id of order) {
  const pair = byId.get(id), any = pair.desk || pair.phone, note = notes.screens?.[id] || {}
  if (note.skip) continue
  const faults = []
  // the review's own faults first (they are what a person would hit), then the measured ones it keeps
  for (const f of note.faults || []) {
    const s = pair[f.width || 'desk']
    let box = f.box
    if (!box && f.find && s?.audit) for (const k of Object.keys(AUTO)) { const hit = s.audit[k]?.find(x => (x.label + ' ' + (x.text || '')).toLowerCase().includes(f.find.toLowerCase())); if (hit) { box = hit.box; break } }
    faults.push({ ...f, width: f.width || 'desk', box, sev: f.sev || 'confusing' })
  }
  for (const w of ['desk', 'phone']) {
    const s = pair[w]
    if (!s?.audit) continue
    for (const [k, def] of Object.entries(AUTO)) {
      const a = s.audit[k]
      if (!a?.length || (note.drop || []).includes(k) || (note.drop || []).includes(`${w}:${k}`)) continue
      const first = { note: def.say(a), rule: def.rule, sev: def.sev, width: w, auto: true }
      faults.push({ ...first, box: a[0].box })
      for (const x of a.slice(1, 8)) faults.push({ ...first, box: x.box, extra: true })
    }
    if (s.audit.overflow) faults.push({ note: 'The page scrolls sideways', rule: 'Rule 25: at 390 nothing scrolls sideways', sev: 'confusing', width: w, auto: true })
  }
  let no = 0
  for (const f of faults) f.no = f.extra ? no : ++no
  const listed = faults.filter(f => !f.extra)
  const worst = listed.reduce((m, f) => Math.min(m, RANK[f.sev] ?? 2), 3)
  const sev = note.sev || (['block', 'confusing', 'cosmetic'][worst] ?? 'ok')
  const reached = pair.desk?.reached || pair.phone?.reached
  rows.push(`<tr><td><a href="#${esc(id)}">${esc(any.title)}</a></td><td class="num">${reached ? listed.length : '–'}</td><td><span class="sev ${reached ? sev : 'miss'}">${reached ? SEV[sev] || 'Fine' : 'Not reached'}</span></td></tr>`)
  sections.push(`<section id="${esc(id)}">
  <h2><span class="flow">${esc(any.flow || '')}</span>${esc(any.title)}</h2>
  <p class="verdict">${esc(note.verdict || (reached ? '' : 'Not reached in this pass.'))}</p>
  <div class="pics">${picture(pair.desk, faults)}${picture(pair.phone, faults)}</div>
  ${listed.length ? `<ol class="faults">${listed.map(f => `<li value="${f.no}" class="${f.sev}"><span class="sev ${f.sev}">${SEV[f.sev]}</span> ${esc(f.note)} <em>${esc(f.rule || '')}${f.width === 'phone' ? ' · at 390' : ''}${f.auto ? ' · measured' : ''}</em></li>`).join('')}</ol>` : ''}
</section>`)
  mark += listed.length
}

const fixes = (notes.fixes || []).map(g => `<h3>${esc(g.owner)}</h3><ol>${g.items.map(i => `<li><span class="sev ${i.sev}">${SEV[i.sev]}</span> ${esc(i.text)}</li>`).join('')}</ol>`).join('')
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Studio walkthrough</title>
<style>
:root { color-scheme: dark; --bg: #0b0b0c; --panel: #151517; --line: #2a2a2e; --text: #ececee; --muted: #9a9aa2; --block: #ff5b5b; --confusing: #f2b84b; --cosmetic: #a1a1aa; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, sans-serif; }
main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 80px; }
h1 { font-size: 28px; margin: 0 0 8px; } h2 { font-size: 19px; margin: 0 0 4px; } h3 { font-size: 16px; margin: 24px 0 8px; }
p, li { color: var(--text); } .lede { color: var(--muted); max-width: 820px; }
a { color: var(--text); }
table { border-collapse: collapse; width: 100%; margin: 16px 0 40px; font-size: 14px; }
td, th { border-bottom: 1px solid var(--line); padding: 7px 8px; text-align: left; vertical-align: top; } th { color: var(--muted); font-weight: 500; }
td.num { text-align: right; width: 64px; }
.sev { display: inline-block; font-size: 12px; padding: 1px 7px; border-radius: 9px; border: 1px solid currentColor; white-space: nowrap; }
.sev.block { color: var(--block); } .sev.confusing { color: var(--confusing); } .sev.cosmetic { color: var(--cosmetic); } .sev.ok { color: var(--muted); } .sev.miss { color: var(--muted); border-style: dashed; }
section { border-top: 1px solid var(--line); padding: 28px 0; }
.flow { color: var(--muted); font-weight: 400; margin-right: 8px; }
.verdict { margin: 0 0 14px; color: var(--muted); }
.pics { display: flex; gap: 16px; align-items: flex-start; }
figure { margin: 0; } figure.desk { flex: 1 1 auto; min-width: 0; } figure.phone { flex: 0 0 210px; }
figcaption { color: var(--muted); font-size: 12px; margin-top: 4px; }
.miss figcaption { border: 1px dashed var(--line); padding: 12px; }
.shot { position: relative; border: 1px solid var(--line); line-height: 0; }
.shot img { width: 100%; height: auto; display: block; }
.mk { position: absolute; border: 2px solid var(--confusing); border-radius: 3px; pointer-events: none; }
.mk.block { border-color: var(--block); } .mk.cosmetic { border-color: var(--cosmetic); border-style: dashed; }
.mk b { position: absolute; left: -2px; top: -18px; font: 700 11px/16px system-ui; background: var(--confusing); color: #000; padding: 0 5px; border-radius: 3px; }
.mk.block b { background: var(--block); } .mk.cosmetic b { background: var(--cosmetic); }
ol.faults { margin: 14px 0 0; padding-left: 26px; } ol.faults li { margin: 4px 0; } ol.faults em { color: var(--muted); font-style: normal; font-size: 13px; }
.unreached li { color: var(--muted); }
@media (max-width: 760px) { .pics { flex-direction: column; } figure.phone { flex: none; width: 60%; } }
</style></head><body><main>
<h1>Studio walkthrough</h1>
<p class="lede">${esc(notes.intro || '')}</p>
<table><thead><tr><th>Screen</th><th class="num">Faults</th><th>Worst</th></tr></thead><tbody>${rows.join('')}</tbody></table>
${sections.join('\n')}
<section id="fixes"><h2>Fixes, ranked, by who owns them</h2>${fixes}</section>
<section id="unreached"><h2>Not reached</h2><ul class="unreached">${(notes.unreached || []).map(u => `<li>${esc(u)}</li>`).join('')}</ul></section>
</main></body></html>`
writeFileSync(join(OUT, 'index.html'), html)
console.log(`${sections.length} screens, ${mark} faults → ${join(OUT, 'index.html')}`)
