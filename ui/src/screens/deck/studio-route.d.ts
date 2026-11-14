// The types of web/route.js as the next UI uses it: where a message typed into a build's chat goes. The file is the
// current Studio's; here it is `@studio/route` (vite.config.ts). tests/next.test.mjs checks that every name declared
// here is one web/route.js exports.
export type Route = 'none' | 'slash' | 'new' | 'fix' | 'extend'
export declare function routeMessage(m: { text?: string, run?: string | null, site?: boolean, selected?: boolean, hosted?: boolean }): Route
export declare function seoAsk(text: string): boolean
