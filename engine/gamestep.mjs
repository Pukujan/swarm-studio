// A game plan's next step, read from what the server really did (owner, 2026-11-14: "chat works for everything",
// "show, don't tell"). The planner chat (engine/talkplan.mjs) never says by itself that something is locked, painted,
// picked or underway: once a chat has its plan, the line that ends each of Hermia's turns and the buttons under it
// come from here, from the plan file, and every button runs what its label says (server/talk.mjs runs it through the
// Plan board's own routes, server/plans.mjs act).
//
//   planFacts(plan, env)        what is true now: the gate, the price, each sketch sheet with its picks, what is
//                               painted and what is painting
//   nextStep(chat, plan, env)   one line and the options for the one thing the person can do next
//   checkClaims(text, facts)    the planner's own words without the sentences that claim what did not happen
//   readPicks(text, sheet)      "hero 1 is 4, hero 2 is 7" -> the cells (0-based) with the hero's name as the note
//   goWords(text)               "lock", "do it", "go": the person said to do the next step
//
// Pure functions: no store, no model, no paint.
import { planPrice, roster, is3d, sprites } from './plan.mjs'

const named = k => String(k).replace(/^\w/, c => c.toUpperCase())
const done = e => e?.state === 'done'
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// the sheets the board shows (web/plan.js sheetsOf, ui/src/screens/plan/model.ts)
export const sheetKinds = plan => plan?.art?.sheets ? plan.art.sheets.slice(0, plan.shape?.size === 'tiny' ? 2 : 4) : ['cast', 'weapons']

// what painting a plan's pieces means: the 3D turnarounds and models, a 2D plan's cut-out sprites, or (an action
// game drawn in 2D, whose art list is empty) the close-ups of its cast
export function pieces(plan) {
  if (is3d(plan)) {
    const chars = new Map((plan.build?.characters || []).map(c => [c.name, c]))
    const cast = roster(plan)
    return { what: 'characters', sub: 'build', total: cast.length, done: cast.filter(r => chars.get(r.name)?.state === 'done').length, painting: plan.build?.state === 'building' ? cast.map(r => r.name) : [] }
  }
  const list = sprites(plan)
  if (list.length) {
    const made = plan.build?.sprites || []
    return { what: 'sprites', sub: 'build', total: list.length, done: list.filter(x => done(made.find(y => y.name === x.name))).length, painting: made.filter(x => x.state === 'painting').map(x => x.name) }
  }
  if (plan.shape?.closeups === false) return { what: 'close-ups', sub: 'closeups', total: 0, done: 0, painting: [] }
  const chars = new Map((plan.build?.characters || []).map(c => [c.name, c]))
  const cells = roster(plan).flatMap(r => ['cutin', 'portrait'].map(w => ({ name: r.name, e: chars.get(r.name)?.[w] })))
  return { what: 'close-ups', sub: 'closeups', total: cells.length, done: cells.filter(c => done(c.e)).length, painting: [...new Set(cells.filter(c => c.e?.state === 'painting').map(c => c.name))] }
}

export function planFacts(plan, env = {}) {
  const price = planPrice(plan)
  const cast = roster(plan).map(r => r.name)
  const sheets = sheetKinds(plan).map(kind => {
    const s = (plan.sheets || []).find(x => x.kind === kind)
    const picks = s?.picks || []
    // the cast sheet wants one design for each hero; any other sheet one pick at least
    const needs = kind === 'cast' ? Math.max(1, cast.length) : 1
    return { kind, name: named(kind), id: s?.id || null, state: s?.state || 'none', src: s?.src || null, grid: s?.grid || [5, 4], picks, notes: s?.notes || {}, needs, skipped: (env.skip || []).includes(kind) }
  })
  const p = pieces(plan)
  const painting = [
    ...sheets.filter(s => s.state === 'painting').map(s => `the ${s.name} sketches`),
    ...((plan.mocks || []).some(m => m.state === 'painting') ? ['the mock screens'] : []),
    ...((plan.backdrops || []).some(b => b.state === 'painting') ? ['the backdrops'] : []),
    ...p.painting
  ]
  const target = plan.engine?.target || plan.starter?.engine || 'web'
  return {
    locked: !!plan.gate?.locked, phase: plan.gate?.phase || null,
    price: { images: price.images, credits: price.credits },
    cast, sheets, pieces: p, painting,
    mocks: { total: (plan.art?.shots?.length ?? 5), done: (plan.mocks || []).filter(done).length },
    backdrops: { on: plan.shape?.backdrops !== false, done: (plan.backdrops || []).filter(done).length },
    styleLocked: !!plan.style?.locked,
    engine: target, godot: env.godot
  }
}

const priceLine = pr => `${plural(pr.images, 'picture')}${pr.credits ? ` and ${pr.credits} Meshy credits` : ', no credits'}`
export const lockLabel = pr => pr.credits ? `Lock · ${pr.credits} credits` : `Lock · ${plural(pr.images, 'picture')}`
const o = (id, label, why = '') => ({ id, label, why, made: [] })
// which cell's number is whose: the cast sheet's picks in order, one per hero
const pickedFor = (f, s) => s.kind === 'cast' ? f.cast.filter(n => Object.values(s.notes || {}).includes(n)) : []
const nextHero = (f, s) => s.kind === 'cast' ? f.cast.find(n => !Object.values(s.notes || {}).includes(n)) || null : null
// a sheet still waits on the person: done, not skipped, fewer picks than it needs
const waitsOnPicks = s => s.state === 'done' && !s.skipped && s.picks.length < s.needs

// The one next step. chat.godot is the person's answer to the Godot question ('install' or 'web'); chat.skip the
// sheets they went on without.
// Returns { text, options, wait?, sheet?, price? }: wait is true while something paints (the board shows the crew on
// it and the chat checks again); sheet is the sketch sheet to show in the chat while its picks are asked.
export function nextStep(chat, plan, env = {}) {
  const f = planFacts(plan, { ...env, skip: chat.skip || [] })
  if (f.painting.length) {
    const p = f.pieces
    const count = p.painting.length && p.total ? ` (${p.done} of ${p.total} done)` : ''
    return { text: `Painting ${f.painting.join(', ')} now${count}. It shows on the board as it lands.`, options: [], wait: true }
  }
  if (!f.locked) {
    const tested = plan.gate?.tested ? `${plan.gate.tested} is painted: check it on the board. ` : ''
    return { text: `${tested}The plan is not locked yet, so nothing paints. Lock it at about ${priceLine(f.price)}.`, options: [o('lock', lockLabel(f.price)), o('talk', 'Keep talking')], price: f.price }
  }
  if (f.engine === 'godot' && f.godot === false && !chat.godot) {
    return { text: 'Godot 4 is not installed on this computer. Install Godot 4, or is the browser fine?', options: [o('do:godot', 'Install Godot 4'), o('do:browser', 'Browser is fine')] }
  }
  for (const s of f.sheets) {
    if (s.skipped) continue
    if (s.state === 'none' || s.state === 'failed') {
      // the first sheet is the one the rest follow; later ones can be skipped
      const opts = [o(`do:sheet:${s.kind}`, `Paint ${s.name} sketches · 1 picture`)]
      if (s !== f.sheets[0]) opts.push(o(`do:skip:${s.kind}`, 'Skip'))
      return { text: `${s.state === 'failed' ? `The ${s.name} sketches failed. ` : ''}Next: the ${s.name} sketch sheet, 20 options to pick from.`, options: opts }
    }
    if (waitsOnPicks(s)) {
      const [cols, rows] = s.grid
      const who = nextHero(f, s)
      const cells = Array.from({ length: cols * rows }, (_, i) => o(`do:cell:${s.id}:${i}${who ? `:${who}` : ''}`, String(i + 1)))
      const left = s.kind === 'cast' ? f.cast.filter(n => !pickedFor(f, s).includes(n)) : []
      const text = s.kind === 'cast'
        ? `The ${s.name} sheet waits on your picks: one number for ${left.join(', ')}. Tap the number for ${who}, or type "${f.cast.slice(0, 2).map((n, i) => `${n.toLowerCase()} is ${i * 3 + 4}`).join(', ')}".`
        : `The ${s.name} sheet waits on your pick: tap a number, or type it.`
      return { text, options: [...cells, o(`do:skip:${s.kind}`, 'Go on')], sheet: { id: s.id, src: s.src, grid: s.grid, picks: s.picks } }
    }
  }
  const p = f.pieces
  if (p.done < p.total) {
    const n = p.total - p.done
    return { text: `Every sheet is picked. Next: paint the ${p.what}, ${plural(n, 'picture')}.`, options: [o('do:paint', `Paint · ${plural(n, 'picture')}`)] }
  }
  if (f.mocks.done < f.mocks.total) {
    return { text: `The ${p.what} are painted. Next: the mock screens from your picks, ${plural(f.mocks.total - f.mocks.done, 'picture')}.`, options: [o('do:mocks', `Paint mocks · ${f.mocks.total - f.mocks.done}`)] }
  }
  if (f.backdrops.on && !f.backdrops.done) {
    return { text: 'Next: lock the look from your picks and paint the backdrops.', options: [o('do:backdrops', 'Lock look, paint backdrops')] }
  }
  const godot = f.engine === 'godot' && f.godot === false ? ' Godot 4 is still not installed, so the game builds for the browser until it is.' : ''
  return { text: `Every picture in the plan is painted.${godot} Next: build the game from the plan.`, options: [o('start:design', 'Read the plan')], done: true }
}

// ---------- the planner's own words, checked against the plan
const SENT = /[^.!?]+[.!?]*\s*/g
const NOW = /\b(painting|drawing|underway|under way|in progress|on (it|its way)|(start|keep|begin)\w*\s+(on\s+)?(paint|draw)\w*|(paint|draw)\w*\s+(it|them|the\s+\w+)?\s*now)\b/i
const PAST = /\b(painted|drew|drawn|made|finished|already (did|done|have|got|made|started))\b/i
const LOCK = /\block(ed)?\b/i
const PICK = /\b(picked|chosen|chose|roster (is )?(set|locked|confirmed))\b/i
// which sentences say something happened that the facts deny; returns { text, cut: [sentences] }
export function checkClaims(text, f) {
  const cut = []
  const keep = (String(text || '').match(SENT) || []).filter(s => {
    const anyPicks = f.sheets.some(x => x.picks.length)
    const anyDone = f.sheets.some(x => x.state === 'done') || f.pieces.done > 0 || f.mocks.done > 0 || f.backdrops.done > 0
    const bad = (NOW.test(s) && !f.painting.length) || (PAST.test(s) && !anyDone && /\b(art|sprite|hero|fighter|character|picture|sheet|sketch|it|them)\b/i.test(s)) ||
      (LOCK.test(s) && !f.locked) || (PICK.test(s) && !anyPicks)
    if (bad) cut.push(s.trim())
    return !bad
  })
  return { text: keep.join('').trim(), cut }
}

// ---------- the person's words
// "lock", "do it", "go", "go on", "yes", "paint it", "let's go": the next step's first option
export const GO = /^\s*(ok(ay)?[,!.\s]+)?(yes|yeah|yep|sure|lock( it)?( in)?|do it|go( ahead| on)?|let'?s go|start( it)?|paint( it| them)?|continue|next)[\s.!]*$/i
export const goWords = text => GO.test(String(text || ''))

// "hero 1 is 4, hero 2 is 7, hero 3 is 12" or "4, 7, 12" or "4": 1-based numbers on the sheet, each with its hero
export function readPicks(text, sheet, cast = []) {
  const t = String(text || '')
  const max = (sheet?.grid?.[0] || 5) * (sheet?.grid?.[1] || 4)
  const out = []
  const ok = n => Number.isInteger(n) && n >= 1 && n <= max
  for (const m of t.matchAll(/([a-z][a-z' ]*?\s*\d+)\s*(?:is|=|:|->|gets|takes|as)\s*(?:#|number\s+|no\.?\s*)?(\d+)/gi)) {
    const who = cast.find(n => n.toLowerCase() === m[1].trim().toLowerCase())
    const n = Number(m[2])
    if (who && ok(n)) out.push({ cell: n - 1, who })
  }
  if (out.length) return out
  // bare numbers, in the cast's order: only when the message is numbers and separators
  if (!/^[\s#\d,;.and&]+$/i.test(t.replace(/\b(and|&)\b/gi, ','))) return []
  const nums = [...t.matchAll(/\d+/g)].map(x => Number(x[0])).filter(ok)
  return nums.map((n, i) => ({ cell: n - 1, who: cast[i] || null }))
}
