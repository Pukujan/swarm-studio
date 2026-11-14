// The types of web/edit/patches.js as the next UI uses it: Open Design's Edit, ported (decision 0010,
// docs/engines/open-design.md). It works on a finished section's HTML (a fragment) and hands back new HTML; an
// element is addressed by its child-index path ('path-0-2'). The file is the current Studio's; here it is
// `@studio/edit` (vite.config.ts). tests/next.test.mjs checks that every name declared here is one it exports.
export type PartKind = 'text' | 'link' | 'image' | 'container' | 'graphic'
export interface PartRow { id: string, depth: number, tag: string, kind: PartKind, label: string }
export interface Part {
  id: string, tag: string, kind: PartKind, label: string
  fields: { text?: string, href?: string, src?: string, alt?: string }
  styles: Record<string, string>
  attributes: Record<string, string>
  wordsEditable: boolean, canRemove: boolean, canUp: boolean, canDown: boolean
}
export type Patch =
  | { kind: 'set-text', id: string, value: string }
  | { kind: 'set-link', id: string, text?: string, href: string }
  | { kind: 'set-image', id: string, src: string, alt?: string }
  | { kind: 'set-style', id: string, styles: Record<string, string> }
  | { kind: 'set-attributes', id: string, attributes: Record<string, string> }
  | { kind: 'remove-element', id: string }
  | { kind: 'move-element', id: string, dir: -1 | 1 }
export declare const swEdit: {
  STYLE_PROPS: string[]
  tree(html: string, max?: number): PartRow[]
  read(html: string, id: string): Part | null
  apply(html: string, patch: Patch): { ok: boolean, html: string, id: string | null, error?: string }
}
