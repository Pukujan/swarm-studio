# 0003. Use mature dependencies

- Date: 2026-11-12
- Status: accepted

## Context

"No npm dependencies" and "no build step" had been read as goals, so sessions hand-rolled a bundler, MIME
tables, image sizing, a JSON store and a router.

## Decision

> "my idea has and will always be use mature dependency wherever possible … dont reinvent the wheel"

> "why try to copy an engine thats already working instead of utilizing whats being maintained"

## Consequences

- Use a mature, maintained, widely adopted dependency wherever one solves the problem. Build something custom
  only when nothing fits, and say why in the PR.
- "No dependencies" and "no build step" were never goals.
- The real constraints are in [AGENTS.md](../../AGENTS.md): pinned, bundled or disclosed; size and licence;
  nothing new downloaded at build time.
