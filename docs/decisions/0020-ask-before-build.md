# 0020. Ask before every build: skip steps, step by step, a recommended path

- Date: 2026-11-13
- Status: accepted by the owner ("Yes, that's it", then "no that is what i emant"). The quotes are the owner's
  words; the rest is *our wording*.
- Adds to [0015](0015-studio-walk-and-chat.md) (the walk: What you have → Brand → Lock → Plan → Build) and
  [0004](0004-plan-by-conversation.md) (nothing runs without a press).

## Context

The owner asked Hermes's chat for a website. It opened the Studio walk, and when they said "no branding, just
generate" it didn't build: "thats still confusing, its supposed to ask or be more intuitive if they just want it
generated or want the onboarding and scaffolding". The walk had one route and a Skip per step; nothing read what the
person wanted from their words, and the old Make box's **Just build** didn't carry over to the chat or the walk.

## Decision

- **Before any build, the chat asks one question** with three answers, and nothing builds until the person answers.
  It holds even for "just make it": the chat asks if they're sure ("no even with just make it, it prompts if they
  are sure and path is recommended"). It doesn't jump the gun.
  - **Skip all, build now**: the crew fills in what the skipped steps would have decided (a look of the three
    options, the pages) and says what it picked in one line.
  - **Step by step**: Brand → Lock → Plan, one at a time. Before each step the chat says what that step does in one
    line and recommends **Do it** or **Skip** ("i think we should have step and step").
  - **Pick steps to skip**: the person ticks Brand, Lock, Plan.
- **One path is always recommended**, from what the person said:
  - a sure prompt ("no branding, just generate", or a full brief): **Skip all, build now**;
  - a brand file, a website to read, or "help me set it up": **Step by step**;
  - anything between: **Pick steps to skip**, with the steps their words already answer ticked.
  The recommendation is the first answer and says why in a few words.
- **Every build is its own build.** A quick build isn't rebuilt later in the person's look: doing the walk afterwards
  makes a new build beside it ("we should have different build"). There's no "Set up brand" link inside a running
  build, and "just build it" mid-walk doesn't jump ahead; the question before Build is where steps are skipped.
- **A guide shows what to press next** ("some arrow or prompt or shiny thing for what ot click and then what to
  choose like a guide for studio"). *Proposed form, waiting on the owner:* one soft shine on the one thing to press
  next: the recommended answer, then the next step's choice. It's never a tooltip and never a text bubble
  ([RULES 1](../ux/RULES.md)). It moves on once the person presses something and doesn't come back on its own.
  With reduced motion it's a still outline.
- The question follows 0015: in the chat at the bottom, one open question at a time, three answers, no "pack".

## Consequences

- `swarm_design`, `/swarm`, the Make box and the Studio chat stop starting a website build directly. They put the
  brief to this question, and the build starts on the answer. `hermes swarm --build` stays the explicit "I'm sure"
  for scripts.
- The planner's skipped steps get filled in by the crew, and the build says what it picked.
- Tests cover: no build without an answer, the recommendation for each kind of prompt, and step by step asking before
  each step.
