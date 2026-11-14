// What the app build wall shows, as the app's routes give it (engine/appjob.mjs view() and state(); engine/appmap.mjs)
export interface AppStep { kind: string, text: string, ok?: boolean, turn?: number, file?: boolean, t?: number }

export interface AppState {
  state?: 'working' | 'done' | 'failed' | 'stopped' | 'paused'
  kind?: 'site' | 'app' | 'game'
  stage?: string
  // how the app is served: its dev server while it is built, its build after (decision 0017)
  served?: 'dev' | 'files' | 'built' | null
  steps?: AppStep[]
  url?: string | null
  photo?: string | null
  result?: { ok?: boolean, gatesPassed?: boolean, turns?: number, files?: number } | null
  deployed?: string | null
  hasApp?: boolean
  message?: string | null
  // the project's name (server/server.mjs runApp)
  name?: string | null
}

export interface AppMap {
  version: string
  flow: string
  er: string
  screens: { id: string, name: string, path: string }[]
  data: { id: string, name: string }[]
  note?: string
  at?: number
}

export interface RunEvent { type: string, run?: string, t?: number, [k: string]: unknown }

export interface AppModel {
  run: string
  title: string
  // the build's crew, in the order of the wall's windows: Map, Live app, Code, Shipped (the web wall's wallNames())
  crew: string[]
  app: AppState | null
  // undefined while it loads; null when the run kept no plan
  map?: AppMap | null
  // the screens the build's checks passed (appkit:checks 'screen:<id>' ok), by the map's ids
  done: string[]
  file: { path: string, text: string } | null
  files: { path: string, size: number }[]
  deployedAt?: number
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const mapId = (id: string) => `s_${id.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)}`

// The screen being built now: the one whose name (or path) the file being written is named after
export function nowScreen(map: AppMap | null | undefined, file: string | null | undefined): string | null {
  if (!map || !file) return null
  const f = letters(file.split('/').pop()?.replace(/\.[a-z]+$/i, '') || '')
  if (f.length < 3) return null
  return map.screens.find(s => { const n = letters(s.name), p = letters(s.path.split('/').filter(Boolean).pop() || ''); return (n.length >= 3 && (f.includes(n) || n.includes(f))) || (p.length >= 3 && f.includes(p)) })?.id ?? null
}

// appkit:checks parts ('screen:<kit id>') that passed, as the map's ids
export function doneScreens(events: RunEvent[]): string[] {
  const last = events.findLast(e => e.type === 'appkit:checks') as { checks?: { part?: string, ok?: boolean }[] } | undefined
  return (last?.checks || []).filter(c => c.ok && String(c.part || '').startsWith('screen:')).map(c => mapId(String(c.part).slice(7)))
}

// the flowchart with the screen being built and the ones done marked (theme-neutral: the diagram's colours stay
// Mermaid's own; done is faded, now has a heavy dashed edge)
export function markedFlow(map: AppMap, now: string | null, done: string[]): string {
  const ids = new Set(map.screens.map(s => s.id))
  const d = done.filter(id => ids.has(id) && id !== now)
  return [map.flow,
    ...(d.length ? ['  classDef done opacity:0.5', `  class ${d.join(',')} done`] : []),
    ...(now && ids.has(now) ? ['  classDef now stroke-width:3px,stroke-dasharray:5 3', `  class ${now} now`] : [])].join('\n')
}

// the next screen the plan has that is not done yet
export const nextScreen = (map: AppMap | null | undefined, done: string[], now: string | null) => map?.screens.find(s => !done.includes(s.id) && s.id !== now) ?? null
