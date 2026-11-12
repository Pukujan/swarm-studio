// The game kit (docs/specs/37-studio-first.md, "The kit contract"): today's Plan board (web/plan.js,
// spec 21) behind the contract, unchanged. Its cards are the Plan step, its price is the proposal's cost,
// and its lock is the plan's lock (the board's own gate, with the same price the server checks again).
// The board instance is ctx.C.planView; this module only reads it and calls its gate.
// The joined page has one scope (server/page.mjs), so every helper here is prefixed gameKit.

const gameKitPlan = ctx => ctx?.C?.planView?.plan || null

export const gameKit = {
  kind: 'game',
  name: 'Game',
  icon: 'game',
  steps: ['brand', 'references', 'assets', 'plan'],
  // where to start (engine/talkplan.mjs startsOf, spec 27 slice 5): the cast, the map or the world, then the cards
  starts: [{ id: 'cast', name: 'The cast' }, { id: 'world', name: 'The world' }, { id: 'design', name: 'Overall design' }],
  reads: ['palette', 'type', 'voice', 'pictures'],
  plan: {
    // the board draws its own artboards; the kit names them so the scaffold can list and select them
    sections: ctx => {
      const p = gameKitPlan(ctx)
      if (!p) return []
      const pick = key => () => ctx.C.planView.select(key)
      const sv = p.starterView || {}
      return [
        { sec: 'Starter', cards: ['engine', 'template', 'assets'].filter(k => sv[k]).map(k => ({ key: `st:${k}`, name: sv[k].name || k, render: null, inspect: pick(`st:${k}`) })) },
        { sec: 'Systems', cards: (sv.systems || []).map(x => ({ key: `sys:${x.id}`, name: x.name, render: null, inspect: pick(`sys:${x.id}`) })) },
        { sec: 'Plan', cards: (p.cards || []).map(c => ({ key: `card:${c.id}`, name: c.name, render: null, inspect: pick(`card:${c.id}`) })) }
      ].filter(s => s.cards.length)
    },
    // a game's questions are asked by the planner in the chat (spec 27); the kit adds none of its own
    questions: () => [],
    done: ctx => !!gameKitPlan(ctx)?.gate?.locked
  },
  // the price on the Lock button, as parts the person reads before anything costly runs
  proposal: ctx => {
    const pr = gameKitPlan(ctx)?.price
    if (!pr) return { items: [], minutes: 0, credits: 0 }
    const items = [...pr.parts.filter(x => x.n).map(x => ({ what: `${x.what}: ${x.n}`, order: 'models' })), { what: `Pictures: ${pr.images}`, order: 'art' }, { what: `Coding runs: ${pr.runs}`, order: 'build' }]
    return { items, minutes: pr.minutes || 0, credits: pr.credits }
  },
  // what the locked spec keeps under spec.kits.game: the plan, its gate and the starter
  lock: ctx => {
    const p = gameKitPlan(ctx)
    return p?.gate?.locked ? { plan: p.id, gate: { lockedAt: p.gate.lockedAt, phase: p.gate.phase, credits: p.gate.credits }, starter: p.gate.starter || null } : null
  },
  // the Build press: the board's own gate (Lock with the price first, then Build)
  build: async (spec, ctx) => { await ctx.C.planView.gate(); return { run: gameKitPlan(ctx)?.build?.run || null } }
}
