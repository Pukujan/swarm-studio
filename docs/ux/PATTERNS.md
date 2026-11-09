# Patterns we borrow

We don't invent UI. Each screen of Swarm follows one mature product that people already know (Jakob's law: people
expect your app to work like the apps they use every day). We copy the **pattern**: the layout, the order of the
tools, the gestures and the shortcut keys. We never copy the **look**. Icons, colours, fonts, art and branding are
our own (lucide icons, our tokens), because the repo is public and everything in it must be original.

Read this with [RULES.md](RULES.md) (rules 27–32 come from here) and [SITEMAP.md](SITEMAP.md).

Status: **agreed direction** (owner, 2026-11-09).

## The pattern sheet

| Screen | Follows | We take | We leave out |
|---|---|---|---|
| Home | TikTok's For You | One build fills the screen; swipe up for the next, left for its assets; a right rail (Maker, Like, Talk, Share); Remix is the main button | Captions, hashtags, a sound bar, counts printed on the video |
| Navigation | TikTok and Instagram on a phone, Linear's rail on desktop | Five fixed slots, + Create in the middle, the same order everywhere | Count badges on every slot, a hamburger menu |
| + Create | The Midjourney and ChatGPT composers | One input; chips under it (Start from, the lens); Hermia beside it | Model pickers and settings up front |
| Discover | Dribbble and Pinterest search | One search, then a grid of visuals; filters behind one icon | Walls of category text |
| Projects › My builds | Apple Photos | A grid (the galaxy) you pinch to zoom; select, then act | Albums and filters on the first screen |
| Orbit | Apple Maps | The build fills the stage; one input; a sheet that peeks, then grows, when you pick something | Several panels at once |
| Design deck | **Figma** | Layout, tools and shortcuts, almost one to one (see below) | Figma's look |
| Engine room | VS Code | A file tree, the editor, checks as ticks | Activity and status bars full of icons |
| Game room | A game's own pause menu | Play fills the stage; Esc opens the pause menu (Report a bug, Tweak) | An engine editor's panels |
| Film studio | CapCut | The clip on the stage, the timeline under it | Effect libraries on screen at rest |
| Progress | Apple Maps' ETA pill | One pill that opens into the steps | Progress bars in several places |
| ⌘K | Linear, Raycast | Every action can be searched, so a rare action doesn't need a button | — |
| Me › Settings | iOS Settings | Grouped lists, one level per tap | Settings mixed with actions |
| Toasts | Figma, Linear | One toast spot, bottom centre, gone after 4 s | Stacks of toasts |
| Components | shadcn/ui and Radix, Apple HIG, Material 3 | Component anatomy, focus, Esc, keyboard, target sizes | Their default themes |

The social side (boards, notes on a spot, credits, jams, mood boards) has its own sheet below.

## The frame

Every screen is built from the same zones, and every control belongs to exactly one of them. Nothing else gets a
panel, a dock or a strip (rules 27 and 28).

| Zone | What lives there | When it shows |
|---|---|---|
| Nav | Five slots: Home, Discover, + Create, Projects, Me. A left rail on desktop, a bottom bar on a phone | Always (in the Design deck it folds into the logo menu, as in Figma) |
| Top bar | The breadcrumb on the left, the one primary button on the right | Always, except on Home, where the build fills the screen |
| Stage | The content: a build, the galaxy, a canvas, a game, a clip | Always |
| Inspector | Whatever is selected, on the right | Only while something is selected. It slides over the stage instead of shrinking it, and a phone shows it as a half sheet |
| Sheet | One sheet: peek, half, full | When you open something. One at a time |
| Input | Hermia and the one input, bottom centre | In + Create, the orbit and the rooms |
| Toast | One spot, bottom centre above the input | For 4 s after something finishes. It never pushes content |

At rest, Home and the orbit show four things: the nav, the breadcrumb with its one primary button, the content,
and the input. The inspector is a fifth, only while something is selected.

## The Design deck follows Figma

The Design deck is the one room with a full toolset. It follows Figma's current layout and tools almost one to
one, so a designer already knows it (rule 32).

| Figma | Design deck |
|---|---|
| Left panel: the file name and main menu, Pages, Layers | The same. The logo menu holds the five-slot nav, Versions and Export all. A dot on a layer means an agent is working on it |
| The bottom toolbar: Move, Frame, Shape, Pen, Text, Comment, Actions, Dev Mode | Move, Frame, Shape, Pen, Text, Comment, **Hermia** (in place of Actions: ⌘K, search any action or ask the crew), **Code** (in place of Dev Mode) |
| Right panel, top row: who's here, Present, Share, zoom | The crew's avatars, the progress pill, **Play**, **Share**, zoom |
| Right panel with nothing selected: page colour, variables, styles, export | The same; our variables are the design tokens the planner set up |
| Right panel with a selection: the Design tab (position, auto layout, appearance, fill, stroke, effects, type, export) and the Prototype tab | The same, read live from the classes the agents write. Prototype holds On click and Animation |
| Multiplayer cursors; click an avatar to follow that person | The agents' cursors with their names; click an avatar to follow that agent and see what it did |
| Comment pins and threads, resolve | The same. The crew replies in the thread. The Critic's review issues (3 at most) arrive as pins too |
| Shortcut keys | V move, H hand, F frame, R rectangle, O ellipse, L line, P pen, T text, C comment, ⇧1 zoom to fit, ⇧2 zoom to selection, ⌘\ hide the panels |
| Tooltips on the toolbar | The tool's name and key ("Text T"), only on the icons (rule 9) |

What the canvas page has today that Figma doesn't, and where it goes:

| Today (`web/index.html`) | Goes to |
|---|---|
| File name | The top of the left panel, with the logo menu |
| View tabs | Play (top right) and Code (toolbar); the other rooms are reached through the breadcrumb |
| Publish menu | Share |
| More menu | The logo menu, and ⌘K |
| Chat feed and log | Hermia on the toolbar, and the comment threads |
| Tree | Layers |
| Files | Code |
| Dock | Merged into the toolbar |
| Status bar | The progress pill, top right |
| Camera hint | Removed |
| Theme toggle | Me › Settings |
| Agents list | The crew's avatars, top right |
| Design and Variables panel | The right panel (Design tab; variables with nothing selected) |
| Player | Play |

On a phone, the deck shows the canvas and the toolbar; the panels open as sheets.

## The social side

Swarm Feed is built on Kresilo's code, so most of the social side already exists in `swarm-feed/src/creative/`:
boards with join requests, idea pins, credits, jams, events and mood boards. We don't build it again. We move
each piece into the five-slot tree (SITEMAP.md sections 3, 4, 6 and 7), give it the Swarm twist, and borrow
what's missing from the products below.

| Feature | Swarm Feed already has (from Kresilo) | Also borrowed from | Swarm's version |
|---|---|---|---|
| Boards | A hosted board: a cover, wanted roles, Ask to join (the host accepts), members, activity (`Boards.tsx`, `boardRequests.ts`) | Pinterest group boards, Are.na channels | Projects › Boards. A board holds builds and assets. Access (edit or comment) is separate from credit |
| Who sees a board | Private or community; a public flag on mood boards | Are.na's three levels | One switch: Private, Public (anyone can see it), Open (anyone can ask to add). Open boards are listed in Discover |
| Notes on a spot | Idea pins on a spot, with accept, decline and reply (`IdeaPins.tsx`, `ideaCards.ts`) | Figma comments, FigJam stamps | One pin everywhere: on a board, on a build in the Feed (Talk) and in the Design deck. Reactions (+1, ✓) replace "agree" replies. The crew replies to pins too |
| Credits | A credit the person confirms or declines; "the work behind this work"; how each part was made: by hand, AI-assisted or generated (`Team.tsx`, `lineage.ts`, `authorship.ts`) | Behance's co-owners and credits | Every build lists its people **and its agents** (Designer, Critic, Fixer…), with how each part was made. Each person confirms their own credit |
| Suggest a change | Suggestions that are proposed, then approved or declined | GitHub pull requests | Remix, then suggest it back to the maker. The maker accepts and you're credited |
| Remix chains | Lineage from references, and "Used in" (`lineage.ts`, `UsedIn.tsx`) | Dribbble rebounds, TikTok stitch | The build's story shows the chain: what it came from, and what came from it |
| Mood boards | Saved collections: up to 12 boards and 200 items, each private or public (`moodboards.ts`) | Pinterest, Are.na, Milanote | Save anything: a build, an asset, a clip, a palette. A mood board can be the **Start from** in + Create, and the crew reads it as the brief |
| Jams | Competitions: a prompt, up to 6 rules, open and close dates, entry with a published post, one vote per person per entry and none on your own; the host picks the winner, or the most votes win (`Competitions.tsx`, `competitionRules.ts`; already at `/jams`) | itch.io jams, Dribbble playoffs | Discover › Jams and events. Join opens + Create with the jam's lens set. Winners go on Home |
| Events | Meetups: in person, online or hybrid, a time, spots, Going (`Meetups.tsx`) | Luma | Live build sessions: watch a crew build in real time (Home › Live). Going sets a reminder |
| Follow, like, save | Follow; a like (stored only in the browser today); a Behance-style share rail: Follow, Keep as a reference, Share, Appreciate | TikTok, Behance | Home's right rail: Maker (follow), Like, Talk, Share. Save to a mood board lives in Share. Likes get stored on the server |
| The process story | A maker's process story (`/stories/:id`) | Behance project pages | The build's story: chapters as frames, before and after, the prompt, a time-lapse, the credits |

## Reference frames, approved before building

We use Kresilo's design QA method (`swarm-feed/docs/design-qa.md`):

1. For each landmark screen, we draw our own reference frame at 1280 × 800 and 390 × 844, in our look, following
   the pattern sheet. Frames go in `docs/ux/frames/<screen>-desktop.jpg` and `-phone.jpg`, drawn from
   `docs/ux/frames/src/` (see [frames/README.md](frames/README.md)).
2. The owner approves each frame, and the approval is dated in REQUIREMENTS.md. An approved frame is the source
   of visual truth for that screen.
3. We build to the frame. `scripts/ui-review.mjs` puts the screenshot beside the frame at the same sizes and
   grades each difference P1 (breaks the flow), P2 (wrong place or size) or P3 (polish), with the evidence
   saved under `docs/qa/`.

We never commit screenshots of other products (TikTok, Figma and so on). The products are named, not pictured.

## How it's checked

| Check | Where | Status |
|---|---|---|
| A tooltip only on an icon-only control | `scripts/ui-check.mjs` | Being added in the groundwork PR (`feat/flow-calm`) |
| The number of tooltips can't go up (106 in `web/` on 2026-11-09) | `scripts/ui-check.mjs` | Being added in the groundwork PR |
| At most 15 words of interface text at rest | `scripts/ui-check.mjs` | Next |
| At most two sidebars (the nav and the inspector; Figma's two panels in the deck) | `scripts/ui-check.mjs` | Next |
| The nav and the primary button keep their place and size while idle, working, hovered and with a panel open, at 1280 and 390 | `scripts/ui-check.mjs` | Next |
| Layout shift below 0.01 | `scripts/ui-check.mjs` | Next |
| The screen matches its approved frame | `scripts/ui-review.mjs` | Next |
| The studio's own design review finds no real issue | `scripts/ui-review.mjs` | Being added in the groundwork PR |

A check that is still "Next" is a rule people follow by hand until it lands. Update this table when one ships.
