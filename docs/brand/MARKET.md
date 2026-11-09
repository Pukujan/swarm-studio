# Market research

Researched on 2026-11-09 from public sources. Every number has its source and year. Private companies' numbers are company- or press-reported, and the source says which. Anything we couldn't confirm is marked **unconfirmed**. Don't put an unconfirmed number on a slide or the home page.

## The market in one sentence

AI builders are the fastest-growing software category, and most of their users aren't developers. Every builder still makes **one** kind of thing behind **one** chat box, and none of them lives inside the open agent people already run: Hermes.

## Numbers we can quote

| Number | What it shows | Source |
|---|---|---|
| **Hermes Agent: 262,021 GitHub stars, 58,351 forks** (checked 2026-11-09) | the audience the plugin opens up; created 2025-07-22 | [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), via the GitHub API |
| **Lovable: about $400M ARR (Feb 2026), about $500M (Jun 2026)**, press-reported | how fast prompt-to-app spending grew | [valueaddvc](https://valueaddvc.com/blog/lovable-valuation-2026-13-2b-and-500m-arr-how-vibe-coding-actually-makes-money) |
| **Replit: $9B valuation (Mar 2026)**, aiming for $1B ARR by the end of 2026 | investors back agent builders | [AI Magazine](https://aimagazine.com/news/replit-ai-agents-vibe-coding-and-a-us-9bn-valuation) |
| **Canva: $4B annualized revenue, 265M monthly users (2026)** | how big the demand for visual tools for non-designers is | [TechCrunch](https://techcrunch.com/2026/02/18/canva-gets-to-4b-in-revenue-as-llm-referral-traffic-rises/) |
| **63% of vibe-coding and AI app builder users aren't developers (2026)**; vendor data | our audience is already the majority | [Hostinger](https://hostinger.com/blog/ai-app-builder-statistics) |
| **The creator economy could grow from $250B to $480B by 2027**, with about 50M creators | the people who launch things for a living | [Goldman Sachs](https://www.goldmansachs.com/insights/pages/the-creator-economy-could-approach-half-a-trillion-dollars-by-2027) |
| **40% of enterprise apps will include task-specific agents by the end of 2026**, up from under 5% in 2025 | agents are going mainstream | [Gartner, 2025-08-26](https://gartner.com/en/newsroom/press-releases/2025-08-26-gartner-predicts-40-percent-of-enterprise-apps-will-feature-task-specific-ai-agents-by-2026-up-from-less-than-5-percent-in-2025) |
| **MCP: 97M monthly SDK downloads (Mar 2026)**; moved to the Linux Foundation's Agentic AI Foundation in Dec 2025 | the standard that lets Swarm plug into any tool | [dev.to](https://dev.to/yujia_zhang_0328/mcp-crossed-97-million-installs-in-16-months-the-agent-connectivity-standard-is-settled-3dfk) |
| **Genspark raised $485M at $2.6B (Jun 2026)**; **Meta agreed to buy Manus (Dec 2025, reported $2B+)** | agent workspaces are being bought and funded now | [AI Magazine](https://aimagazine.com/news/genspark-how-the-ai-workspace-hit-at-us-2-6bn), [Trending Topics](https://www.trendingtopics.eu/meta-acquires-ai-agent-startup-manus-which-recently-reached-100-million-arr/) |

Use only as ranges, never as one number:
- **Design software:** estimates run from $45B to $71B for design, editing and rendering software (2025). The category definitions differ. Sources: [GII Research](https://www.giiresearch.com/report/tbrc603100-design-editing-rendering-software-global-market.html), [Cambashi](https://cambashi.com/cambashi-referenced-as-trusted-source-of-market-data-in-nemetschek-groups-annual-report-2025/).
- **Open-weight models:** reported at 72% of tokens among OpenRouter's top 50 models (late Sep 2026), up from 27% a year earlier. It's cited secondhand via [Futurum](https://futurumgroup.com/?p=97147), so check it on [OpenRouter](https://openrouter.ai/blog/insights/open-weight-vs-closed-weight-models/) before quoting.

Don't use: the indie games market size (a single vendor blog contradicts itself), Hermes skill and plugin counts (sources conflict), or any plan price marked unconfirmed below.

## Competitors

| Product | What it makes | The gap that matters to us |
|---|---|---|
| Lovable | web apps from a prompt | apps only, one chat thread, you can't see the agents, no remix |
| Bolt.new | apps in the browser | code only; cost grows with project size |
| v0 (Vercel) | UI and apps | tied to one hosting stack; UI first |
| Replit Agent | apps with hosting and a database | code and apps only; no canvas, no community |
| Figma Make | prototypes from designs | prototype-grade, locked to one design tool; no game, film or posts |
| Framer AI, Webflow AI | marketing sites | sites only, locked to their platforms |
| **Omma (Spline)** | 3D sites and apps with up to 100 agents on a canvas (launched 2026-03-24) | **the closest rival.** It focuses on 3D web, is locked to its platform, and we found no community or remix (unconfirmed). It builds one whole page per agent, while Swarm splits each page into sections across the crew. |
| Rosebud AI | browser games | games only |
| Runway, Pika | video clips | clips with no product around them |
| Canva AI | design assets, docs, decks | static assets, not deployed apps or games |
| Manus, Genspark | general agent workspaces | generalist output; you can't watch a crew; no feed |

Sources for the table: [Spline changelog](https://updates.spline.design/changelog/meet-omma-create-3d-websites-and-apps-with-ai-agents.), [createwith](https://www.createwith.com/tool/spline/updates/spline-launches-omma-canvas-with-100-parallel-ai-agents-for-site-building), [Bolt pricing](https://www.banani.co/blog/bolt-new-pricing), [v0 pricing](https://vercel.com/blog/updated-v0-pricing), [Rosebud FAQ](https://rosebud.ai/blog/pricing-subscription-faqs), [Runway pricing](https://aitoolsbakery.com/blog/runway-pricing/).

**The pattern.** Each one makes one kind of output, hides its agents behind a chat box, keeps you on its platform, and has no loop where people's work feeds other people's work. Swarm is the opposite on all four counts:
- it makes the whole launch;
- you watch and steer the crew;
- it runs on your own Hermes with your own models;
- the Feed turns every build into the start of the next one.

## Why now

1. **Multi-agent work went mainstream in 2026.** Omma launched with parallel agents, Manus was bought and Genspark raised. Gartner expects a third of agentic systems to combine agents with different skills by 2027 (same release as above).
2. **Builders who aren't developers are the majority.** 63% of AI builder users aren't developers (Hostinger), yet the agent most people run, Hermes, still looks like a developer tool.
3. **MCP made agents pluggable.** A Hermes plugin can reach any tool with an MCP server, so a crew can grow new skills without a new app.
4. **Open models got good enough to run a crew cheaply.** Swarm runs on whatever model the person already uses in Hermes, including open ones.

## Hermes Agent and the hackathon

- **What Hermes is:** Nous Research's open-source agent, with memory across sessions, scheduled jobs, 20+ chat platforms, 60+ built-in tools, subagents, MCP, and skills on the agentskills.io standard ([docs](https://hermes-agent.nousresearch.com/docs/)).
- **Who uses it:** developers and researchers; designers, game makers and studios aren't named as an audience. That is the opening.
- **The hackathon:**
  - $20K in total prizes;
  - entry is a catalog PR plus a demo video under 90 s;
  - it is due 2026-11-11 at 17:00 EST;
  - accepted plugins are listed in the Hermes Marketplace.
  - Secondary sources give the judging criteria as usefulness, reliability and creativity; **unconfirmed**, so check the official Nous announcement.

## Not researched yet

- an official hackathon rules page;
- plan prices for Lovable, Replit, Figma Make and Webflow AI;
- whether Omma has a community feed;
- products launched after these.
