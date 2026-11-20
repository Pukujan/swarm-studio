// The type of web/replaytalk.js's appPill (`@studio/replaytalk`, vite.config.ts): the room's state in the pill's
// words ("building", "running", "your turn"), the same in both apps. tests/next.test.mjs checks it is exported.
export declare function appPill(o: { replay?: boolean, at?: number, state?: string, url?: string | null, hasApp?: boolean, kind?: string, part?: { state: string, hasApp?: boolean } | null }): string
