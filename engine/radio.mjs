// Crew radio: the app engine is a lead agent that hands tasks to helper agents.
// It keeps that conversation in its own SQLite file (assignments, every tool
// call, the reports). This reads it, read-only, while a build runs and turns it
// into studio events: the lead's thinking and orders come from Hermia, each
// helper is one of the run's crew, and their real work shows on their cursor.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const query = (db, sql) => new Promise(ok => execFile('/usr/bin/sqlite3', ['-readonly', '-json', db, sql], { maxBuffer: 1 << 24, timeout: 8000 }, (err, out) => {
  if (err) return ok([])
  try { ok(out.trim() ? JSON.parse(out) : []) } catch { ok([]) }
}))

// The newest engine database under the run (one per model the engine used).
function dbOf(runDir) {
  const dir = join(runDir, '.engine')
  try {
    return readdirSync(dir).filter(d => d.startsWith('data-')).map(d => join(dir, d, 'sqlite.db')).filter(existsSync)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] || null
  } catch { return null }
}

// The lead's words between its tool tags: what it is thinking and deciding.
export function prose(content) {
  return String(content || '')
    .replace(/<dyad-([a-z-]+)[^>]*\/>/g, '\n')
    .replace(/<dyad-([a-z-]+)[^>]*>[\s\S]*?<\/dyad-\1>/g, '\n')
    .replace(/<think>[\s\S]*?<\/think>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n+/).map(l => l.replace(/[#*`>|]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 24 && !/^[-–•\d.]+\s/.test(l) && /[a-z]/.test(l))
}

const firstSentence = s => String(s || '').replace(/\s+/g, ' ').replace(/^GOAL\s*/i, '').split(/(?<=[.!?])\s/)[0].slice(0, 220)

const TOOLS = {
  read_file: p => `reading ${p}`, write_file: p => `writing ${p}`, search_replace: p => `editing ${p}`, delete_file: p => `removing ${p}`,
  list_files: () => 'looking around the project', grep: () => 'searching the code', run_type_checks: () => 'running the typecheck', web_fetch: () => 'checking the docs',
}
const act = (tool, input) => {
  let p = ''
  try { const j = JSON.parse(input || '{}'); p = basename(j.path || j.file_path || j.target_file || '') } catch {}
  return (TOOLS[tool] || (() => tool.replace(/_/g, ' ')))(p || 'a file')
}

export function crewRadio({ runDir, crew = [], say, every = 2500 }) {
  // crew: [{ id, name }] from the run; the lead is Hermia, helpers take crew members in order
  const seen = { threads: new Map(), acts: 0, reports: 0, lead: '', leadLines: 0 }
  let timer = null, busy = false
  const helper = id => {
    if (!seen.threads.has(id)) seen.threads.set(id, crew[seen.threads.size % Math.max(1, crew.length)] || { id: null, name: `Helper ${seen.threads.size + 1}` })
    return seen.threads.get(id)
  }
  async function tick() {
    if (busy) return
    busy = true
    try {
      const db = dbOf(runDir)
      if (!db) return
      // the lead's newest message: new lines of thinking since the last look
      const [m] = await query(db, "select id, content from messages where role='assistant' order by id desc limit 1")
      if (m) {
        if (m.id !== seen.lead) { seen.lead = m.id; seen.leadLines = 0 }
        const lines = prose(m.content)
        for (const l of lines.slice(seen.leadLines, seen.leadLines + 3)) say({ kind: 'think', who: 'lead', text: l.slice(0, 260) })
        seen.leadLines = Math.max(seen.leadLines, Math.min(lines.length, seen.leadLines + 3))
      }
      // new assignments: Hermia gives the order, the helper answers
      for (const t of await query(db, 'select id, persona, task_name, status, assignment, error from agent_threads order by created_at')) {
        const known = seen.threads.has(t.id)
        const h = helper(t.id)
        if (!known) {
          say({ kind: 'assign', who: 'lead', to: h, text: `${h.name}, ${t.task_name.replace(/-/g, ' ')}: ${firstSentence(t.assignment)}` })
          say({ kind: 'ack', who: h, text: `On it: ${t.task_name.replace(/-/g, ' ')}.` })
        }
        const was = h.status
        h.status = t.status
        if (was && was !== t.status && t.status === 'failed') say({ kind: 'report', who: h, text: `Hit a problem: ${String(t.error || 'it failed').slice(0, 160)}` })
      }
      // what each helper is doing right now
      const acts = await query(db, `select id, thread_id, tool_name, input_json, status from agent_activities where id > ${seen.acts} order by id limit 40`)
      const shown = new Set()
      for (const a of acts) {
        seen.acts = Math.max(seen.acts, a.id)
        // one line per helper per look, the newest
        shown.add(a.thread_id)
      }
      for (const id of shown) {
        const a = acts.findLast(x => x.thread_id === id)
        say({ kind: 'act', who: helper(id), text: act(a.tool_name, a.input_json), quiet: true })
      }
      // reports back to the lead
      for (const r of await query(db, `select id, thread_id, content from agent_messages where id > ${seen.reports} and role='assistant' order by id`)) {
        seen.reports = Math.max(seen.reports, r.id)
        const h = helper(r.thread_id)
        const first = prose(r.content)[0] || firstSentence(r.content)
        say({ kind: 'report', who: h, to: 'lead', text: `Done. ${first}`.slice(0, 260) })
        say({ kind: 'ack', who: 'lead', text: `Good work, ${h.name}.` })
      }
    } finally { busy = false }
  }
  // what is already in the database (an earlier turn) is history, not news
  async function prime() {
    const db = dbOf(runDir)
    if (!db) return
    const [m] = await query(db, "select id, content from messages where role='assistant' order by id desc limit 1")
    if (m) { seen.lead = m.id; seen.leadLines = prose(m.content).length }
    for (const t of await query(db, 'select id, status from agent_threads order by created_at')) helper(t.id).status = t.status
    const [a] = await query(db, 'select max(id) as n from agent_activities'), [r] = await query(db, 'select max(id) as n from agent_messages')
    seen.acts = a?.n || 0
    seen.reports = r?.n || 0
  }
  return {
    async start() { if (timer) return; await prime().catch(() => {}); timer = setInterval(tick, every) },
    async stop() { clearInterval(timer); timer = null; await tick().catch(() => {}) },
    tick,
  }
}
