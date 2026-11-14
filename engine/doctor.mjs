// Fix mode (docs/specs/45-chat-modes.md): what is wrong with Swarm Studio's own working parts, as
// opposed to the project. The doctor only gathers facts and says what they mean. It installs nothing,
// restarts nothing and changes nothing: the next step is either an action the person presses (or types
// yes to), which runs a route that already exists, or a command the person runs themselves.
//
// Facts (server/server.mjs gathers them; everything here is pure):
//   parts    every part of Setup › Parts with its live state: the same list and the same state
//            functions the Setup sheet draws (web/setup-parts.js GROUPS), run on the server
//   run      the open build's recent failures, read from its events
//   python   which Python the cutters use and which of numpy, scipy and PIL each candidate lacks
//   hermes   whether Hermes is attached
//   models   the planner, builder, reviewer, image and video models that are set
import { HONEST_RULE, CANNOT, honestly } from './honest.mjs'

const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// ---------- parts: Setup's own list, with the state each part has now
// groups: web/setup-parts.js GROUPS; F: what its state functions read ({ view, hermes, models, local, media, publish, conn, gateway })
export function partStates(groups, F = {}) {
  const out = []
  for (const g of groups || []) for (const p of g.parts || []) {
    let s = { st: 'wait', why: '' }, fix = null
    try { s = p.state(F) || s } catch {}
    try { fix = p.fix ? p.fix(F) : null } catch {}
    out.push({ k: p.k, name: p.name, group: g.k, groupName: g.name, need: !!p.need, st: s.st, why: clean(s.why, 160), for: p.for || '', without: p.without || '',
      // what the Setup sheet would offer: a row to open, a command to copy, a link; never a key's value
      fix: fix ? { ...(fix.row ? { row: fix.row } : {}), ...(fix.cmd ? { cmd: clean(fix.cmd, 200) } : {}), ...(fix.note ? { note: clean(fix.note, 200) } : {}), ...(fix.link ? { link: fix.link } : {}) } : null })
  }
  return out
}
// a part that stops something: set up and not working, or needed and not set up
export const brokenParts = parts => (parts || []).filter(p => p.st === 'fail' || (p.need && p.st === 'off'))

// ---------- the open build's failures, from its events (newest last)
// A failure that was put right later does not count: a section built after it failed, a picture
// painted after it failed, an app build that ended well after the failed step.
const STOPPED = /^(stopped|aborted)$/i
export function failuresOf(events = [], { limit = 12 } = {}) {
  const out = []
  const later = (i, test) => events.slice(i + 1).some(test)
  // steps count only from the app's last start: an older build's failed steps are history
  const lastStart = events.findLastIndex(e => e.type === 'app:start')
  const lastApp = events.findLast(e => ['app:start', 'app:done', 'app:failed', 'app:paused'].includes(e.type))
  events.forEach((e, i) => {
    if (e.type === 'layer:failed' && !STOPPED.test(e.message || '')) {
      if (later(i, x => (x.type === 'layer:done' || x.type === 'layer:start') && x.layer === e.layer && x.page === e.page)) return
      out.push({ kind: 'section', t: e.t || 0, what: clean(`${e.page || ''} › ${e.layer || ''}`, 120), message: clean(e.message), page: e.page, layer: e.layer })
    } else if (e.type === 'image:failed' && !STOPPED.test(e.message || '')) {
      if (later(i, x => x.type === 'image' && x.layer === e.layer && x.page === e.page && x.gen === e.gen)) return
      out.push({ kind: 'picture', t: e.t || 0, what: clean(e.gen || `${e.page || ''} › ${e.layer || ''}`, 120), message: clean(e.message), page: e.page, layer: e.layer, gen: e.gen })
    } else if (e.type === 'app:failed' && e === lastApp) {
      out.push({ kind: 'app', t: e.t || 0, what: 'the app build', message: clean(e.message) })
    } else if (e.type === 'app:step' && e.step?.ok === false && i > lastStart) {
      out.push({ kind: 'step', t: e.t || e.step.t || 0, what: clean(e.step.kind || 'step', 40), message: clean(e.step.text) })
    }
  })
  return out.slice(-limit)
}

// ---------- what a failure message means: the Studio's own tooling, a model or connection, or the project
const PIP = { PIL: 'pillow', cv2: 'opencv-python', yaml: 'pyyaml', sklearn: 'scikit-learn' }
export const pipName = mod => PIP[mod] || mod
// -> { where: 'studio' | 'model' | 'project' | 'unknown', cause, module?, program? }
export function causeOf(message = '') {
  const m = String(message)
  let x
  if ((x = /No module named ['"]?([\w.]+)['"]?/i.exec(m))) return { where: 'studio', cause: `the Python that Swarm Studio ran has no ${x[1].split('.')[0]} module`, module: x[1].split('.')[0] }
  if ((x = /spawn (\S+) ENOENT|(\S+): command not found|['"]?([\w.-]+)['"]? is not (?:installed|recognized)/i.exec(m))) return { where: 'studio', cause: `the program ${x[1] || x[2] || x[3]} is not on this computer (or not on the PATH)`, program: x[1] || x[2] || x[3] }
  if (/Godot 4 was asked for but is not installed/i.test(m)) return { where: 'studio', cause: 'Godot 4 is not installed on this computer', program: 'godot' }
  if (/hermes is not|hermes (closed|disappeared|did not answer)|ECONNREFUSED|socket hang up/i.test(m)) return { where: 'model', cause: 'Hermes did not answer', part: 'hermes' }
  if (/\b(401|403)\b|unauthori[sz]ed|invalid api key|not signed in|no image model|no planner model|no model/i.test(m)) return { where: 'model', cause: 'a model or its sign-in is not set up', part: /image|picture|paint/i.test(m) ? 'pictures' : 'planner' }
  if (/\b(429|402)\b|usage limit|quota|rate.?limit|insufficient|no capacity|is busy at the provider|overloaded/i.test(m)) return { where: 'model', cause: 'the model provider refused: out of quota, or busy', part: /image|picture|paint/i.test(m) ? 'pictures' : 'builders' }
  if (/timed? ?out|ETIMEDOUT|aborted due to timeout/i.test(m)) return { where: 'model', cause: 'a call took too long and was given up' }
  if (/typecheck|did not pass its build|play test|TS\d{4}|SyntaxError|Godot reports \d+ error/i.test(m)) return { where: 'project', cause: 'the project\'s own code or play test' }
  return { where: 'unknown', cause: '' }
}

// ---------- which Python the cutters use (scripts/cutout.py and the sheet cutter need numpy, scipy and PIL)
export const CUT_MODULES = ['numpy', 'scipy', 'PIL']
// candidates: the Pythons tried, in order; missing(py) -> the modules of CUT_MODULES it cannot import,
// or null when that Python does not run. inUse: what the running server settled on at its first cut
// (it keeps that until it restarts), or undefined when it has not cut anything yet.
// -> { use, tried: [{ py, missing | null }], inUse?, restart }
export async function pythonFacts({ candidates = [], missing, inUse } = {}) {
  const tried = []
  for (const py of candidates.filter(Boolean)) tried.push({ py, missing: await missing(py).catch(() => null) })
  const use = tried.find(t => t.missing && !t.missing.length)?.py || null
  // a Python that works now, while the server still holds "none": it looked before the packages were there
  return { use, tried, ...(inUse !== undefined ? { inUse } : {}), restart: inUse === null && !!use }
}
// the exact command that puts the missing modules into the first Python that runs
export function pythonCommand(python) {
  const first = (python?.tried || []).find(t => t.missing)
  if (!first || !first.missing.length) return ''
  return `${first.py} -m pip install ${first.missing.map(pipName).join(' ')}`
}

// ---------- actions: only routes that already exist, each needing the person's press or typed yes
//   setup      opens the Setup sheet on the part (window.SwarmSetup.open)
//   repaint    POST /api/runs/<id>/image    one failed picture, painted again
//   resume     POST /api/runs/<id>/resume   a website's unfinished sections, built in its next version
//   app-again  POST /api/runs/<id>/app      an app or game that never built, tried again (the App room's Try again)
export function actionsFor(facts = {}) {
  const out = []
  const run = facts.run?.id || null
  const fails = facts.run?.failures || []
  const broken = brokenParts(facts.parts)
  // the part a failure points at comes first, then every other part that is not working
  const named = fails.map(f => causeOf(f.message).part).filter(Boolean)
  const parts = [...broken.filter(p => named.includes(p.k)), ...broken.filter(p => !named.includes(p.k))]
  for (const p of parts.slice(0, 3)) out.push({ id: `setup:${p.k}`, kind: 'setup', part: p.k, group: p.group, row: p.fix?.row || 'parts', label: `Open Setup: ${p.name}`, does: `opens Setup on ${p.name} (${p.why || p.st})` })
  // a failure caused by the Studio's own tooling comes back if it is run again as it is: no re-run is offered for it
  const rerun = f => causeOf(f.message).where !== 'studio'
  const pic = fails.findLast(f => f.kind === 'picture' && f.page && f.layer && f.gen && rerun(f))
  if (run && pic) out.push({ id: 'repaint', kind: 'repaint', run, page: pic.page, layer: pic.layer, gen: pic.gen, label: 'Paint it again', does: `paints the picture "${clean(pic.gen, 60)}" again` })
  if (run && !facts.run.working && fails.some(f => f.kind === 'section' && rerun(f))) out.push({ id: 'resume', kind: 'resume', run, label: 'Finish the build', does: 'builds the sections that failed, in the project\'s next version' })
  // (a failed change to an app that is built has no route that sends the same words again: it is typed again)
  if (run && !facts.run.working && !facts.run.built && fails.some(f => f.kind === 'app' && rerun(f))) out.push({ id: 'app-again', kind: 'app-again', run, label: 'Build again', does: `builds the ${facts.run.kind === 'game' ? 'game' : 'app'} again` })
  return out
}

// ---------- the facts as plain lines: what the model is given, and what is said when there is no model
const ST = { ok: 'working', later: 'installs on first use', off: 'not set up', fail: 'NOT WORKING', wait: 'not known yet' }
export function factLines(facts = {}) {
  const lines = []
  const fails = facts.run?.failures || []
  if (facts.run) {
    lines.push(`The open ${facts.run.kind === 'game' ? 'game' : facts.run.kind === 'app' ? 'app' : 'build'}${facts.run.working ? ' (building now)' : ''}: ${fails.length ? `${fails.length} recent failure${fails.length === 1 ? '' : 's'}` : 'no failures in its log'}.`)
    for (const f of fails) { const c = causeOf(f.message); lines.push(`- ${f.kind} (${f.what}): ${f.message || 'no message'}${c.where !== 'unknown' ? ` [${c.where === 'studio' ? "the Studio's tooling" : c.where === 'model' ? 'a model or connection' : 'the project'}: ${c.cause}]` : ''}`) }
  } else lines.push('No build is open.')
  if (facts.hermes) lines.push(`Hermes: ${facts.hermes.attached ? 'attached' : `not attached${facts.hermes.message ? ` (${clean(facts.hermes.message, 160)})` : ''}`}.`)
  if (facts.models) lines.push(`Models: ${['planner', 'worker', 'reviewer', 'image', 'video'].map(r => `${r === 'worker' ? 'builders' : r} ${facts.models[r] || 'none'}`).join(', ')}.`)
  if (facts.python) {
    const p = facts.python
    lines.push(`Python for cutting out sprites (needs ${CUT_MODULES.join(', ')}): ${p.use ? `${p.use} has all three` : 'no Python here has all three'}${p.restart ? '; the running Studio looked before they were installed and still has none, so it needs a restart' : ''}.`)
    for (const t of p.tried) if (!p.use || t.missing === null || t.missing.length) lines.push(`- ${t.py}: ${t.missing === null ? 'does not run' : t.missing.length ? `lacks ${t.missing.join(', ')}` : 'has all three'}`)
    const cmd = pythonCommand(p)
    if (!p.use && cmd) lines.push(`- To add them: ${cmd}`)
  }
  const parts = facts.parts || []
  if (parts.length) {
    const broken = brokenParts(parts), off = parts.filter(p => p.st === 'off' && !p.need)
    lines.push(`Setup parts: ${parts.filter(p => p.st === 'ok').length} of ${parts.length} working.`)
    for (const p of broken) lines.push(`- ${p.name}: ${ST[p.st]}${p.why ? ` (${p.why})` : ''}${p.without ? `. Without it: ${p.without}` : ''}${p.fix?.cmd ? ` Fix: ${p.fix.cmd}` : p.fix?.note ? ` Fix: ${p.fix.note}` : ''}`)
    if (off.length) lines.push(`- Not set up, optional: ${off.map(p => p.name).join(', ')}.`)
  }
  return lines
}

// what failed and the one next step, with no model to word it: the facts, plainly
export function plainReply(facts = {}, actions = actionsFor(facts)) {
  const fails = facts.run?.failures || []
  const last = fails.findLast(f => causeOf(f.message).where === 'studio') || fails.at(-1)
  const out = []
  if (last) {
    const c = causeOf(last.message)
    out.push(`What failed: ${last.what}: ${last.message || 'no message'}.`)
    out.push(c.where === 'studio' ? `That is Swarm Studio's own tooling, not your project: ${c.cause}.` : c.where === 'model' ? `That is a model or connection, not your project: ${c.cause}.` : c.where === 'project' ? `That is in the project itself: ${c.cause}.` : 'The log does not say whether that is the Studio or the project.')
    const cmd = c.module && facts.python && !facts.python.use ? pythonCommand(facts.python) || `python3 -m pip install ${pipName(c.module)}` : ''
    if (cmd) out.push(`Next step: run this in a terminal on this computer, then restart Swarm Studio: ${cmd}`)
    else if (c.module && facts.python?.restart) out.push('Next step: restart Swarm Studio. The packages are there now, and it looked before they were.')
    else if (c.module && facts.python?.use) out.push(`Next step: nothing to install. ${facts.python.use} has the packages; update Swarm Studio so its cutters use it, then build again.`)
  } else out.push(facts.run ? 'Nothing failed in this build\'s log.' : 'No build is open, so there is no log to read.')
  const rest = factLines(facts).filter(l => !/^The open |^No build is open|^- (section|picture|app|step) \(/.test(l))
  if (rest.length) out.push(rest.join('\n'))
  if (actions.length && !out.some(l => l.startsWith('Next step'))) out.push(`Next step: ${actions[0].label}.`)
  return out.join('\n')
}

export const DOCTOR_PROMPT = (facts, actions) => `You are Hermia, the planner of Swarm Studio's crew. The chat is in Fix mode: the person wants to know what is wrong with Swarm Studio's own working parts (its tools, models and connections) rather than with their project.

From the facts below, say in two to five short plain sentences, with no markdown and no lists: what failed; whether it is the Studio's tooling, a model or connection, or the project itself; the cause; and the ONE next step. If nothing failed, answer what they asked from the facts: what is working and what is not set up. If the facts do not show it, say that you cannot see it from here.

${HONEST_RULE} The next step is one of the actions listed below, which the person presses or types yes to, or a command the person runs themselves: give the exact command from the facts and say where to run it (a terminal on this computer). Never invent a command, an action or a setting.

Reply with ONE JSON object and nothing else: {"say":"…","offer":["action id"]}. "offer" holds at most two ids from the list of actions, the next step first, or [] when no action fits.

Facts:
${factLines(facts).join('\n')}

Actions you may offer:
${actions.map(a => `- ${a.id}: ${a.does}`).join('\n') || '- none'}`

// the model's reply -> { say, offer: [ids] }; a reply that is not the JSON asked for is taken as the words
export function readDoctor(text) {
  const s = String(text || '').trim()
  const at = s.indexOf('{')
  if (at >= 0) try {
    const j = JSON.parse(s.slice(at, s.lastIndexOf('}') + 1))
    if (j && typeof j.say === 'string') return { say: j.say.trim(), offer: Array.isArray(j.offer) ? j.offer.map(String) : [] }
  } catch {}
  return { say: /^\s*[{[]/.test(s) ? '' : s.replace(/^```\w*|```$/g, '').trim(), offer: [] }
}

// One diagnosis. chat(messages) -> text, or null when there is no model: the facts are listed plainly.
// -> { reply, actions: [the offered ones, in full], by: 'model' | 'facts' }
export async function diagnose({ facts = {}, text = '', chat = null }) {
  const actions = actionsFor(facts)
  const plain = () => ({ reply: plainReply(facts, actions), actions: actions.slice(0, 1), by: 'facts' })
  if (!chat) return plain()
  const messages = [{ role: 'system', content: DOCTOR_PROMPT(facts, actions) }, { role: 'user', content: clean(text, 1200) || 'What is wrong?' }]
  try {
    const first = readDoctor(await chat(messages))
    if (!first.say) return plain()
    const say = await honestly({ answer: first.say, text, again: async note => readDoctor(await chat([...messages, { role: 'assistant', content: JSON.stringify(first) }, { role: 'user', content: `${note} Reply with the same JSON shape.` }])).say })
    // a model that keeps claiming it will fix things itself is not quoted: the facts are
    if (say === CANNOT) return plain()
    // only actions from the list, never one the model made up
    const offered = first.offer.map(id => actions.find(a => a.id === id)).filter(Boolean).slice(0, 2)
    return { reply: say.replace(/\*\*(.+?)\*\*/g, '$1').slice(0, 1200), actions: offered, by: 'model' }
  } catch { return plain() }
}
