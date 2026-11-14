// The tier manager (image-first boards architecture §3.3, budgets §4): on every settled frame it picks, for each item
// on a board, what it holds: nothing (hidden), a small photo (tiny), a photo at the size the zoom shows (sharp), or a
// live sandboxed page (live). Pure: no DOM, no clock of its own, so tests drive it with a fake time.
//
//   size     the photo's width is the item's width on screen × the device pixel ratio, rounded up to a power of
//            two (as tldraw does) and never past the photo's own width; a change of size waits like a tier change
//   delay    an item stays past a threshold `hysteresisMs` before it changes tier or size, so edges don't flicker;
//            going live (the person's pick, an agent at work) is at once
//   live     at most `live` items: agents' work first, then what the person selected, then the nearest; the rest
//            drop back to a photo
//   bytes    the photos held add up (width × height × 4); over `bytes`, the furthest drop first, sharp → tiny →
//            hidden, at once (memory comes before smoothness)

export type Tier = 'hidden' | 'tiny' | 'sharp' | 'live'

export interface Budgets {
  // live pages at once
  live: number
  // bytes of decoded photo textures held at once
  bytes: number
  // how far beyond the screen items are prepared, in screens
  margin: number
  hysteresisMs: number
  // below this zoom a photo is tiny
  tinyBelow: number
}

const MB = 1024 * 1024
export const PROFILES: Record<'normal' | 'low', Budgets> = {
  normal: { live: 3, bytes: 512 * MB, margin: 1, hysteresisMs: 300, tinyBelow: 0.3 },
  low: { live: 2, bytes: 256 * MB, margin: 0.5, hysteresisMs: 300, tinyBelow: 0.3 }
}

// The budgets for this machine. A browser does not say how much video memory its adapter has (WebGL names the
// renderer, WebGPU gives no memory), so the normal budget is 25% of the device memory the browser reports, capped at
// 512 MB; a machine with 4 GB or less, or one that says nothing and asks to save data, gets the low profile. It takes
// lite mode's place (architecture §4).
export function budgetsFor(env: { deviceMemoryGB?: number, saveData?: boolean, override?: Partial<Budgets> } = {}): Budgets {
  const gb = env.deviceMemoryGB
  const low = (gb !== undefined && gb <= 4) || (gb === undefined && !!env.saveData)
  const base = low ? PROFILES.low : { ...PROFILES.normal, bytes: Math.min(PROFILES.normal.bytes, Math.round(((gb ?? 8) * 1024 * MB) * 0.25)) }
  return { ...base, ...env.override }
}

export interface Item {
  id: string
  // in the board's own units (what the camera's k scales)
  rect: { x: number, y: number, w: number, h: number }
  // the photo's own width in pixels (its 1× size), so a size is never asked past it
  photoW: number
}

export interface View {
  // the part of the board on screen, in the board's units
  rect: { x: number, y: number, w: number, h: number }
  k: number
  dpr: number
  now: number
}

export interface Wants {
  // the person selected or clicked into these
  selected?: ReadonlySet<string>
  // an agent is working on these
  agents?: ReadonlySet<string>
}

export interface Decision { tier: Tier, px: number, bytes: number }

export const pow2 = (n: number) => (n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n)))
const HIDDEN: Decision = { tier: 'hidden', px: 0, bytes: 0 }

interface Held { d: Decision, pending: Decision | null, since: number }

export class TierManager {
  budgets: Budgets
  private held = new Map<string, Held>()

  constructor(budgets: Budgets) { this.budgets = budgets }

  // what every item holds now; `near` is the spatial index's answer for the view plus the margin
  plan(view: View, items: Iterable<Item>, near: ReadonlySet<string>, wants: Wants = {}): Map<string, Decision> {
    const b = this.budgets
    const sel = wants.selected ?? new Set<string>(), agents = wants.agents ?? new Set<string>()
    const cx = view.rect.x + view.rect.w / 2, cy = view.rect.y + view.rect.h / 2
    const list = [...items]
    const dist = new Map(list.map(i => [i.id, Math.hypot(i.rect.x + i.rect.w / 2 - cx, i.rect.y + i.rect.h / 2 - cy)]))
    const far = (a: Item, z: Item) => (dist.get(z.id) ?? 0) - (dist.get(a.id) ?? 0)

    // a photo at the size this zoom shows
    const photo = (i: Item): Decision => {
      const px = Math.min(i.photoW, pow2(i.rect.w * view.k * view.dpr))
      const h = Math.round(px * (i.rect.h / i.rect.w))
      return { tier: view.k < b.tinyBelow ? 'tiny' : 'sharp', px, bytes: px * h * 4 }
    }

    // live: agents first, then the person's picks, then the nearest; never more than the budget
    const asking = list.filter(i => agents.has(i.id) || sel.has(i.id))
      .sort((a, z) => Number(agents.has(z.id)) - Number(agents.has(a.id)) || Number(sel.has(z.id)) - Number(sel.has(a.id)) || -far(a, z))
    const live = new Set(asking.slice(0, Math.max(0, b.live)).map(i => i.id))

    const wanted = new Map<string, Decision>()
    for (const i of list) {
      if (live.has(i.id)) { const p = photo(i); wanted.set(i.id, { tier: 'live', px: p.px, bytes: p.bytes }) }
      else if (near.has(i.id)) wanted.set(i.id, photo(i))
      else wanted.set(i.id, HIDDEN)
    }

    // hold each change until it has lasted hysteresisMs (a first sight, and going live, are at once)
    const out = new Map<string, Decision>()
    for (const i of list) {
      const want = wanted.get(i.id) as Decision
      const h = this.held.get(i.id)
      if (!h || (want.tier === 'live' && h.d.tier !== 'live')) { this.held.set(i.id, { d: want, pending: null, since: view.now }); out.set(i.id, want); continue }
      if (same(h.d, want)) { h.pending = null; out.set(i.id, h.d); continue }
      if (!h.pending || !same(h.pending, want)) { h.pending = want; h.since = view.now }
      if (view.now - h.since >= b.hysteresisMs) { h.d = want; h.pending = null }
      out.set(i.id, h.d)
    }
    for (const id of [...this.held.keys()]) if (!out.has(id)) this.held.delete(id)

    // the byte budget: over it, the furthest photos step down at once, sharp → tiny → hidden (live ones last)
    let total = 0
    for (const d of out.values()) total += d.bytes
    if (total > b.bytes) {
      const byFar = list.filter(i => (out.get(i.id)?.bytes ?? 0) > 0).sort((a, z) => Number(out.get(a.id)?.tier === 'live') - Number(out.get(z.id)?.tier === 'live') || far(a, z))
      for (const step of ['tiny', 'hidden'] as const) {
        for (const i of byFar) {
          if (total <= b.bytes) break
          const d = out.get(i.id) as Decision
          if (d.tier === 'live' || d.tier === 'hidden' || (step === 'tiny' && d.tier === 'tiny')) continue
          const next: Decision = step === 'hidden' ? HIDDEN : shrink(d, i, view)
          total -= d.bytes - next.bytes
          out.set(i.id, next)
          this.held.set(i.id, { d: next, pending: null, since: view.now })
        }
      }
    }
    return out
  }

  // the bytes the decisions hold
  static bytes(plan: Map<string, Decision>) { let n = 0; for (const d of plan.values()) n += d.bytes; return n }
}

const same = (a: Decision, z: Decision) => a.tier === z.tier && a.px === z.px

// a sharp photo dropped to the small size: a quarter of the photo's own width, as a power of two
function shrink(d: Decision, i: Item, view: View): Decision {
  const px = Math.min(d.px, pow2(i.photoW / 4), pow2(i.rect.w * view.k * view.dpr))
  const h = Math.round(px * (i.rect.h / i.rect.w))
  return { tier: 'tiny', px, bytes: px * h * 4 }
}
