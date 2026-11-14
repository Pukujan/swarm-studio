# 0005. Sharing: Swarm makes the post ready, the person posts it

- Date: 2026-11-12
- Status: accepted

## Context

Spec 39 planned Connect and Post per network, with our own app registrations on X, LinkedIn, Instagram, TikTok,
Bluesky and Threads.

## Decision

> "we are not gonna post, the users themself have to connect and do it"

> "cant our app create the post and let the user handle the posting itself and link it to their browser"

## Consequences

- Swarm makes the post ready: the text, the pictures and the clip.
- The person posts it from their own account. Swarm either opens the network with the text filled in, or hands
  the post to a posting tool they already have in Hermes. AdaptlyPost, Postel and Postroom are community plugins;
  Postiz has none *(our wording)*.
- Swarm never posts for anyone and never holds their accounts. Nothing relies on our own app registrations with
  the networks.
- Spec 39's sharing slice must be rewritten to match.
