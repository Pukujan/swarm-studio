# Swarm Studio: what it does

Every feature works in three places: on the canvas, as a `/swarm …` command, and as an action of the `swarm_studio` / `swarm_design` tools that the Hermes agent calls when you just ask in chat.

## Build

| Feature | What you see | Canvas | Command |
|---|---|---|---|
| **Swarm build** | A planner picks the theme and pages, then 4–24 agents stream sections onto the canvas at the same time. A typical build is 4 pages and about 30 sections in 30–60 s. | Brief box → **Build** | `/swarm <brief>` · `hermes swarm "<brief>" --wait` · `swarm_design` tool |
| **Live agents** | Each agent has a cursor, a name and a colour. You see the tool it picks, a caret where it is typing, a one-line note about what it is doing, and a break room while it waits for work. | Agents panel, Log tab | — |
| **Planner stream** | The theme (colours, fonts, radius) and the page plan as they are written. | **Planner** | — |
| **Wires** | Buttons that link pages become wires between frames. | always on | — |
| **Generated images** | Photos from your Hermes image provider (your Codex login by default). A sketch holds each spot, then the photo fades in. | **Models** | `/swarm images [auto\|off\|<provider> [model]]` |
| **Models** | Choose the models for planning, building, reviewing and images. | **Models** | `/swarm models [<role> <model\|off\|reset>]` |
| **Lite mode** | For machines short on memory: one live page at a time, smaller images. | **Models** | `/swarm lite [on\|off\|auto]` |

## Edit

| Feature | What you see | Canvas | Command |
|---|---|---|---|
| **Design panel** | Click any section and change its layout, padding, gap, fill, stroke, radius and type. Variables change every page. Edits are saved with the build. | **Design** (D) | — |
| **Comments to agents** | Pin a comment on a section ("make the hero darker"). An agent picks it up and rewrites that section live. Without a section selected, the planner works out which sections you mean. | 💬 tool | `/swarm fix <what to change>` |
| **Visual review** | A vision model photographs every page and names up to 3 problems per page. Agents then fix them live. | **🔎 Review** | `/swarm review [n]` |

## Show

| Feature | What you see | Canvas | Command |
|---|---|---|---|
| **Clickable prototype** | Every page, with working links, on desktop or mobile. | **▶ Play** (P) | `/swarm play` |
| **Motion** | Sections rise in as they scroll into view and buttons lift on hover. Bold or playful themes move faster and springier. | **✨ Motion** (M) | `/swarm motion [on\|off]` |
| **Watch a visitor** | 3–4 people with different goals use the site. A cursor acts each one out, with a thought bubble. | **👀 Watch a visitor** (V) | — |
| **Promo video** | The planner writes a storyboard from the site's own copy and photos. HyperFrames renders a ~20 s MP4 in the site's theme. | **🎬 Video** | `/swarm video [n]` |

## Ship

| Feature | What you get | Canvas | Command |
|---|---|---|---|
| **Export** | Static HTML pages, a React + Tailwind project (Vite, one component per section, builds as is) and an ABA handoff (`spec.md` + `blueprint.json`), plus a zip. Motion is included. | **⬇ Export** | `/swarm export [n]` |
| **Publish** | A live website. **GitHub Pages** uses your `gh` login: it makes one public repo per site and returns a link like `you.github.io/site-name/` in about a minute; publishing again updates it. **This computer**: Swarm Studio hosts it at `127.0.0.1:4319/site/<build>/` straight away. If GitHub fails, the site is still hosted locally. | **🌐 Publish** | `/swarm publish [n] [local]` |
| **Real app handoff** | `aba/spec.md` in the export is written for an app builder such as ABA (the author's own), which turns the design into a full-stack app. | in the export | `/swarm export` |
| **Files** | Every build is saved, can be reopened, and replays exactly. | Files tab | `/swarm files` · `/swarm open <n>` |
