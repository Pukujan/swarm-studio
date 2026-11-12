# The pitch

Used for the hackathon submission, the deck, the marketing page and anyone we talk to. The numbers come from [MARKET.md](MARKET.md), the words from [BRAND.md](BRAND.md) and the people from [stories-swarm-studio.md](stories-swarm-studio.md).

## In one line

**Swarm turns Hermes into a creative studio: a crew of agents you can watch, steer like a design tool, and ship from, all from one prompt.**

## The problem we lead with

**Agents are built by developers, for developers.** Today an agent works in a terminal, one file at a time, out of sight, and its output looks like everyone else's. Hermes is a good example: it has 262,021 GitHub stars, real tools, memory and MCP, and its face is still a command line.

People who make things for a living, such as designers, game makers, studios, marketers and founders, work visually and in parallel. A launch isn't one file. It's a site, an app, a game, a film and a week of posts, made together and kept consistent. No agent lets those people see the work, steer it in a canvas they already know, and ship every piece at once. Each AI builder makes one kind of thing behind one chat box.

## What Swarm does

1. **One prompt.** "A night market in Taipei: street food, a festival weekend, tickets and a vendor map."
2. **Hermia plans it.** Commander Hermia draws the site map, splits each page into sections, and sends her crew out.
3. **You watch the crew build.** Many agents work at once on a Figma-like canvas with their own cursors. Code checks catch mistakes, and the crew fixes them live.
4. **You steer.** Talk to Hermia ("make the hero warmer") or edit the canvas yourself, and the crew keeps going.
5. **It ships, all of it:**
   - a multi-page site;
   - a real web app with a database, deployed live;
   - a playable game;
   - a promo film;
   - the posts for launch day.
6. **The community remixes it.** Post the build to Swarm Feed. People swipe, try it live and remix it, and every remix credits the original and its crew.

**Packs** make it professional: a ready-made crew and plan for a market (Events, Game Studio, Brand Campaign, Commerce). The Swarm Wall runs four packs at once, four launches for four markets, side by side.

## Why it wins

| | Other AI builders | Swarm |
|---|---|---|
| Output | one kind: an app, a site, a clip or a game | the whole launch, made together and kept consistent |
| The agents | hidden behind a chat box | a crew you watch, with cursors, on a canvas |
| Control | re-prompt and hope | steer by talking or by editing the canvas, like Figma |
| Where it runs | their platform, their models | your own Hermes, with your models and your connections |
| After it ships | it ends | the Feed: try, remix, credit, jams |

**The closest rival is Omma (Spline):** up to 100 agents on a canvas, but for 3D web, on its own platform, with one agent per page. Swarm splits every page into sections across the crew, makes the app, game, film and posts as well, and lives inside the agent people already run.

## Why Hermes

Swarm isn't a web app with a Hermes button. It's built out of Hermes:
- **A plugin and a skill.** `/swarm` in any Hermes chat, `hermes swarm` from the shell, and a pane in the Hermes desktop app.
- **Hermes' own tools:**
  - its subagents run the crew;
  - its MCP connectors handle sign-in, for example Supabase through Hermes' OAuth connector;
  - its memory keeps your references;
  - its models are whatever you already chose.
- **MCP both ways.** Swarm Feed speaks MCP, so publishing and remixing are tool calls from your own Hermes.
- **For Hermes, Swarm is the front door for everyone who isn't a developer.** That is most of the people building with AI today: 63% of AI builder users aren't developers.

## Proof (all real, all checkable)

- **Day one: 72 merged pull requests.** The plugin's first commit was 2026-11-08 18:19 EST, and pull request #72 merged 2026-11-09 14:34 EST. Source: [github.com/Pukujan/swarm-studio](https://github.com/Pukujan/swarm-studio).
- **25 real builds made** in the studio so far.
- **4 market packs** and the Swarm Wall.
- **14 specs** written and built against.
- **Swarm Feed is live** at [swarm.design-bakery.com](https://swarm.design-bakery.com), with swipe, Try, Remix, boards and Hermes Jam #1.

## The market

Three markets meet where Swarm sits:
1. **AI builders, the fastest-growing software there is:**
   - Lovable reached about $400M ARR by Feb 2026 (press-reported);
   - Replit was valued at $9B in Mar 2026.
2. **Visual tools for people who aren't designers:** Canva has $4B annualized revenue and 265M monthly users.
3. **People who launch things for a living:** Goldman Sachs says the creator economy could reach $480B by 2027.

The way in is the Hermes community (262,021 stars), then everyone those people make things for.

## How it makes money (next; not in the hackathon build)

1. **Free plugin, open source.** It grows through the Hermes Marketplace.
2. **Hosted Swarm Studio.** Build in the browser without installing Hermes, paid per build in credits.
   > Superseded by the owner's direction of 2026-11-12: there is no hosted studio and no build credits. Swarm Studio runs in the person's own Hermes; the Feed is the only hosted part. See [PRODUCT.md](../PRODUCT.md).
3. **The pack marketplace.** Pros sell packs (a crew and a plan for a market), and makers earn a share of every use.
4. **Studio seats.** Teams, shared boards, brand kits and review.
5. **Remix revenue share.** When a remix earns, the original maker earns too. The credit chain already records who made what.

Real billing waits for a legal and payments review. The demo only shows a labelled test checkout.

## The road (this hackathon is day one)

| When | What |
|---|---|
| **Now** (hackathon) | the plugin, the crew, Auto, the packs and the live Feed |
| **Next** | the Hermes Marketplace listing, the hosted studio, real credits, and Feed boards for everyone |
| **Then** | new crews through MCP and open-source skills: game engines, marketing and ad tools, print, 3D. **Any tool Hermes can reach, the crew can use.** |
| **Later** | Swarm beyond Hermes: any agent host that speaks MCP can run the studio and post to the Feed |

> "The hosted studio, real credits" in **Next**: Superseded by the owner's direction of 2026-11-12: there is no hosted studio and no build credits. Swarm Studio runs in the person's own Hermes; the Feed is the only hosted part. See [PRODUCT.md](../PRODUCT.md).

## The maker

Design Baker, [@Pukujan](https://github.com/Pukujan) on GitHub. Portfolio: [design-bakery.com](https://www.design-bakery.com).

- **100,000,000+ people served** by the production platforms Design Baker has built: hosted platforms, SaaS applications, and design and development tools.
- **8 years building products**, from the first question to running in production: research, design, front end, back end, AI and servers.
- **Built for the people Swarm serves:** most of the work so far has been for marketers, event hosts, creative communities and licensed professionals.
- **Built before Swarm:** the Maybe and Riley voice agents, the Octo data platform, Precedent, Eval Lab, and a coordination pack that lets several coding agents work on one repository.

## The sales pitch

### 10 seconds

> Swarm is a creative studio inside Hermes. One prompt, and a crew of agents builds your whole launch while you watch and steer.

### 30 seconds

> Agents are built for developers: a terminal, one file at a time, out of sight. Swarm gives everyone else a studio. Type one prompt, and Commander Hermia's crew builds your site, a live app, a game, a film and your launch posts. They work on a canvas you can see and steer like Figma. It runs on your own Hermes and your own models. Post it to Swarm Feed and people remix it, with credit. That was day one; it's a whole creative studio, inside Hermes.

### 2 minutes (talk track for the deck)

1. **The problem.** Agents are built by developers, for developers. Use the hero story from `stories-swarm-studio.md`.
2. **The turn.** One prompt, then live on the canvas: the crew working, Hermia's orders.
3. **The breadth.** The site, the app on a phone, playing the game, the film, the posts.
4. **The steer.** One sentence changes the colour everywhere.
5. **The loop.** Post, remix and credit in the Feed.
6. **The numbers.** The market, Hermes' reach, and the 72 PRs on day one.
7. **The road.** Packs, the hosted studio and new crews through MCP. This hackathon is day one.
   > "The hosted studio": Superseded by the owner's direction of 2026-11-12: there is no hosted studio and no build credits. Swarm Studio runs in the person's own Hermes; the Feed is the only hosted part. See [PRODUCT.md](../PRODUCT.md).

## What we never claim

- Users, revenue or partners we don't have.
- That Nous made or endorses Swarm.
- That anything labelled "next" is live.
- Numbers marked "unconfirmed" in MARKET.md.
