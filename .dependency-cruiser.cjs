// The dependency rules for the studio's page code (CI: tools/dev, `npm run deps`). The page is split
// into modules (docs/ux/MOTION.md, the canvas.js split); these keep the split honest.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cycles',
      severity: 'error',
      comment: 'Modules form no cycles: a module that needs something from one that imports it is given it (an init call) instead.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'only-through-the-front',
      severity: 'error',
      comment: 'An area of the studio (a folder under web/canvas/) is used only through its index.js; what else is in the folder is its own.',
      from: { path: '^web/canvas/([^/]+)/' },
      to: { path: '^web/canvas/[^/]+/(?!index\\.js$)', pathNot: '^web/canvas/$1/' }
    },
    {
      name: 'outside-only-through-the-front',
      severity: 'error',
      comment: 'Code outside web/canvas/ uses an area only through its index.js.',
      from: { path: '^web/', pathNot: '^web/canvas/' },
      to: { path: '^web/canvas/[^/]+/(?!index\\.js$)' }
    },
    {
      name: 'page-code-stays-in-web',
      severity: 'error',
      comment: 'The page runs in the browser: it imports nothing from the server, the engine or node_modules.',
      from: { path: '^web/' },
      to: { pathNot: '^web/' }
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
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^web/vendor/' },
    tsPreCompilationDeps: false
  }
}
