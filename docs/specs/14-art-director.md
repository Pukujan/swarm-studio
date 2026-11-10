# 14. The art director: one style per build, no generic AI look

Owner's direction (2026-11-09): Swarm Feed is a community art wall, like DeviantArt or Pinterest. **Every tile
should look like a different person made it, and every build should look like one person made it.** The old builds
all came out in the same glowing teal-and-gold fantasy look, because each worker wrote its own picture prompt and the
planner's one-line theme direction ("neon-lit", "painterly", "lantern glow") went into every one.

## What it does

`engine/artdirect.mjs` (pure functions) and `paintArt()` in `server/server.mjs`.

1. **A style guide per build**, set when the plan's theme arrives and saved as an `art` event:
   `{ style, name, guide, avoid, bans }`.
   - **Photo is the default**: 35mm documentary, natural or practical light, real clutter, shallow depth of field,
     grain, off-centre framing, people not posing, one muted grade. The grade is warm or cool from the theme's
     `--primary`, so the pictures sit with the page.
   - **The brief picks another style by naming it**: anime cel, 90s anime, manga ink, pixel art, gouache, ink and
     watercolour, concept sketch, risograph, sticker sheet, papercraft, toy-like 3D. Only words that name a *look* count
     ("pixel art", "riso zine", "gouache look"); subject words ("Comic Con", "clay classes", "a toy store") keep photo.
   - The planner's theme direction never picks the style. It reaches for "neon" and "painterly" on its own.
2. **Every picture's prompt comes from the guide**, not from the worker alone:
   - the shape in words ("Tall vertical 2:3 composition"), because the Codex image backend picks the size from the
     prompt, not the size asked for;
   - the worker's `data-gen`, with banned words taken out ("glowing lanterns over an epic neon market" becomes
     "over a night market");
   - the guide, the no-text rule and an "Avoid:" list.
3. **HD for heroes and posters.** A hero layer, the first picture of a build, and the video's full-frame shots ask for
   `gpt-image-2-high` when the pick is a `gpt-image-2` tier. Other providers keep their model. (The Codex backend may
   still answer at its own tier; it reports what it used.)
4. **The check.** The reviewer (vision) model looks at each finished picture against the guide and the banned list,
   plus garbled text, broken hands, warped objects and look-alikes of famous characters. It answers
   `{"ok":true}` or `{"ok":false,"problems":[…]}`; in doubt it passes. A picture sent back is made once more with the
   reasons in its prompt (`image:sent-back` event), and the second one stands. No reviewer model: no check, the prompt
   rules still apply.

## The banned list

Lifted only when the person's own brief asks for it ("a neon cyberpunk club night" keeps neon).

| id | what |
|---|---|
| glow | glowing lanterns, magical glow, god rays |
| teal-gold | teal-and-gold or teal-and-orange fantasy grade |
| neon | neon, cyberpunk, synthwave |
| epic | symmetrical "epic" hero shots, cinematic/majestic framing |
| fantasy | dreamlike, mystical, enchanted sheen |
| not-photo | illustrated, 3D or CGI looks (photo builds only) |

## Rules that stay

- Original characters only; never a known anime, game or franchise character, or one artist's signature look.
- No text in pictures except what the brief needs spelled exactly.
- The UI stays black and white; the pictures bring the colour.

## Done when

- `node --test tests/artdirect.test.mjs` passes (in `scripts/check.sh`).
- A real build with images shows an `art` event, its pictures in one style, a hero at the high tier, and any
  `image:sent-back` with its reasons.
