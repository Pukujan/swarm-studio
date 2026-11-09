# dyad inside Swarm Studio

This folder is the app engine behind Swarm Studio's **App** tab and **game mode**:
[dyad](https://github.com/dyad-sh/dyad)'s agent engine, run headless with plain
node (no Electron window). It is copied from the owner's ABA fork
(app-builder-automation, commit `8dd2d7a`), which adds the headless runner in
`src/aba/` and a few small changes to run it without the desktop app.

- **Licence.** dyad is Apache-2.0 (`LICENSE`), except `src/pro/`, which is under
  dyad's FSL licence (`src/pro/LICENSE`). Swarm Studio as a whole is
  FSL-1.1-ALv2. Non-commercial and internal use is fine; see the root README.
- **Nothing is prebuilt.** On the first app build Swarm runs `pnpm install`
  (Electron's binary is skipped) and bundles `vite.aba-headless.config.mts`
  into `.vite/build/aba_headless.cjs`. Both are ignored by git.
- **Network.** The engine talks only to the model gateway Hermes is set up with;
  an egress guard refuses every other host. Installing downloads packages from
  the npm registry once.
