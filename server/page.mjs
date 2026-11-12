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
  // a module joined into one inline script: its imports of the other files go, its exports become plain
  const join1 = f => read(f).replace(/^import .* from '\.\/.*'$/gm, '').replace(/^export /gm, '')
  const boot = JSON.stringify({ version: webVersion(webDir), frameHtml: read('frame.html'), motion: { css: MOTION_CSS, src: swarmMotion.toString(), snappy: SNAPPY.source }, layout: layoutSource(), guard: swarmLayout.toString(), ...extra }).replace(/</g, '\\u003c')
  return read('index.html')
    .replace('<link rel="stylesheet" href="canvas.css">', () => `<style>${read('canvas.css')}</style>`)
    .replace('<script src="crew.js"></script>', () => `<script>${read('crew.js')}</script>`)
    .replace('<script src="chatter.js"></script>', () => `<script>${read('chatter.js')}</script>`)
    .replace('<script src="show.js"></script>', () => `<script>${read('show.js')}</script>`)
    // the UI kit (docs/specs/12-flow-map.md): shadcn-style tokens and components, and the panel helpers
    .replace('<script src="ui.js"></script>', () => `<script>${read('ui.js')}</script>`)
    .replace('<link rel="stylesheet" href="ui.css">', () => `<style>${read('ui.css')}</style>`)
    .replace('<script type="module" src="canvas.js"></script>', () => `<script>window.SWARM = ${boot}</script>\n<script type="module">${['route.js', 'icons.js', 'store.js', 'workshop.js', 'canvas.js'].map(join1).join('\n')}</script>`)
    // the studio frame, Projects and a project's canvas
    .replace('<link rel="stylesheet" href="studio.css">', () => `<style>${read('studio.css')}</style>`)
    .replace('<link rel="stylesheet" href="home.css">', () => `<style>${read('home.css')}</style>`)
    .replace('<link rel="stylesheet" href="project.css">', () => `<style>${read('project.css')}</style>`)
    .replace('<link rel="stylesheet" href="setup.css">', () => `<style>${read('setup.css')}</style>`)
    .replace('<link rel="stylesheet" href="plan.css">', () => `<style>${read('plan.css')}</style>`)
    .replace('<link rel="stylesheet" href="workshop.css">', () => `<style>${read('workshop.css')}</style>`)
    // the studio controller, Projects and a project: its own modules joined into one, since the pane's frame has no origin to import from
    .replace('<script type="module" src="studio.js"></script>', () => `<script type="module">${['icons.js', 'route.js', 'setup.js', 'settings.js', 'home.js', 'project.js', 'work.js', 'plan.js', 'studio.js'].map(join1).join('\n')}</script>`)
}
