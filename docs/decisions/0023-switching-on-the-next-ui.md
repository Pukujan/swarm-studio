# 0023. Switching the next UI on for people

- Date: 2026-11-14
- Status: decided in [0024](0024-the-next-ui-is-the-studio.md): the owner said "Yes, switch it". `/` serves the
  next UI, and the classic Studio stays at `/classic/`.
- Follows: [0013](0013-react-ui-coexists.md) (step 5: `/` serves the new UI once every screen has moved),
  [0008](0008-releases-stable-pin.md) (an unfinished feature has no visible door) and
  [0018](0018-next-ui-build-on-release.md) (only a release carries `ui/dist/`)

## Context

Issue #404 has moved most of the Studio to `/next/`:
- Projects, the Overview, the Plan board, the brand sheet and the Studio scaffold;
- the Design deck, Setup and Settings, the chat dock, and an app build's App room.

Not moved:
- a new project's deck (`draft`);
- the Game room, and a game build's App room;
- the Film studio;
- a few halves inside moved screens: the planner's talk in the Studio, a plan still in the chat, and a brand sheet
  opened from a chat.

Today nobody reaches `/next/` except by typing its address. Main is at `529f002` (2026-11-14).

On main, `/next/` holds up against `/`:
- **UI audit:** it has fewer known violations than `/` on every moved screen (for example, Projects 3 against 8, the
  Studio 0 against 6).
- **Motion:** 8 differences are still labelled drift, on brand, publish, replay and visitor.
- **Scenarios:** the moved screens' BDD scenarios run on both apps.

Two facts limit how the switch can be made:
- `/` and `/next/` are separate documents, so going from one to the other reloads the page. They share the
  address and the navigation machine (0013), but not Hermia, the chat or the crew's cursors on screen.
- Hermes Desktop opens the Studio at `/`, and the catalog installs a release branch (0008, 0018). So people get
  `/next/` only through a release, and only once something in `/` sends them there.

## The choices

*(our wording)*

1. **All at once, as 0013 planned.** Port the remaining rooms first. Then `/` serves the new UI and `web/`'s
   screens retire, in one PR and one release.
   - Simplest for people: no two apps.
   - Nothing moves for them until the Game room and the Film studio are done.
2. **Room by room.** `/` sends each moved room to `/next/`, and `/next/` sends each unmoved room back to `/`.
   - Moved screens reach people now.
   - Every crossing between the two apps reloads the page and drops the chat's open turn and Hermia's place.
     Crossings are common, because Make goes from Projects to the Studio to the deck.
3. **An opt-in preview, then all at once.** Settings gains one switch, *Use the next Studio* (off by default, in a
   release). With it on, the Studio opens at `/next/`. An unmoved room shows its name and a button to the current
   Studio at the same address, as it does today.
   - People who want it get the moved screens now.
   - Everyone else sees no change until choice 1 ships.
   - Switching it off goes back to `/`, which is unchanged.

## Recommendation

*(our wording)*

**Choice 3, then 1.**
- The switch is a door to a finished but partial app, so it needs the owner's word under 0008. The owner may
  instead hold everything back until choice 1.
- A screen counts as ready, under either choice, when:
  - its audit known list on `/next/` is no longer than on `/`;
  - it has no motion difference labelled `drift`;
  - its BDD scenarios pass on both apps.
- Before the switch ships:
  - list it in the README's "What it does on your machine" (it only changes which page the Studio opens);
  - make sure the release check (0018) builds `ui/dist/`.

## What it would take

*(our wording; nothing here is built)*

- **For choice 3:**
  - a `next` field in the Studio's settings file;
  - a Settings row (the setup sheet's layers, `ui/src/screens/setup/`) and the same row in the current
    Studio's Settings;
  - a redirect from `/` to `/next/` while the field is on (`server/server.mjs`), keeping the address.
- **For choice 1:**
  - `server/page.mjs` serves `nextPage` at `/`;
  - `web/`'s screens and their tests retire;
  - the motion-parity gate, which compares two apps, ends with them.
