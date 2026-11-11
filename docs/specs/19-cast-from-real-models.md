# 19. Cast from real models

## Why

ARES came out with chunky characters built from boxes and capsules, and the owner hated it. The bar is the polish of
anime action games: stylish, attractive characters in techwear, streetwear, gothic or sci-fi looks. Good free models
already exist. The owner's words: *"would be great if our game maker suggested things like these instead of making
weird 3D-looking characters"*.

So the game maker stops building people from primitive shapes. When a game needs characters, the crew finds real,
rigged anime models whose licences allow it, shows a short picture list, and the person picks.

## The flow

1. **Brief → spec.** The game interview writes the spec as before.
2. **Does it need a cast?** Yes when the game is 3D (three.js, or a Godot, Unity or Unreal port) and the spec names
   people: the hero, speaking characters and the boss, **4 roles at most** (`castRoles`, `needsCast` in
   `engine/cast.mjs`). The spec reply carries `cast: { roles, violent }`; `violent` is true when the game has combat.
3. **Search.** For each role, `POST /api/cast { role, violent }` searches both sources, filters by licence, and returns
   a ranked, numbered shortlist of 8.
4. **The Cast step on the canvas.** After the spec card, **Build the game** opens the Cast step instead of building:
   one tab per role, a grid of numbered picture cards. At rest a card is its picture, number and name. A click picks
   it for that role and opens its creator, licence line, triangle count and a link to the source page below the grid.
   **← Spec**, **Skip** and **Build the game**. No tooltips, minimal text, colours only from the tokens (the accent
   ring marks the pick).
5. **Build.** The picks go into `spec.cast`. The build prompt (`castPrompt`) tells the builder to use them and never
   rebuild a character from primitive shapes. `CREDITS.md` is written into the game from the picks.
6. **Load and shade.** VRM files load with the **godot-vrm** addon in Godot, or `@pixiv/three-vrm` in three.js;
   glTF/FBX load the usual way. Each model gets the game's cel shading and outline, unless its licence forbids changes
   (then it keeps its own materials; `licence.restyle` is false).
7. **Credit.** A Credits screen in the game and a credits line on the game's site, word for word from
   `licence.credit`.

## Sources

Only these two official APIs. **Never** ripped game-asset sites (skowt.cc, models-resource and the like); the engine
refuses them.

| Source | Search | Licence |
|---|---|---|
| VRoid Hub | `GET https://hub.vroid.com/api/search/character_models?keyword=…&is_downloadable=1`, header `X-Api-Version: 11`. One keyword (its tags are single words): the role's first style word, else `techwear`. | `latest_character_model_version.vrm_meta`, plus the hub's own `license` block when present, which can only narrow it. |
| Sketchfab | `GET https://api.sketchfab.com/v3/search?type=models&q=…&downloadable=true&rigged=true&license=by\|cc0&sort_by=-likeCount`. One licence per request (two licences in one query return nothing), and two queries: `anime <girl/boy> <style words>`, then `anime <girl/boy>`. | `license.label`: only CC Attribution and CC0. |

## The licence filter

A model is kept only when someone other than its author may use it in a game, with violence when the game has combat.

**VRM 1.0** (`avatarPermission` present):
- `avatarPermission == 'everyone'`, else dropped ("only its author may use it").
- `allowExcessivelyViolentUsage == true` when the game has combat, else dropped ("no violence allowed").
- `commercialUsage`: `corporation` or `personalProfit` marks it fit for paid games; `personalNonProfit` is fine for a
  free hackathon game. Ask for `commercial: true` to drop the rest.
- `creditNotation`: `unnecessary` means no credit is required. We credit anyway.
- `modification == 'prohibited'` keeps the model but turns off the restyle.

**VRM 0.x**: `allowedUserName == 'Everyone'`, `violentUssageName == 'Allow'` (VRoid Hub spells it `violentUsageName`;
both are read), `commercialUssageName` for paid games, `licenseName` (`CC0` needs no credit; `…_ND` turns off the
restyle).

**VRoid Hub's own block** (`license`): `characterization_allowed_user` other than `everyone`, or
`violent_expression: disallow` in a combat game, drops the model; `modification: disallow` turns off the restyle.

**Also dropped**, before the licence is read:
- `age_limit` R15, R18 or adult, Sketchfab `isAgeRestricted`, and `is_vendor_forbidden_use_by_others`.
- A name, title or tag on the blocklist (`BLOCK`, `BLOCK_JA`), matched as whole words (Japanese anywhere):
  - **ip**: HoYoverse games and their best-known characters, NIKKE, Blue Archive, Arknights and other gacha games,
    Vocaloid, popular anime, and words that mark someone else's work (fan art, MMD, GMod, XPS, rip).
  - **adult**: nude, underwear, lingerie, swimsuit, bikini, and the Japanese words for them.
  - **young**: loli, shota, child, and any age under 18 written out ("10 year old").

A blocklist is never complete. Some fan models with an uncommon series name will slip through (live searches turned
up "Marcille Donato, Delicious in Dungeon", now listed). The person sees each name before picking, and a reviewer
pass over the shortlist is the next step (below).

## Ranking

1. Models whose name or tags match the role's style words.
2. Then models marked as original work (`original`, `OC`, オリジナル).
3. Then likes. VRoid hearts and Sketchfab likes are not on one scale, so within each tier the two sources take turns.
4. A model over 120k triangles sinks to the end rather than being dropped.

Each card carries: number, name, creator, source URL, format (`vrm` with its version, or `gltf`), likes, triangles,
preview picture (VRoid's full-body or portrait image, Sketchfab's smallest thumbnail at least 400 px wide) and the
licence verdict with its credit line.

## Downloading the picks

Neither source lets an anonymous script download:
- **Sketchfab** needs the person's API token: `GET /v3/models/{uid}/download` with `Authorization: Token …` gives a
  glTF or GLB link. The token lives with Hermes or in `~/.hermes/.env`, never in the browser.
- **VRoid Hub** downloads need the person's pixiv sign-in. The crew opens the model page in the signed-in browser and
  the person clicks Download, or a VRoid Hub OAuth app does it for them.

Downloaded files go into the Studio's model library (`<data>/models/`) and then the game's `models/`. Until a file is
there, the build prompt names the model page and the builder puts a labelled stand-in in its place. It never builds
the character from shapes.

## Done when

- [x] `engine/cast.mjs`: search both sources, licence filter, blocklist, ranking, roles, build prompt, credits.
- [x] `POST /api/cast`, and the spec reply names the roles to cast.
- [x] The Cast step in the game wizard: tabs per role, numbered picture cards, details on open, Skip, Build.
- [x] Picks reach the build prompt and `CREDITS.md`; the three.js prompt no longer says "group primitive geometries"
      when there is a cast.
- [x] Licence filter tests on fixture JSON (`tests/cast.test.mjs`, `tests/fixtures/cast/`): allowed, violence
      forbidden, author-only, IP blocklist hit, adult and child-looking, no-derivatives restyle, Sketchfab licences,
      ranking, one source down.
- [ ] Download the picks (Sketchfab token, VRoid Hub through the signed-in browser) into the model library.
- [ ] A reviewer pass over the shortlist that flags names of existing characters the blocklist missed.
- [ ] The Godot port installs godot-vrm and a shared cel + outline shader, and the game's site shows the credits.

## Out of scope

- Paid models (Booth and the like): a separate decision per game.
- Generating characters with image-to-3D (spec 4 covers the paid hero model).
- Editing a model's mesh or rig.
