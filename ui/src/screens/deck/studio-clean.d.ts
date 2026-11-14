// The types of web/clean.js as the next UI uses it: model-written section HTML made inert before a frame shows it
// (every <script>, on* attribute and javascript: URL goes). The file is the current Studio's; here it is
// `@studio/clean` (vite.config.ts). tests/next.test.mjs checks that every name declared here is one web/clean.js
// exports.
export declare function clean(text: string, doc?: Document): string
