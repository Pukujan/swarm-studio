// The types of web/makeways.js (`@studio/makeways`, resolved by vite.config.ts): the five ways to make something
// (docs/specs/42-ways-to-make.md) and which a kind offers, the same file in both apps. tests/next.test.mjs checks
// every name is exported.
export type MakeMode = 'now' | 'guided' | 'takes' | 'scaffold' | 'studio'
export interface MakeWay { k: MakeMode, icon: string, label: string, words: boolean, steps?: string[], step?: string }
export declare const MAKE_KINDS: Record<string, MakeMode[]>
export declare function makeWays(kind: string, words: boolean): MakeWay[]
export declare function makeStudioStep(kind: string): string
export declare function makeModeOf(k: string | null): MakeMode | null
