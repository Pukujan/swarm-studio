# Next specs

These are the specs for what comes after Auto mode and the Supabase connector. Each spec says what we are building and what "done" looks like. Build them in this order:

| # | Spec | Why it comes here | Size |
|---|---|---|---|
| 1 | [Big game mode](01-big-game-mode.md) | Auto can build one real action roguelike, not only three mini games | ½ day |
| 2 | [Tidebreak demo run](02-tidebreak-demo.md) | One prompt that shows off the studio, and tests everything end to end | 1 run + fixes |
| 3 | [UI polish: Design Bakery theme](05-ui-theme.md) | The studio stops looking AI-generated before we record the video | 1 day |
| 4 | [Onboarding and Connections](06-onboarding.md) | New people connect Supabase, Vercel and Stripe by signing in, or skip and add them later | ½–1 day |
| 5 | [Swarm Arcade](03-arcade.md) | Publish, browse, play and remix other people's builds | 1–1½ days |
| 6 | [3D models](04-3d.md) | Free CC0 models plus one generated hero model, on pages, the canvas and in games | 1 day |

Deadline: the hackathon closes on **2026-11-11 at 17:00 EST**. Specs 1–3 come first, because the demo video needs them. Onboarding (4) comes next, because judges will open the studio fresh. The Arcade (5) and 3D (6) are stretch goals. Files are numbered in the order they were written, not the build order.

## Already done

- **Auto mode** (PR #47): one prompt runs design, review, video, app, games, the $2 demo checkout, Supabase and the Vercel deploy.
- **Real fonts in resting snapshots** (PR #48).
- **Connect Supabase through Hermes's sign-in connector** (PR #49). It is connected on the dev Mac. The free `swarm-studio` project gets created on the next Auto run.

## Rules for every spec

- **Original content only.** A game may share a genre and mechanics with a well-known game, but never its name, characters, art, music or levels.
- **No money moves without the person.** A paid action (a Supabase project that costs money, a Meshy model that uses credits, a live Stripe key) stops and asks first.
- **Secrets stay out of the canvas.** Tokens live with Hermes or in files the server reads, never in the browser or in logs.
- **Test on throwaway copies.** Use a test server on another port with copied runs and a throwaway `HERMES_HOME`.
