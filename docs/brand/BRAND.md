# Swarm brand

The one place that says what Swarm is called, how it looks, how it talks and what it may never do. The look comes from [spec 08](../specs/08-identity.md), which still holds the build details. The pitch is in [PITCH.md](PITCH.md), the numbers in [MARKET.md](MARKET.md) and the people in [stories-swarm-studio.md](stories-swarm-studio.md).

## The idea

> **One prompt. The *whole* launch.**

A crew you can watch builds everything a launch needs: the site, the live app, the game, the film and the posts. You steer it like a design tool and ship it from Hermes. Then the community remixes it.

We keep to three beliefs:
1. **Show the work.** Agents shouldn't hide behind a chat box; you watch the crew build.
2. **Make the whole thing.** A launch is many pieces made together, never one file.
3. **Credit the crew.** Every build names the people and the agents that made it, and every remix credits the build it came from.

## Names

| Name | What it is | How to write it |
|---|---|---|
| **Swarm** | the whole thing: studio, feed and crew | "Swarm" in sentences. Never "SWARM" in running text, and never "the Swarm". |
| **Swarm Studio** | the Hermes plugin where builds are made | the wordmark is "SWARM" in Big Shoulders, then "*Studio*" in EB Garamond italic, in the accent |
| **Swarm Feed** | the community site: swipe, try, remix | the wordmark is "SWARM *Feed*", the same lock-up |
| **Commander Hermia** | the planner and the face of Swarm | "Hermia" after the first mention |
| **the crew** | the agents | lower case. One of them is "a courier", or by name (Pip, Mochi, Lumi…) |
| **a build** | one launch made from one prompt | not "a project" or "a generation" |
| **a pack** | a ready-made crew and plan for one market (Events, Game Studio, Brand Campaign, Commerce) | lower case |
| **a jam** | a timed community challenge in the Feed | "Hermes Jam #1" |

Credit line, used everywhere: **"Built for Hermes Agent."** Never "by Nous Research", never their logo.

## The world

Hermes was the messenger of the gods, with a winged helmet and a caduceus; the myth is public domain. Swarm's story comes from it:
- Commander Hermia came from beyond the galaxy with a crew of alien couriers.
- She plans each launch and sends her couriers out; they carry the pieces in.
- Every build becomes a star in your galaxy, and each one is a star system: the build is the sun and its pages are planets.
- The work happens at three stations: the Design deck, the Film studio and the Engine room.

Use the world as flavour, never as a puzzle. A first-time visitor must always understand the plain words: build, site, app, game, film, post, remix.

## Characters

### Commander Hermia

- **Role:** the planner. She draws the plan, gives the orders and reviews the work. Also the logo, the onboarding host and the narrator of Auto.
- **Look:** a chibi messenger with a round face, big eyes, and an off-white winged helmet with a grey band and graphite wing tips. She wears a short graphite cape (`#2a2a2e`) with a white trim and carries a caduceus baton that glows in the accent when she gives orders. The art is engraved line work with a few pixel touches.
- **Files:**
  - [`web/brand/hermia-mark.svg`](../../web/brand/hermia-mark.svg): her face in a graphite circle, in 3 colours. It is the logo, favicon, app icon and avatar.
  - [`web/brand/hermia.svg`](../../web/brand/hermia.svg): her full figure with the baton.
- **Voice:** short, warm commands. "Course set: 4 pages, 30 sections. Crew, launch!" "Good work, crew." She never explains herself at length. Her reasoning lives one layer down, in the thinking log.
- **Rules for using her:**
  - At most one Hermia per screen or section, with one job: greet, order, point or cheer.
  - Never a pop-up chatbot. Never in front of a button. Never off-palette.
  - On marketing pages she appears at moments: the hero, the "how it works" steps and the empty states. She is not a sticker on every section.

### The crew

- **Who they are:** little alien couriers: round blob bodies, antennae, one or two big goggle eyes on a visor strap, and tiny ankle wings (Hermes' sandals).
- **Names:** Pip, Mochi, Lumi, Nova, Zuzu, Bean, Kiki, Tofu, Pebble, Juno, Comet, Dot, Orbi, Twinkle, Bloop, Sprout, Nim, Puff, Gizmo, Luma, Taro, Echo, Bix and Vela. The list lives in `engine/run.mjs` `AGENT_NAMES` and `web/crew.js`, in the same order.
- **Colour:** a courier's place in that list picks its shade, from white to graphite (no per-agent hues, RULES.md standing rule 3).
- **Drawing:** always drawn in code ([`web/crew.js`](../../web/crew.js)), so the same name always looks the same at any size. **Never drawn by an image generator.**
- **Motion:** a blink every 4 s, wings that flap while moving, a mouth that moves while talking, a hop when done.
- **Rule:** the crew appears as a group (cursors, a line-up, a credit row). Only Hermia speaks for the brand.

## The logo

- **The mark:** Hermia's helmeted face in a graphite circle, in three colours only: graphite `#2a2a2e`, off-white `#F2F2F2` and grey `#8e8e93`. It still reads at 16 px.
- **The lock-up:** the mark, then "SWARM" in Big Shoulders Display 800, then "*Studio*" or "*Feed*" in EB Garamond italic, in the accent.
- **Clear space:** a quarter of the mark's diameter on every side.
- **Don't:**
  - recolour it, outline it or add a shadow;
  - put it on a busy photo without the void behind it;
  - squash it, rotate it, or animate its face;
  - put it next to the Nous logo.

## Colour

History: Hermes-blue glow (spec 08) → Ultraviolet (trial, 2026-11-09) → Graphite with a colour per room
(2026-11-09) → **black, graphite and white with one accent** (owner, 2026-11-09) → **light and dark** (owner,
2026-11-09). The rule lives in [docs/ux/RULES.md](../ux/RULES.md), standing rule 3.

The studio follows the system's light or dark setting; ☰ → Light / Dark overrides it and is remembered. The
tokens are in `web/canvas.css`: dark is `:root`, light is the block after it.

| Token | Dark | Light | Job |
|---|---|---|---|
| bg (`--void`) | `#0b0b0c` | `#ffffff` | the page, flat: no glow, no grid, stars only |
| surface (`--deep`) | `#161618` | `#f4f4f5` | panels and cards |
| surface-2 | `#1f1f22` | `#ececef` | raised surfaces, secondary pills |
| line (`--edge`) | `#2a2a2e` | `#e4e4e7` | card borders and rules |
| text | `#f4f4f5` | `#0b0b0c` | text |
| muted | `#8e8e93` | `#636369` | secondary text |
| **accent** | = text | = text | **the one accent** (`--accent: var(--text)`): the main action, the active tab, the serif word. A white button with black text in dark, black with white in light. Text on it is `--accent-ink` (the page colour). Picking a hue later is that one line. |
| hot | `#F20000` | `#F20000` | errors only |

**Rules:**
- **One accent, used once per screen.** Everything else is black, graphite or white.
- **No per-room, per-view or per-agent colours.** The crew is told apart by shade, white to graphite.
- **No glow, no grid.** The galaxy home is monochrome stars: light stars on black, dark stars on white.
- **Pictures are the only colour.** Built pages, planets, art and video keep their own colours in both modes.
- Body text keeps 4.5:1 or better (`node scripts/contrast.mjs` checks the studio's pairs).

## Type

All free Google fonts under the OFL; they stand in for Nous's licensed ones.

| Role | Font |
|---|---|
| Display (huge, compressed, uppercase) | **Big Shoulders Display** 800 |
| Labels, nav, tabs | **Barlow Condensed** 600, uppercase, letter spacing 0.06em |
| Body and data | **JetBrains Mono** 400 |
| The accent word | **EB Garamond** italic, in the accent |

**The serif rule:** one accent word per headline, in EB Garamond italic, in the accent. For example: "One prompt. The *whole* launch." "Where to *next*?" "SWARM *Studio*". Never two accent words in one line.

## Voice

Swarm talks like a good ship's captain: short, warm, sure, and specific.

| Do | Don't |
|---|---|
| Plain verbs: build, steer, ship, remix, credit | "empower", "seamless", "revolutionary", "unleash", "magic" |
| Real numbers from real runs ("16 agents, 4 pages") | made-up stats, or "10x faster" with no run behind it |
| Name the output: "a site, a live app, a game, a film" | "content", "assets", "solutions" |
| Short lines; one idea each | rhetorical questions, "It's not X, it's Y", em-dash drama |
| Credit the crew and the maker | "AI-generated" as a label; it's built by a crew you steered |

**Lines we use:**
- One prompt. The *whole* launch.
- Watch your crew build it.
- Steer it like a design tool. Ship it from Hermes.
- Every build credits its crew.
- A whole creative studio, inside Hermes.
- Any tool Hermes can reach, the crew can use.

The app's own interface follows [docs/ux/RULES.md](../ux/RULES.md): names at rest, 15 words per screen at most, no explanations in tooltips. Marketing pages may say more, but each section still makes one point.

## Imagery and motion

- **Real output only.** Show real builds, real screenshots and real footage, never mock-ups or stock photos. A frame we drew is labelled as a design.
- **The look:** flat black space with stars, no grid and no glow, a 1 px graphite frame around the page; the builds bring the colour.
- **Motion:**
  - the 400 ms warp between views;
  - slow galaxy turns;
  - couriers that blink and hop;
  - Hermia on the home page: she breathes, blinks, flutters her helmet wings, looks toward the pointer, leans in while you type, and raises her baton when you pick a starter or copy the command. One gesture at a time, and only in response to the visitor.
  - Everything moving honours `prefers-reduced-motion` and has a still version.
  - Video is muted, looping, and has a poster.
- **Other products:** never show their logos or screenshots. Name them only in a comparison, in plain text.

## What we may never use

- the Nous Research logo, wordmark or engraved portrait, or anything that looks like a variant of it;
- Nous's licensed fonts (Rules, Aeonik);
- anything that suggests Nous made or endorses Swarm;
- characters, art or names from existing games, films or shows;
- other products' logos, screenshots or UI.
