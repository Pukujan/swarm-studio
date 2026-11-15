/// <reference types="vite/client" />

declare global {
  interface Window {
    /** inlined by the server (server/next.mjs): the API token, the build of the page, the hosted prefix and, in the hosted studio, its guest (server/hosted.mjs) */
    SWARM?: { token?: string, version?: string, base?: string, hosted?: unknown, motion?: { css: string, src: string, snappy: string }, layout?: string }
  }
}
export {}
