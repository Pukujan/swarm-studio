# Next specs

> **The overall plan is in [11-platform-plan.md](11-platform-plan.md):** Swarm Feed (forked from Kresilo) is the community home page, Swarm Studio is the studio, and MCP connects the two. It also has the schedule to the deadline.

These are the specs for what comes after Auto mode and the Supabase connector. Each spec says what we are building and what "done" looks like. Build them in this order:

| # | Spec | Why it comes here | Size |
|---|---|---|---|
| 1 | [Big game mode](01-big-game-mode.md) | Auto can build one real action roguelike, not only three mini games | ½ day |
| 2 | [Tidebreak demo run](02-tidebreak-demo.md) | One prompt that shows off the studio, and tests everything end to end | 1 run + fixes |
| 3 | [UI polish: Design Bakery theme](05-ui-theme.md) | The studio stops looking AI-generated before we record the video | 1 day |
| 3a | [Identity: Commander Hermia, her crew, Hermes space theme](08-identity.md) | A planner mascot, avatars for the agents and the logo, in Hermes's own colours over a space look. It updates the theme in spec 3. | 1 day |
| 3b | [The Auto show: visuals, chatter, launch kit](07-auto-show.md) | Every step is fun to watch and hear, and a launch kit posts only when you click | 1½ days |
| 4 | [Two demo modes and Pro packs](09-demo-modes.md) | Make for everyone, Pro packs that bring four markets into Hermes, and the Swarm Wall: four runs at once | 1½ days |
| 5 | [Swarm Feed](10-swarm-feed.md) | Swipe live builds, try them in place, save references, remix and post back with credit. It extends the Arcade. | 1½ days |
| 6 | [Onboarding and Connections](06-onboarding.md) | New people connect Supabase, Vercel and Stripe by signing in, or skip and add them later | ½–1 day |
| 7 | [Swarm Arcade](03-arcade.md) | Hosting and the public listing behind the Feed | 1–1½ days |
| 8 | [3D models](04-3d.md) | Free CC0 models plus one generated hero model, on pages, the canvas and in games | 1 day |
| 9 | [Prompt-driven films](15-prompt-films.md) | The Film studio makes trailers, calm films or ads from one prompt and an optional style reference, so Swarm can make its own trailer | ½ day |
| 10 | [ARES flagship demo](16-ares-demo.md) | A fast first-person Godot boss rush on Windows with the Discord as bosses, played by Jev, plus its site, app, posts and a blockbuster trailer | 1 day |
| 11 | [Release to stores, with the Studio as guide](17-release-to-stores.md) | After the hackathon: any developer's game goes to itch.io, then Steam. The Studio makes the builds, store art, copy, trailer and upload, and guides the steps only the person can take | 2–3 days |

Deadline: the hackathon closes on **2026-11-11 at 17:00 EST**. The demo video needs specs 1–5, so they come first: build 3 and 3a together, and keep 3b to the step transitions and the chatter if time runs short. Onboarding (6) comes next, because judges will open the studio fresh. The Arcade hosting (7) and 3D (8) are stretch goals. That is more than two days of work, so each spec's "Done when" is cut to what the video shows before anything else. Files are numbered in the order they were written, not the build order.

## Already done

- **Auto mode** (PR #47): one prompt runs design, review, video, app, games, the $2 demo checkout, Supabase and the Vercel deploy.
- **Real fonts in resting snapshots** (PR #48).
- **Connect Supabase through Hermes's sign-in connector** (PR #49). It is connected on the dev Mac. The free `swarm-studio` project gets created on the next Auto run.

## Rules for every spec

- **Original content only.** A game may share a genre and mechanics with a well-known game, but never its name, characters, art, music or levels.
- **No money moves without the person.** A paid action (a Supabase project that costs money, a Meshy model that uses credits, a live Stripe key) stops and asks first.
- **Secrets stay out of the canvas.** Tokens live with Hermes or in files the server reads, never in the browser or in logs.
- **Test on throwaway copies.** Use a test server on another port with copied runs and a throwaway `HERMES_HOME`.
