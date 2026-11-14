// The canvas as one document (styles, script, frame template and boot data inline), so it
// also works inside the Desktop pane's sandboxed frame, whose origin is opaque. Shared by
// the local studio (server.mjs) and the hosted one (hosted.mjs), which adds its own boot keys.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MOTION_CSS, SNAPPY, swarmMotion } from '../engine/motion.mjs'
import { layoutSource, swarmLayout } from '../engine/layout.mjs'

// Changes whenever a canvas file does. An open canvas compares it with its own and
// reloads itself when idle, because Hermes's pane keeps a page open indefinitely.
// (web/edit/ too: its files are joined in like the rest)
export const webVersion = webDir => String(Math.max(...readdirSync(webDir, { recursive: true }).map(f => statSync(join(webDir, f)).mtimeMs)) | 0)

// A vendored library (web/vendor/, built by scripts/vendor.mjs) imported by a joined module.
const VENDOR_IMPORT = /^import \{([^}]*)\} from '(?:\.\.?\/)+(vendor\/[^']+\.mjs)'$/gm
const vendorVar = path => `__vendor_${path.split('/')[1].replace(/\W/g, '_')}`
const pairs = list => list.split(',').map(e => e.trim()).filter(Boolean).map(e => e.split(/\s+as\s+/))

// Modules joined into one inline script, since the pane's frame has an opaque origin and cannot import:
// imports of the other web files go and their exports become plain names. A vendored library goes in
// once, ahead of them, as a value made from its own code: esbuild's closing `export { a as b }` becomes
// the value's fields, and every `import { b } from './vendor/x/x.mjs'` becomes one declaration of them.
export function joinModules(webDir, files) {
  const read = f => readFileSync(join(webDir, f), 'utf8')
  // path → (local name → exported name), so a name two files import is declared once
  const libs = new Map()
  const body = files.map(f => {
    const src = read(f)
      .replace(VENDOR_IMPORT, (_, names, path) => {
        const used = libs.get(path) || libs.set(path, new Map()).get(path)
        for (const [name, local] of pairs(names)) used.set(local || name, name)
        return ''
      })
      .replace(/^import (?:.* from )?'\.\.?\/.*'$/gm, '').replace(/^export /gm, '')
    // a Studio kit (web/kit-<kind>.js, docs/specs/37-studio-first.md) keeps its own names: it is its own
    // closure, and only its export, <kind>Kit, reaches web/kits.js
    const kit = f.match(/^kit-([a-z]+)\.js$/)
    return kit ? `const ${kit[1]}Kit = (() => {\n${src}\nreturn ${kit[1]}Kit\n})()` : src
  })
  const vendored = [...libs].map(([path, used]) => {
    const src = read(path)
    const end = src.match(/export\s*\{([^}]*)\};?\s*$/)
    if (!end) throw new Error(`${path}: no closing export to inline`)
    const fields = pairs(end[1]).map(([local, name]) => `${name || local}: ${local}`).join(', ')
    const names = [...used].map(([local, name]) => (local === name ? name : `${name}: ${local}`)).join(', ')
    return `const ${vendorVar(path)} = (() => {\n${src.slice(0, end.index)}\nreturn { ${fields} }\n})()\nconst { ${names} } = ${vendorVar(path)}`
  })
  // inlined in a <script>: a "</script" in the code (a deck's frame, say) would end it early; "<\/script" is the same string
  return [...vendored, ...body].join('\n').replace(/<\/script/gi, '<\\/script')
}

// every Studio kit there is (web/kit-<kind>.js): web/kits.js names the ones it lists
const kitFiles = webDir => readdirSync(webDir).filter(f => /^kit-[a-z]+\.js$/.test(f)).sort()

export function canvasPage(webDir, extra = {}) {
  const read = f => readFileSync(join(webDir, f), 'utf8')
  const boot = JSON.stringify({ version: webVersion(webDir), frameHtml: read('frame.html'), motion: { css: MOTION_CSS, src: swarmMotion.toString(), snappy: SNAPPY.source }, layout: layoutSource(), guard: swarmLayout.toString(), ...extra }).replace(/</g, '\\u003c')
  return read('index.html')
    .replace('<link rel="stylesheet" href="tokens.css">', () => `<style>${read('tokens.css')}</style>`)
    .replace('<link rel="stylesheet" href="canvas.css">', () => `<style>${read('canvas.css')}</style>`)
    .replace('<script src="crew.js"></script>', () => `<script>${read('crew.js')}</script>`)
    .replace('<script src="chatter.js"></script>', () => `<script>${read('chatter.js')}</script>`)
    .replace('<script src="show.js"></script>', () => `<script>${read('show.js')}</script>`)
    // the UI kit (docs/specs/12-flow-map.md): shadcn-style tokens and components, and the panel helpers
    .replace('<script src="ui.js"></script>', () => `<script>${read('ui.js')}</script>`)
    .replace('<link rel="stylesheet" href="ui.css">', () => `<style>${read('ui.css')}</style>`)
    .replace('<script type="module" src="canvas.js"></script>', () => `<script>window.SWARM = ${boot}</script>\n<script type="module">${joinModules(webDir, ['route.js', 'icons.js', 'data.js', 'workshop.js', 'seo.js', 'layerlink.js', 'layers.js', 'video.js', 'clean.js', 'canvas/core.js', 'canvas/base.js', 'canvas/carry.js', 'canvas/events.js', 'canvas/deck.js', 'canvas/panels.js', 'canvas/zoom.js', 'canvas/loop.js', 'canvas/talk.js', 'canvas/player.js', 'canvas/design.js', 'canvas/publish.js', 'canvas/marks.js', 'canvas/film.js', 'canvas/settings.js', 'canvas/replay.js', 'canvas/rooms.js', 'canvas/start.js', 'canvas/auto.js', 'canvas/dock.js', 'canvas/hook.js', 'canvas/hosted.js', 'canvas.js'])}</script>`)
    // the studio frame, Projects and a project's canvas
    .replace('<link rel="stylesheet" href="studio.css">', () => `<style>${read('studio.css')}</style>`)
    .replace('<link rel="stylesheet" href="home.css">', () => `<style>${read('home.css')}</style>`)
    .replace('<link rel="stylesheet" href="project.css">', () => `<style>${read('project.css')}</style>`)
    .replace('<link rel="stylesheet" href="setup.css">', () => `<style>${read('setup.css')}</style>`)
    .replace('<link rel="stylesheet" href="plan.css">', () => `<style>${read('plan.css')}</style>`)
    .replace('<link rel="stylesheet" href="brand.css">', () => `<style>${read('brand.css')}</style>`)
    .replace('<link rel="stylesheet" href="scaffold.css">', () => `<style>${read('scaffold.css')}</style>`)
    .replace('<link rel="stylesheet" href="workshop.css">', () => `<style>${read('workshop.css')}</style>`)
    .replace('<link rel="stylesheet" href="pet.css">', () => `<style>${read('pet.css')}</style>`)
    // the studio controller, Projects and a project: its own modules joined into one
    .replace('<script type="module" src="studio.js"></script>', () => `<script type="module">${joinModules(webDir, ['icons.js', 'route.js', 'video.js', 'setup-parts.js', 'setup.js', 'settings.js', 'makeways.js', 'templatepick.js', 'bringin.js', 'home.js', 'edit/patches.js', 'layers.js', 'lookmatch.js', 'project.js', 'work.js', 'board.js', 'plan.js', 'brand.js', ...kitFiles(webDir), 'kits.js', 'scaffold.js', 'nav.js', 'modes.js', 'pet.js', 'studio.js'])}</script>`)
}
