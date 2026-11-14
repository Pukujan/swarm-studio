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

## Changes made here (not in the ABA fork's commit above)

Swarm Studio's `docs/engines/dyad.md` says what the runner changes do and how
they were checked. The last two are inside `src/aba/`.

- A few files reworded to pass the Hermes catalog validator, and headless
  installs given no stdin so they run on Windows
  (`src/ipc/utils/pty_command_runner.ts`).
- `--mode` for the runner (dyad's ask and plan modes, one turn), and
  `headless_args.ts` split out of `headless_cli.ts`.
- The tools that wait for a person in dyad's window (`planning_questionnaire`,
  `add_integration`, `suggest_plugin`, `exit_plan`, `generate_test_assertions`)
  get consent "never" in a headless run, so they are not offered
  (`HEADLESS_OFF_TOOLS` in `headless_args.ts`, used by `headless.ts`). A turn
  that still ended on a call to one is followed by one that says nobody is here
  (`offToolStop`, `nobodyHere`, the `stream` wrapper in `headless_cli.ts`).
