# 0022. Copy the look from a link: walk the site, 2D first, traced to where it was given

- Date: 2026-11-13
- Status: accepted by the owner ("Yes, 2D first"). The quotes are the owner's words; the rest is *our wording*.
  0020 is the ask-before-build PR (#479); 0021 is held for the draft-first Studio.
- Builds on [spec 29](../specs/29-chats-references-marks.md) (References) and [0016](0016-open-design-intake.md)
  (a look is a design system).

## Context

A link as a reference was only its address: `refs.brief()` passed the URL text to the planner, and the chat's page
reader fetched the HTML words. A site built with a framework sends almost nothing in its HTML (design-bakery.com
answers 3 KB), so the crew learned nothing of its look, and Hermia said "I can't browse" ("thats not good"). The
owner asked how a look with "multiple animation… and 3js" could come from a picture.

## Decision

- **The goal** ("the goal is for poeple to be able to copy design of thing sthey like and write what they want from
  it optionally if they want and trace back to where they wrote that reference and create something awesome out of
  it"): anyone's site, by its link. There's no repo route.
- **The crew walks the site** in a real browser: the link and up to 2 more pages it links to, a few screens each,
  with shots. The look is measured from what the browser drew: colours by how much screen they cover, the fonts by
  role and size, corners, small labels, what moves and how fast, and any 3D canvas.
- **2D first** ("or should we limit scope to just 2d and basic aesthetic and aesthetic prompt for now? and try for
  visual match of style"): a 3D piece is named and gets a flat 2D stand-in in the same feel. Real 3D comes later.
- **What the person writes is optional and steers it.** The note on the reference ("the type and the glow") is
  what the style prompt leans on. In a project's chat, the words around the link are that note.
- **It's learned from, never copied.** The style words name no site, brand or person and quote none of its words;
  its logo, pictures and font files never go into a build (the builder takes the closest loadable font). The
  shots are for the person to see only; they're never placed.
- **Every look traces back** to its reference: the address, where it was given (References or the chat, with the
  chat and the time), and the person's note. The brief says so on each look, and the References card shows it.
- **Only public pages are opened** (spec 29's link rule), and every page and request is checked the same way.
- **The visual match check is next**, as its own step: it compares style (colours, type, spacing, mood), not
  layout or content, shows the pair and the top differences, and fixes only when the person says so (0020: only
  the person starts a build).

## Consequences

- `engine/sitelook.mjs` walks, measures and describes; `refs.setLook` keeps the look and shots on the link;
  `POST …/refs/link` and a link in a project's talk start a walk; `POST …/refs/:id/look` walks again.
- The walk needs the browser the video tools install. Without it, the card says so and the link stays plain.
- The vision model is the reviewer's, else the planner's; with neither, the look is the measured words.
- The `/next/` React Studio doesn't show looks yet; the current Studio's References card does.
