# 0001. The Studio is local; only the Feed is hosted

- Date: 2026-11-12
- Status: accepted

## Context

The pitch, specs 11 and 13, and the code (`server/hosted.mjs`, `Dockerfile.hosted`) described a hosted Swarm
Studio: build in the browser without Hermes, paid per build in credits. The owner read it and said it contradicts
them.

## Decision

> "do u think we will host a swarm server for them? swarm is only hosting server for the social media to showcase
> what they built, to bring in collaborators, annotation, events etc, everything else is done by other people and
> their own studio"

The Studio is a plugin in the person's own Hermes. It uses their models, keys, engines and accounts. Swarm Feed
(the showcase, collaborators, annotation and boards, events and jams) is the only thing we host.

## Consequences

- No hosted studio, no build credits, and no "paid per build". `tests/decisions.test.mjs` guards `docs/brand/`
  and the README.
- How Swarm makes money is to be decided by the owner. Don't write a business model that the owner has not
  given.
- Specs 11 and 13, and the hosted mode in the code, contradict this decision and need the owner's call before
  they are removed *(our wording)*.
