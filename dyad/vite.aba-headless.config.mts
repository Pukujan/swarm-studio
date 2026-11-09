import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import path from "path";

// ABA-0005 Stage B — the headless bundle.
//
// Builds `src/aba/headless_cli.ts` into a single CommonJS file that runs under
// plain `node` (no Electron, no vitest, no forge). It is a clone of
// `vite.main.config.mts` with three deliberate differences:
//
//   1. `electron` is aliased to `src/aba/electron_module.ts`, so dyad's real
//      main-process graph (72 files import electron) resolves to the in-process
//      shim instead of the Electron runtime.
//   2. The output lands in `.vite/build/`, two directories below the dyad root
//      — exactly where forge puts `main_bootstrap.js`. `initializeDatabase()`
//      resolves migrations as `path.join(__dirname, "..", "..", "drizzle")`
//      (src/db/index.ts:72); from `.vite/build` that is the real `dyad/drizzle`,
//      so migrations are found with no path patching.
//   3. No forge `restart`/bundle-shape plugins: this is a one-shot CLI.
//
// Vite (not a bespoke node loader) is the bundler because dyad's module graph
// relies on three conventions a raw loader would have to re-implement: the `@/`
// alias, `?raw` imports (read_guide.ts, socket_firewall.ts) and the workspace
// package aliases below. Vite already handles all three for the main build.

const nodeBuiltins = builtinModules.flatMap((name) => [name, `node:${name}`]);

export default defineConfig({
  resolve: {
    alias: [
      // Must precede the `@` alias so the bare `electron` specifier (and any
      // `electron/...` subpath) resolves to the shim, not to node_modules.
      {
        find: "electron",
        replacement: path.resolve(__dirname, "./src/aba/electron_module.ts"),
      },
      // Also must precede `@`: the headless preview asserts the installed
      // proxy module carries HEADLESS_PROXY_MARKER, which only a vitest
      // `vi.mock` supplies. Under a plain-node bundle there is no mock, so the
      // specifier is redirected to a module that re-exports the REAL startProxy
      // with the marker attached. See src/aba/headless_proxy_module.ts.
      {
        find: "@/ipc/utils/start_proxy_server",
        replacement: path.resolve(__dirname, "./src/aba/headless_proxy_module.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: "pg-schema-classifier",
        replacement: path.resolve(
          __dirname,
          "./packages/pg-schema-classifier/src/index.ts",
        ),
      },
      {
        find: "ts-pg-schema-diff",
        replacement: path.resolve(
          __dirname,
          "./packages/ts-pg-schema-diff/src/index.ts",
        ),
      },
    ],
  },
  build: {
    target: "node22",
    minify: false,
    sourcemap: true,
    // Never empty `.vite/build`: forge's real main bundle lives there.
    emptyOutDir: false,
    outDir: ".vite/build",
    lib: {
      entry: path.resolve(__dirname, "src/aba/headless_cli.ts"),
      fileName: () => "aba_headless.cjs",
      formats: ["cjs"],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
      external: [
        ...nodeBuiltins,
        "better-sqlite3",
        "dyad-keychain-reader",
        "node-pty",
        "ssh2",
        "mustardscript",
        "pg",
        "ws",
        // view_render lazily imports playwright; keep it out of the bundle so
        // the CLI resolves it from dyad/node_modules at runtime.
        "playwright",
        "playwright-core",
      ],
    },
  },
});
