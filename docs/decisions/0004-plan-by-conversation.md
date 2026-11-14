# 0004. Plan by conversation; nothing runs without a press

- Date: 2026-11-12
- Status: accepted

## Context

A fixed questionnaire ended in an automatic build, and a stop typed into the prompt started a build anyway
(spec 27).

## Decision

> "so we can have discussion back and forth to lock down specs of what i want before we even build"

> "do i have to type in prompt i dont get the flow at all"

The order is talk, gather, the kit, Lock, then build. Nothing builds, publishes or posts without a person's press.
Make offers Studio first *(our wording, from specs 27 and 37)*.

## Consequences

- Make opens a menu: Studio, Brand sheet and Build now. An empty box opens the Studio.
- The last step is always a visible plan with Lock. A build never starts by itself.
- Specs: [27](../specs/27-plan-conversation.md) and [37](../specs/37-studio-first.md).
