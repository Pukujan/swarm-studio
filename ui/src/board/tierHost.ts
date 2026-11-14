// The second BoardHost (host.ts): the tier manager's (tiers.ts, spec 43 §2.3). It is slice 1's host (iframeHost.ts)
// for the live frames, which attach themselves and carry their messages both ways, plus the tiers: the live wishes
// become the tier manager's wants (an agent's work → agents; the person's pick, an edit, a review → selected), and
// each plan it makes is applied here, so tier() and onTier() report what every item holds now.
// with its extension: tests/board.test.mjs runs this file as it is (Node strips the types)
import { iframeHost, type IframeHost } from './iframeHost.ts'
import type { LiveReason, Tier } from './host'
import type { Decision, Wants } from './tiers'

export interface TierHost extends IframeHost {
  // the wishes as the tier manager weighs them
  wants(): Wants
  // the wishes changed (plan again)
  onWants(fn: () => void): () => void
  // a plan from the tier manager: every item's tier, size and bytes
  apply(plan: ReadonlyMap<string, Decision>): void
  decision(id: string): Decision | undefined
}

const PERSON: ReadonlySet<LiveReason> = new Set(['selected', 'edit', 'review'])

export function tierHost(): TierHost {
  const base = iframeHost()
  const plan = new Map<string, Decision>()
  const reasons = new Map<string, Set<LiveReason>>()
  const tierFns = new Set<(id: string, t: Tier) => void>()
  const wantFns = new Set<() => void>()
  const changed = () => { for (const f of wantFns) f() }

  return {
    ...base,
    tier: id => plan.get(id)?.tier ?? 'hidden',
    onTier(fn) { tierFns.add(fn); return () => { tierFns.delete(fn) } },
    requestLive(id, why) {
      base.requestLive(id, why)
      const set = reasons.get(id) ?? reasons.set(id, new Set()).get(id)!
      if (set.has(why)) return
      set.add(why)
      changed()
    },
    releaseLive(id, why) {
      base.releaseLive(id, why)
      if (!reasons.get(id)?.delete(why)) return
      changed()
    },
    wants() {
      const selected = new Set<string>(), agents = new Set<string>()
      for (const [id, set] of reasons) for (const why of set) (why === 'agent' ? agents : PERSON.has(why) ? selected : null)?.add(id)
      return { selected, agents }
    },
    onWants(fn) { wantFns.add(fn); return () => { wantFns.delete(fn) } },
    apply(next) {
      for (const [id, d] of next) {
        const was = plan.get(id)?.tier ?? 'hidden'
        plan.set(id, d)
        if (was !== d.tier) for (const f of tierFns) f(id, d.tier)
      }
      for (const id of [...plan.keys()]) if (!next.has(id)) { const was = plan.get(id)?.tier; plan.delete(id); if (was && was !== 'hidden') for (const f of tierFns) f(id, 'hidden') }
    },
    decision: id => plan.get(id)
  }
}
