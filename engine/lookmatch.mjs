// The visual match check (docs/decisions/0022-copy-the-look-from-a-link.md, "The visual match check is next"): how
// close the crew's build is to the STYLE of a reference the person gave, not to its layout or content. The
// build's own exported pages are walked with the same browser and the same measurements as the reference
// (engine/sitelook.mjs), so the two are compared like for like: colours, type, corners, small labels, motion.
// A vision model then looks at both sets of shots and names the top differences. Nothing is fixed here: the
// person sees the pair and presses Fix on a difference, which goes to the crew like a comment (0020: only the
// person starts work).
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { walkSite } from './sitelook.mjs'
import { scrubber } from './reference.mjs'

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const rgb = h => [1, 3, 5].map(i => parseInt(String(h || '#000000').slice(i, i + 2), 16))
// how far apart two colours are, 0 (same) to 1 (black to white)
export const colourGap = (a, b) => { if (!a || !b) return a === b ? 0 : 1; const x = rgb(a), y = rgb(b); return Math.sqrt(x.reduce((n, v, i) => n + (v - y[i]) ** 2, 0)) / 441.67 }

// measured differences, biggest first: [{ part, weight, ref, ours, say, fix }]
export function compareTokens(ref, ours, refMotion = null, ourMotion = null) {
  if (!ref || !ours) return []
  const out = []
  const colour = (part, name, w) => {
    const g = colourGap(ref[part], ours[part])
    if (ref[part] && g > 0.12) out.push({ part: name, weight: w * Math.min(1, g * 2), ref: ref[part], ours: ours[part] || 'none', say: `${name} is ${ours[part] || 'missing'}, the reference has ${ref[part]}`, fix: `Change the ${name.toLowerCase()} colour to ${ref[part]} on every page.` })
  }
  colour('bg', 'Background', 30); colour('text', 'Text', 15); colour('accent', 'Accent', 25)
  const f = ref.fonts || {}, g = ours.fonts || {}
  if (f.display?.kind && f.display.kind !== g.display?.kind) out.push({ part: 'Headings', weight: 20, ref: f.display.kind, ours: g.display?.kind || 'none', say: `headings are ${g.display?.kind || 'unset'}, the reference uses ${f.display.kind}`, fix: `Set the headings in a ${f.display.kind} typeface${f.display.weight >= 700 ? ', heavy weight' : ''}.` })
  if (f.display && !!f.display.upper !== !!g.display?.upper) out.push({ part: 'Headings', weight: 10, ref: f.display.upper ? 'uppercase' : 'mixed case', ours: g.display?.upper ? 'uppercase' : 'mixed case', say: `headings are ${g.display?.upper ? 'uppercase' : 'mixed case'}, the reference is ${f.display.upper ? 'uppercase' : 'mixed case'}`, fix: `Make the big headings ${f.display.upper ? 'uppercase' : 'mixed case, not uppercase'}.` })
  if (f.body?.kind && f.body.kind !== g.body?.kind) out.push({ part: 'Body text', weight: 12, ref: f.body.kind, ours: g.body?.kind || 'none', say: `body text is ${g.body?.kind || 'unset'}, the reference uses ${f.body.kind}`, fix: `Set the body text in a ${f.body.kind} typeface.` })
  if (f.label && !g.label) out.push({ part: 'Labels', weight: 10, ref: `${f.label.kind} labels`, ours: 'none', say: `no small ${f.label.upper ? 'uppercase ' : ''}${f.label.kind} labels like the reference has`, fix: `Add small ${f.label.upper ? 'uppercase ' : ''}${f.label.kind} labels${f.label.tracking >= 0.05 ? ' with wide letter spacing' : ''} above headings and in the navigation.` })
  if (ref.radius && ref.radius !== ours.radius) { const sq = r => r === '0px'; if (sq(ref.radius) !== sq(ours.radius) || (ref.radius === 'pill') !== (ours.radius === 'pill')) out.push({ part: 'Corners', weight: 8, ref: ref.radius, ours: ours.radius, say: `corners are ${ours.radius}, the reference has ${ref.radius}`, fix: `Make the corners ${ref.radius === '0px' ? 'square' : ref.radius === 'pill' ? 'fully round' : `rounded about ${ref.radius}`}.` }) }
  if (f.display && ref.sizes?.biggest && ours.sizes?.biggest && ours.sizes.biggest < ref.sizes.biggest * 0.6) out.push({ part: 'Scale', weight: 10, ref: `${ref.sizes.biggest}px`, ours: `${ours.sizes.biggest}px`, say: `the biggest heading is ${ours.sizes.biggest}px, the reference goes to ${ref.sizes.biggest}px`, fix: `Make the main heading much bigger, about ${ref.sizes.biggest}px on desktop.` })
  if (refMotion && ourMotion && refMotion.animations > 3 && !ourMotion.animations) out.push({ part: 'Motion', weight: 10, ref: 'animated', ours: 'still', say: 'nothing moves; the reference has animation', fix: 'Add gentle motion in the same feel: sections that ease in, and one slow looping accent.' })
  return out.sort((a, b) => b.weight - a.weight)
}
// 100 is the same style; each difference takes its weight off
export const scoreOf = diffs => Math.max(0, Math.round(100 - diffs.reduce((n, d) => n + d.weight, 0)))

export const MATCH_RULES = `You are an art director checking how well a new site matches the STYLE of a reference site. The first pictures are the reference, the rest are the new site. Judge only style: colour, typography, spacing and density, shapes and borders, texture and glow, motion feel, mood. Do NOT ask for the same layout, the same sections, the same words or the same pictures: the new site is an original and must stay one. Never name the reference, its owner or brands, and never quote its words. If the person said what they want from the reference, weigh that most. Return JSON only:
{"score":0-100,"close":"what already matches, under 16 words","diffs":[{"part":"one or two words","say":"the difference in under 18 words","fix":"an instruction to the builders that closes it, under 28 words"}]}
Give at most 3 diffs, the biggest first, and none if the style already matches.`

export function matchMessages({ ref, ours, want = '', measured = [] }) {
  const content = [{ type: 'text', text: `${want ? `What the person wants from the reference: ${clip(want, 300)}\n` : ''}Measured differences: ${JSON.stringify(measured.map(d => d.say)).slice(0, 1200)}\nReference: ${ref.length} picture(s). New site: ${ours.length} picture(s).` }]
  for (const s of [...ref, ...ours]) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(s).toString('base64')}` } })
  return [{ role: 'system', content: MATCH_RULES }, { role: 'user', content }]
}

// ref: { tokens, motion, shots: [Buffer] }; ours: a walk of the build ({ tokens, motion, pages }).
// chat(messages) -> text or null. Returns { score, close, diffs: [{ part, say, fix }], by }.
export async function judgeMatch({ ref, ours, want = '', avoid = [], chat = null }) {
  const measured = compareTokens(ref.tokens, ours.tokens, ref.motion, ours.motion)
  const plain = { score: scoreOf(measured), close: '', diffs: measured.slice(0, 3).map(({ part, say, fix }) => ({ part, say, fix })), by: 'measured' }
  if (!chat) return plain
  try {
    const mine = ours.pages.flatMap(p => p.shots.slice(0, 1)).slice(0, 2)
    const theirs = (ref.shots || []).slice(0, 2)
    if (!mine.length || !theirs.length) return plain
    const t = String(await chat(matchMessages({ ref: theirs, ours: mine, want, measured })) || '')
    const said = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))
    const clean = scrubber(avoid)
    const diffs = (Array.isArray(said.diffs) ? said.diffs : []).map(d => ({ part: clip(clean(d.part), 24), say: clip(clean(d.say), 160), fix: clip(clean(d.fix), 240) })).filter(d => d.say && d.fix).slice(0, 3)
    const score = Math.round(Number(said.score))
    if (!Number.isFinite(score)) return plain
    return { score: Math.max(0, Math.min(100, score)), close: clip(clean(said.close), 140), diffs, by: 'model' }
  } catch { return plain }
}

// the build's exported pages, walked like the reference was. htmlDir: the export's html folder; files: its pages.
export async function walkBuild({ htmlDir, files, dataDir, pages = 2, launch, signal }) {
  const urls = files.filter(f => existsSync(join(htmlDir, f))).slice(0, pages).map(f => pathToFileURL(join(htmlDir, f)).href)
  if (!urls.length) return { pages: [], tokens: null, motion: null, note: 'nothing built yet' }
  return walkSite(urls[0], { dataDir, pages, shots: 2, allowPrivate: true, urls, launch, signal })
}

// what the crew is told when the person presses Fix on a difference
export const fixText = (d, host = '') => clip(`Style fix, to match the look the owner chose${host ? ` (their reference, ${host})` : ''}: ${d.fix} Change only the style; keep the layout, the words and the pictures as they are.`, 600)
