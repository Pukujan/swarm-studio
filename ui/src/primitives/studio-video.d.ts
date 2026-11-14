// The types of web/video.js as the next UI uses it: every board video's poster, preload, teardown and the page's
// budget of playing clips. The file is the current Studio's; here it is `@studio/video` (vite.config.ts).
// tests/next.test.mjs checks that every name declared here is one web/video.js exports.
export declare function boardVideo(v: HTMLVideoElement, o: { src: string, poster?: string, auto?: boolean, at?: number }): HTMLVideoElement
export declare function dropVideo(v: HTMLVideoElement): void
export declare const playVideo: (v: HTMLVideoElement) => Promise<void>
export declare const posterFor: (src: string) => string
export declare function videoBudget(n?: number): number
export declare const videoStats: () => { held: number, playing: number, clips: number }
