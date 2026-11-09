# Reference frames

These are Swarm's own drawings of its landmark screens, at 1280 × 800 (desktop) and 390 × 844 (phone). They
follow [PATTERNS.md](../PATTERNS.md) and [RULES.md](../RULES.md). Each screen takes the layout of one product
people already know and draws it in Swarm's look.

**Status: proposed, awaiting the owner's approval.** Once approved, the date goes in REQUIREMENTS.md, and the
frame becomes the source of visual truth for its screen.

| Screen | Borrows the pattern of | Interface words at rest | Desktop | Phone |
|---|---|---|---|---|
| Home (the Feed) | TikTok's For You | 10 | [home-desktop.jpg](home-desktop.jpg) | [home-phone.jpg](home-phone.jpg) |
| Discover | Pinterest search and masonry | 12 | [discover-desktop.jpg](discover-desktop.jpg) | [discover-phone.jpg](discover-phone.jpg) |
| Create | One prompt box (ChatGPT, Midjourney) | 10 | [create-desktop.jpg](create-desktop.jpg) | [create-phone.jpg](create-phone.jpg) |
| Projects: My builds | A map you browse (Apple Maps) | 13 | [projects-desktop.jpg](projects-desktop.jpg) | [projects-phone.jpg](projects-phone.jpg) |
| A build: the orbit | Apple Maps: the map is the content, one input | 14 | [orbit-desktop.jpg](orbit-desktop.jpg) | [orbit-phone.jpg](orbit-phone.jpg) |
| The Design deck | Figma, almost one to one | 3 | [deck-desktop.jpg](deck-desktop.jpg) | [deck-phone.jpg](deck-phone.jpg) |
| The Game room | itch.io's game page | 14 | [game-desktop.jpg](game-desktop.jpg) | [game-phone.jpg](game-phone.jpg) |
| A board | Are.na and Pinterest boards, with Kresilo's idea pins | 9 | [board-desktop.jpg](board-desktop.jpg) | [board-phone.jpg](board-phone.jpg) |

The word count follows rule 30:
- It counts labels, placeholders and button text, the five nav labels included.
- It doesn't count content: build, page, layer, maker and crew names, counts and values.
- In the Design deck, panel section and property names count as content, as in Figma.

The deck frame shows the hero selected, so its inspector is open.

## What's in them

Commander Hermia is the real art from `web/brand/`. Her badge, `hermia-mark.svg`, is the logo, the nav mark and
the avatar in the input. Her full figure, `hermia.svg`, stands on Create. The crew are drawn by `web/crew.js`, the
same code the studio uses: Lumi, Bean, Pip and Nova appear as cursors, orbiters and collaborators.

The images are real Swarm builds from `~/.hermes/swarm-studio/runs`: Lantern Drift, Neon Alley, Deep Lantern and
the Lisbon roastery. The icons are lucide (ISC licence, `web/brand/LICENSE-lucide.txt`), in `src/icons.js`. The
fonts are Big Shoulders Display, Barlow Condensed and JetBrains Mono, all OFL. The colours are the studio's tokens,
in `src/kit.css`.

The frames picture no other product. The products in the table are named, not shown.

## Re-rendering

Each screen is one HTML file in `src/`. The same file renders both sizes; at 600px and below, the nav becomes a
bottom bar. To render every screen, or only the ones you name:

```bash
node docs/ux/frames/src/render.mjs docs/ux/frames [home deck ...]
```

The script (`src/render.mjs`) needs `playwright-core` and a Chromium. Set `PLAYWRIGHT_CORE` to the package's
`index.mjs` and `CHROMIUM` to the browser if they aren't in the default places. It writes
`<screen>-desktop.jpg` (1×) and `<screen>-phone.jpg` (2×).
