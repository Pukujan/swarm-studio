// What the Studio's scripts share through window, for the type check (tsconfig.json). Each is set by
// one file and read by others; they are typed loosely until their owners are typed.
export {}
declare global {
  interface Window {
    /** inlined by the server: the API token, the base path, the frame template */
    SWARM: { token?: string, base?: string, [k: string]: any }
    /** web/canvas.js: what studio.js, home.js and project.js may read and call */
    swarm: any
    /** web/studio.js: the navigation, the brand, the rooms */
    swarmCosmos: any
    /** web/kits.js */
    swarmKits: any
    /** web/data.js: the debug dump */
    swarmState: () => object
    /** classic scripts: web/ui.js, web/crew.js, web/chatter.js, web/show.js, web/setup.js */
    SwarmUI: any
    SwarmCrew: any
    SwarmChatter: any
    SwarmShow: any
    SwarmSetup: any
    webkitAudioContext: typeof AudioContext
  }
  interface Navigator {
    /** Chromium only: the device's memory in GB, rounded (web/canvas/settings.js picks lite mode by it) */
    deviceMemory?: number
  }
}
