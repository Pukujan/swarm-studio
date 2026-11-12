// The chat store (docs/specs/29-chats-references-marks.md §Store), the part spec 27's planner
// conversation needs: <data>/chats/<id>/chat.json, made, read and changed one write at a time.
// A chat is not a run and not a plan, and a loose chat is never listed in Projects. Moving a chat
// into a project, categories, refs, marks and made items are spec 29's slices and extend this file.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

export const CHAT_ID = /^c-[0-9a-f]{10}$/
export const KINDS = ['site', 'app', 'game', 'film']
export const CATEGORY = { site: 'Design', app: 'App', game: 'Game', film: 'Video' }

export function newChat({ kind = 'site', title = '' } = {}, now = Date.now()) {
  const k = KINDS.includes(kind) ? kind : 'site'
  return {
    v: 1, id: `c-${randomBytes(5).toString('hex')}`, kind: k, category: CATEGORY[k], categoryBy: 'planner',
    title: String(title || '').slice(0, 80), created: now, updated: now,
    state: 'open', lead: 'person', project: null, plan: null,
    turns: [], decisions: {}, spec: null, refs: [], made: [], marks: []
  }
}

export function chatStore(root) {
  const dir = join(root, 'chats')
  const folder = id => join(dir, id)
  const file = id => join(folder(id), 'chat.json')
  const ok = id => CHAT_ID.test(String(id || ''))
  const write = chat => {
    mkdirSync(folder(chat.id), { recursive: true })
    const tmp = `${file(chat.id)}.tmp`
    writeFileSync(tmp, JSON.stringify(chat, null, 1))
    renameSync(tmp, file(chat.id))
    return chat
  }
  // one writer per chat: each update waits for the one before it
  const queues = new Map()
  return {
    dir,
    get(id) { if (!ok(id) || !existsSync(file(id))) return null; try { return JSON.parse(readFileSync(file(id), 'utf8')) } catch { return null } },
    create(input = {}) { return write(newChat(input)) },
    // fn(chat) changes the record (it may be async); the result is written whole, then renamed into place
    update(id, fn) {
      if (!ok(id)) return Promise.reject(Object.assign(new Error('bad chat id'), { status: 400 }))
      const run = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
        const chat = this.get(id)
        if (!chat) throw Object.assign(new Error('no such chat'), { status: 404 })
        const out = await fn(chat)
        chat.updated = Date.now()
        write(chat)
        return out === undefined ? chat : out
      })
      queues.set(id, run)
      run.finally(() => { if (queues.get(id) === run) queues.delete(id) }).catch(() => {})
      return run
    },
    // loose chats (not in a project), newest first
    listLoose() {
      if (!existsSync(dir)) return []
      return readdirSync(dir).filter(ok).map(id => this.get(id)).filter(c => c && !c.project)
        .sort((a, b) => b.updated - a.updated)
        .map(c => ({ id: c.id, kind: c.kind, category: c.category, title: c.title, state: c.state, plan: c.plan, updated: c.updated }))
    }
  }
}
