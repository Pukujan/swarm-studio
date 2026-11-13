# 6. Onboarding: one setup screen, and a guided prompt for every mode

Status: **agreed** (owner, 2026-11-11: "ok do it"). It replaces the four-step welcome this file held before,
which was never built and predates [docs/ux/RULES.md](../ux/RULES.md). The Connections panel that file also
described is [spec 25](25-connections.md).

## Problem

A new person gets a prompt box and nothing else. They cannot tell:

- whether a model is set up, until a build fails with a blank canvas;
- what their builds will use for pictures. For a day (fixed in #230 and #231) builds came out with no pictures
  because the picked image provider was not signed in, and nothing said so;
- which account a Feed post will carry. Connecting as a guest makes a profile with a made-up name ("Topaz
  Toucan");
- what to type. A short prompt gets a generic result.

## Part 1. Setup: one screen, three rows

One sheet, shown **once**, the first time Projects opens in the plugin (never in the hosted studio). After that
it opens from the Projects user menu (the avatar) → **Setup**, and from Settings (spec 25) once that sheet
ships: Settings › You and Settings › Crew then hold the same three controls, and the user menu's Setup item
goes (rule 4, one place per control).

It follows iOS Settings, as [PATTERNS.md](../ux/PATTERNS.md) assigns for settings: a grouped list, one level
per tap. It closes with ×, Esc and a click outside (rule 18); closing it any way counts as seen. Nothing is
required: every row has a default already picked, and **Start** works at once.

At rest (11 words of interface text; values are content):

| Row | State at rest | Tap opens |
|---|---|---|
| **Account** | "Not signed in", or the Feed name | Google, GitHub, Discord; **Skip for now** |
| **Models** | the builder model's name and a ✓, or a ⚠ | planner and builder names; on ⚠ one plain line, the fix that fits (**Let Hermes set this up** or **Test again**) and **Details**; then Hermes's own model list to pick from, and **More providers** to sign in |
| **Pictures** | Painted, Stock photos or Drawn | the three options |

The one primary action is **Start**, bottom right, fixed width.

### Account

- **Sign in** with Google, GitHub or Discord. The browser opens Swarm Feed's sign-in; when it comes back, the
  plugin is connected **as that account**. The order matters: sign-in first, then the device code is approved
  by the signed-in account (`feed.py`, swarm-feed `/link`), so the plugin is never linked to a guest profile
  by this screen.
- **Skip for now** is the default and is a real choice: a reviewer must be able to try the plugin cold.
  Skipped, you can build and publish; you cannot post to the Feed. Post to Feed then offers the same sign-in
  at that moment, instead of connecting silently as a guest.
- The one honest line lives here, one layer down, where the choice is made (rule 9): **"Builds stay on this
  computer. Publish and Post make them public."** The full table of where data goes is Settings › Data
  (spec 25).

### Models

- Shows the planner and builder models: Hermes's `swarm_studio_planner` and `swarm_studio_builder` slots, or
  Hermes's main model while a slot is empty.
- **Pick from a list, never type a name** (owner, 2026-11-13). Opened, the row lists the models Hermes itself
  lists (the same list as Hermes Desktop's picker), grouped by signed-in provider, the one in use first with a
  ✓, eight per provider until **All n**, and a search box over all of them. A tap sets both slots in Hermes's
  config, drops the canvas's own picks for those roles, and tests again. Hermes reads its config again when
  the file changes, so no restart.
- **More providers** lists the providers that are not signed in, and the search box narrows them by name.
  **Sign in** opens what that provider uses: a key box where a key is its only sign-in (saved where Hermes
  keeps keys, sent on stdin, never shown again), or Hermes's own browser sign-in (`hermes auth add <provider>`;
  the sheet shows its code and an **Open** link, and the list refreshes when Hermes says it is signed in).
  Providers Hermes sets up only in its own setup (cloud consoles, local servers, custom endpoints) are not
  listed; **Let Hermes set this up** covers them.
- The list is read by `hermes_models.py`, run in Hermes's own Python; the pick and the key are Hermes's public
  CLI (`hermes config set`). [hermes-and-connections.md](../engines/hermes-and-connections.md) names why the
  list reads Hermes internals and what keeps that read-only.
- When the screen opens, the server makes one tiny call to each (a few tokens; `POST /api/setup/models`).
  A ✓ when both answer. The check is kept for ten minutes, so opening the screen again costs nothing.
- When one fails: a ⚠ on the row (rule 10); opened, one plain line saying what is wrong and the one fix that
  fits it (`modelProblem` in engine/setup.mjs). The provider's raw message stays behind **Details**.
  - No model, a refused key, a model Hermes doesn't have, no credit, or anything unknown:
    **Let Hermes set this up**. It hands the job to Hermes (`hermes model`, opened in a terminal by the plugin's
    server: a `.command` file on a Mac, a console window on Windows through Hermes Desktop's `hermes` alias;
    elsewhere the command to copy). The row tests again when the person comes back to the window.
  - Hermes can't read its keys, or Swarm Studio was updated: "Restart Hermes." and **Test again**.
  - Hermes not connected, the model busy or slow: **Test again**.
  The plugin never stores a model key (catalog rule 11): a key pasted under More providers goes straight to
  Hermes's key store, and the plugin's own files never hold it.
- While the last check failed, the avatar keeps a small red dot and its menu's **Setup** item an ⚠, so closing
  the sheet never hides the problem. The server keeps the result (`modelsOk` in setup.json) until a check passes.
- A different model per role stays where it is (☰ → Models; Settings › Crew in spec 25). The Setup pick sets
  planner and builders together.

### Pictures

What a build uses for pictures unless that build says otherwise. Three options, one picked:

| Option | What a build does | Needs | Speed |
|---|---|---|---|
| **Painted** | An image model paints each picture; a stock photo holds the slot until it lands | a signed-in image model | about a minute a picture |
| **Stock photos** | Photos from the built-in library and Pexels fill the slots; nothing is painted | nothing | instant |
| **Drawn** | The builders draw in SVG; no picture slots, no photos | nothing | fastest |

- Opened, Painted names its model ("gpt-image-2 · Codex") and carries a dot: ready (signed in, and its last
  paint worked), or ⚠ (not signed in, or its last paint was refused: out of quota, a spending limit). The
  state comes from Hermes's sign-ins and from the last real paint. No test picture is painted: that would
  spend the person's credits without asking.
- **The default**: Painted when an image model is ready, else Drawn. So a first build never comes out with
  empty picture slots. Once the person picks, the pick is kept (`models.json`, `pictures`).
- A build can override it: the Website questions end with Pictures (Part 2), and a build's input may carry
  `pictures: painted | stock | drawn`.
- The existing image-model pick (which provider and model paint) is untouched. Its "off" means Drawn.

### Everything else is asked when it is needed

No row for these on the setup screen. Each is one action at the moment a build needs it, with **Let Hermes
handle it** first (spec 25's actions), and Skip always there:

| When | Asks for |
|---|---|
| Publish | a host (GitHub Pages, Vercel, Cloudflare) |
| An app with payments | Stripe, test mode |
| A game that wants 3D | Meshy (paid: shows the price first) |
| A film | music and clip keys |
| Post to Feed, not signed in | the Account row's sign-in |

## Part 2. A guided prompt for every mode

Game already has one (`QUESTIONS` in `engine/game.mjs`, then the Plan board). Website, App and Film get the
same thing from the same code: the pop under the Make box (`grill` in `web/home.js`), fed by
`engine/intake.mjs`. No second interview is built, and no second input: it is the one Make box (rule 1).

After Make is pressed:

| Mode | Questions, in order |
|---|---|
| **Website** | What is it for? · Who is it for? · The mood? · Which pages? · Pictures? |
| **App** | What do people do in it? · Accounts? · Payments? · What does the admin see? |
| **Film** | What is it about? · The feeling? · How long? · Voice or music? |

Rules:

1. **One question at a time**, each answerable with one tap on a chip. Dots show how far along (rule 12).
2. **Typing is never taken away**: every question takes your own words, and the Make box keeps the prompt.
3. **Just build** is on every question. Anything unanswered takes a sensible default; the default is not
   written into the brief as if the person had said it.
4. **A full prompt skips what its words already answer.** Each question knows the words that answer it
   ("for families" answers Who; "booking", "menu", "pricing" answer Which pages; "2 minutes" answers How
   long). A prompt that answers all of them builds at once, as today.
5. **The brief is shown before the build starts**: the last step is one short paragraph, written from the
   prompt and the answers, in a text box. Edit it or press **Build**. Just build skips this step too: it
   means build now.
6. The **Grill me** switch in the kind menu stays the off switch: off, Make builds at once.
7. The **💡 button** offers a few good starting prompts **for the mode that is picked** (today it lists four
   showcases whatever the mode). One tap puts the prompt in the box and starts its questions.

The Pictures answer on a Website sets that build's pictures (Part 1) and offers the same three options, with
the setup default picked first.

## The empty state

Before a first build, Projects has no cards. In their place a finished build plays itself: a recorded run
shipped with the plugin, played by the existing replay (#238, #241) at small size on the stage, with no
controls and no text. The Make box sits over it as it does over the cards. The first real build takes its
place. Not in the hosted studio.

## No coach marks

The first shape of this had three once-only coach marks during the first build. [RULES.md](../ux/RULES.md)
does not allow them: standing rule 1 bans every hover hint and tooltip component, standing rule 2 and rule 9
ban helper sentences ("explanations are deleted, not hidden"). A coach mark is both.

What the first build does instead, all of it already in the rules:

- it **opens in the Design deck with Follow on** (#235), so the crew is seen working without being pointed at;
- the **progress pill** is in view (rule 19);
- **Hermia speaks** her short orders at each phase (rule 24), under the one Sound control;
- when it finishes, the **one toast** (rule 27) reads "Done" with **Play**.

Nothing is shown only once, so nothing has to be remembered or dismissed.

## Data and safety

- `setup.json` in the plugin's data dir holds `{ seen: true }` and nothing else. The pictures pick is in
  `models.json` with the other picks. No secrets in either.
- The model test sends the words "Say ok" to the planner and builder models the person already uses.
- Sign-in happens in the browser on Swarm Feed; the plugin receives the same device token as today
  (`feed.json`, mode 0600) and never sees a password.

## Slices

| Slice | What | Files |
|---|---|---|
| 1 | The Setup sheet with the Pictures and Models rows; the pictures default; `pictures` on a build | `engine/setup.mjs`, `web/setup.js`, a few lines in `server/server.mjs` and `web/home.js` |
| 2 | Website guided prompt: its questions, skip-what-is-answered, the brief step, 💡 per mode | `engine/intake.mjs`, `web/home.js` |
| 3 | The Account row (after Settings slice 1 of spec 25, which shares the Feed account control) | `feed.py`, `commands.py`, swarm-feed `/link` |
| 4 | App and Film guided prompts | `engine/intake.mjs` |
| 5 | The empty state's recorded build; "asked when it is needed" for Publish, Stripe, Meshy and film keys | with spec 25 slices 2 to 4 |

## Done when

- [ ] A fresh `HERMES_HOME` opens Setup once; × or Start lands on Projects and a website build works.
- [ ] With no image model signed in, the Pictures row reads Drawn and a first build has no empty picture slot.
- [ ] With a model key that fails, the Models row shows ⚠ and "Let Hermes set this up", not a blank canvas later.
- [ ] Signing in on the Account row connects the plugin as that account; skipping never makes a guest profile.
- [ ] Website, App and Film each ask their questions one at a time; Just build works on every one; a prompt
      that answers a question is not asked it; the brief is shown and can be edited before the build.
- [ ] 💡 lists starting prompts for the picked mode.
- [ ] `docs/ux/INVENTORY.md` and `SITEMAP.md` carry every control added; light and dark, 1280 and 390.
