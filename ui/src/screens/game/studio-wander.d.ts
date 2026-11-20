// The types of web/canvas/wander.js as the Game room uses it (`@studio/wander`, vite.config.ts): what the room says
// when there is nothing built to change, "go on" typed at a stopped build, and how a waiting slice reads in the chat.
// tests/next.test.mjs checks that every name declared here is one it exports.
export interface SliceLike { i: number, n: number, name?: string, play?: boolean, started?: boolean, line?: string, skipped?: string, failed?: boolean, ask?: string, ideas?: string[], next?: string, clip?: string }
export interface StepLike { kind?: string, ok?: boolean, text?: string, clip?: string, started?: boolean }
export declare function noAppYet(app: { kind?: string, state?: string, message?: string | null, steps?: unknown[] }): string
export declare function goOnAsk(text: string, app: { state?: string, message?: string | null, steps?: unknown[] }): boolean
export declare function neverDrew(x: StepLike | null | undefined): boolean
export declare function sliceSay(text: string): 'fix' | 'go' | 'ask' | 'note'
export declare function sliceWords(s: SliceLike, result?: unknown, steps?: StepLike[]): { failed: boolean, noStart: boolean, noClip: boolean, line: string, ask: string, ideas: string[] }
