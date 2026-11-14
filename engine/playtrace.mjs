// What a failed play test hands the crew (docs/engines/godot.md, Play-testing): the first error the game threw,
// with its stack read back to the game's own source lines, the page's console around it, whether the game
// ever drew, and what earlier fix attempts changed.
//
// Why: Rooftop Signal (run 2026-11-11T13-00-28-617Z) threw "Cannot read properties of null (reading 'x')" 1.5 s
// after it opened, in its scene's update (clouds destroyed by setLevel and still moved every frame). The fix
// request was that one sentence, with no stack, file or line, and said "while playing". The first fix turn
// changed six files, none of them the scene; the second changed nothing. The line was one stack frame away.

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { dyadDir } from './appbuild.mjs'

// how many times the crew is sent at a failed play test before the slice is shown as it is (each attempt is
// model time; docs/specs/47-game-builder-loop.md proposes three and is not decided)
export const FIX_TRIES = 2

// the browser's own noise, never the game's
const NOISE = /WebGL|GL Driver|swiftshader|GPU stall|DevTools|\[vite\] (connect|hot|hmr)|Download the React DevTools/i
export const noise = text => NOISE.test(String(text || ''))

// "    at Scene.update (http://127.0.0.1:5173/src/game/scene.ts?t=1:229:10)" -> { fn, url, file, line, col }
// file: the path the page asked for, with no address and no query; only frames of `origin` are the game's own
// A page whose script the browser will not describe to another origin (no CORS header, in the sandboxed frame)
// has its stack rebuilt by Playwright from the debugger's frames: "Uncaught …" first, functions without their
// class, and lines and columns counted from 0 (playwright-core crProtocolHelper getExceptionMessage). Those are
// put back to the 1-based numbers every editor and every other stack uses.
export function parseStack(stack, origin = '') {
  const out = []
  const zero = /^Uncaught\b/.test(String(stack || '').trimStart()) ? 1 : 0
  for (const raw of String(stack || '').split('\n')) {
    const m = raw.match(/^\s*at (?:(.+?) \()?((?:https?|file):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/)
    if (!m) continue
    let path = m[2]
    try { path = new URL(m[2]).pathname } catch {}
    const lib = /\/node_modules\/|\/@vite\/|\/@react-refresh|\/\.vite\//.test(path)
    out.push({ fn: (m[1] || '').replace(/^(async|new) /, '').replace(/^<anonymous>$/, ''), url: m[2], file: decodeURIComponent(path).replace(/^\//, ''), line: +m[3] + zero, col: +m[4] + zero, own: !lib && (!origin || m[2].startsWith(origin)) })
    if (out.length >= 12) break
  }
  return out
}

// the maintained source-map reader (@jridgewell/trace-mapping), when the app engine's packages are on this
// machine (the same place the play test's browser driver comes from); null: stacks stay as the page served them
export async function loadTracer() {
  try { return await import('@jridgewell/trace-mapping') } catch {}
  for (const dir of [process.env.PLAYWRIGHT_DIR, dyadDir].filter(Boolean)) {
    try { return createRequire(join(dir, 'package.json'))('@jridgewell/trace-mapping') } catch {}
  }
  return null
}

const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
// one line of a served file; a bundle's line is thousands of characters, so only what is around the column
const lineOf = (text, line, col) => {
  const l = String(text || '').split('\n')[line - 1]
  if (l === undefined) return ''
  return l.length > 220 ? l.slice(Math.max(0, col - 60), col + 100).trim() : l.trim()
}
// a source map's name for a file -> a path inside the project
function sourcePath(source, frame, root) {
  let s = String(source || '').replace(/^(webpack|vite|file):\/\/\/?/, '/').replace(/\?.*$/, '')
  if (root && isAbsolute(s) && s.startsWith(root)) return relative(root, s).split(sep).join('/')
  if (!s.includes('/')) return [...frame.file.split('/').slice(0, -1), s].join('/')
  return s.replace(/^(\.\.?\/)+/, '').replace(/^\//, '')
}

// Frames -> the same frames with the game's own source line where a source map says it ({ src: { file, line, col }, code }).
// fetchText(url) -> the served file's text (or null); tracer: loadTracer()'s module; root: the project on disk
export async function mapFrames(frames, { fetchText, tracer = null, root = '' } = {}) {
  const texts = new Map()
  const get = async url => {
    if (!texts.has(url)) texts.set(url, texts.size < 6 ? await Promise.resolve().then(() => fetchText(url)).catch(() => null) : null)
    return texts.get(url)
  }
  const out = []
  for (const f of frames) {
    const g = { ...f }
    out.push(g)
    if (!f.own || !fetchText) continue
    const text = await get(f.url)
    if (!text) continue
    const ref = [...String(text).matchAll(/\/\/[#@] sourceMappingURL=(\S+)/g)].at(-1)?.[1]
    let map = null
    if (ref && tracer) {
      try {
        const json = ref.startsWith('data:') ? Buffer.from(ref.slice(ref.indexOf(',') + 1), /;base64,/.test(ref) ? 'base64' : 'utf8').toString('utf8') : await get(new URL(ref, f.url).href)
        if (json) map = new tracer.TraceMap(JSON.parse(json))
      } catch {}
    }
    if (map) {
      try {
        const o = tracer.originalPositionFor(map, { line: f.line, column: Math.max(0, f.col - 1) })
        if (o?.source && o.line) {
          g.src = { file: sourcePath(o.source, f, root), line: o.line, col: (o.column || 0) + 1 }
          let body = null
          try { body = tracer.sourceContentFor(map, o.source) } catch {}
          if (body == null && root && existsSync(join(root, g.src.file))) try { body = readFileSync(join(root, g.src.file), 'utf8') } catch {}
          g.code = cut(lineOf(body, o.line, g.src.col), 160)
          continue
        }
      } catch {}
    }
    // no map: with none named the served file is the source, so its line is the line; with one named and
    // nobody to read it, the line is the compiled file's and says so
    g.served = !!ref
    // a built bundle: one line is thousands of characters and the names are shortened, so the line number says
    // nothing and the code around the column is what there is to search for
    g.bundled = (String(text).split('\n')[f.line - 1] || '').length > 220
    g.code = cut(lineOf(text, f.line, f.col), 160)
  }
  return out
}

const at = f => (f.src ? `${f.src.file}:${f.src.line}` : f.bundled ? `${f.file}:${f.line}:${f.col}` : `${f.file}:${f.line}${f.served ? ' (line of the served file)' : ''}`)
const secs = t => `${Number(t || 0).toFixed(1)} s`
// the first frame that is the game's own code
export const ownFrame = frames => (frames || []).find(f => f.own) || null

// The play test's failure in one plain line, for the room and the chat: the error and where, no advice.
export function playLine(t) {
  const e = t?.evidence, first = e?.first
  if (first) {
    const f = ownFrame(first.frames)
    return cut(`${first.message}${f && !f.bundled ? `, in ${at(f).replace(/ \(line.*\)$/, '').replace(/:(\d+)$/, ' line $1')}` : ''}`, 180)
  }
  return cut(String(t?.problem || t?.skipped || '').split(/\. |\n/)[0], 180)
}

// The fix request: what the builder is handed after a failed play test.
// t: the play test's result; attempt: 1 for the first request; before: [{ changed: [files], same: bool }] the
// earlier attempts on this slice; extra: other problems to fix with it (made-up links, a game that looks for the test)
// carry: the same findings as the next slice's first job (no attempt count, no "keep everything else")
export function fixBrief(t, { attempt = 1, before = [], extra = [], finish = '', carry = false } = {}) {
  const e = t?.evidence, first = e?.first
  const out = []
  if (before.length && carry) {
    const last = before.at(-1)
    out.push(`The last fix attempt ${last.changed?.length ? `changed ${last.changed.slice(0, 8).join(', ')}` : 'changed no file'} and did not cure it${last.same ? ': the same error is still thrown, so that change did not touch the cause' : ''}.`)
  } else if (before.length) {
    const last = before.at(-1)
    out.push(`This is fix attempt ${attempt}. The last attempt ${last.changed?.length ? `changed ${last.changed.slice(0, 8).join(', ')}` : 'changed no file'} and the play test, run again, ${last.same ? 'fails with the same error: that change did not touch the cause, so do not repeat it' : 'now fails differently'}.`)
  }
  if (t && !t.ok && !t.skipped) {
    out.push(`A play test of this game failed. ${t.problem}`)
    if (e) out.push(e.started ? 'The game did draw its first screen.' : 'The game never drew anything: the page stayed empty, so nothing after the crash below matters until it is fixed.')
    if (first) {
      const when = `thrown ${secs(first.t)} after the page opened${e.firstKey == null || first.t < e.firstKey ? ', before the test pressed anything' : `, after the test pressed ${cut(e.lastKey || 'a key', 24)}`}${first.count > 1 ? `, then ${first.count - 1} more time${first.count === 2 ? '' : 's'}` : ''}`
      const frames = (first.frames || []).slice(0, 8).map(f => `  at ${f.fn || '(anonymous)'} (${f.own ? at(f) : f.file.split('/node_modules/').pop()})${f.code ? `    > ${f.code}` : ''}`)
      out.push(`The first error (${when}):\n${first.message}\n${frames.join('\n') || '  (the browser gave no stack)'}`)
      if (e.others?.length) out.push(`Later errors, likely caused by the first:\n${e.others.slice(0, 3).map(m => `- ${m}`).join('\n')}`)
    }
    const lines = (e?.console || []).slice(0, 10).map(c => `  [${secs(c.t)} ${c.type}] ${c.text}${c.where ? ` (${c.where})` : ''}`)
    if (lines.length) out.push(`The page's console:\n${lines.join('\n')}`)
    if (e && !e.started && e.text) out.push(`The page showed only: "${cut(e.text, 160)}"`)
    const f = ownFrame(first?.frames)
    if (f?.bundled) out.push('The game was played as a built bundle, so the names in that stack are shortened: the code after each > is what runs at that frame. Search the source for it, read it, find which value is null or missing there and what made it so (something destroyed, removed or never set earlier), and fix that cause. Do not guard other code on a guess before you have read it.')
    else if (f) out.push(`Start at ${at(f)}${f.fn ? `, in ${f.fn}` : ''}: read that line, find which value is null or missing there and what made it so (something destroyed, removed or never set earlier), and fix that cause. Do not guard other code on a guess before you have read it.`)
    else if (first) out.push('Find where that error is thrown before changing anything: search the code for the property it names, and read the code that runs when the page opens.')
  } else if (t?.skipped) out.push(`The play test could not run (${t.skipped}); fix what is listed below.`)
  for (const x of extra.filter(Boolean)) out.push(x)
  if (!carry) out.push(`Keep everything else as it is.${finish ? ` ${finish}` : ''}`)
  return out.join('\n\n')
}

// the same failure as last time (the same first error at the same place, or the same sentence)
export function sameFailure(a, b) {
  const key = t => { const f = t?.evidence?.first; return f ? `${f.message}|${ownFrame(f.frames) ? at(ownFrame(f.frames)) : ''}` : String(t?.problem || t?.skipped || '').split('. ')[0] }
  return !!a && !!b && key(a) === key(b)
}

// A play test's step in the build's log, as an older Studio wrote it or a new one: did the game never draw?
const NO_START = /^(play test failed|still wrong after [^:]*): (No game canvas appeared|The game's screen is blank|The Godot web export did not start|The game did not start)/
export const noStart = x => !!x && (x.started === false || (x.ok === false && NO_START.test(String(x.text || ''))))

// A game passed its play test only when the test ran and found nothing: one that could not run (`skipped`: no
// browser on this machine) is never a pass, whatever else it says (docs/engines/godot.md, Limits).
export const playPassed = (t, links = '', dodged = '') => !links && !dodged && !!t?.ok && !t.skipped

// Play the game, and while it fails send the crew at what failed and play it again: up to `tries` requests, each
// with the last test's own evidence and what the attempt before it changed. Every step says what happened.
//   play(first) -> a play test result (engine/playtest.mjs), filmed    film() -> { clip, keys } of the last test, or {}
//   fix(prompt) -> the builder's fix turn (throws when it stops)       extras() -> { links, dodged }: other problems, as asks
//   head() / changedSince(head) -> the project's commit, and the files changed since it
// -> { ok, fixed?, seconds?, skipped?, problem?, started?, line?, tries?, clip?, checks? }: problem is the whole
// fix request for what is still wrong; started: false when the game never drew; line: the failure in one line
export async function playAndFix({ play, fix, step, film = () => ({}), extras = () => ({ links: '', dodged: '' }), asked = '', head = () => '', changedSince = () => [], finish = '', tries = FIX_TRIES, settle = 0, line = null }) {
  const checkLine = line || (checks => `${checks.filter(c => c.ok).length} of ${checks.length} checks passed`)
  // what a failed test's step says: the checks that failed, else the error and where, in one line
  const said = r => (r.checks?.some(c => c.ok === false) ? checkLine(r.checks) : r.started === false ? `The game did not start: ${playLine(r)}` : playLine(r))
  const facts = r => ({ ...(r.started === false ? { started: false } : {}), ...(r.ok || r.skipped ? {} : { line: playLine(r) }) })
  let { links, dodged } = extras()
  if (links) step({ kind: 'test', text: 'the game links to a made-up web address', ok: false })
  let t = await play(true)
  if (dodged) step({ kind: 'test', text: 'the game plays differently when it is being tested', ok: false })
  if (t.skipped) step({ kind: 'test', text: `play test skipped: ${t.skipped}`, ok: false })
  else if (t.ok) step({ kind: 'test', text: `play test passed: ${t.checks?.length ? checkLine(t.checks) : `still playing after ${Number(t.seconds || 0).toFixed(1)} s`}`, ...film() })
  else step({ kind: 'test', text: `play test failed: ${said(t)}`, ok: false, ...facts(t), ...film() })
  const out = o => ({ ...o, ...(film().clip ? { clip: film().clip } : {}), ...(t.checks ? { checks: t.checks } : {}), ...(o.ok ? {} : facts(t)) })
  // a play test that could not run is reported, not passed, and no fix turn is spent on it
  if (t.skipped && !links && !dodged) return { ok: false, skipped: t.skipped }
  if (playPassed(t, links, dodged)) return out({ ok: true, seconds: t.seconds })
  const before = []
  let ok = false
  for (let attempt = 1; attempt <= tries && !ok; attempt++) {
    // a skipped play test is played again after the fix turn, never assumed to pass
    const prompt = fixBrief(t, { attempt, before, extra: [dodged, links, asked], finish })
    const from = head(), last = t
    step({ kind: 'test', text: `fix ${attempt} of ${tries}: the crew is sent at ${t.ok || t.skipped ? (links ? 'the made-up web address' : dodged ? 'the test dodge' : 'what failed') : said(t)}` })
    try { await fix(prompt) } catch (err) {
      step({ kind: 'test', text: `the fix turn stopped: ${String(err.message).slice(0, 160)}`, ok: false, ...facts(t) })
      return out({ ok: false, problem: prompt, tries: attempt })
    }
    const changed = changedSince(from)
    if (settle) await new Promise(r => setTimeout(r, settle))
    // played again the same way, and filmed: the clip shown is always the last test's
    if (!t.ok || dodged) t = await play(false)
    ;({ links, dodged } = extras())
    ok = playPassed(t, links, dodged)
    const same = !ok && sameFailure(last, t)
    before.push({ changed, same })
    const did = changed.length ? `it changed ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ` and ${changed.length - 4} more` : ''}` : 'it changed no file'
    step({ kind: 'test', text: ok ? `the game passes its checks after fix ${attempt}${t.checks?.length ? `: ${checkLine(t.checks)}` : ''} (${did})` : `still wrong after fix ${attempt} of ${tries} (${did}${t.ok || t.skipped ? '' : same ? '; the same error' : '; a different error now'}): ${t.ok ? (links || dodged || '').split('. ')[0] : t.skipped ? `play test skipped: ${t.skipped}` : said(t)}`, ok, ...(ok ? {} : facts(t)), ...film() })
  }
  if (ok) return out({ ok: true, fixed: true, seconds: t.seconds, tries: before.length })
  // what is still wrong, whole: the next slice (or a typed "fix it") starts from it
  return out({ ok: false, ...(t.skipped ? { skipped: t.skipped } : {}), problem: fixBrief(t, { attempt: before.length + 1, before, extra: [dodged, links] }), carry: fixBrief(t, { before, extra: [dodged, links], carry: true }), tries: before.length })
}
