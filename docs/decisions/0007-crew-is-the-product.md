# 0007. The crew and the game loop are product, with test sets

- Date: 2026-11-12
- Status: accepted

## Context

The engines are borrowed (0002). What is Swarm's own, and hardest to copy, is how the work is planned, split,
checked and played.

## Decision

Relayed by the trailer session on 2026-11-12 *(our wording)*:

- These are Swarm's own and hardest to copy:
  - the crew's prompts;
  - its parallel orchestration;
  - its review loops;
  - the game plan and play-test loop.
- Treat them as product, with test sets.

## Consequences

- A change to a crew prompt, the orchestration or a review loop comes with a test set or a bench run (`bench/`)
  that shows it is no worse.
- They are versioned and reviewed like code a person sees.
