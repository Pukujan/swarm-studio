# 8. Identity: the Commander, her crew, and the Hermes space theme

The studio should feel like part of the Hermes world, not a generic AI tool. A cute commander runs the build (she's the planner), a crew of little agents does the work, and the studio is set in a deep-space theme. The colours come from Hermes and Nous Research, and the space look comes from design-bakery.com.

This spec **updates [05-ui-theme.md](05-ui-theme.md)**. That spec's layout, components and screen-by-screen changes still apply, but its tokens are replaced by the palette below.

## What Hermes and Nous look like

Taken from nousresearch.com and hermes-agent.nousresearch.com on 2026-11-09:
- **Colour:**
  - **Hermes blue `#0000F2`** is the brand colour. It's used for buttons and frames, and as a full-bleed background.
  - **Off-white `#F2F2F2`.**
  - A bright "F2" palette: red `#F20000`, orange `#F27900`, yellow `#F2F200` (the accent), neon `#79F200`, green `#00F279`, cyan `#00F2F2`, indigo `#7900F2`, magenta `#F200F2`, pink `#F20079`, neutral `#616191`.
  - The dark pages are a deep blue-black.
- **Type:**
  - Display is very tall and compressed (Rules Gothic Compressed), used for huge titles like "NOUS RESEARCH".
  - Labels are condensed uppercase (Rules Condensed). Body text is monospaced-looking (Aeonik Fono). EB Garamond (classical serif) is used for accents.
- **Imagery:** the Nous logo is an engraved classical portrait. The site mixes classical engraving with pixel and glitch touches (the small pixel-wing mark in the search bar). There's a thin blue frame around the whole page.
- **Plugins:** official dashboard plugins (for example `plugins/kanban`) don't bring their own palette. They use the dashboard's theme variables (`--color-foreground`, `--color-card`, `--color-border`, `--color-ring`, `--color-primary`, `--font-mono`, `--radius`). Themes are YAML files in `~/.hermes/dashboard-themes/`.

**What we may not use:**
- the Nous logo or wordmark as our mark;
- their commercial fonts (Rules and Aeonik are licensed);
- anything that suggests Nous made Swarm Studio.

A small "Built for Hermes Agent" line in the footer and the README is fine.

## The theme: "Hermes space"

**Base:** deep-space blue-black with a starfield, a faint grid and one glow, the design-bakery.com look recoloured to Hermes blue. There's a 1 px Hermes-blue frame around the whole app, as on their sites.

| Token | Value | Use |
|---|---|---|
| `--void` | `#05051a` | app background, deep space |
| `--deep` | `#0a0a2e` | panels (glass over the void) |
| `--panel` | `rgb(242 242 242 / .04)` | glass fill |
| `--panel-edge` | `rgb(242 242 242 / .12)` | 1 px borders |
| `--frame` | `#0000F2` | the app frame, the primary button, the selection ring |
| `--text` | `#F2F2F2` | body |
| `--muted` | `#8b8bb8` (neutral, lifted for contrast) | secondary text |
| `--accent` | `#F2F200` (yellow) | the one "do this / live" accent |
| `--accent-ink` | `#05051a` | text on yellow |
| `--ok` | `#00F279` | done |
| `--hot` | `#F20000` | failed, recording |
| `--info` | `#00F2F2` | links, info |
| `--glow` | `#0000F2` at 35%, blurred 120 px | the orb behind the active area |

**Crew colours:** each agent gets one of the 10 F2 colours (red, orange, yellow, neon, green, cyan, indigo, magenta, pink, plus blue on white). Agents beyond 10 reuse a colour with a lighter tint. These colours are used for the cursors, the name pills, the 2 px message rules and the avatar.

**Type** (all free, OFL, self-hosted in `web/fonts/`):

| Role | Font | Stands in for |
|---|---|---|
| Display: huge compressed titles | **Big Shoulders Display** 800, or **Antonio** 700 | Rules Gothic Compressed |
| Labels, nav, tabs, timers | **Barlow Condensed** 600, uppercase, letter spacing 0.06em | Rules Condensed |
| Body and data | **JetBrains Mono** 400 | Aeonik Fono (mono feel) |
| Accent word | **EB Garamond** italic (which Nous uses too) | — |

**The rule from design-bakery.com still holds:** one accent word in the serif, in yellow. For example "One prompt. The *whole* thing." and "SWARM *Studio*".

**Inside the Hermes dashboard:** when the canvas is embedded as a dashboard tab, it reads the host's `--color-*` and `--font-*` variables first and falls back to the tokens above, so it fits whatever Hermes theme the person uses. We also ship an optional `swarm-space.yaml` dashboard theme with these tokens, the starfield `bg` asset and the fonts (`fontUrl`). People can switch their whole dashboard to it.

## The Commander (the planner)

- **Who she is:** a cute chibi commander who runs every build. She's original, inspired by the Hermes myth, which is public domain: the messenger with a winged helmet and a caduceus staff.
- **Look:**
  - a round face and big eyes, with a small winged helmet in off-white, and the wing tips in Hermes blue;
  - a short blue cape with a yellow trim line;
  - she carries a caduceus-style baton that glows yellow when she gives orders;
  - drawn in an engraved, line-art style with a few pixel and glitch accents, a nod to the Nous style without copying their logo.
- **Name:** she's called "Hermia". The name and look are final unless we change them before launch.
- **Where she appears:**
  1. **The planner's seat:** at the top of the canvas when a build starts. She "draws" the sitemap, and the page frames fly out from her baton.
  2. **Orders:** each `agent:assign` is a speech bubble from her ("Ada, hero section, go!"), and a dotted line runs from her to the agent's cursor.
  3. **Auto narrator:** the step transition cards from [07-auto-show.md](07-auto-show.md) show her pointing to the next view.
  4. **Onboarding host:** she greets people in [06-onboarding.md](06-onboarding.md), one line per step.
  5. **Logo and avatar:** her helmeted face in a circle is the app icon, the favicon, the README hero, the catalog listing and the Arcade avatar.
- **Voice:** in the chatter system she has a warmer, lower voice than the crew, and her TTS lines are rarer and sound like commands ("Launch!", "Good work, crew.").

## The crew (the agents)

- **Who they are:** cute alien minion workers who came with Hermia from beyond the galaxy. Each is a round blob body in a soft tint of the agent's colour, with antennae, one or two big goggle eyes on a visor strap in the agent's colour, and tiny ankle wings (Hermes' winged sandals).
- **Names:** short, original, star-like and easy to say (Pip, Mochi, Lumi, Nova, Zuzu, Tofu, Pebble, Comet, …), never characters from existing shows. The list lives in `engine/run.mjs` (`AGENT_NAMES`) and, in the same order, in `web/crew.js`; a name's place in it picks its F2 colour.
- **Avatars:** SVG, generated in code from the agent's name, so they stay consistent at any size:
  - the body colour is from the F2 palette;
  - the goggles (two eyes or one big one), antenna style and one accessory (none, a tool belt, a scarf, overall straps) are picked by a seed;
  - each one is a single `<svg>` that animates cheaply: a 4 s blink, a mouth that opens in sync with its chatter syllables, wings that flap while it moves, and a hop when it finishes a task.
- **Where they appear:** on each cursor (the avatar replaces the plain arrow head, with the name pill beside it), in agent messages in Chat, the break room, the code wall tiles ("Ada is writing `routes.ts`"), and the final summary card's crew line.
- **Images:** the generator never draws them. Generated sprite sheets don't stay consistent, so the crew is code only.

## Star systems

The studio is a little universe. Hermia came from beyond the galaxy with her crew, and the work happens across a few star systems.

- **Each view is a star system.** Canvas, Video and App are stars on a small star map in the top bar (it replaces the segmented control); Auto is the yellow star at the end of the map. Each star has its own colour (Canvas off-white, Video cyan, App green, Auto yellow). The current one is bigger, glows, and has a dashed orbit ring turning round it.
- **Switching views is a warp.** For about 400 ms stars streak outward from the middle of the screen, with a few streaks in the colour of the system you are going to. It is turned off under `prefers-reduced-motion`.
- **Each unit of work is a star node.** A page frame, a code file tile and a video scene each carry a glowing node. While an agent works on it, the node turns yellow and gets a soft orbit ring.
- **The crew talk on the radio.** On the App code wall, the engine's lead agent speaks as Hermia: her newest line sits in a strip at the top of the wall, and when she gives an order a dotted line runs from her to that helper's cursor. Helpers answer in bubbles on their cursors, and their name pill shows what they are doing right now ("reading SharedNav.tsx", "writing store.ts"). Between batches, a planning tile says who is planning, for how long, with how much context.
- All of it stays inside the palette above; no new colours.

## Galaxy and orbit

The owner found the studio too "terminal and code based", with too much on screen at once. So the default now starts with visuals, and the old layout stays one click away.

Screens: `docs/specs/screens/galaxy/`. Start with `galaxy-1280.png`, then `orbit-1280-building.png`, `orbit-1280-thinking-log.png`, `galaxy-390.png` and `orbit-390.png`.

### Galaxy home

The first thing you see is a slowly turning spiral galaxy, drawn with three.js. Hermia's ship sits at the core.

- **Builds are star systems.** Each saved build (`GET /api/runs`) is a star. Its place in the arms comes from a hash of the run id, so it is the same on every visit. Its colour comes from the build's theme, lifted so it shows on the dark. Its label is the build's title. The live build pulses.
- **Labels stay readable.** At most 9 labels (5 on a phone) are shown. They skip the core and the prompt area and don't overlap each other. The "Star chart" button lists every build.
- **Starting a build.** A floating "Where to *next*?" prompt starts one, either with Launch (the normal brief submit) or with Auto. Chips under it reopen the last build.
- **Opening a build.** Clicking a star flies the camera in (about 900 ms) and opens that build in orbit. Under `prefers-reduced-motion` the galaxy does not turn and the flight is a short cross-fade.
- **Rendering.**
  - About 46k instanced points (22k on a phone) with additive glow, nebula sprites and mouse parallax.
  - The pixel ratio is capped at 2, and rendering pauses when the tab is hidden or the galaxy is closed.
  - three.js r170 is vendored in `web/vendor/three/` with its MIT licence; nothing loads from a CDN.

### Orbit view (the default inside a build)

- **The bodies.**
  - The build is the sun, in its theme colour.
  - Each page is a planet, textured with a thumbnail of that page, and a ring under its label fills as its sections finish.
  - Sections are moons while they are being built. A moon sinks into its planet when its section is done.
- **The crew.** Crew minions fly to the moon or planet they are working on. They say what they are doing in speech bubbles, with at most 3 talking at once. The engine crew fly to the Engine room.
- **Hermia's comm-link.** Hermia's orders show in one comm-link strip at the bottom.
- **Hermia's reasoning.**
  - Her reasoning (`crew:lead` events with `kind: 'reason'`) shows separately, as a dimmer, italic, cloud-style thought bubble above the strip.
  - Clicking the strip or the **Thinking** button opens a scrollable "Hermia's thinking" log. It lists every thought, with the full text, and her orders. Esc closes it.
- **Stations.** The three views are stations on the outer ring:
  - **Design deck** (the canvas);
  - **Film studio** (video);
  - **Engine room** (the app; the code wall is only in here).
- **Moving around.**
  - Clicking a planet opens the Design deck at that page.
  - The back button in the top bar goes Station → Orbit → Galaxy.
- **Chat.** It is folded into the comm-link strip. The Chat button opens the full side column, and its ✕ folds it again.
- **On a phone.** At 600 px and below, orbit becomes a list: a sun header, the three stations as cards, and a row per planet with its thumbnail and progress.

### Lean chrome and the Classic view

- **The top bar.** In galaxy, orbit and station modes it shows only back, the build name, Auto, Play, Publish and ☰.
- **Classic view.** Classic view in ☰ restores the old layout exactly. It is stored in `localStorage` (`swarm.classic`, read and written inside try/catch), and switching it does not reload the page. Game also moved into ☰ in the new layout.
- **What keeps working.**
  - `?wall=1` and `/wall` are untouched; no galaxy or orbit appears there.
  - `?replay=<id>` and `?run=<id>` open straight into orbit.

### Code layout

- **New files.** `web/galaxy.js` (the galaxy and the `window.swarmCosmos` mode controller), `web/orbit.js` (the orbit view, comm-link and thinking log) and `web/galaxy.css`. The server inlines them into the canvas page like the other files.
- **Changes to `canvas.js`.** Only small hooks, marked "galaxy/orbit hook":
  - an event hook at the top of `on(e)`;
  - a check so auto-open-latest waits when the galaxy is home;
  - a small `window.swarm` object: `S`, `view`, `openRun`, `setView`, `focusPage`, `openPlayer`, `thumb(id)`, `submit(text, auto)` and `on(fn)`.
- **How orbit updates.** Orbit reads the build state from `swarm.S` 4 times a second. It uses events only for bubbles and the comm-link. Events from a reloaded history are not replayed as bubbles.
- **Colours.** All colours come from `:root` tokens; WebGL reads them with `getComputedStyle`. There are two new tokens for the nebula, both from the F2 set: `--nebula` `#7900F2` and `--nebula-2` `#F20079`.

### Performance (MacBook Air M1, Chrome with Metal, DPR 2)

- **Galaxy:** a steady 60 fps.
- **Orbit:** about 60 fps once a build has settled.
- **During a fast replay:** frames drop in both orbit and Classic view. The time goes to the canvas's own page iframes, not to the WebGL.

## The Commander's artwork

- A small set of reference illustrations: a portrait, a pointing pose, a cheering pose and a thinking pose.
  - They're made with the image generator from one fixed prompt and seed.
  - Then we hand-pick and clean them into transparent PNGs and SVG line art.
  - The kept versions go in `web/brand/`, recorded with their prompt and seed in `web/brand/credits.json`.
- The logo is a clean vector redraw of the portrait: 3 colours (blue, off-white, yellow) that still read at 16 px.
- Nothing is copied from Nous artwork. A reviewer compares the final art against the Nous logo, to make sure it doesn't look like a variant of it.

## Done when

- [ ] Tokens, fonts and the frame are in `web/canvas.css`. The canvas uses the Hermes dashboard's `--color-*` variables when embedded, and `swarm-space.yaml` installs and works as a dashboard theme.
- [ ] Hermia appears at the start of a build and gives orders in bubbles with dotted lines to cursors. She's also in the Auto transitions and the onboarding.
- [ ] Each agent cursor has its SVG avatar: it blinks, its mouth moves with chatter, its wings flap while it moves, and it hops when done. Two runs with the same agent names look the same.
- [ ] The app icon, favicon and README hero use Hermia's logo. The footer says "Built for Hermes Agent", with no Nous logo anywhere.
- [ ] Contrast passes WCAG AA, and everything works at 390 px wide.
- [x] Galaxy home, orbit view with stations, comm-link, thought cloud and thinking log, lean chrome and the Classic view toggle (see "Galaxy and orbit").
