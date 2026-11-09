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
| **Models** | Choose the models for planning, building, reviewing and images. The builders' model is also right in the chat box, next to Agents (recent picks, or Other… for the full list). | **☰ More → Models**, or **Model** in the chat box | `/swarm models [<role> <model\|off\|reset>]` |
| **Lite mode** | One live page at a time; the others rest as snapshots and wake when you zoom in or an agent works on them. Auto turns it on for machines short on memory, for everyone half a minute after a build finishes, and while you're in Play. | **Models** | `/swarm lite [on\|off\|auto]` |

## Edit

| Feature | What you see | Canvas | Command |
|---|---|---|---|
| **Design panel** | Click any section and change its layout, padding, gap, fill, stroke, radius and type. Variables change every page. Edits are saved with the build. Opens by itself when you select a section and closes after; × closes it. | **☰ More → Design** (D) | — |
| **Comments to agents** | Pin a comment on a section ("make the hero darker"). An agent picks it up and rewrites that section live. Without a section selected, the planner works out which sections you mean. | 💬 tool | `/swarm fix <what to change>` |
| **Visual review** | Every page is checked at desktop and phone width. Measured problems come first: a panel sitting on top of other text, or a half-written tag, found by measuring the page, not guessed. Then a vision model looks at both screenshots and names what a visitor would notice. Agents fix it all live, one agent per section. | **🔎 Review** | `/swarm review [n]` |

## Show

| Feature | What you see | Canvas | Command |
|---|---|---|---|
| **Clickable prototype** | Every page, with working links, on desktop or mobile. A layout guard moves any text panel that a builder floated over a map or picture beside it if it would cover other text at that width (exports and published sites get it too). | **▶ Play** (P) | `/swarm play` |
| **Motion** | Sections rise in as they scroll into view and buttons lift on hover. Bold or playful themes move faster and springier. | **✨ Motion** (M) | `/swarm motion [on\|off]` |
| **Watch a visitor** | 3–4 people with different goals use the site. A cursor acts each one out, with a thought bubble. | **👀 Watch a visitor** (V) | — |
| **Files** | Every build is a file with its metadata: brief, dates, pages, theme colours and fonts, models, pictures, reviews, edits, live links, video. Name it, tag it, file it in a folder, add a note (⋯ → Details). Search every field (`tag:`, `folder:`, `on:vercel`, `has:video`), sort by newest, oldest, name or size, group by day or folder; unfinished runs fold away. | **Files** tab | `/swarm files [words]`, `/swarm info [n]` |
| **Promo video** | The planner writes a storyboard and a voiceover from the site's own copy and photos and casts the voices and music for the theme. Plans: Promo, Kinetic type, Slideshow, Teaser, Customer story; cuts: colour wipe, fade, zoom, slide, flash; plus your own idea. HyperFrames renders the MP4 in the site's theme; Kokoro (local, no account) reads it over a music bed ducked under the voice. Download, Show in Finder, ⛶ Big screen. Any OpenAI-compatible TTS (`SWARM_TTS_URL`) can replace Kokoro. | **🎬 Video**, or `/video [style] [idea]` in the chat | `/swarm video [n] [style] [cut] [voice\|off] [nomusic] [idea]` |
| **Chat commands** | Type `/` in the canvas chat for a list: /play, /review, /fix, /video, /export, /publish, /motion, /files, /open, /info, /models, /new, /help. Anything else starts a new build. | Chat box | same as `/swarm …` |
| **Tidy workspace** | Play and Publish stay in the top bar; Review, Video, Export, Models and the panels live in **☰ More**. ⇤ shrinks the side panel to a small chat over the canvas (the chat always stays); ⇥ brings it back. | **☰ More**, **⇤** | — |

## Ship

| Feature | What you get | Canvas | Command |
|---|---|---|---|
| **Export** | Static HTML pages, a React + Tailwind project (Vite, one component per section, builds as is) and an ABA handoff (`spec.md` + `blueprint.json`), plus a zip. Motion is included. | **⬇ Export** | `/swarm export [n]` |
| **Publish** | A live website, wherever you host. **GitHub Pages** uses your `gh` login: one public repo per site, a `you.github.io/site-name/` link in about a minute. **Vercel** and **Cloudflare Pages** go to your own account: paste an access token once (like Dyad does), or an Octo vault grant so the token never leaves your vault, and get a `…vercel.app` or `…pages.dev` link. **This computer** hosts it at `127.0.0.1:4319/site/<build>/` straight away, and is the fallback if a host fails. Publishing again updates the same site; projects it didn't make are never touched. | **🌐 Publish** | `/swarm publish [n] [github\|vercel\|cloudflare\|local]` · `/swarm hosts` |
| **Real app handoff** | `aba/spec.md` in the export is written for an app builder such as ABA (the author's own), which turns the design into a full-stack app. | in the export | `/swarm export` |
| **Files** | Every build is saved, can be reopened, and replays exactly. | Files tab | `/swarm files` · `/swarm open <n>` |
