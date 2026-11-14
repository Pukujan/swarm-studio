// What the brand routes answer (server/brand.mjs, docs/specs/31-brand-sheet.md): the sheet, its theme and the packs
export interface Palette { id: string, name: string, bg: string, text: string, accent: string, link: string }
export interface TypeOption { id: string, name: string, heading: string, body: string }
export interface Photo { url: string, alt?: string }

export interface Brand {
  brief: string
  story?: { what?: string, who?: string, pages?: string[] }
  palettes: Palette[]
  types: TypeOption[]
  pick?: { palette?: string | null, type?: string | null }
  pack?: string | null
  voice?: { pack: string, name: string, lines: string[] } | null
  pictures?: { pack: string, name: string, photos: Photo[] } | null
  storyboard?: { pack: string, frames: string[] } | null
  lockedAt?: number | null
}

export interface BrandPack {
  slug: string
  name: string
  why?: string
  suggested?: boolean
  palette: Omit<Palette, 'id' | 'name'>
  type: { heading: string, body: string }
  radius: string
  voice: { lines: string[] }
  pictures: { name: string, photos: Photo[] }
}

export interface BrandView { chat: string | null, brand: Brand | null, theme: unknown, packs?: BrandPack[] }

// what the person can do on the sheet; each answers with the new view
export type Pick = { part: 'palette' | 'type', id: string } | { part: 'palette' | 'type', words: string } | { part: 'pack', id: string, parts?: string[] }
export type Edit = { part: 'story', values: Record<string, string> } | { part: 'palette' | 'type', id: string, values: Record<string, string> }
export interface BrandActions {
  pick(p: Pick): Promise<void>
  edit(e: Edit): Promise<void>
  lock(): Promise<void>
  unlock(): Promise<void>
}
