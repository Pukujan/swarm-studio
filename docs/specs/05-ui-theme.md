# 3. UI polish: the Design Bakery theme

## Problem

The studio looks generic and "AI-generated": Inter everywhere, a periwinkle accent, flat grey panels, emoji in place of icons, and the same rounded boxes for everything. It should look like it comes from [design-bakery.com](https://www.design-bakery.com/): a dark lab, a bold display type, mono labels and one electric accent.

## The theme (taken from design-bakery.com)

**Tokens.** These replace the `:root` block in `web/canvas.css`:

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0b0b0a` | page background |
| `--bg` | `#0f0f0f` | canvas background |
| `--panel` | `rgb(255 255 255 / .03)` over `--ink` | panels, "glass" |
| `--panel-edge` | `rgb(255 255 255 / .12)` | 1 px panel borders |
| `--line` | `#2a2925` | dividers, grid |
| `--text` | `#f2efe8` (paper) | body text |
| `--cream` | `#efe6c6` | outlined pill buttons |
| `--muted` | `#8f8b82` | secondary text |
| `--accent` | `#c6f432` (lime) | primary action, live state, selection |
| `--accent-ink` | `#0b0b0a` | text on lime |
| `--hot` | `#ff5c50` | errors, recording, "live" |
| `--cool` | `#3aa7ff` | links, info |
| `--violet` | `#5b3cff` | rare highlight (agents' wires) |

**Type:**
- **Display:** *Bricolage Grotesque* (variable, 200–800). Titles are 800 weight, uppercase, with tight letter spacing (−0.02em).
- **Accent:** *Instrument Serif* italic, for one word in a title, coloured lime. This is the "B*a*ker" trick from the site.
- **Labels and data:** *JetBrains Mono*, 11 px, uppercase, 0.08em letter spacing. Used for the nav, tabs, the status bar, timers, layer names and code.
- **Body:** Bricolage at 400, 14–15 px.
- **Loading:** the fonts are self-hosted in `web/fonts/` (woff2, latin subset). That way the studio works offline and never waits on Google.

**Surfaces:**
- **Background:** near-black, with a faint 40 px grid (`--line` at 35% opacity), slight film grain, and one soft lime glow behind the active area, like the hero orb on design-bakery.com.
- **Panels:** glass (`--panel`) with a 1 px `--panel-edge` border, a 14 px radius, and no drop shadows. Depth comes from borders and glow only.
- **Buttons:**
  - **Primary:** a lime pill (`--accent` background, `--accent-ink` text).
  - **Secondary:** a cream outlined pill (8% cream fill, 45% cream border, 999 px radius, 13 px, weight 650).
  - **Tertiary:** text only, in mono.
- **Inputs:** a borderless field on a glass bar, with a round lime send button. It's the same chat bar as the "Ask about RAG…" box on the site.
- **Icons:** one line icon set (Lucide, 1.5 px stroke, MIT) replaces the emoji in the toolbar, tabs and menus. Emoji stay only in chat and agent messages, where they come across as personality.

## What changes, screen by screen

1. **Top bar:**
   - A "SWARM STUDIO" wordmark in Bricolage 800, with the "a" in the lime serif.
   - The Canvas / Video / App switch becomes a mono segmented control.
   - The clock (timer) is in mono lime.
   - ⚡ Auto becomes the single lime pill. Game and Publish are cream outline pills.
2. **Left panel:**
   - The Chat, Log, Layers and Files tabs become mono uppercase, with a lime underline on the active one.
   - Agent messages get a coloured 2 px rule and the agent's name in mono.
   - The composer becomes the glass chat bar.
3. **Canvas:**
   - A grid background, and page frames with a 1 px edge.
   - The page title above each frame is in mono.
   - The selection outline is lime.
   - The wires between pages are violet, with lime while they are live.
   - Cursor name tags are pills in each agent's colour, set in mono.
4. **Bottom toolbar:** a floating glass dock with Lucide icons. The active tool is a lime circle.
5. **Popovers** (Auto, Game, Publish, Models):
   - The same glass panel.
   - The title in display type with a serif accent word, for example "One prompt. The *whole* thing."
   - Mono step lists.
6. **Auto panel and break room:** mono timestamps, lime for the working step, `--hot` for a failed step, and a muted line through skipped ones.
7. **Code wall:** an ink background, JetBrains Mono, lime caret, and syntax colours remapped (strings cream, keywords lime, tags cool, comments muted).
8. **Motion:** 160 ms ease-out on hover and press, a 200 ms fade and rise when a panel opens, and no bounce. Motion is turned off under `prefers-reduced-motion`.

## Rules

- **No new colours** outside the tokens. Agent colours are the only exception, and they come from a fixed palette of 12 that is tuned to look right on ink.
- **One lime element per area:** lime marks what to do next or what is live, nothing else.
- **Contrast:** every text and background pair meets WCAG AA, checked with a script on the tokens.
- **Leave the designed pages alone:** the theme applies to the studio only, never to the sites it designs.

## Done when

- [ ] All of `web/canvas.css` uses the new tokens. There are no hard-coded hex colours outside `:root` and the agent palette.
- [ ] The fonts are self-hosted and load offline. Toolbar, tab and menu emoji are replaced by Lucide icons.
- [ ] Before-and-after screenshots of the canvas mid-build, the Auto window, the App view with the code wall, and Publish are added to this spec.
- [ ] It works at a 1280 px window width and at 390 px (phone, for Remote Control): no horizontal scroll, and the panels collapse.
- [ ] `scripts/check.sh` passes, and nothing changes in how builds work.
