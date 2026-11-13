/// <reference types="vite/client" />

declare global {
  interface Window {
    /** inlined by the server (server/next.mjs): the API token and the build of the page */
    SWARM?: { token?: string, version?: string }
  }
}
export {}
