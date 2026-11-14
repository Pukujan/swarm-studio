# Make

The one way to start something: the Make box on Projects, the kind menu, and the two ways to make
([decision 0020](../../decisions/0020-ask-before-build.md), [spec 42](../../specs/42-ways-to-make.md),
[spec 27](../../specs/27-plan-conversation.md), RULES rule 1). Statechart: `projects.make`, which opens `scaffold` (the Studio), `draft` and
`planBoard`. Code: `web/home.js` (the box, the pop, `begin`, `confirmBuild`, `studioFirst`), `web/makeways.js`
(which ways each kind offers), `engine/intake.mjs` (the questions and the examples).

SITEMAP and the statechart also have **+ Create**, the Feed's front door (§5). The Studio has no Feed of its own, so
in the Studio the Make box is + Create (OBJECTS.md flags the two names).

## Places and affordances

```
Make box  (projects.make, on Projects)
  · Kind (what to make) ▾          ──(none)──▶ Kind menu
  · "What should the crew build?" (input)
  · Examples (lightbulb; only for a kind with examples)  ──(none)──▶ Examples
  · Make (the one primary button)
      the kind offers one way       ──way.*──▶ that way, straight away
      otherwise                     ──(none)──▶ Make menu
      Hermes not answering          ──(none)──▶ toast: the reason and the fix · Check again (the words stay)

Kind menu  (layer)
  · Website · App · Game · Video · Brand · Deck (a kind whose kit has not landed is not shown)

Examples  (layer, under the box; ×, Esc, a click outside)
  · "Examples" · up to four ideas for the kind     ──(none)──▶ its words in the box, to edit

Make menu  (layer; the last way picked for the kind, else what the words suggest, is pre-selected)
  · Just make it (needs words)
      a new website                 ──way.just──▶ the question before a build: Skip all · Step by step · Pick steps to skip
      an app, video or game         ──way.just──▶ the Design deck's chat: the brief, Build · Keep talking
  · Studio                          ──way.studio──▶ the Studio scaffold, every step (studio.md);
                                                    a game: the Plan board, its talk asking (plan-board.md)

Step by step and Pick steps to skip open the Studio; Skip Brand opens it on Plan with Brand skipped. Three takes is the
Brand step's three options. The old guided questions pop is not reached from the menu.

Design deck chat, nothing built  (draft)
  · the brief, in plain words, and the steps it will take
  · Build                           ──started { run }──▶ the Design deck, the crew at work
  · Keep talking · the dock: Send
  · a build already running         ──(none)──▶ toast: "A build is running…" · Watch it
```

## Which ways each kind offers

From `web/makeways.js` (`MAKE_KINDS`):

| Kind | Just make it | Studio |
|---|---|---|
| Website, App, Video | ✓ | ✓ |
| Game | ✓ | ✓ (the Plan board) |
| Deck | | ✓ |
| Brand | | ✓ |

With an empty box, only Studio is offered for every kind, so Make goes straight there. A kind with one way has no
menu. A remembered way that is no longer offered is forgotten and the words decide.

## At 390 px

The box keeps one row (Kind as an icon, the input, Make); the menus open as sheets from the bottom; the pop fills the
width.

## Where the code differs

- **The statechart's `way.just` goes straight to the deck**; the code first opens the deck's chat with the brief
  (`confirmBuild`, `web/home.js:835`) and builds only on its Build. The spec (42) agrees with the code: Just make
  it skips the questions, not the press.
- **Three takes are three looks, not three builds** (spec 42, "Not built yet"); the statechart's `takes → pick { run }`
  goes to the deck, the code to the scaffold's Brand step. Nothing in Make opens them now.
- **A busy build is a toast** (`web/home.js:748`), the one place Make says no.
