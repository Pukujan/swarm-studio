# 0016. What Swarm takes from Open Design's runtime

- Date: 2026-11-13
- Status: accepted by the owner ("Sounds good do all this too"). *Our wording*, from a read of Open Design at
  commit `59e4f2a` (2026-11-13), file references kept in the issue that links this record.
- Builds on [0010](0010-open-design-tools.md) (Open Design's editing tools). Supersedes the "dropped" list in
  `engine/opendesign/NOTICE` and the data-only verdict of [spec 35](../specs/35-open-design.md).

## Context

Swarm took 53 of Open Design's design systems, but only their colours, fonts and corner radius (9 theme
variables). It took two of its skills, and none of its prompts or checks. The owner asked how Open Design's
runtime picks and uses these, and how its agent loop and prompts compare with Swarm's crew.

What the read found:
- **Selection has no AI matching.** Design system: a fixed order (request → plugin → project → app default).
  Templates: the person picks them. Skills: the project's, or in OD Next the agent reads an 11-entry catalogue
  and opens what it wants.
- **The full design system is used at runtime:**
  - `DESIGN.md` is injected as the rulebook;
  - `tokens.css` is pasted to be copied verbatim (spacing, motion, radius, component tokens);
  - a summary of the component manifest is included;
  - previews and Tailwind files are fetched on demand.
- **Open Design has no agent loop of its own.** It drives one outside coding agent (Hermes over ACP) and wraps it
  with guards. That one agent works alone, with no parallel work.
- **Its prompts are long craft prose** (about 100–130 KB per run). Swarm's are short machine contracts (about
  2 KB each), built for parallel builders and caching.
- **`lint-artifact.ts`** is a deterministic, model-free "slop" linter, run on saved HTML. It has P0/P1/P2 rules,
  each with a fix hint for the agent.
- **"Critique Theater"** is a five-judge scored panel. It's off by default and never runs with Hermes.

## Decision

1. **Use full design systems.**
   - Import each system's whole `tokens.css` (spacing, motion, radius, component tokens), its `DESIGN.md` rules
     as a compact digest, and a summary of its component manifest.
   - Builders get the tokens verbatim and must use them; the reviewer checks them.
   - Import **all 151 systems**, including the ~85 named after real brands (owner, pointing at that line: "I want
     these"). Fonts that aren't on Google Fonts are still swapped for the nearest Google family, with the original
     kept in `dropped`, because the Studio loads only Google Fonts.
1b. **Take its skills, design templates, plugin skills and prompt templates** (169 + 115 + 272 + 107) as a pinned
   library, with their licences. Selection follows Open Design's model:
   - **Templates:** the person picks one (Make, the Studio, the brand sheet).
   - **Skills:** the planner reads a short catalogue (name, one line, kind) and names the ones the build needs. Only
     the chosen skill's text goes into the **planner's** context, as Open Design does.
   - **Builders:** they receive only the distilled rules and tokens, never whole skill files, so they stay short,
     parallel and cacheable.
   - **Prompt templates:** they serve image and video only (the picture and film briefs), picked the same way.
2. **Take its craft and anti-slop rules** into the builder (`WORKER_SYSTEM`) and reviewer prompts, condensed, so
   the prompts stay short and cacheable.
3. **Take its selection order:** the design system comes from the request, then the project, then the default,
   instead of the planner choosing a pack freely.
4. **Port the slop linter** (`lint-artifact.ts`, Apache-2.0) as a pinned copy with its licence, the same way
   `web/edit/patches.js` was ported. It runs on **every section a builder streams**, with no model cost. Its
   findings go into that builder's fix pass and to the reviewer. Swarm's own chrome rules ("no blue, purple or
   green in the Studio's own chrome") are added as rules.
5. **The reviewer gets a score and a threshold**, borrowed from Critique Theater's idea, not its code. It reworks
   until the score passes or a round limit is hit, instead of a single round of up to 4 issues.
6. **Not taken: Open Design's agent loop.** It is one agent working alone, so it would replace the crew
   ([0007](0007-crew-is-the-product.md)). Its 100 KB+ prompt across 8 or more builders would undo the crew's speed
   and caching. Running the full Open Design app stays **optional, for people who install it** (owner,
   2026-11-12: "we make it optional if they wanna run it or install it they can"), as an "Open in Open Design"
   hand-off.

## Consequences

- `scripts/import-od-systems.mjs` re-imports at a pinned commit, with the extra parts. `engine/opendesign/NOTICE`
  lists what is now taken.
- Changes land in `engine/prompts.mjs`, `engine/brandpacks.mjs`, `engine/brand.mjs` and `engine/review.mjs`, plus a
  new `engine/lint/` (the port).
- `docs/engines/open-design.md` is updated (the engine-docs CI check applies).
- Measured afterwards on the board gauge and on build time, so prompt growth can't slow the crew.
