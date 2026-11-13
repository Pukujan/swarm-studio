// The dependency rules for the next UI (CI: tools/dev, `npm run deps:ui`). TypeScript 7 has no compiler API for
// dependency-cruiser to parse with, so it parses with swc (pinned in ui/package.json).
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cycles',
      severity: 'error',
      comment: 'Modules form no cycles.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'nav-only-through-src-nav',
      severity: 'error',
      comment: 'The current Studio\'s machine (@studio/nav, web/nav.js) is reached only through src/nav/: a screen reads the view with useNav() and moves with go().',
      from: { path: '^src/', pathNot: '^src/nav/' },
      to: { path: 'studio-nav\\.d\\.ts$' }
    },
    {
      name: 'legacy-only-through-src-legacy',
      severity: 'error',
      comment: 'The current Studio\'s kits and Hermia\'s cursor (@studio/kits, @studio/pet) are hosted only through src/legacy/, so they leave from one place.',
      from: { path: '^src/', pathNot: '^src/legacy/' },
      to: { path: 'studio-(kits|pet)\\.d\\.ts$' }
    },
    {
      name: 'shared-stand-alone',
      severity: 'error',
      comment: 'A shared part (src/shared/, such as Layers) is used by several screens, so it knows none of them, nor the frame.',
      from: { path: '^src/shared/' },
      to: { path: '^src/(shell|screens|legacy)/' }
    },
    {
      name: 'primitives-stand-alone',
      severity: 'error',
      comment: 'A primitive (src/primitives/) knows nothing of the navigation, the frame or a screen, so its stories need nothing else.',
      from: { path: '^src/primitives/' },
      to: { path: '^src/(nav|shell|screens)/' }
    },
    {
      name: 'resolvable',
      severity: 'error',
      comment: 'Every import names a file that exists.',
      from: {},
      to: { couldNotResolve: true }
    }
  ],
  options: {
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.css$' },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'] }
  }
}
