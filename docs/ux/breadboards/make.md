# Make

The one way to start something: the Make box on Projects, the kind menu, and the five ways to make
([spec 42](../../specs/42-ways-to-make.md), [spec 27](../../specs/27-plan-conversation.md), RULES rule 1). Statechart:
`projects.make` and its sibling flows `guided`, `takes`, `blocks`, `scaffold` (the Studio), `draft`, `planBoard`. Code:
`web/home.js` (the box, the pop, `begin`, `guide`, `confirmBuild`, `studioFirst`), `web/makeways.js` (which ways each
kind offers), `engine/intake.mjs` (the questions and the examples).

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
  · Just build  (needs words)       ──way.just──▶ the Design deck's chat: the brief, Build · Keep talking
  · Guided      (needs words; a game's does not)
      a website, app or video       ──way.guided──▶ Guided questions
      a game                        ──plan──▶       the Plan board, its talk asking (plan-board.md)
  · Three takes (needs words)       ──way.takes──▶  the Studio scaffold on its Takes (studio.md)
  · Scaffold                        ──way.blocks──▶ the Studio scaffold, Plan step only
  · Studio                          ──way.studio──▶ the Studio scaffold, every step

Guided questions  (projects.guided.questions, in the pop)
  · one question at a time: its chips, or your own words (input)
      an answer that is a question, or says not to build yet   ──draft──▶ the Design deck's chat, talking
  · Back · Skip / Next
  · the last answer                 ──answered──▶ Guided brief

Guided brief  (projects.guided.brief, in the pop)
  · the brief (textarea, editable)
  · Back                            ──up──▶   Guided questions
  · Brand sheet (a website or app)  ──brand { from: draft }──▶ the brand sheet, the brief in the chat
  · Keep talking                    ──talk──▶ the Design deck's chat, talking
  · Build (⌘Enter)                  ──build { run }──▶ the Design deck, the crew at work

Design deck chat, nothing built  (draft)
  · the brief, in plain words, and the steps it will take
  · Build                           ──started { run }──▶ the Design deck, the crew at work
  · Keep talking · the dock: Send
  · a build already running         ──(none)──▶ toast: "A build is running…" · Watch it
```

## Which ways each kind offers

From `web/makeways.js` (`MAKE_KINDS`):

| Kind | Just build | Guided | Three takes | Scaffold | Studio |
|---|---|---|---|---|---|
| Website, App, Video | ✓ | ✓ | ✓ | ✓ | ✓ |
| Deck | | | ✓ | ✓ | ✓ |
| Brand | | | ✓ | | ✓ |
| Game | ✓ | ✓ (the Plan board) | | | |

With an empty box, only Scaffold, Studio and a game's Guided are offered: the others need words.

## At 390 px

The box keeps one row (Kind as an icon, the input, Make); the menus open as sheets from the bottom; the pop fills the
width.

## Where the code differs

- **The statechart's `way.just` goes straight to the deck**; the code first opens the deck's chat with the brief
  (`confirmBuild`, `web/home.js:835`) and builds only on its Build. The spec (42) agrees with the code: Just build
  skips the questions, not the press.
- **Three takes are three looks, not three builds** (spec 42, "Not built yet"); the statechart's `takes → pick { run }`
  goes to the deck, the code to the scaffold's Brand step.
- **A busy build is a toast** (`web/home.js:748`), the one place Make says no.
