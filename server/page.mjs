// The canvas as one document (styles, script, frame template and boot data inline), so it
// also works inside the Desktop pane's sandboxed frame, whose origin is opaque. Shared by
// the local studio (server.mjs) and the hosted one (hosted.mjs), which adds its own boot keys.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MOTION_CSS, SNAPPY, swarmMotion } from '../engine/motion.mjs'
import { layoutSource, swarmLayout } from '../engine/layout.mjs'

// Changes whenever a canvas file does. An open canvas compares it with its own and
// reloads itself when idle, because Hermes's pane keeps a page open indefinitely.
export const webVersion = webDir => String(Math.max(...readdirSync(webDir).map(f => statSync(join(webDir, f)).mtimeMs)) | 0)

export function canvasPage(webDir, extra = {}) {
  const read = f => readFileSync(join(webDir, f), 'utf8')
  const boot = JSON.stringify({ version: webVersion(webDir), frameHtml: read('frame.html'), motion: { css: MOTION_CSS, src: swarmMotion.toString(), snappy: SNAPPY.source }, layout: layoutSource(), guard: swarmLayout.toString(), ...extra }).replace(/</g, '\\u003c')
  return read('index.html')
    .replace('<link rel="stylesheet" href="canvas.css">', () => `<style>${read('canvas.css')}</style>`)
    .replace('<script src="crew.js"></script>', () => `<script>${read('crew.js')}</script>`)
    .replace('<script src="chatter.js"></script>', () => `<script>${read('chatter.js')}</script>`)
    .replace('<script src="show.js"></script>', () => `<script>${read('show.js')}</script>`)
    // the UI kit (docs/specs/12-flow-map.md): shadcn-style tokens and components, and the panel helpers
    .replace('<script src="ui.js"></script>', () => `<script>${read('ui.js')}</script>`)
    .replace('<link rel="stylesheet" href="ui.css">', () => `<style>${read('ui.css')}</style>`)
    .replace('<script type="module" src="canvas.js"></script>', () => `<script>window.SWARM = ${boot}</script>\n<script type="module">${read('canvas.js')}</script>`)
    // the galaxy home and the orbit view (docs/specs/08-identity.md, "Galaxy and orbit"); three.js loads from web/vendor on demand
    .replace('<link rel="stylesheet" href="galaxy.css">', () => `<style>${read('galaxy.css')}</style>`)
    .replace('<script type="module" src="galaxy.js"></script>', () => `<script type="module">${read('galaxy.js')}</script>`)
    .replace('<script type="module" src="orbit.js"></script>', () => `<script type="module">${read('orbit.js')}</script>`)
}
