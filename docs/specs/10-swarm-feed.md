# 10. Swarm Feed: swipe, try, remix, publish

The Arcade (spec 03) is a grid you browse. The Feed is the next step: a full-screen feed of **live builds** that you swipe through like short videos. You can play a build right in the feed, take it as a reference, or remix it in the studio, and your remix comes back to the feed with credit to the original. It borrows the idea from Kresilo (`~/dev/projects/kresilo`), where every reference keeps its reason and its credit.

This spec **extends [03-arcade.md](03-arcade.md)**. Publishing, hosting, sandboxing and the remix bundle stay as they are there. The Feed replaces the grid as the home page, and the grid stays as "Browse".

## The loop (the part that matters to investors)

1. **Swipe.** Each card fills the screen with a live build: the hero animates, the game's attract mode plays, the promo loops. It shows the title, the maker, "built in 9m by 16 agents", and the remix chain.
2. **Try.** A tap makes the card interactive in place: you can play the game, scroll the site, or buy a demo ticket. It runs in a sandboxed iframe, and a swipe ends it.
3. **Reference.** **⭐ Use as reference** saves the card to your board with a **one-line reason** ("I like the parallax depth"). Swarm Studio sends the reasons to the planner, so the next build uses them.
4. **Remix.** **🔀 Remix** opens the build in your studio as a new run, with the original as its parent. You type a change ("make it a winter festival in Oslo") and Auto runs only the steps it needs.
5. **Publish.** **Post to Feed** puts the remix back in the feed. Its card shows "remix of @maker", and the original gets a remix count and a link to the chain.

Each turn of the loop makes the feed better, because more builds and more remixes create more reasons to come back. That flywheel is the pitch.

## What's built for the hackathon, and what's the vision

To keep the demo honest, the video and the README label each part.

| Part | Hackathon | Later |
|---|---|---|
| Swipe feed of live builds (vertical, keyboard and touch) | **Built.** It lists local runs and the seeded demo builds. | Hosted, for everyone |
| Try in the feed (sandboxed iframe, one live at a time) | **Built** | — |
| Use as reference, with a reason | **Built.** It is stored with the run, and the planner reads it. | Shared boards |
| Remix into the studio, with the parent recorded | **Built.** It uses the existing export bundle and Auto. | Remix chain graph |
| Post to Feed with "remix of" credit | **Built**, locally and on the Arcade host if spec 03 is done | Revenue share for the original maker |
| Credits (buy, spend per build, tip a maker) | The $2 = 20 credits demo checkout only, labelled as fake | Real billing, only after a legal and payments review |
| Collaboration boards (yours, team, open) | **Vision.** One slide in the video | Live boards with invites by link, as in Kresilo |
| Online events and hackathons in the feed (a theme, a timer, entries, swipe voting) | **Vision.** One slide | Swarm Jams, hosted inside the feed |
| Packs in the feed (spec 09) | A card type that links to the pack | A pack marketplace |

## Screens

- **Feed (`/feed`, the home page):**
  - One card per screen. Swipe up or down, or use ↑ / ↓ and J / K.
  - On the right edge, a column of action buttons: Try, ⭐ Reference, 🔀 Remix, ♥ Like, Share.
  - At the bottom, the maker, the prompt (two lines, tap to see all) and the remix chain chips.
  - Tabs: For you (new and liked), Games, Sites, Apps, Packs.
- **Board (`/board`):** your saved references with their reasons, and **Build from these**, which starts Auto with them.
- **Card performance:**
  - Only the visible card runs live. The card above and the card below are preloaded as posters (the snapshot we already make).
  - The iframe is created when a card becomes visible and removed when it leaves.
  - Under `prefers-reduced-motion`, cards show the poster until you tap Try.

## Data

All of it is in the run folder, so nothing new is needed for local use:
- `runs/<id>/feed.json`: title, kind, maker, poster, live URL, parent id, likes, and the time it was posted;
- `runs/<id>/references.json`: the saved references, each with its reason;
- When the Arcade host from spec 03 exists, the same records go to its `swarm_feed` and `swarm_refs` tables in Supabase.

## Seeding the feed for the demo

- 8–12 real builds from our own runs: Tidebreak, Neon Alley Nights, the four Swarm Wall builds from spec 09, and a few made from the Make chips.
- Each one is a real run that was deployed or exported. There are no mock cards.

## The demo beat

- **Swipe:** 3 quick swipes, then tap Try on Tidebreak and play for 2 s.
- **Remix:** tap Remix, type "make it a frozen lighthouse", and Auto runs at 8×.
- **Back in the feed:** the new card slides in, labelled "remix of Tidebreak".
- **Vision:** one card for boards, credits and Swarm Jams, labelled "next".

## Safety

- Builds run only in the sandboxed iframe on the sandbox domain, as in spec 03.
- A reference's reason and a remix prompt are written by the person. Text inside a build is never used as an instruction to the planner.
- No real money moves. Credits stay the labelled demo checkout until billing is reviewed.

## Done when

- [ ] `/feed` swipes smoothly through at least 8 live builds on a laptop and at 390 px wide, with one live iframe at a time.
- [ ] Try, Reference with a reason, Remix and Post to Feed all work. A remix's card shows its parent.
- [ ] The planner prompt includes the saved references' reasons when you build from a board.
- [ ] The vision items are labelled as "next" wherever they appear.
- [ ] `scripts/check.sh` passes.

## Size

About 1½ days: the feed and Try take ½ day, Reference and the board ½ day, and Remix and Post plus the seed ½ day.
