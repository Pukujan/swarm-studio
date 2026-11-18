// A game plan's next step, read from what the server really did (owner, 2026-11-14: "chat works for everything",
// "show, don't tell"). The planner chat (engine/talkplan.mjs) never says by itself that something is locked, painted,
// picked or underway: once a chat has its plan, the line that ends each of Hermia's turns and the buttons under it
// come from here, from the plan file, and every button runs what its label says (server/talk.mjs runs it through the
// Plan board's own routes, server/plans.mjs act).
//
//   planFacts(plan, env)        what is true now: the gate, the price, each sketch sheet with its picks, what is
//                               painted and what is painting, and each kind of picture (sheets, close-ups, sprites,
//                               models, mocks, backdrops) with its name, its own done and painting, and what is left
//   nextStep(chat, plan, env)   one line and the options for the one thing the person can do next
//   checkClaims(text, facts)    the planner's own words without the sentences that claim what did not happen
//   stepLineFor(chat, step)     the step's line, or '' when it is the very line already said: never said twice in a row
//   readPicks(text, sheet)      "hero 1 is 4, hero 2 is 7" -> the cells (0-based) with the hero's name as the note
//   goWords(text)               "lock", "do it", "go": the person said to do the next step
//   installLine(state)          the line while Godot 4 installs; godotOptions(again, route) the one button after it failed
//
// Pure functions: no store, no model, no paint.
import { planPrice, roster, is3d, sprites, stageCount } from './plan.mjs'
import { cutClaims } from './claims.mjs'

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

// Every kind of picture a plan paints, named so that a sentence about it can be checked (owner, 2026-11-17: the
// chat said "Repainting the mocks" and nothing was repainted). `names` are the words the planner uses for it, in
// the chat's own voice; `painting` counts only what is painting in the plan file right now, `done` what landed, and
// `queued` what the plan still has to paint: a sentence that claims one of those now or as done is checked against
// that name's own painting and done count, never against another kind's.
const pictures = (plan, p) => {
  const mocks = plan.mocks || [], backs = plan.backdrops || [], made = plan.build?.sprites || []
  const art = (plan.art?.shots || []).length
  // the plan's own count of backdrops, from the one place that decides it (engine/plan.mjs stageCount, the price's own)
  const stages = stageCount(plan)
  const perStage = Number(plan.settings?.backdropsPerStage ?? 3)
  return [
    { what: 'sheet', names: ['sketch sheet', 'sketch sheets', 'concept sheet', 'concept sheets', 'sheet', 'sheets'], done: (plan.sheets || []).filter(done).length, painting: (plan.sheets || []).filter(s => s.state === 'painting').length, queued: sheetKinds(plan).filter(k => (plan.sheets || []).find(s => s.kind === k)?.state !== 'done').length },
    // what the plan paints of its own kind: the 2D cut-outs, the close-ups of a cast, the 3D characters
    { what: p.what, names: [p.sub, p.what, p.what === 'cut-outs' ? 'cut outs' : '', ...(p.sub === 'build' ? ['build', 'builds'] : []), ...(p.sub === 'closeups' ? ['cut-in', 'cut-ins', 'cut in', 'cut ins', 'portrait', 'portraits'] : [])].filter(Boolean), done: p.done, painting: p.painting.length, queued: Math.max(0, p.total - p.done) },
    { what: 'sprite', names: ['sprite', 'sprites'], done: made.filter(done).length, painting: made.filter(s => s.state === 'painting').length, queued: Math.max(0, sprites(plan).length - made.filter(done).length) },
    { what: 'model', names: ['model', 'models', '3d model', '3d models', 'turnaround', 'turnarounds'], done: made.filter(done).length, painting: made.filter(s => s.state === 'painting').length, queued: Math.max(0, sprites(plan).length - made.filter(done).length) },
    { what: 'mock', names: ['mock', 'mocks', 'mock screen', 'mock screens', 'mock screenshot', 'mock screenshots', 'mockup', 'mockups', 'screen', 'screens', 'screenshot', 'screenshots'], done: mocks.filter(done).length, painting: mocks.filter(m => m.state === 'painting').length, queued: Math.max(0, (art || 5) - mocks.filter(done).length) },
    { what: 'backdrop', names: ['backdrop', 'backdrops', 'background', 'backgrounds', 'panorama', 'panoramas', 'sky', 'skybox'], done: backs.filter(done).length, painting: backs.filter(b => b.state === 'painting').length, queued: plan.shape?.backdrops === false ? 0 : Math.max(0, stages * perStage - backs.filter(done).length) }
  ]
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
    pictures: pictures(plan, p),
    styleLocked: !!plan.style?.locked,
    engine: target, godot: env.godot
  }
}

const priceLine = pr => `${plural(pr.images, 'picture')}${pr.credits ? ` and ${pr.credits} Meshy credits` : ', no credits'}`
export const lockLabel = pr => pr.credits ? `Lock · ${pr.credits} credits` : `Lock · ${plural(pr.images, 'picture')}`
const o = (id, label, why = '') => ({ id, label, why, made: [] })
// the line while Godot installs: the route, the size and how far the download is, when the route says
export const installLine = (i = {}) => i.route === 'templates'
  // the editor is in; its Web export templates are the second, larger download (engine/godotinstall.mjs)
  ? `Installing Godot's Web export templates now${i.mb ? `: ${i.mb} MB from Godot's releases` : ''}${i.pct ? ` (${i.pct}%)` : ''}.`
  : `Installing Godot 4 now${i.route === 'brew' ? ', with Homebrew' : i.mb ? `: ${i.mb} MB from Godot's releases` : ''}${i.route !== 'brew' && i.pct ? ` (${i.pct}%)` : ''}.`
// after an install failed, or a look that found nothing: the one action again, the look, and the way round
// after a failed install there is one way forward: Try again, or Check again when this kind of computer has no
// download (route 'none'); "check again" and "browser is fine" still work typed
export const godotOptions = (again, route) => again ? [route === 'none' ? o('do:godot:check', 'Check again') : o('do:godot', 'Try again')] : [o('do:godot', 'Install Godot 4'), o('do:godot:check', 'Check again'), o('do:browser', 'Browser is fine')]
// which cell's number is whose: the cast sheet's picks in order, one per hero
const pickedFor = (f, s) => s.kind === 'cast' ? f.cast.filter(n => Object.values(s.notes || {}).includes(n)) : []
const nextHero = (f, s) => s.kind === 'cast' ? f.cast.find(n => !Object.values(s.notes || {}).includes(n)) || null : null
// a sheet still waits on the person: done, not skipped, fewer picks than it needs
const waitsOnPicks = s => s.state === 'done' && !s.skipped && s.picks.length < s.needs

// The one next step. chat.godot is the person's answer to the Godot question ('install', 'web', or 'installing'
// while the install they asked for runs); env.install is that install's state (engine/godotinstall.mjs godotJob);
// chat.skip the sheets they went on without.
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
    return { text: `${tested}The plan is not locked yet. Lock it at about ${priceLine(f.price)}.`, options: [o('lock', lockLabel(f.price)), o('talk', 'Keep talking')], price: f.price }
  }
  if (f.engine === 'godot' && f.godot === false) {
    // an install the person asked for is running (one for the whole Studio): the chat waits on it, as on a painting
    const i = env.install
    if (i?.state === 'installing') return { text: installLine(i), options: [], wait: true, install: { pct: i.pct ?? null } }
    // 'installing' with no install running is an install that ended with the server: the question is open again
    if (!chat.godot || chat.godot === 'installing') return { text: 'Godot 4 is not installed on this computer. Install Godot 4, or is the browser fine?', options: [o('do:godot', 'Install Godot 4'), o('do:browser', 'Browser is fine')] }
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
  // THE HANDOVER TO THE BUILD (issue #666). With every picture painted this branch used to offer only "Read the plan":
  // the chat said "Next: build the game from the plan" and gave no way to build it, and it went on saying exactly that
  // after a build had failed, because the plan's own state has no idea the app engine ever ran. env.app is the app
  // engine's real state for this run (server/server.mjs chatTruth), so the one next step can be the build itself.
  const app = env.app || null
  if (app?.state === 'working') return { text: `The game is building.${godot}`, options: [], wait: true }
  if (app?.state === 'failed') {
    const why = String(app.message || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    return { text: `The game did not build${why ? `: ${why}` : ''}. Nothing in the plan is lost: the pictures are still painted.`, options: [o('do:app', 'Try again'), o('start:design', 'Read the plan')] }
  }
  if (app?.hasApp) return { text: `The game is built.${godot}`, options: [o('start:design', 'Read the plan')], done: true }
  return { text: `Every picture in the plan is painted.${godot} Next: build the game from the plan.`, options: [o('do:app', 'Build the game'), o('start:design', 'Read the plan')], done: true }
}

// ---------- the planner's own words, checked against the plan (the runner is every chat's: engine/claims.mjs)
const NOW = /\b(painting|drawing|underway|under way|in progress|on (it|its way)|(start|keep|begin)\w*\s+(on\s+)?(paint|draw)\w*|(paint|draw)\w*\s+(it|them|the\s+\w+)?\s*now)\b/i
const PAST = /\b(painted|drew|drawn|made|finished|already (did|done|have|got|made|started))\b/i
const ART = /\b(art|sprite|hero|fighter|character|picture|sheet|sketch|it|them)\b/i
// "the plan is not locked yet" is what the planner is told to say when it is not: only a lock claim without a "not"
// before it counts (the words between must not reach another clause, so "not now; locked" is still a claim)
const LOCK = /\block(ed)?\b/i
const NOT_LOCKED = /\b(?:not|never|isn['’]?t|aren['’]?t|no longer)\b[^.;:!?]{0,20}\block(ed)?\b/i
const PICK = /\b(picked|chosen|chose|roster (is )?(set|locked|confirmed))\b/i

// A first-person claim of an action (rank-juggler, 2026-11-16: "Repainting the mocks so they read as fast side-view
// arena combat", and no mock was ever painted in that chat). Whoever says it is the person's crew: the first person,
// "we", or a sentence that opens on the action itself ("Repainting the mocks", "Painting the backdrops now"), since a
// sentence with no subject still says the painting is his. "the painter is repainting the mocks" names the crew as
// the doer and is left to the NOW rule.
const ME = /\b(?:i|we|i['’](?:m|ve|d|ll)|we['’](?:re|ve|d|ll)|let me|let us|let['’]s)\b/i
const SELF_VERB = s => /^\s*(?:(?:ok(?:ay)?|sure|right|great|now|then|so|next|first|and)[,.!:]?\s+)?(?:i['’]?(?:m|ve|d|ll)?\s+|we['’]?(?:re|ve|d|ll)?\s+|just\s+|already\s+)*(?:re|un)?(?:painting|drawing|regenerating|refreshing|rendering|reworking|fixing|changing|redoing|paint|repaint|redraw|regenerate|refresh|render|rework|fix|change|redo)\w*/i.test(String(s))
// a word about repainting something that is not the crew's ("how do I install it myself?") is not a claim
const BLOCKED = /\b(?:cannot|can not|couldn['’]?t|can['’]?t|won['’]?t|will not|not able|unable|don['’]?t|does not|doesn['’]?t|never|no(?!t)\b)\b|\b(?:unless|if|when|once|after|before)\b(?!')|\b(?:you|your|yourself)\b/i
// every way the words say an action on the pictures: "repainting", "repaint", "repainted", "re-painted", "fixes",
// "changed", "regenerated". The whole word is taken (\w*), and its ending says the tense: -ing is the present, the
// one a promise or a report of work underway is in.
const ACT = /\b(re|un)?(paint|draw|regenerate|refresh|render|rework|fix|change|redo)\w*/gi
const acts = s => [...String(s).matchAll(ACT)].map(m => {
  // a full stop ends the sentence, not the verb
  const word = m[0].replace(/[.!?,;:]+$/, '').toLowerCase()
  return {
    present: /ing$/.test(word),
    // the tenses that say it happened: "repainted", "fixed", "changed"; a bare "repaint" only says what the person
    // may do, and is not a claim of the crew's
    done: /(?:ed|n|s|es)$/.test(word),
    whole: m[0]
  }
})
// the picture kinds the sentence names, each checked against its own painting and done count
const kindOf = (f, name) => (f.pictures || []).find(p => p.names.some(n => new RegExp(`(?:^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`, 'i').test(name))) || null
const namedKinds = s => [...String(s).matchAll(/\b[a-z][a-z'’-]*\b/gi)].map(m => m[0].toLowerCase())
// the pictures as a whole, when the sentence names a kind the plan does not paint on its own ("I'll fix the art",
// "I changed the character"): those are borne out only when everything the plan paints has landed
const ALL = /\b(?:art|artwork|sprite|sprites|close-?ups|characters?|models?|mock\w*|backdrops?|backgrounds?|panoramas?|pictures?|pieces|sheets?)\b/i
// what has landed, and what the plan still has to paint, across every kind of picture
const landedCount = f => f.pieces.done + (f.mocks?.done || 0) + (f.backdrops?.done || 0)
const stillToPaint = f => (f.pictures || []).reduce((n, p) => n + Math.max(0, p.queued || 0), 0)

// which sentences say something happened that the facts deny; returns { text, cut: [sentences] }
export function checkClaims(text, f) {
  const anyPicks = f.sheets.some(x => x.picks.length)
  const anyDone = f.sheets.some(x => x.state === 'done') || f.pieces.done > 0 || f.mocks.done > 0 || f.backdrops.done > 0
  const parts = { done: landedCount(f), left: stillToPaint(f) }
  return cutClaims(text, [
    { claims: s => NOW.test(s), ok: () => f.painting.length > 0 },
    { claims: s => PAST.test(s) && ART.test(s), ok: () => anyDone },
    { claims: s => LOCK.test(s) && !NOT_LOCKED.test(s), ok: () => !!f.locked },
    { claims: s => PICK.test(s), ok: () => anyPicks },
    // "Repainting the mocks" while the mocks are not painting, and "I repainted the mocks" when no mock has landed
    {
      claims: s => {
        if (BLOCKED.test(s) || !(ME.test(s) || SELF_VERB(s)) || !(kindOf(f, s) || ALL.test(s))) return false
        return acts(s).some(a => a.present || a.done)
      },
      ok: s => acts(s).every(a => {
        const named = new Set(namedKinds(s).map(w => kindOf(f, w)).filter(Boolean))
        const kinds = named.size ? [...named] : [null]
        if (a.present) return kinds.every(k => k ? k.painting > 0 : f.painting.length > 0)
        // a whole-pieces claim is borne out only when every piece the plan paints has landed
        return kinds.every(k => (k ? k.done > 0 : parts.done > 0 && parts.left === 0))
      })
    }
  ])
}

// ---------- the step's line, said once (rank-juggler, 2026-11-16: turns 46 to 54 all ended with the same sentence)
// "Painting the backdrops now. It shows on the board as it lands." It was stapled onto nine replies in a row, and
// once onto a turn that said the mocks had NOT been repainted: the person read a promise the board never made.
//
// What is dropped is only the echo: the same line, on the same step, when the reply above it already said something
// of its own. A turn whose words carry nothing but that line keeps it, because silence would be worse than a repeat:
//   - the person asked what is happening ("go", "what now?") and there is nothing else to say;
//   - a download is running (`installing`): "Installing Godot 4 now" is the only news there is;
//   - the step asks something (options, or a question mark): it is a decision still open, and asking again is the
//     whole point ("go" at the Godot question asks it again with its buttons, tests/rankjuggler.test.mjs).
// said: what the turn says besides the step's line (the planner's own answer, or the reason nothing happened).
export const stepLineFor = (chat, step, said = '') => {
  const line = String(step?.text || '').trim()
  if (!line) return ''
  if (step?.wait || step?.install) return line
  // A question is a decision still open, and asking it again is the point: "go" at the Godot question restates it with
  // its buttons. A question is recognised by its words, not by having buttons: every step carries buttons, so an
  // options guard here would make the dedupe dead code (it did, until tests/talkwords.test.mjs caught it).
  if (/\?\s*$/.test(line)) return line
  // a step whose whole job is to be chosen between (no sentence, only options) is asked again too
  if (!line.replace(/[.\s]+$/, '') && (step?.options || []).length) return line
  // nothing of its own to say: the line is the whole reply, and repeating it is the honest thing
  if (!String(said || '').trim()) return line
  const last = [...(chat?.turns || [])].reverse().find(t => t?.who === 'planner')
  if (!last || last.step !== true) return line
  // the reply above carried its own words too, so this line is an echo of the one it had
  const prior = String(last.text || '').trim()
  if (!(prior === line || prior.endsWith(` ${line}`))) return line
  const own = prior.slice(0, Math.max(0, prior.length - line.length)).trim()
  return own ? '' : line
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
