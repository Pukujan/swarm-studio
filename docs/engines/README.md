# Engines

One page per engine Swarm drives. Read the page before saying what an engine can or can't do, or before adding
code or a library around it (AGENTS.md, "Engines: read the page, never guess").

| Page | Engine | Status |
|---|---|---|
| [dyad.md](dyad.md) | Dyad: websites and full-stack apps | built in |
| [godot.md](godot.md) | Godot: games | built in |
| [meshy.md](meshy.md) | Meshy: 3D characters | optional, the person connects |
| [video.md](video.md) | HyperFrames: films | built in |
| [sound.md](sound.md) | Voices, music, sound | built in, with optional voice services |
| [open-design.md](open-design.md) | Open Design: design data and editing tools | built in, tools not yet brought in |
| [hermes-and-connections.md](hermes-and-connections.md) | Hermes models and the person's connections (Supabase, Stripe, Resend, posting) | optional, the person connects |

Every page has the same parts:

- **`Glue:`** the Swarm files that drive the engine, comma-separated. CI reads this line.
- **`Status:`**
- **What it already does**
- **How Swarm drives it**
- **What the person connects**
- **Limits inside Swarm**
- **Open questions**
- **Sources**

Each claim cites a file and line, or a URL with the date it was fetched. A claim nobody checked starts with
"Unchecked:".

Machine checks (`scripts/engine-docs-check.mjs`, `tests/engines.test.mjs`):

- every `Glue:` path exists;
- every claim carries a source;
- on a pull request (the `engine-docs` workflow), a change to a page's glue files must update that page or name
  it in the PR description.

A Claude Code hook (`scripts/engine-docs-hook.mjs`) adds the right page to any message that names an engine.
