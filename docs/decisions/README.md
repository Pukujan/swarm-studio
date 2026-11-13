# Decisions

The owner's standing decisions, one short record each, so that no session has to be told twice. Read
[docs/PRODUCT.md](../PRODUCT.md) first; these records are the detail behind it.

Each record has the context, the decision (in the owner's words where they exist) and the consequences. Text
marked *(our wording)* is ours, not the owner's. To change a decision, add a new record that supersedes the old
one; don't edit the old one quietly.

| # | Date | Decision |
|---|---|---|
| [0001](0001-studio-is-local-feed-is-hosted.md) | 2026-11-12 | The Studio is local; only the Feed is hosted |
| [0002](0002-workspace-over-engines.md) | 2026-11-12 | The workspace over engines: this is the moat |
| [0003](0003-mature-dependencies.md) | 2026-11-12 | Use mature dependencies |
| [0004](0004-plan-by-conversation.md) | 2026-11-12 | Plan by conversation; nothing runs without a press |
| [0005](0005-sharing-person-posts.md) | 2026-11-12 | Sharing: Swarm makes the post ready, the person posts it |
| [0006](0006-art-direction.md) | 2026-11-12 | Art direction |
| [0007](0007-crew-is-the-product.md) | 2026-11-12 | The crew and the game loop are product, with test sets |
| [0008](0008-releases-stable-pin.md) | 2026-11-12 | Releases: a stable pin apart from main |
| [0009](0009-ux-rules-are-checks.md) | 2026-11-12 | The UX rules are checks, not prose |
| [0010](0010-open-design-tools.md) | 2026-11-12 | Open Design's editing tools (Edit, Comment, Tweaks, Draw) |
| [0011](0011-hyperframes-default-video.md) | 2026-11-12 | HyperFrames is the default film engine; the person picks another |

`tests/decisions.test.mjs` fails if the hosted studio, build credits or "paid per build" come back in
`docs/brand/` or the README.
