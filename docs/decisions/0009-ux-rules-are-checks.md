# 0009. The UX rules are checks, not prose

- Date: 2026-11-12
- Status: accepted

## Context

The rules in [docs/ux/RULES.md](../ux/RULES.md) kept being broken: tooltips, internal names like ARES, sample
prompts that were not called tests, and panels that opened by themselves.

## Decision

> "again what does ares even mean here? why not something more intuitive like 3d with meshy"

> "again if these are test prompt why not say tests?"

> "is this not written down why are u getting confused?"

The rules, which become tests *(our wording of the list relayed by the trailer session)*:

1. Never tooltips.
2. Nothing opens by itself.
3. Names only at rest.
4. One front door.
5. No internal or sample names.
6. Numbers carry units.
7. A setting never sits in a list of things to make.
8. Every stop says why.

## Consequences

- Each rule should get an automated check in `tests/`. A rule without a check is a gap to close, not a rule to
  skip.
