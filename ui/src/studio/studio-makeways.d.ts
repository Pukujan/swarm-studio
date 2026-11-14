// The types of web/makeways.js (`@studio/makeways`, resolved by vite.config.ts): the two ways to make something
// (docs/decisions/0020-ask-before-build.md) and which a kind offers, the same file in both apps. tests/next.test.mjs checks
// every name is exported.
export type MakeMode = 'now' | 'studio'
export interface MakeWay { k: MakeMode, icon: string, label: string, words: boolean, steps?: string[], step?: string }
export declare const MAKE_KINDS: Record<string, MakeMode[]>
export declare function makeWays(kind: string, words: boolean): MakeWay[]
export declare function makeStudioStep(kind: string): string
export declare function makeModeOf(k: string | null): MakeMode | null
