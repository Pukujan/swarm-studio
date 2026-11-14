# 0010. Open Design's editing tools

- Date: 2026-11-12
- Status: accepted. Supersedes spec 35's "Keep ours" for Edit and Scribble.

## Context

Spec 35 recommended taking Open Design's data (design systems, deck themes, skills) but keeping Swarm's own Edit
and Scribble. That was a session's recommendation, not the owner's choice, and it went against
[0003](0003-mature-dependencies.md).

## Decision

> "i already decided to use open design stop asking, and yes use that thing for scribble too"

## Consequences

- Editing uses Open Design's tools: Edit, Comment, Tweaks, and Draw, which replaces Swarm's own Scribble.
- Taking Open Design's data still stands.
- Don't compare editors or propose tests of them again.
- The guided-walk toolbox on branch `proto/guided-walk` is a flow mock-up. It shows where the tools appear and how
  changes reach Lock. The real tools are Open Design's.
- Open Design's tools work on HTML. Games and rendered video need their own tools (see [PLANS.md](../PLANS.md)).
