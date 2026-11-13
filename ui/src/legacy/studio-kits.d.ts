// The types of web/kits.js as the next UI uses it: the Studio's kits (docs/specs/37-studio-first.md, "The kit
// contract"), one per kind. The files are the current Studio's, checked by the root tsconfig.json; here they are
// imported by name (`@studio/kits`, resolved by vite.config.ts) and hosted as they are (src/legacy/kits.ts).

// what every kit is handed (web/scaffold.js ctx())
export interface KitCtx {
  project: { id: string, name: string, title?: string | null }
  studio: Studio
  brand: unknown
  refs: StoreItem[]
  assets: StoreItem[]
  chat: string | null
  state: Record<string, unknown>
  look: { bg: string, text: string, accent: string, link: string, heading: string, body: string } | null
  sw: unknown
  C: unknown
  board: { toast(text: string): void, focus(target: string | HTMLElement, animate?: boolean): boolean }
  save(data: Record<string, unknown>): Promise<unknown>
  select(key: string | null): void
  refresh(): void
  say(text: string): void
}

export interface KitCard {
  key: string
  name: string
  cls?: string
  add?: boolean
  wide?: boolean
  busy?: boolean
  render?: ((el: HTMLElement, ctx: KitCtx) => void) | null
  inspect?: (box: HTMLElement, ctx: KitCtx) => void
  press?: (ctx: KitCtx) => void
  rename?: (name: string) => unknown
  remove?: (() => unknown) | null
}

export interface Kit {
  kind: string
  name: string
  steps: string[]
  starts: { id: string, name: string, why?: string }[]
  suggest?: (ctx: KitCtx) => string | undefined
  prepare?: (ctx: KitCtx) => Promise<unknown>
  plan?: { sections(ctx: KitCtx): { sec?: string, cards: KitCard[] }[], done?(ctx: KitCtx): boolean }
  build?: (spec: unknown, ctx: KitCtx) => Promise<{ run?: string } | undefined>
}

export interface StoreItem { id: string, name: string, kind?: string, src?: string, role?: string }

export interface Studio {
  kind: string
  idea: string
  mode?: string
  chat: string | null
  steps: Record<string, string>
  start?: string
  kit?: Record<string, unknown>
  locked?: unknown
  proposal?: unknown
}

export declare const KITS: Record<string, Kit>
