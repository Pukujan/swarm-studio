// One drop target for references (issue #543, decision 0015: "drop anything anywhere"), the logic of the classic
// Studio's web/refdrop.js with its words: a file dropped on a screen goes to the project's References, the one place
// the crew's brief reads, and Hermia asks once, beside it: "like this, or use as is?". Like this keeps it a
// reference; Use as is moves it to the project's Assets, placed as it is (spec 37). RefDrop.tsx draws it.
// No React here, so the unit test (ui/test/refs.test.mjs) runs it as it is (Node strips the types).

// what the server answers for a reference or an asset: each screen reads it with its own type
export interface Ref { id: string, name: string }
export type RefApi = (path: string, init?: RequestInit) => Promise<Response>

const enc = encodeURIComponent

// where a drop goes: the project's address, or a build's (the server finds its project; a build in no project
// answers 404 "this build is not in a project yet"), or null: then the drop is not taken
export function refAt(project?: string | null, run?: string | null): string | null {
  if (project) return `/api/projects/${enc(project)}`
  if (run) return `/api/runs/${enc(run)}`
  return null
}

// what Hermia calls what was dropped: its name, or "N files"
export const whatOf = (added: Ref[]) => (added.length === 1 ? added[0].name : `${added.length} files`)
export const askLine = (what: string) => `I put ${what} in References. Like this, or use as is?`
export const inRefs = (what: string) => `${what} is in References.`
export const placed = (what: string) => `${what} will be placed as it is.`
export const askLabel = (what: string) => `${what}: like this, or use as is?`

// each file to References (12 at most), as web/refdrop.js add(): what could not be added is said with the reason.
// source: 'upload' (web/refdrop.js's), or 'import' on the Studio's first steps, where it is also read for what it
// says (server/refs.mjs)
export async function addRefs<R extends Ref = Ref>(api: RefApi, at: string, files: File[], said: (text: string) => void = () => {}, source: 'upload' | 'import' = 'upload'): Promise<{ refs: R[], added: R[] }> {
  const added: R[] = []
  let refs: R[] | null = null
  for (const f of files.slice(0, 12)) {
    const res = await api(`${at}/refs?name=${enc(f.name || 'reference')}&source=${source}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f }).catch(() => null)
    const j = (res ? await res.json().catch(() => ({})) : {}) as { ref?: R, refs?: R[], error?: string }
    if (!res?.ok || !j.ref) { said(`${f.name} could not be added${j.error ? `: ${j.error}` : ''}.`); continue }
    added.push(j.ref); refs = j.refs || refs
  }
  return { refs: refs || [], added }
}

// Use as is: each added reference to the project's Assets; the store as it is after the last one, or null
export async function placeAsIs<R extends Ref = Ref>(api: RefApi, at: string, added: Ref[]): Promise<{ refs: R[], assets: R[] } | null> {
  let j: { refs?: R[], assets?: R[] } | null = null
  for (const r of added) {
    const res = await api(`${at}/assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: r.id }) }).catch(() => null)
    j = res?.ok ? await res.json().catch(() => null) : j
  }
  return j ? { refs: j.refs || [], assets: j.assets || [] } : null
}
