# 0015. The Studio walk and the chat

- Date: 2026-11-12, recorded 2026-11-13
- Status: accepted by the owner on 2026-11-12. Until now these lived only in the owner's own log
  (`DECISIONS.md` in the hackathon folder, §2 and "The guided walk in the Studio"), so the 2026-11-13 React
  ports did not follow them. The quotes are the owner's words; the rest is *our wording*.

## Context

On 2026-11-12 the owner shaped the guided walk through the Studio with a prototype (`proto/guided-walk`) and
decided a set of rules for it and for the chat. The approved prototype is what the React screens are built from
(owner, 2026-11-13: the guided-walk prototype "is built directly as React screens"). The first React ports
(#423 Studio, #428 Chat) ported today's screens instead, with the chat on the left.

## Decision

**The chat**
- **Always along the bottom**, at every width ("nope chat always in bottom"). Not on the left.
- **It can be pulled up.** It sits low by default. A handle drags it to one of three heights (low: the message box
  and the last line; middle; high: the whole history). It stays where the person left it when the crew asks
  something new, and never opens or drops by itself.
- **Suggestions are a small underlined text link** beside the chat box, opening a drawer, on every screen with a
  chat. There is no row of reply buttons ("its better to have a suggestion button that can click as a drawer").
- **One open question at a time** (leaning): the planner never stacks two unanswered questions.

**The walk**
- **One infinite canvas, not pages** ("i thought i said infinite canvaS?"). The steps sit left to right on it, so
  what was picked, or added later, stays visible.
- **The order:** What you have → Brand → Lock → Plan (the website design: pages, skeletons, sections) → Build.
- **The first step is always shown, with a Skip button.**
- **The first step is an importer, not a form.** The person drops a PDF or a file, or gives a website. An agent
  reads it and fills in what it finds, "so they dont have to fill it out like a form".
- **Three options, no more** ("3 is fine and a sweet spot"). If none fits, the person says so in the chat.
- **The word "pack" is never shown.** People see options ("dont mention it pack, just say options").
- **The moodboard lives inside the Brand step** ("brand is what creates those moodboards"). Picking a mood is the
  first choice on the Brand board, and the moodboard, story, colours, type and voice follow from it.
- **Choices come first:** on a step that asks for a pick, the choices sit at the top, above what is filled in.
- **Lock is for the look only** ("lock is for locking down branding and visuals"). It locks the person's own hand
  changes to colours, heading font and corners, not the option's.
- **The Plan reflects the look:** each page is a small page in the locked look.
- **"Behind the site"** has two toggles under the pages: People sign in, and You run it here.
- **Phone later, not now.** The walk is designed for desktop, and every size decision goes through one switch.

## Consequences

- The React Chat (#428) and the Studio port (#423, merged) move the chat to the bottom, with the handle and the
  three heights. Today it's on the left.
- The brand sheet and the Studio stop showing the word "pack" (today there's a **PACKS** heading). The option
  stays; only the word goes.
- The Studio's first step becomes the importer, with Skip, and the Brand step holds the moodboard and three
  options.
- `docs/ux/REQUIREMENTS.md`, `SITEMAP.md`, `INVENTORY.md` and the OpenSpec screen specs are updated to match, and
  the `ui-audit` gates get a check for "chat at the bottom" and "no 'pack' on screen".
- Issue log: see the issue that links this record.
