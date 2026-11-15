// The types of web/github.js as the next UI uses it: where builds go on GitHub, typed in a chat ("publish to
// <organization>", "where do builds go"). The file is the current Studio's; here it is `@studio/github`
// (vite.config.ts). tests/next.test.mjs checks that every name declared here is one web/github.js exports.
export declare function ownerSay(text: string, host: { api: (path: string, opts?: RequestInit) => Promise<Response>, said: (text: string) => void, answer: (text: string) => void }): Promise<boolean>
