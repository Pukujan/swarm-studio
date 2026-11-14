# Owner's UX requirements

The owner's own words, kept as the source for [RULES.md](RULES.md) and [AUDIENCE.md](AUDIENCE.md). Add new
entries at the bottom with the date; don't rewrite old ones.

## 2026-11-09

**Audiences and flows**
> goal is 6 different right. 1st normal person just auto. 2nd is designers who mostly only want to work with
> designs. 3rd is developers who wants to develop. 4th is game developers who only want game development
> quickly. 5th is others who want to do mix and match between just design and web. 6th maybe web and marketing.
> give them tools differently and flow differently, we need to address all of them.

**Structure**
> check how ui works for complex things like google map, apple map, and how they handle complex ui, and
> complex dashboards. right now way too many buttons, way too much confusion. our goal should be 1 flow expand
> into 2-3 flow expand into multiple flow and details, expand into more details, that's how it should be
> structured.

**Text**
> UI is everywhere … text and tool tips everywhere, no one asked for them and it makes our app look sloppy,
> only bring them up upon expansions and tooltip hovers.

**Duplicates**
> if there is one chat on the side bar already why do we need another here?, same for game

**Navigation**
> these nav buttons make no sense, some are clickable some aren't some are weird
>
> no way to go back to the main starmap or gui mode
>
> also cant seem to close this

**Explorer**
> even the explorer, look how hard it is to use

**Controls and look**
> look at the tick mark out of place … maybe use shadcn for it instead of making all from scratch … use our own
> design prompts to make it better designs
>
> weird to have volume and mute button so far apart

**Galaxy and orbit**
> the star map, I can't drag and drop them, no idea how engine room, film studio and other things work, I can't
> see it properly … also can't click film studio … did you also check responsiveness, I mean it's mostly for
> desktop but still

**The social side**
> what happened to our main homepage, the social media like Kresilo, collab board, show off, their story, their
> marketing, etc?

**Process**
> do you want to write UI/UX rules for yourself so you stop making such mistakes … all our buttons and chips,
> write them all in one place first so we can talk and reason about how we can layer them … what about our
> target audience … durably, as my requirements.

## 2026-11-09, later

**Depth**
> that's just 3 layers, I thought I said I want more and much more layers?

**Diagrams**
> I said I want full tree diagram flows and site maps

**The social side**
> what about the social aspects I talked about, where does that go?

**The commander**
> what about the Nous Portal girl's cyber version, or a moving PNG image or something that sounds like she is
> the commander?

**The front door**
> the flow is wrong, I want the plugin to open the feed directly, like how Kresilo works
>
> yup, and it's a TikTok-style navigation, it doesn't need project descriptions, just more visuals and assets

**Borrowing from mature products**
> how are we going to arrange and borrow ideas from mature frameworks and their UI/UX, also how are we going to
> avoid text and tooltips everywhere, a proper navigation and only a few sidebars, non-moving buttons, etc.

> are we about to have UI everywhere in the studio again?

**The canvas follows Figma**
> I think our canvas is the one with the most tools, right, and it's supposed to follow Figma's UI and tools
> almost 1 to 1, right?

**The social side, borrowed**
> what about Kresilo's collaboration board, annotation, contribution, public boards, events, mood boards, etc.?
> Can we borrow some of those ideas from Kresilo, Behance and more?

These are answered in [PATTERNS.md](PATTERNS.md) and RULES.md rules 9 and 27–32.

## 2026-11-11

**Watching the crew**
> u didint go in here on time btw maybe we should make this a default when they create a website btw

Said of the Design deck, after a website finished in about 40 seconds on the project's canvas before anyone had
double-clicked into a page. A website started with Make opens in the Design deck (SITEMAP.md sections 8 and 10).
The project's Overview and the Design deck stay two places: the Overview holds the pages and files, the deck is
where the crew is watched and a page is designed.

> again its doing this instead of designing and taking me here is it coz both of them is called canvas?

> this needs to be called overview

Said on 2026-11-11 of an App started with Make, which stayed on the project's pages while the crew designed, with
the mode menu reading Canvas on both places. The project's pages and files are the **Overview**; the Design deck
keeps **Canvas** in the mode menu. Every kind that starts with page design (Website, App, Video) opens in the deck.

**Talk before building**
> i asked it not to develop yet and have discussion with me but it built it instea dand started designing

Said on 2026-11-11 of an App whose prompt asked "do u wanna grill me first?" and whose answer read "dont build yet
lets talk about specifications". A stop or a wish to talk, in the prompt, in an answer or in a dock, never starts a
build: the planner model reads every message first (engine/talkplan.mjs; a clear stop phrase is never read as a
build). A talk opens in the Design deck's chat on a new project with nothing built; Hermia answers there and the
dock reads Send. When unsure, one choice: Build now or talk first. A question typed into an answer is answered, not
added to the brief. The last step is always the brief to read and edit, with Build and Keep talking. `hermes swarm`,
`/swarm auto` and `swarm_design` refuse a brief that says to talk first and say why.

**Launch only what is there**
> launch kit before i even build the app thats weird

Said on 2026-11-11 of an App whose app step failed after the page design: the Auto summary popped up and its launch
kit said "Flight Search is live." with the prompt pasted in as the pitch and "0 images" as a feature. The summary
opens by itself only for a finished build with a live link; a failed or stopped one says so in the Auto panel. The
Launch kit is offered (Auto panel, summary) only with a live link or a finished video, and the server refuses to
write one otherwise. Its copy names the product by its brand (the nav's wordmark, "SkyLedger"), pitches it in one
line the planner writes from the pages, lists the pages by name, never counts zeros and says "is live" only beside
the live link. The Design deck's title is that name too, not the first page's title.

**Chats apart from projects**
> i think we need a store just for chat that doesnt get turned into projets

Said on 2026-11-11 (spec 29). A talk with the planner is kept in a chat of its own, not a project: listed under
**Chats** in the Projects sidebar, never in Projects, and opened again where it left off. When it builds, the chat
moves into the project, which keeps all its chats grouped Design, App, Game and Video. The first words typed into
the Make box always land in a chat, even when they build at once.

**A talk inside a project knows that project**
> looks like it wont stop or change the colors what to do? no matter how much i ask it to

Said on 2026-11-12, after a talk in the "Night Runner Press" deck. The planner had said nothing was built while four
pages were on screen, added a different product (a site for rat owners) to the sneaker project twice, ignored the
colours the talk agreed, and Stop left pictures painting. Now the planner is told the project's pages, look and
running work; a different product's brief offers **New project** (and **Add here**), "redo from scratch" offers
**Start over** (new pages and look, the old version stays in the project); colours a brief or a follow-up names
become the theme, checked against it; Stop covers every build of the project on screen and says Stopped at once;
one Enter is one message. **New chat** heads the Chats list on Studio home.

**Nothing builds until the person says so**
> so we dont waste tokens on something we dontwant

Said on 2026-11-12, after one click on the showcase "Shop with checkout" built a whole App unasked. Now a showcase,
and a Make box idea with no questions, opens a chat with the brief in plain words and the steps it will take; it
builds only on **Build**, and **Keep talking** is there. Stop ends an automatic run as Stopped, not failed. An
opened project shows its builds as **Version 3, 2, 1**, not as projects of their own.

**A brand sheet before the first page**
> do this and option for idk pre chosen picture and mood and feel with brand voice storyboard idk

Said on 2026-11-12. A website's or app's brief offers **Brand sheet** beside **Build**. The sheet shows the story (what,
who, pages), three palettes side by side, each with a light and a dark sample, and three type pairings as a real
heading and paragraph. The person's own words make one more option. **Lock** makes the chosen palette and type the
build's theme as they are, and the build checks it kept them. It is optional: **Build** works without it.
Spec: docs/specs/31-brand-sheet.md.

**Stop the crew**
> anyway to stop an ongoing swarm or agents? wish there was ? lol i cant stop them once they start

Said on 2026-11-11. One **Stop**, in the top bar beside the work chip, the same place in Projects, the Overview, the
Design deck and the other rooms, shown whenever agents work. Inside a project it stops everything in flight for that
project (the layout pass, pictures not started yet, review and fix passes, a film, an app or game build, Auto); on
Projects it stops all of it. No confirmation. Builders take no more sections and the model calls in flight are
aborted; what is built is kept and the build ends with `run:stopped`. The deck's chat says how much is kept, offers
**Resume** (the next version builds only what was left) and takes a change in the dock. A picture already with the
image model is kept when it lands (painting cannot be cut off half way); a single agent or section cannot be stopped
on its own. `hermes swarm --stop`, `/swarm stop [n]` and the `swarm_studio` tool's `stop` do the same.

