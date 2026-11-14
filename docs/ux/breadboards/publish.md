# Publish

Putting a version online and making it ready to share: Website, Working app, Swarm Feed, and the launch kit's posts.
Swarm never posts for anyone: a post opens the network's own page, and a message to Discord, Slack or Telegram goes
through Hermes's gateway only after the person confirms the exact text (PRODUCT.md, [decision 0005](../../decisions/0005-sharing-person-posts.md),
[docs/engines/hermes-and-connections.md](../../engines/hermes-and-connections.md): `hermes send`). SITEMAP §9 (Share,
Publish, Promote). Statechart: `build.share`. Code: the top bar's Publish (`web/index.html:47-55`,
`web/canvas/start.js:294-326`), `web/canvas/publish.js`, `web/seo.js`, the launch kit in `web/canvas/auto.js`,
`engine/publish.mjs`, `engine/launch.mjs`.

## Places and affordances

```
Publish ▾  (top bar of the Overview and the rooms; hidden on Projects)
  · "Publish" / "Publishing…" / "Live"; disabled until the build is done
  · menu "Put it online"            (build.share)
      the live link · Copy
      Website                      ──(none)──▶ Website
      Working app (or its reason: "The app is still building." · "Build the app first" · "Live at X")
                                   ──room.app──▶ the Engine room, deploying
      Swarm Feed                   ──(none)──▶ Post to Feed

Website  (layer; ×)
  · "Checking…" first
  · Thumbnail: the picked one, one click to swap (up to six)
  · where: GitHub · Vercel · Cloudflare · This computer
      not connected: Connect X · Get a token · the token · Connect ("Checking…", its error)
      connected: Disconnect
  · Publish                        ──(none)──▶ Publishing
Publishing  (layer)   each stage ✓ / ◌ / ·
  · failed: "Not published", the reason · Other host · Retry
  · live: "Live · host", the link · Publish again · Copy link · Open ↗ · Post to Feed

Post to Feed  (layer; ×)          (build.share → posted)
  · Public / Unlisted · Post to Feed ("Posting…")
  · not linked: Connect Hermes, its code, Open ↗
  · done: "In the Feed", the link    ──posted──▶ the Feed's Home (in the Feed's own app)

Search & share  (the Design deck's right panel, nothing selected)
  · Title (n/60) · Description (n/160) · Share picture

Launch kit  (layer; from the Auto summary's "Open the launch kit" or the Auto panel's "Launch kit"; only with a
             live link or a finished video)
  · "Writing the posts…" while it writes
  · a post card per network: Edit / Save · Skip · Post
      X, LinkedIn, Threads, Bluesky   ──(none)──▶ the network's own share page, the text filled in
      Instagram, TikTok               ──(none)──▶ the caption copied, the video downloaded
      Discord, Slack, Telegram        ──(none)──▶ Confirm: the channel and the exact text · Cancel · Send
                                        (disabled, "Connect X in Hermes to send", with no gateway)
```

## At 390 px

The top bar's Publish keeps its icon only; its pops fit the width (`calc(100vw - 28px)`); the launch kit is full width
below 900 px, its cards one column.

## Where the code differs

- **SITEMAP §9's Share** (Link, Publish, Promote) is one menu, "Put it online"; there is no Promote group, and the
  launch kit is reached only from Auto (`web/canvas/auto.js:97`, `:107`), not from Publish.
- **No Arcade, custom domain or Go live step** in the code (SITEMAP §9, spec 3); Swarm Feed holds Arcade's slot.
- **Disabled with no reason.** Publish is disabled until the build is done with nothing saying why
  (`web/canvas/loop.js:139`); Working app does give its reason.
- **Working app's progress is chat lines**, Vercel only (`web/canvas/rooms.js:657-667`), not the Publishing step list.
- **The menu's minimum width** (300–340 px, `web/canvas.css:846`, `:986`) is close to the 390 px edge.
- **Spec 30's file is headed "27."** (`docs/specs/30-seo.md:1`).
- **Not an audited screen.** Publish opens from rooms that are audited; its layers are not (AUDIT.md, "Loading after
  a click inside a screen isn't" checked).
