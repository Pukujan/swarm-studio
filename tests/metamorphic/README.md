# Metamorphic relations

Decision 0019 (point 3) and issue #462. Most of what Swarm makes comes from models, so a build has no one right
output to compare against. These are relations that must hold between two builds, or two readings of one build.

## The crew's relations (`relations.mjs`)

| relation | what it checks |
|---|---|
| **brand colour** | Changing only the brand sheet's main colour changes only colour tokens. The theme's other fields stay put, the sitemap planner's brand lines differ only in their colours, and every builder is told exactly the same. No section writes the brand colour itself. In the exported site, every line that differs sets a colour token. |
| **rename** | Renaming one page leaves every other page's content version unchanged (spec 36, `server/snaps.mjs` `pageVersions`), and the renamed page gets a new version. |
| **sitemap** | The same brief worded three ways gives the same sitemap structure: the number of pages, home first, the shared navigation and footer, and which of the brief's named pages each page is. |
| **rework** | A section reworked by the reviewer's fix pass (`engine/review.mjs` `fixSection`) for a layout problem keeps the copy it was given, word for word. That copy is every piece of text the builder took from the planner's content. |
| **linter** | Slop-linter findings (`engine/lint`) don't change with whitespace or attribute order. Each built and reworked section is checked in five rewritten forms (seeds 1–5), with the text a reader sees left untouched. |

Each relation returns its breaks. Every break names the inputs that made it: the build, wording, page, section,
file and line, or seed. A red run says what to look at.

The board relations (zoom and budgets, live → photo → live, adding a card) are with the tier manager (#440).

## Recorded and live

- `briefs.json` holds two briefs, each worded three ways, each with a locked brand sheet and a pinned page type.
  The look is then the same for every wording, and the colour can be changed alone.
- `record.mjs record` makes the crew's output the way `engine/run.mjs` does: the sitemap for each wording, the
  home page's plan, three of its sections built, and each section reworked. It writes `recorded/<brief>.json`.
  The model key is `SWARM_API_KEY`, else Hermes's InferHub key on this machine. The model is
  `cb/deepseek-v4.1-flash` (`SWARM_EVAL_MODEL`).
- **In CI**, the `metamorphic` job checks every relation on the recordings: `node --test "tests/metamorphic/*.test.mjs"`.
- **Nightly**, `metamorphic-nightly.yml` runs `record.mjs live`: the same output, made fresh, then checked. It
  needs the `SWARM_EVAL_API_KEY` secret. On a break, the fresh output is uploaded as the `metamorphic-live`
  artifact.

Record again when a crew prompt changes what these relations read: `node tests/metamorphic/record.mjs record`.
