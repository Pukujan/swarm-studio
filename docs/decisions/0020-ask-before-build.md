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
  - **Pick steps to skip**: Brand or Plan. *(our wording)* Lock goes with Brand: the server uses a brand only once
    it's locked, so "do Brand, skip Lock" would throw the person's choice away. Skipping Brand skips Lock too; doing
    Brand locks it.
- **Only the person answers.** The question waits in the Studio chat; Hermes's model calling `swarm_design` can't
  answer it for them (the tool says it's waiting on the person). An error while reading the prompt asks; it never
  builds by default. "Don't build yet" still wins.
- **The answers live in the suggestions drawer** ([0015](0015-studio-walk-and-chat.md): no row of reply buttons), and
  a typed answer ("skip all", "step by step", "skip the plan") works the same.
- **One path is always recommended**, from what the person said:
  - a sure prompt ("no branding, just generate", or a full brief): **Skip all, build now**;
  - a brand file, a website to read, or "help me set it up": **Step by step**;
  - anything between: **Pick steps to skip**, with the steps their words already answer ticked.
  The recommendation is the first answer and says why in a few words.
- **References take website links the crew opens** ("references we can directly keep other websites here that our
  agent can visit to get ideas"), and a link or picture in the chat is looked at, not refused ("I can't browse the
  web" was "not good").
- **Every build is its own build.** A quick build isn't rebuilt later in the person's look: doing the walk afterwards
  makes a new build beside it ("we should have different build"). There's no "Set up brand" link inside a running
  build, and "just build it" mid-walk doesn't jump ahead; the question before Build is where steps are skipped.
- **Make has two ways** ("instead of studio and brand sheet coz studio path defaults to default path of branding
  first make just do studio and one prompt mode or just make it?"): **Just make it** (one prompt; the question then
  recommends Skip all) and **Studio** (the walk; the question recommends Step by step). This replaces spec 42's five
  ways: Guided is Step by step, Scaffold is skipping Brand, Three takes is the Brand step's three options.
- **When it asks** *(owner's OK to the defaults, 2026-11-13)*: before a new build. The next version of a build that
  exists doesn't ask (its look and plan are already locked). A finished walk's Build doesn't ask again. Scripts say
  so explicitly (`hermes swarm --build`, remix, resume, the evals).
- **Which kinds:** websites first. App and Video follow with the same question; a game keeps its Plan board talk,
  and a brand or deck is made only in the Studio.
- **A guide shows what to press next** ("some arrow or prompt or shiny thing for what ot click and then what to
  choose like a guide for studio"). Decided form: one soft shine on the one thing to press
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
