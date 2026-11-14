// The orphan check for the studio's own code (CI: tools/dev, `npm run orphans`): every file under web/, engine/
// and server/ is reached from something that runs. A file nothing reaches is dead: delete it, or wire it in.
// (The next UI has its own, with unused exports and packages too: ui/knip.config.ts, `npm run orphans:ui`.
// knip needs a package.json where it runs and the plugin's root has none on purpose, so this side is
// dependency-cruiser's reachability rule: files only, not exports.)
import { fileURLToPath } from 'node:url'
import { CANVAS_MODULES, PAGE_SCRIPTS, studioModules } from './server/page.mjs'

const literal = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')
// The page is not built through imports alone: server/page.mjs joins fixed lists of web files into one script.
// Those lists are read from page.mjs itself, so a file added to one is an entry point here the same day.
const pageFiles = [...new Set([...PAGE_SCRIPTS, ...CANVAS_MODULES, ...studioModules(fileURLToPath(new URL('./web', import.meta.url)))])]

// What runs, or is run: the check's entry points.
const entries = [
  // the two servers (launcher.py and Dockerfile.hosted start them)
  '^server/(server|hosted)\\.mjs$',
  // the page: the files server/page.mjs puts inline
  `^web/(${pageFiles.map(literal).join('|')})$`,
  // what a person or CI runs: tests, scripts, benchmarks, the development tools, the docs' own scripts
  '^(tests|scripts|bench|tools/dev|docs)/',
  // a developer's command line, run by hand (docs/engines/hermes-and-connections.md): node engine/paint-ckff.mjs
  '^engine/paint-ckff\\.mjs$',
  // a pack's tools are loaded by path (engine/packs.mjs); Hermes's Desktop loads desktop/plugin.js
  '^(packs|desktop)/'
]

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Nothing that runs reaches this file: not the server, not the page\'s lists (server/page.mjs), not a test, a script, a benchmark or a pack. Delete it, or import it where it is used. Kept on purpose? Say why in .dependency-cruiser-orphans-known.json (AGENTS.md).',
      from: {
        path: entries
      },
      to: {
        path: '^(web|engine|server)/',
        pathNot: [
          // an entry point is not reached from another: it is where reaching starts
          ...entries,
          // vendored libraries (scripts/vendor.mjs) and the prototypes kept on purpose
          '^(web|engine)/vendor/', '^web/proto/',
          // the types the type check reads (tsconfig.json), not code
          '\\.d\\.ts$'
        ],
        reachable: false
      }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)node_modules/' },
    tsPreCompilationDeps: false
  }
}
