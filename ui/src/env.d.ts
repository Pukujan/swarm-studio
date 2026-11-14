/// <reference types="vite/client" />

declare global {
  interface Window {
    /** inlined by the server (server/next.mjs): the API token, the build of the page and the hosted prefix */
    SWARM?: { token?: string, version?: string, base?: string }
  }
}
export {}
