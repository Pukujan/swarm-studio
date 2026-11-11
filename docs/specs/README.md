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
| 11 | [Release to stores, guided by the agent](17-release-to-stores.md) | After the hackathon: any developer's game goes to itch.io, then Steam. The Studio makes the builds, store art, copy, trailer and upload, and the agent talks the person through the steps only they can take | 2–3 days |
| 12 | [One idea, one project, one name](18-projects.md) | A site, an app, a game and a film of one idea are one Studio project and one Feed post, named by the brand, never by a screen like "Sign in" | ½ day |
| 13 | [Cast from real models](19-cast-from-real-models.md) | A game's characters are polished, licence-checked anime models the person picks from a numbered picture shortlist (VRoid Hub, Sketchfab), not primitive blocks; they are loaded into the game, cel-shaded and credited | ½ day |
| 13a | [Characters from the project's own art](20-meshy-characters.md) | One more card in the Cast step: with a Meshy key, the site's anime art becomes a rigged, cel-textured GLB (35 credits, asked first); without one, the art stands in the 3D world as a 2.5D sprite | ½ day |
| 14 | [Plan before spend](21-plan-before-spend.md) | The crew interviews the creator, writes Plan cards, shows cheap sketch sheets and mock screenshots, and one Lock button carries the price of everything expensive (Meshy multi-view characters, animations, props, coding runs); ARES becomes a remixable template | 1 day |
| 14a | [Guided game maker](22-guided-game-maker.md) | Next to the one-prompt build, **Shape it** walks the Plan board one step at a time (game, world, characters, personality and poses, voice, moves, outfits) with moving sprite strips, stills, clips and voice samples; every pick writes the game's `heroes.json`, and the build runs `skins.mjs` and `voice.mjs` on it | 1½ days |
| 14b | [Art on request](23-art-on-request.md) | The build crew asks for a prop, backdrop, sprite or run sheet mid-build in `ART_REQUESTS.json`; it is painted the same way as the first art pass (capped per slice) and wired in. A companion in the hero line gets its own sprite and run sheet | ½ day |
| 14c | [The hero's idle, animated](24-video-idle.md) | A game build animates the hero's idle from one painted frame: with the video model the person picks (Veo first when there; the price shown on the button), else close painted keyframes in-betweened by RIFE (or another interpolator) with a ghost check, else the painted sheet. Cut and checked into a 24-frame sheet on the heavy machine | ½ day |
| 15 | [Settings: accounts, models, connections and where data goes](25-connections.md) | One screen for everything a build can need, Hermes doing the connecting where it can, and plain statements of where data goes. Proposal; replaces spec 6's Connections panel | 3–3½ days in 5 slices |

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
