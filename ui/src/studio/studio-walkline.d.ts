// The types of web/walkline.js (`@studio/walkline`, resolved by vite.config.ts): what Hermia says as the Studio's walk
// goes, the same words in both apps (#541). tests/next.test.mjs checks every name is exported.
export declare const WALK_SAYS: Record<string, { done: string, next: string }>
export declare function nextStep(order: string[], stateOf: (step: string) => string, from?: string | null): string | null
export declare function walkNext(step: string, names: Record<string, string>): string
export declare function walkLine(o: { step: string, how: 'done' | 'skipped', next: string | null, names: Record<string, string> }): string
export declare function moodLine(mood: string, next: string | null, names: Record<string, string>): string
