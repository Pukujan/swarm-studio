// The Map window's data (spec 44; the owner, 2026-11-14: "visually instantly gives me feedback on whats going on
// always"): a build as Mermaid diagrams, made from what the Studio already knows, with no model call, so it is
// there at once and always current. Pure: facts in, text out (tests/gamemap.test.mjs).
//   gameMap   a game: its build (the art, each slice, the last play test) and its loop (title, play, pause, win,
//             lose, next stage, the ending), from the spec and the build's own steps
//   appMapView an app: the plan's screens and data (engine/appmap.mjs planMap), the screen being built and the
//             ones done marked, as the next UI's wall does (ui/src/screens/app/model.ts)
//   cleanChart a diagram a model wrote, asked for in the chat: untrusted text, cut down to what Mermaid may be given
// Every map is { kind, version, tabs: [{ id, name, text, marks, nodes: [{ name, state }] }], say }: `nodes` is the
// diagram as a list (its text alternative), `say` is Hermia's one line under it. A node's state is a Mermaid class
// (done, now, failed) the page gives its colours to: this text names no colour.
import { createHash } from 'node:crypto'
import { words } from './appmap.mjs'

const version = tabs => createHash('sha1').update(JSON.stringify(tabs.map(t => [t.id, t.text]))).digest('hex').slice(0, 12)
const classes = nodes => ['done', 'now', 'failed'].map(c => [c, nodes.filter(n => n.state === c).map(n => n.id)]).filter(([, ids]) => ids.length).map(([c, ids]) => `  class ${ids.join(',')} ${c}`)
const listed = nodes => nodes.map(({ name, state }) => ({ name, state: state || '' }))
const tick = n => (n.state === 'done' ? '✓ ' : '')
// a sentence of the spec as a label: whole words, a line or so
const brief = (s, max = 56) => { const w = words(s); return w.length <= max ? w : `${w.slice(0, max).replace(/\s+\S*$/, '')}…` }

// "play test failed: the hero never moved" → { state: 'failed', reason }, from the build's steps (engine/appjob.mjs playGame)
export function lastPlayTest(steps = []) {
  const s = steps.findLast(x => x?.kind === 'test' && /^play test (passed|failed|skipped)/.test(x.text || ''))
  if (!s) return null
  const [, state, rest = ''] = /^play test (passed|failed|skipped)(?::\s*(.*))?/s.exec(s.text)
  return { state, reason: words(rest.split('\n')[0]) }
}

/**
 * A game's map.
 * @param {object} g
 * @param {any} g.spec the game's spec (engine/game.mjs)
 * @param {{ name?: string }[]} [g.stages] its build slices in order (stagesFor(spec)); none for a mini game, built in one go
 * @param {number[]} [g.done] the slices that finished (0-based)
 * @param {number} [g.now] the slice being built (0-based), -1 when none is
 * @param {string} [g.state] the build's state: working, paused, done, failed, stopped, idle
 * @param {{ done: number, total: number } | null} [g.art] the art plan's progress
 * @param {{ state: string, reason: string } | null} [g.test] the last play test (lastPlayTest)
 */
export function gameMap({ spec, stages = [], done = [], now = -1, state = 'idle', art = null, test = null }) {
  const title = words(spec?.title) || 'The game'
  const n = stages.length
  const build = []
  if (art?.total) build.push({ id: 'art', name: `Art: ${art.done} of ${art.total} painted`, label: `Art<br/>${art.done} of ${art.total} painted`, state: art.done >= art.total ? 'done' : state === 'working' && now < 0 ? 'now' : '' })
  if (n) stages.forEach((s, i) => build.push({ id: `s${i + 1}`, name: `Slice ${i + 1} of ${n}: ${words(s?.name) || 'a slice'}`, label: `Slice ${i + 1} of ${n}<br/>${words(s?.name) || 'a slice'}`, state: done.includes(i) ? 'done' : i === now && state === 'working' ? 'now' : '' }))
  else build.push({ id: 's1', name: 'Build the game', label: 'Build the game', state: state === 'done' ? 'done' : state === 'working' ? 'now' : '' })
  // the play test hangs off the slice it played: the one being built, else the last one finished
  const played = n ? `s${(now >= 0 && state === 'working' ? now : Math.max(-1, ...done)) + 1 || 1}` : 's1'
  const kind = ['passed', 'failed', 'skipped'].includes(test?.state) ? test.state : '', why = words(test?.reason)
  const testNode = kind ? { id: 'test', name: `Play test ${kind}${why ? `: ${why}` : ''}`, label: `Play test ${kind}${why ? `<br/>${why}` : ''}`, state: kind === 'failed' ? 'failed' : kind === 'passed' ? 'done' : '' } : null
  const chain = build.map(b => b.id)
  const buildText = ['flowchart LR',
    ...build.map(b => `  ${b.id}["${tick(b)}${b.label}"]`),
    ...(testNode ? [`  test["${testNode.label}"]`] : []),
    ...(chain.length > 1 ? [`  ${chain.join(' --> ')}`] : []),
    ...(testNode ? [`  ${played} -.-> test`] : []),
    ...classes([...build, ...(testNode ? [testNode] : [])])].join('\n')

  // the loop every game of the Studio runs (engine/game.mjs: a title, the play, a way to fail, an ending), with
  // this game's own words on it and its places in order
  const places = (Array.isArray(spec?.places) ? spec.places : []).map(p => words(typeof p === 'string' ? p : p?.name)).filter(Boolean).slice(0, 8)
  const loop = [
    { id: 'title', name: `Title: ${title}`, label: `Title<br/>${title}`, shape: ['([', '])'] },
    { id: 'play', name: `Play a stage${spec?.loop ? `: ${brief(spec.loop, 120)}` : ''}`, label: `Play a stage${spec?.loop ? `<br/>${brief(spec.loop)}` : ''}` },
    { id: 'pause', name: 'Pause', label: 'Pause' },
    { id: 'win', name: 'Win the stage', label: 'Win' },
    { id: 'lose', name: 'Lose', label: 'Lose' },
    { id: 'next', name: `Next stage${spec?.progression ? `: ${brief(spec.progression, 120)}` : ''}`, label: `Next stage${spec?.progression ? `<br/>${brief(spec.progression)}` : ''}` },
    { id: 'fin', name: `Ending${spec?.goal ? `: ${brief(spec.goal, 120)}` : ''}`, label: `Ending${spec?.goal ? `<br/>${brief(spec.goal)}` : ''}`, shape: ['([', '])'] }
  ]
  const loopText = ['flowchart LR',
    ...loop.map(b => `  ${b.id}${b.shape?.[0] || '['}"${b.label}"${b.shape?.[1] || ']'}`),
    '  title --> play', '  play --> pause', '  pause --> play', '  play --> win', '  play --> lose', '  lose --> title', '  win --> next', '  next --> play', '  win --> fin',
    ...(places.length ? ['  subgraph stages["Stages"]', '    direction LR', ...places.map((p, i) => `    p${i + 1}["${p}"]`), ...(places.length > 1 ? [`    ${places.map((_, i) => `p${i + 1}`).join(' --> ')}`] : []), '  end', '  next -.-> stages'] : [])].join('\n')

  const at = now >= 0 && state === 'working' && n ? `Slice ${now + 1} of ${n}, ${words(stages[now]?.name) || 'a slice'}: building.`
    : state === 'working' ? (art?.total && art.done < art.total ? 'Painting the art.' : 'Building.')
    : n && done.length >= n ? `All ${n} slices are built.`
    : n ? `${done.length} of ${n} slices built${state === 'paused' ? '; your turn' : state === 'stopped' ? '; the build is stopped' : state === 'failed' ? '; the last build failed' : ''}.`
    : state === 'done' ? 'The game is built.' : 'Not built yet.'
  const say = [at, art?.total ? `Art ${art.done} of ${art.total}.` : '', kind ? `Last play test ${kind}${kind === 'failed' && why ? `: ${why}` : ''}.` : ''].filter(Boolean).join(' ')
  const tabs = [
    { id: 'build', name: 'Build', text: buildText, marks: true, nodes: listed([...build, ...(testNode ? [testNode] : [])]) },
    { id: 'loop', name: 'Loop', text: loopText, marks: true, nodes: [...listed(loop), ...places.map(p => ({ name: `Stage: ${p}`, state: '' }))] }
  ]
  return { kind: 'game', version: version(tabs), tabs, say }
}

const letters = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** The screen being built: the one the file being written is named after (ui/src/screens/app/model.ts nowScreen). */
export function nowScreen(screens = [], file = '') {
  const f = letters(String(file).split('/').pop()?.replace(/\.[a-z]+$/i, ''))
  if (f.length < 3) return null
  return screens.find(s => { const nm = letters(s.name), p = letters(String(s.path || '').split('/').filter(Boolean).pop()); return (nm.length >= 3 && (f.includes(nm) || nm.includes(f))) || (p.length >= 3 && f.includes(p)) })?.id ?? null
}

/**
 * An app's map, from planMap's answer (engine/appmap.mjs).
 * @param {any} m planMap(plan)
 * @param {{ now?: string | null, done?: string[], state?: string }} [at] the screen being built and the ones the
 *   kit's checks passed (their map ids), and the build's state
 */
export function appMapView(m, { now = null, done = [], state = 'idle' } = {}) {
  const screens = (m?.screens || []).map(s => ({ id: s.id, name: s.path && s.path !== s.name ? `${s.name} (${s.path})` : s.name, state: s.id === now && state === 'working' ? 'now' : done.includes(s.id) ? 'done' : '' }))
  const tabs = [{ id: 'screens', name: 'Screens', text: [m.flow, ...classes(screens)].join('\n'), marks: true, nodes: listed(screens) }]
  if (m.er) tabs.push({ id: 'data', name: 'Data', text: m.er, marks: false, nodes: (m.data || []).map(d => ({ name: d.name, state: '' })) })
  const on = screens.find(s => s.state === 'now'), n = screens.length, d = screens.filter(s => s.state === 'done').length
  const say = [on ? `Building ${on.name}.` : state === 'working' ? 'Building.' : '', n ? `${d} of ${n} screens checked.` : '', m.note ? `${m.note[0].toUpperCase()}${m.note.slice(1)}.` : ''].filter(Boolean).join(' ')
  return { kind: 'app', version: version(tabs), tabs, say }
}

// ---------- a diagram asked for in the chat ("show the enemy AI as a state chart"): the planner writes Mermaid text
// for it, and that text is a model's, so it is untrusted. It is drawn with securityLevel strict (web/canvas/mapwin.js);
// here it is cut to size and to a diagram Mermaid knows, with nothing that configures Mermaid or wires a click.
export const CHART_MAX = 6000
const CHART_KINDS = /^(flowchart|graph|stateDiagram(-v2)?|sequenceDiagram|classDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|requirementDiagram)\b/
/** @param {unknown} raw  @returns {{ ok: true, text: string } | { ok: false, why: string }} */
export function cleanChart(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, why: 'no diagram' }
  if (raw.length > CHART_MAX) return { ok: false, why: 'too long' }
  let t = raw.replace(/\r\n?/g, '\n').trim()
  // a fenced block: what is inside it
  const fence = /```(?:mermaid)?\s*\n([\s\S]*?)```/.exec(t)
  if (fence) t = fence[1].trim()
  // front matter and %%{init}%% directives configure Mermaid; a comment is not needed either
  t = t.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/%%\{[\s\S]*?\}%%/g, '')
  const lines = t.split('\n').filter(l => !/^\s*%%/.test(l) && !/^\s*(click|href|call|link|links)\b/i.test(l) && !/javascript:/i.test(l)).map(l => l.replace(/[\u0000-\u0008\u000b-\u001f]/g, ''))
  while (lines.length && !lines[0].trim()) lines.shift()
  if (!lines.length || !CHART_KINDS.test(lines[0].trim())) return { ok: false, why: 'not a diagram' }
  if (lines.length > 200) return { ok: false, why: 'too long' }
  return { ok: true, text: lines.join('\n').trim() }
}

// A chat message that asks for a diagram: the answer needs room for one (server/server.mjs tellBuilder)
export const wantsChart = text => /\b(mermaid|diagrams?|flow ?charts?|state ?charts?|charts?|graphs?)\b/i.test(String(text || ''))
