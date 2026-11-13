# 0017. Swarm's processes run only when needed

- Date: 2026-11-13
- Status: accepted by the owner. *Our wording*; the quotes are the owner's.

## Context

Swarm's Node server is started detached and never exits, even after Hermes closes. Each previewed app keeps a
Dyad/Vite dev server running with no timeout. Video renders and Godot jobs exit on their own. Spawning and stopping
are hand-written (`engine/appjob.mjs` `stopProc`/`alive`), and they can leave child processes behind. On
2026-11-13 the owner's machine ran out of memory with many sessions running.

The owner: "Do it then use them" (mature libraries, not hand-built), "Just use 2 min and then shut it down", and
"no cold start and keep running needed" for viewing.

## Decision

- **Dyad's dev server runs only while the crew is building or the person is editing.** It stops after **2 minutes**
  with no viewer and no build. At most 2 run at once, and the least recently used one stops first.
- **A finished app is served as a static build by Swarm's own server.** `vite build` runs once when building
  stops, so viewing an app never needs the dev server. Only editing or rebuilding starts it again, cold, with the
  skeleton and the working cursor while it boots.
- **Swarm's server exits after 20 minutes** with no pane connected and no build, render or job running.
  `ensure_server()` starts it again on next use.
- **One video render at a time.** The rest queue.
- **Mature libraries do the process handling:**
  - **execa**, pinned: `cleanup: true`, `forceKillAfterDelay`, and `extendEnv: false` with `childEnv()`, so the
    catalog's minimal-environment rule holds.
  - **tree-kill**, pinned: a stop kills the whole process tree on Windows, macOS and Linux.
  - **PM2 is not used:** it would be one more always-on daemon.
- Every timeout is configurable and shown in Settings.

## Consequences

- The work is on `feat/idle-shutdown`, and the static-build part ties in with [spec 44](../specs/44-app-build-wall.md).
- `plugin.yaml` and the README disclose execa and tree-kill.
- Tests use fake timers and processes, plus a real tree-kill test in the Windows and macOS CI jobs.
