// Talk: the crew member whose whole job is to talk with the person while the builder builds.
// The builder never stops for a question; Talk answers it, and it can only read and look:
// list the app's files, read one, list the pictures and play test clips, look at a picture
// (the vision model says what is in it) and show pictures or a clip under its answer.
// It never writes anything. When the person asks for a change, Talk writes it out clearly for
// the builder and asks them to confirm; only their confirmation sends it (the server's /tell
// with confirm), to the start of the next slice or, if it cannot wait, into the turn now.
//
// The tools are a JSON reply, not a provider's tool calling, so any chat model can do it:
// each turn the model sends one JSON object, a tool call or the answer.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const SKIP = /^(node_modules|\.git|dist|build|\.output|\.vercel|\.engine|\.nitro|\.cache|\.godot|\.import|exports?)$/
const TEXT = /\.(tsx?|jsx?|mjs|cjs|css|html|json|md|gd|tscn|tres|cfg|godot|txt|vue|svelte|ya?ml|toml)$/
export const MAX_STEPS = 5
const SEE = /\b(screen ?shots?|pictures?|pics?|images?|sprites?|clips?|videos?|previews?|footage|show me|let me see|can i see|looks? like)\b/i
export const wantsToSee = text => SEE.test(String(text || ''))
const newest = m => (m.clips[0] || m.pics.length ? { clip: m.clips[0]?.src || null, pics: m.pics.slice(0, 4) } : null)

// the app's own files, shortest paths first (what Talk can read)
export function appFiles(dir, limit = 120) {
  const out = []
  const walk = (d, depth = 0) => {
    if (depth > 6 || out.length >= limit * 3) return
    let list = []
    try { list = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const f of list) {
      if (SKIP.test(f.name)) continue
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p, depth + 1)
      else if (TEXT.test(f.name)) out.push(relative(dir, p).split(sep).join('/'))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).slice(0, limit)
}

// one file of the app, never outside it, cut to a size a chat turn can hold
export function readAppFile(dir, path, max = 6000) {
  const full = resolve(dir, String(path || ''))
  if (!full.startsWith(resolve(dir) + sep)) return 'That path is outside the app.'
  try {
    if (!statSync(full).isFile()) return 'No such file.'
    const s = readFileSync(full, 'utf8')
    return s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more characters)` : s
  } catch { return 'No such file.' }
}

// the model's reply → one action; a reply that is not JSON is taken as the answer itself
// every {...} in the text that stands on its own as JSON, in order (braces inside strings are skipped)
function jsonObjects(s) {
  const out = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue
    let depth = 0, str = false, esc = false
    for (let j = i; j < s.length; j++) {
      const c = s[j]
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
      if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try { const o = JSON.parse(s.slice(i, j + 1)); if (o && typeof o === 'object' && !Array.isArray(o)) { out.push(o); i = j } } catch {}
        break
      }
    }
  }
  return out
}
// Some models answer in their own tool-call markup instead of the JSON asked for (DeepSeek's
// <｜DSML｜invoke name="read"><｜DSML｜parameter name="path">…). Read as the same action.
const MARKUP = /<[^<>]*DSML[^<>]*>/g
function markupCall(s) {
  const call = s.match(/<[^<>]*DSML[^<>]*invoke\s+name="([^"]+)"[^<>]*>/)
  if (!call) return null
  const a = { tool: call[1] }
  for (const m of s.matchAll(/<[^<>]*DSML[^<>]*parameter\s+name="([^"]+)"[^<>]*>([\s\S]*?)<\/[^<>]*DSML[^<>]*parameter\s*>/g)) a[m[1]] = m[2].trim()
  return a
}
// One action from a model's reply. The reply should be one JSON object; in practice it can be
// prose around it, several tool calls at once (the first is taken, the loop asks again), or the
// model's own markup. What is left with no action in it is the answer, with no markup shown.
export function parseAction(text) {
  const s = String(text || '').trim()
  const found = jsonObjects(s)
  const act = found.find(o => typeof o.tool === 'string' || o.say !== undefined)
  if (act) return act
  const call = markupCall(s)
  if (call) return call
  if (found.length === 1 && !s.replace(/^[^{]*/, '').replace(/\}[^}]*$/, '}').includes('\n\n')) return found[0]
  return { say: s.replace(MARKUP, ' ').replace(/^```\w*|```$/g, '').replace(/[ \t]+/g, ' ').trim() }
}

export function talkPrompt({ who = '', on = '', title = '', notes = '', media = { pics: [], clips: [] }, files = [], building = true }) {
  const me = who
    ? `You are ${who}, one of the Swarm crew (Hermia leads it), answering for yourself in the first person: right now you are on ${on || 'the build'}.`
    : 'You are Hermia, the lead of the Swarm crew.'
  return `${me} The crew is building ${title ? `the game "${title}"` : 'this app'}. A separate builder writes the code; your whole job is to talk with the person who owns it, so they always know what is going on and can see it. Be like a good colleague: check before you answer, never guess, never say something is missing without looking.

You can use tools. Each turn, reply with ONE JSON object and nothing else:
{"tool":"files"} lists the app's files
{"tool":"read","path":"src/main.ts"} reads one file
{"tool":"look","src":"/img/…"} a picture is described to you (pictures only, not clips)
{"say":"your answer","show":["/img/…"]} your answer, with up to 4 pictures or one clip shown under it (srcs from the list below)
{"say":"…","change":"the change, written clearly for the builder","now":false} when they ask for a change${building ? '' : ' (none now: the crew is not building)'}

A change is never sent by you: you write it out and they confirm it with a button under your answer. In "say", say what you understood in a few words and ask them to confirm. "now": true only when it cannot wait for the next slice (the builder is going the wrong way right now); it stops the builder's turn and redoes the slice.

Answer in one to four short plain sentences, no markdown, no lists. When they ask to see something, show it at once in this answer (the newest clip and pictures; never ask which, never say you cannot); when they ask how something works, read the code first. Never say a change is done or sent. At most ${MAX_STEPS} tool calls, then answer.

${notes}

Pictures and clips you can show (newest first):
${[...media.clips.map(c => `- clip ${c.src}${c.name ? ` (${c.name})` : ''}`), ...media.pics.map(p => `- picture ${p.src} (${p.name})`)].join('\n') || '- none yet'}

The app's files (${files.length}${files.length >= 120 ? '+' : ''}):
${files.slice(0, 60).join(', ') || 'none yet'}`
}

// One answer. chat(messages) → text; look(src) → text (the vision model) or null; appDir: the app;
// media: { pics: [{src,name}], clips: [{src,name}] }; building: the builder is working (a change can be sent)
// → { answer, media: {clip, pics} | null, proposal: {change, now} | null, used: [tool names] }
export async function talk({ chat, look = null, appDir, media = { pics: [], clips: [] }, text, notes = '', who = '', on = '', title = '', building = true, deadline = Date.now() + 60000 }) {
  const files = appFiles(appDir)
  const messages = [
    { role: 'system', content: talkPrompt({ who, on, title, notes, media, files, building }) },
    { role: 'user', content: String(text) }
  ]
  const used = []
  const shown = new Set([...media.pics.map(p => p.src), ...media.clips.map(c => c.src)])
  for (let step = 0; step <= MAX_STEPS; step++) {
    const last = step === MAX_STEPS || Date.now() > deadline
    if (last) messages.push({ role: 'user', content: 'No more tools: answer now with {"say":…}.' })
    const a = parseAction(await chat(messages))
    if (a.say !== undefined || last || !a.tool) {
      const srcs = (Array.isArray(a.show) ? a.show : []).map(String).filter(s => shown.has(s.split('?')[0]))
      const clip = srcs.find(s => /\.(webm|mp4)$/i.test(s)) || null
      const pics = srcs.filter(s => !/\.(webm|mp4)$/i.test(s)).slice(0, 4).map(src => ({ src, name: media.pics.find(p => p.src === src)?.name || '' }))
      // asked to see and nothing shown: the newest clip and pictures go under the answer anyway
      if (!clip && !pics.length && wantsToSee(text)) return { answer: String(a.say || '').trim().slice(0, 700), media: newest(media), proposal: null, used }
      const change = building && typeof a.change === 'string' && a.change.trim() ? { change: a.change.trim().slice(0, 1200), now: a.now === true } : null
      return { answer: String(a.say || '').trim().slice(0, 700), media: clip || pics.length ? { clip, pics } : null, proposal: change, used }
    }
    used.push(a.tool)
    let result
    if (a.tool === 'files') result = files.join('\n') || 'No files yet.'
    else if (a.tool === 'read') result = readAppFile(appDir, a.path)
    else if (a.tool === 'look') result = !shown.has(String(a.src || '').split('?')[0]) || /\.(webm|mp4)$/i.test(a.src) ? 'Only the pictures in the list can be looked at.' : look ? ((await look(a.src).catch(() => null)) || 'The picture could not be looked at.') : 'Looking at pictures is not available.'
    else result = `There is no tool "${a.tool}".`
    messages.push({ role: 'assistant', content: JSON.stringify(a) }, { role: 'user', content: `Result of ${a.tool}:\n${String(result).slice(0, 7000)}` })
  }
}
