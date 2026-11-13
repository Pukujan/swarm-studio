// The types of web/icons.js as the next UI uses it: the Lucide line icons' paths (ISC; licence in
// web/brand/LICENSE-lucide.txt) and the crew's names. The file is the current Studio's; here it is `@studio/icons`
// (vite.config.ts). tests/next.test.mjs checks that every name declared here is one web/icons.js exports.
export declare const P: Record<string, string>
// the crew who write a plan's cards in, and who paint a picture slot
export declare const CREW: string[]
export declare const PAINTERS: string[]
export declare function painterOf(key: string): string
