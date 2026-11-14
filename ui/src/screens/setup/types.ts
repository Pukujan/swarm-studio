// What the Setup routes answer (server/setup.mjs, engine/setup.mjs). No answer carries a key: a provider says
// whether it is signed in, /api/setup/parts says whether each key is set.

export interface RoleTest { ok: boolean, error?: string }
export interface ModelTest {
  ok: boolean
  planner: RoleTest
  worker: RoleTest
  // one plain line and the fix that fits it (engine/setup.mjs modelProblem)
  problem?: { line: string, fix?: 'hermes' | string }
}

export interface Account {
  connected?: boolean
  guest?: boolean
  name?: string
  handle?: string
  pending?: { code?: string } | null
}

export interface Pictures {
  mode: 'painted' | 'stock' | 'drawn'
  painted: { model?: string, provider?: string, ready?: boolean, error?: string }
}

export interface SetupView {
  seen: boolean
  modelsOk?: boolean | null
  test?: ModelTest | null
  models: {
    planner?: { model?: string }
    worker?: { model?: string }
    media?: { model?: string, off?: boolean, takes?: string }
  }
  pictures: Pictures
  account?: Account
}

export interface Provider {
  slug: string
  name: string
  signedIn: boolean
  current?: boolean
  models: string[]
  // 'key' when a key is the only sign-in; anything else signs in in the browser
  sign?: string
}
export interface Slot { provider: string, model: string }
export interface Signing { slug: string, url?: string, code?: string, done?: boolean | null, error?: string }
export interface Options {
  ok: boolean
  message?: string
  providers: Provider[]
  slots?: Record<string, Slot>
  main?: Slot
  signing?: Signing | null
}
