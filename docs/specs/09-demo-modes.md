# 9. Two demo modes and Pro packs

The demo has to land with two audiences at once. A normal person should think "I want to make one of those tonight." An investor should think "every market can now come into Hermes through this." So Swarm Studio gets two front doors: **Make** and **Pro**.

## Make (for everyone)

- **One box, one prompt, a fun result.** It's the current Auto run, in the space theme with Hermia, the crew and the chatter (specs 07 and 08).
- **Starter chips** under the box: "a game trial page", "my band's tour site", "a pop-up shop", "a birthday quest". Each chip fills in a prompt the person can edit.
- **Defaults are set for delight, not control:** mini games on, the promo video on, deploy on when Vercel is connected. Nothing asks a technical question.
- **The ending is shareable:** the summary card, the live link and QR code, the launch kit, and **Post to Feed** (spec 10).

## Pro (for professionals and markets)

Pro is the same engine, configured by a **pack**. A pack turns Swarm Studio into a tool for one market. It brings that market's steps, tools, connectors and checks into Hermes.

### What a pack is

A folder at `packs/<id>/` with a `pack.json` and any files it needs:

| Field | What it holds |
|---|---|
| `id`, `name`, `market`, `icon` | For example `events`, "Events & Ticketing", "Live events" |
| `intake` | 3–6 typed questions the pack asks first (dates, venue, tiers, currency, brand colours). Each one has a sensible default, so "just build it" still works. |
| `steps` | The Auto steps it runs, in order, with per-step prompt additions (for example the app step adds "ticket tiers, capacity, check-in"). |
| `tools` | Custom tools the pack adds, written as small engine modules in `packs/<id>/tools/`. Examples: a seat-map generator, a QR check-in page, an SKU and inventory sheet, a press-kit zip. |
| `connectors` | Which Hermes connectors it uses (Supabase, Vercel, Stripe test mode, the messaging gateway) and which are required or optional. The onboarding from spec 06 asks for the missing ones. |
| `checks` | What "done" means for this market, for example "buying a ticket writes an order row and the check-in page reads it". Auto's review step runs these checks. |
| `deliverables` | What the final card lists, for example "site, ticketing app, check-in page, promo, launch posts". |

Packs are plain files, so anyone can write one. That is the marketplace story: **a pack is how a new market joins the Hermes ecosystem**, and packs can be listed and remixed in the Feed like builds.

### The four launch packs

| Pack | For | What it adds beyond Make |
|---|---|---|
| 🎟 **Events & Ticketing** | Promoters, venues, festivals, meetups | Ticket tiers with capacity, a QR check-in page, a vendor or speaker map, a countdown, and a "doors open" announcement through the gateway (confirmed by the person) |
| 🎮 **Game Studio** | Indie developers | Big game mode (spec 01), a trial page with a parallax hero, a trailer, a wishlist sign-up, a leaderboard, and a press kit |
| 📣 **Brand Campaign** | Agencies and marketers | One brief turned into a campaign site plus 3 visual directions to choose from, a promo video, the launch kit for every network, and UTM-tagged links |
| 🛍 **Commerce Drop** | Shops and creators | A product drop page, a limited stock counter, a demo checkout (Stripe test mode or our fake $2 one), an orders admin, and a restock sign-up |

### Where Pro shows up in the studio

- The Auto window gets a **Make / Pro** switch. Pro shows the pack picker as four cards, then the pack's intake as one short form, then the usual run.
- The step list, the code wall and the final card show the pack's own steps and deliverables.
- `/swarm pro events <prompt>` runs a pack from Hermes chat.

## The "woah" shot: the Swarm Wall

This is the moment in the video meant to impress investors.

- **What it shows:** the screen splits into a 2×2 wall. **Four packs run at the same time on four briefs**: a festival, an indie game, a sneaker drop and a product launch campaign. Four crews, four Hermias giving orders, four timers.
- **The ending:** the four finish within seconds of each other. Each tile flips to its live site, and the four cards fly into the Feed (spec 10).
- **Caption:** "Four markets. One Hermes. 11 minutes." It uses the real time.
- **How it's built:** `/swarm wall` opens a grid view of 2–4 runs. Each tile is the existing canvas in a compact mode, following that run's events. The server already keeps runs separate; the wall only views them.
- **Capacity:** four parallel runs need about four times the model throughput. Before recording, do one dry run of the wall and watch InferHub for rate limits. **Fallback:** run the four one after another and put them together into the 2×2 in the edit. Every tile is still real footage, and the screen says "recorded separately".

## Done when

- [ ] The Make / Pro switch is in the Auto window. Make looks and works as Auto does today.
- [ ] The four packs exist as `packs/<id>/pack.json` with their intake, steps, tools and checks. Each one runs end to end once, and its checks pass.
- [ ] At least one custom tool per pack really runs (the seat map, the QR check-in page, the 3 visual directions, the stock counter).
- [ ] `/swarm wall` shows up to 4 runs live, and a tile opens its full canvas when clicked.
- [ ] Builds without a pack are unchanged (`scripts/check.sh` passes).

## Size

About 1½ days: the pack loader and the switch take ½ day, the four packs ½ day, and the wall view ½ day.
