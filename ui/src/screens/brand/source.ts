// Where a brand sheet is read from and written to (server/brand.mjs): a chat's record, by the chat's routes, as
// web/brand.js opens it for a talk's brief. (A project's own sheet, by the project's routes, is api.ts.) And which
// screen draws a sheet. No React and nothing imported, so the unit test (ui/test/brandsheet.test.mjs) runs it as it
// is (Node strips the types).

// the answer every brand route gives; `Sheet` is ./types' BrandView
export interface SheetSource<Sheet> {
  // the sheet, made from the brief the first time (the options are a model call: the slow part), then kept
  open(): Promise<Sheet>
  // pick, edit, lock, unlock: each answers with the new sheet
  change(what: string, body?: unknown): Promise<Sheet>
}

// the brief a chat asks a sheet for (src/chat/types.ts onBrandSheet): its chat when it has one, its words, its kind
export interface SheetAsk { chat: string | null, brief: string, kind: string }

export type SheetApi = (path: string, init?: RequestInit) => Promise<Response>

async function post<T>(api: SheetApi, path: string, body: unknown): Promise<T> {
  const r = await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

// A chat's sheet: POST /api/brand makes it for the brief (and makes the chat, when the brief had none: a showcase's,
// or the Make box's words); the same brief gets the sheet it had. Every change then goes to that chat's routes,
// /api/brand/<chat>/(pick|edit|lock|unlock). A website or an app has one; any other kind is asked for as a website.
export function chatSheet<Sheet extends { chat: string | null }>(ask: SheetAsk, api: SheetApi): SheetSource<Sheet> {
  let chat = ask.chat
  const take = (v: Sheet) => { if (v.chat) chat = v.chat; return v }
  return {
    open: () => post<Sheet>(api, '/api/brand', { chat, brief: ask.brief, kind: ask.kind === 'app' ? 'app' : 'site' }).then(take),
    change: (what, body = {}) => (chat ? post<Sheet>(api, `/api/brand/${encodeURIComponent(chat)}/${what}`, body).then(take) : Promise.reject(new Error('No brand sheet yet')))
  }
}

// The room whose screen draws the sheet. A sheet opened from a chat's brief is drawn by the screen that chat is on,
// beside it: the chat stays, with its brief and its Build (web/brand.js: "The chat stays on the left; Build there
// builds from the locked sheet"), and the machine's `from` is that room. Only the Design deck's chat opens one so far
// (a new project's deck, `draft`, and a build's, `deck`). Any other sheet is the brand screen's own: a project's,
// opened from its Studio.
const HOSTS = ['draft', 'deck']
export function sheetHost<Room extends string>(v: { room: Room, from: string | null }): Room {
  return v.room === 'brand' && v.from && HOSTS.includes(v.from) ? v.from as Room : v.room
}
