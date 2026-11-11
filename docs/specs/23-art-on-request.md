# Art on request: the crew asks for a picture while it builds

A big game's art is painted once before stage 1 (`engine/game.mjs` `artList` and `sheetList`, painted by
`paintGame` in `server/server.mjs`). A slice that needs something nobody painted (a water tower, a new
backdrop, a run sheet for a companion) used to draw a stand-in shape. Now it asks for it.

## How a build asks for art

1. Every stage prompt ends with `askBrief()` (`engine/artask.mjs`): need a picture that is not in the art
   list? Write `ART_REQUESTS.json` in the app root (`ports/godot/ART_REQUESTS.json` for a Godot-first game)
   as a JSON list, and draw a stand-in until it lands:

   ```json
   [
     { "kind": "prop", "what": "a rusty rooftop water tower" },
     { "kind": "backdrop", "what": "the antenna yard at night", "look": "wet steel, red warning lights" },
     { "kind": "sprite", "what": "a rooftop gull", "look": "grey and white, cheeky" },
     { "kind": "sheet", "of": "sprite-kumo", "move": "run" }
   ]
   ```

   `kind` is `sprite`, `prop`, `backdrop`, `icon`, `portrait` or `sheet`. A sheet names the sprite it
   animates (`of`) and a `move`: `run`, `jump`, `slide`, `climb`, `fix`, `hurt`, `idle`, `walk`, `action`,
   or any other move with its six poses in `frames`. A sprite asked in the same file can be animated in it.
2. When the slice's engine call ends, `takeAsks()` reads and clears the file, turns each ask into a painter
   item and leaves out (as a logged step) asks that are broken, painted already, or over the cap.
3. The asks go through `paintGame` again, with `have` (the art so far), so they take **the same route as
   the first pass**: the same image choice with its backup provider (ckff/Codex fallback,
   `paintWithBackup`), the run's style guide, the vision check, the chroma-key cut and check (magenta
   `#FF00FF`, green for a pink or purple subject, swapped on a second try), the sheet cutter, and the
   library fallback. Sprites and props are painted with the hero's picture as `--ref`, so they match it
   (a provider that refuses references paints without one). The painters' tiles show them live on the Game
   wall (`art:job`), and each picture is a step in the build log.
4. The new files land in `public/art/` (and `ports/godot/assets/art/` via `syncGodotArt`), are added to
   the art list the next stages are told about, and the crew gets **one 2-turn call** to swap its stand-ins
   for them before the slice's gates, Godot check and play test.
5. Every ask taken is kept in `ART_ASKED.json`, so a resumed build paints them (or reuses the kept copy)
   with the first pass, and the crew never asks twice.

**Caps:** at most 4 per slice (`SWARM_ART_ASKS`, 0 turns asking off, 8 at most) and 16 per build. No
asking when art is off for the build or the image model ran out of quota.

## Companions

When the hero line names a companion ("runs with her cat Kumo", "with Rust-8, a small robot", "a fox called
Ember", or `spec.companion`), `companionOf()` finds it. The first pass paints `sprite-<name>` (after the
hero, with the hero's picture as reference) and `sheet-<name>-run` (four-legged for an animal, flying for a
drone or bird; a `walk` sheet in a top-down game). The hero's own sprite and sheets paint the hero alone
(`heroLook()`).
