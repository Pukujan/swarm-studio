// The types of web/canvas/autoplay.js's pure rules (`@studio/autoplay`, vite.config.ts): the Autoplay switch typed in
// the chat, when it is offered, and what the chat answers when it cannot play. The part of that file that draws is
// the classic room's; here useAutoplay.ts draws. tests/next.test.mjs checks every name declared here is exported.
export interface AutoplayRoom { run?: string | null, kind?: string, url?: string | null, live?: boolean }
export declare function autoplayAsk(text: string): 'start' | 'stop' | null
export declare function autoplayOffered(room: AutoplayRoom, can: boolean): boolean
export declare function autoplayNone(room: AutoplayRoom, can: boolean): string
