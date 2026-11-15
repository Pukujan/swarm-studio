// The types of web/capture.js as the next UI uses it: a page photographs itself inside its sandboxed frame
// (web/frame.html `capture`, snapDOM) and a worker makes each size's JPEG. The file is the current Studio's; here it
// is `@studio/capture` (vite.config.ts). tests/next.test.mjs checks that every name declared here is one
// web/capture.js exports.
export declare const MAX_HEIGHT: number
export declare const LIB: string
export declare const sizeAt: (width: number, height: number, scale: number) => { w: number, h: number }
export declare const dataUrl: (blob: Blob) => Promise<string>
export interface Shot { width: number, height: number, scale: number, jpegs: Map<number, Blob>, ms: { page: number, resize: number, total: number } }
export declare function makeCapture(options?: { base?: string, quality?: number, timeout?: number }): {
  shoot(win: Window, opts?: { scales?: number[], maxHeight?: number, fit?: number }): Promise<Shot>
  close(): void
}
