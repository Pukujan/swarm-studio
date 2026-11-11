# 17. Release to stores, with the Studio as guide

A developer who builds a game in Swarm Studio can release it on **itch.io** and then **Steam** from the Studio. The Studio does the work it can do: the builds, the store art, the copy, the trailer, the checks and the upload. It **guides** the person through the steps only they can take: accounts, fees, tax forms, agreements and the final submit. Commander Hermia leads the release the way she leads a build.

This is for every developer, not only our own demo. It comes after the hackathon. In the pitch it is the next line: **one prompt → a built game → a post on the Feed → released on a store.**

## Why

Many small games never ship. The game is not what stops them. The release is: the store page, capsule art at exact sizes, screenshots, a trailer, the copy, the build upload and the store rules. The Studio already makes most of those pieces. This spec joins them into one guided release.

## Stores, in order

1. **itch.io first.** There is no fee and no review. The person makes the game's page on itch once. After that, `butler push` uploads each build with an API key. It is live in minutes, so it proves the flow.
2. **Steam next.** Steam Direct charges a fee per game (US$100, paid back after the game earns US$1,000). Valve reviews the store page and the build before release, which takes a few business days. A new developer also waits before their first release, and the "Coming soon" page must be public for a while first. The Studio says the dates plainly and never promises a launch day it can't keep.
3. **Later:** Epic, GOG, and console stores only when someone asks.

## What the person does (the Studio guides each one)

Only the person can do these. The Studio shows each one as a step with one plain line, a button that opens the exact page, and a check that turns gold when it is done.

- **itch.io:** make an itch account; make the game's page (title, the short URL); make an API key and paste it into the Studio once.
- **Steam:**
  - join Steamworks;
  - accept the distribution agreement;
  - fill in the tax and bank forms and the identity check;
  - pay the fee for this game;
  - create the app, which gives the App ID;
  - make a **builder account** that can only upload builds, and connect it in the Studio (see Accounts and secrets);
  - answer the content survey;
  - press **Submit for review** on the store page, and later on the build;
  - press **Release** on launch day.

The Studio never pays a fee, signs an agreement, fills in tax or identity forms, or presses submit or release. It gets everything ready and says "Your turn" with the one button.

## What the Studio does

1. **Builds.**
   - Exports the game for Windows (and Mac or Linux where the engine supports it), from Godot with export templates or from the web build in a desktop wrapper.
   - Runs a smoke test on the exported build: it starts, reaches the menu, and the first level loads. If Jev autoplay is configured, Jev plays the first level.
2. **Store art at the store's sizes.** It is cut from the game's key art and renders, with the name set in the game's own type.
   - **Steam:** header capsule 920×430, small 462×174, main 1232×706, vertical 748×896, library capsule 600×900, library hero 3840×1240, and a library logo 1280×720 on a transparent background.
   - **itch.io:** cover 630×500.
   - Rules checked: no URLs, review quotes or award badges on capsules; the name is readable at the small size.
3. **Screenshots** from the playtest recording: at least five at 1920×1080, real gameplay, no menus only.
4. **Trailer** from the Film studio (spec 15), cut to the store's limits, with a short version for the capsule hover.
5. **Copy:** a short description (Steam's limit), a long description with headings, features, tags, system requirements read from the export settings, languages, and the content survey answers drafted for the person to confirm.
6. **Pre-check before the person submits.** A list of what Valve or itch will check, each with pass or fix: art sizes, missing fields, build launches, no placeholder text or stand-in pictures left. Stand-in stock photos must be replaced or credited before a store release.
7. **Upload.**
   - itch.io: `butler push <dir> <user>/<game>:<channel>`.
   - Steam: `steamcmd` with an `app_build` and a `depot_build` script the Studio writes, uploaded to a **beta branch**. The person moves it to the default branch on Steamworks; Steam does not allow that from the uploader.
8. **The Feed.** The game's post gets a "Get it on itch" or "Get it on Steam" button, and the release shows up on the maker's profile.

## The guide

A **Release** panel opens from the game's canvas. It is one column of steps for the chosen store, top to bottom:

- each step shows who does it (Hermia's crew or the person) and its state (waiting, working, done, your turn);
- only names show at rest; a step opens to its one line and its button;
- crew steps run on their own and show their output (the art, the copy, the build) for a yes or a change;
- person steps open the right page and wait. The Studio checks what it can, for example that the App ID exists or that the itch page answers, and turns the step gold;
- dates come from the store's real rules: "Review takes a few business days", "Your page must be public before you can release";
- it remembers progress per game, so a person can stop and come back days later.

Hermia speaks at three points only: when the release starts, when it's the person's turn, and when it is live.

## Accounts and secrets

- Store accounts are **connections**, not sign-ins. They live with the person's other connections (the Feed's Connected accounts on /me, and the Studio's onboarding, spec 06). Signing in with Steam on the Feed gives **no** publishing rights. Publishing always uses a separate builder login or API key.
- The itch API key and the Steam builder login stay with Hermes on the person's computer (`$HERMES_HOME`, mode 0600), never in the canvas, the browser or logs, and never on the Feed. The Feed records only that a store is connected and the public store link.
- **Steam Guard:** the first `steamcmd` login asks for a code. The person types it into the uploader. The Studio never asks for or stores their Steam password in chat.
- A **builder account** with upload-only permission is the default the guide recommends, so a leaked login cannot change prices or the store page.

## Data (Octo, swarm schema, additive)

- `swarm.store_links`: build id, store (`itch`, `steam`), public URL, app id, state (`draft`, `coming_soon`, `in_review`, `live`), and when each state was reached. It is public and drives the Feed button.
- No secrets in Octo. Keys stay with Hermes on the person's computer.

## Done when

- A Studio game goes from its canvas to a live itch.io page through the guide, with Studio-made cover, screenshots, trailer and copy, and the Feed post shows "Get it on itch".
- For Steam, the guide takes a test app up to "build uploaded to a beta branch and the store page ready to submit". Every step only the person can do is clearly marked and was done by the person.
- The pre-check catches a wrong capsule size and a leftover stand-in picture.
- No key or password appears in the canvas, the browser, logs or Octo.

## Not in this spec

- Paying fees, signing agreements or pressing submit or release for the person.
- Pricing, sales, keys, achievements, cloud saves and other Steamworks features beyond the store page and build.
- Consoles.
