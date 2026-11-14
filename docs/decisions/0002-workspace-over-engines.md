# 0002. The workspace over engines: this is the moat

- Date: 2026-11-12
- Status: accepted

## Context

Sessions kept rebuilding what an engine already does (a game engine, an app builder, a 3D tool) instead of
showing and steering it.

## Decision

> "the goal is to have something that can utilize various engine and put it all together in one place and give
> our view layer visual builder and ux layer … its mostly a visual layer with custom tools that takes from them,
> and can configure to using their engine fully, while providing benefit of all being in one workspace, with
> agents, all running through hermes and its benefits of other plugins as well but our own ux ui layer and social
> media builder space and collaboration layer"

The owner calls this the main moat.

## Consequences

- Swarm's own: the workspace and its UX, the agents, the Feed and collaboration.
- Borrowed and optional, reached through Hermes: Godot, Dyad, Meshy, Open Design's data, music, publishing
  targets and posting tools.
- Every new feature answers four questions: where does it run, who pays, which mature engine does it, and how
  does the workspace show and steer it *(our wording of the owner's test)*.
