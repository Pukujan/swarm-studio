// The crew's radio on the app build wall (web/canvas/auto.js radioEvent): the app engine's lead, spoken by Hermia,
// gives orders (crew:lead, to one helper), a helper says what it is doing right now (crew:act, live only) and answers
// (agent:say). Her thinking ('reason') is a dimmer line, never an order. A new run starts the radio again.
import type { RunEvent } from './model'

export interface Heard { text: string, t: number }
export interface Radio {
  run: string | null
  lead: (Heard & { to: string, kind: string }) | null
  reason: Heard | null
  acts: Record<string, Heard>
  says: Record<string, Heard>
}

export const NO_RADIO: Radio = { run: null, lead: null, reason: null, acts: {}, says: {} }
// how long each is fresh (web/canvas/start.js): an order draws Hermia's line for 7 s, a reply stays 5.5 s, what a
// helper is doing 15 s
export const FRESH = { lead: 7000, say: 5500, act: 15000 }
export const heard = (x: Heard | null | undefined, ms: number, now = Date.now()) => !!x && now - x.t < ms

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function foldRadio(r: Radio, e: RunEvent): Radio {
  if (e.type !== 'crew:lead' && e.type !== 'crew:act' && e.type !== 'agent:say') return r
  const run = e.run ?? r.run
  const base = run !== r.run ? { ...NO_RADIO, run } : r
  const t = typeof e.t === 'number' ? e.t : Date.now()
  if (e.type === 'crew:lead' && e.kind === 'reason') return { ...base, reason: { text: str(e.text).replace(/^💭\s*/u, ''), t } }
  if (e.type === 'crew:lead') return { ...base, lead: { text: str(e.text), to: str(e.to), kind: str(e.kind) || 'think', t } }
  const name = str(e.name) || str(e.agent)
  if (!name) return base
  if (e.type === 'crew:act') return { ...base, acts: { ...base.acts, [name]: { text: str(e.text), t } } }
  return { ...base, says: { ...base.says, [name]: { text: str(e.text), t } } }
}
