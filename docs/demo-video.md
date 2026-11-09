# Demo video plan (under 90 s)

One plugin, a few prompts, five things made: a site, a review pass, a promo video, a working app on Vercel, a playable game. The video should feel like a product launch, not a screen recording.

## Rules

- **Real footage only.** Every frame is the plugin working. Long waits are sped up, and the screen says so (a small `8×` chip in the corner while sped up). The build timer stays real time.
- **Hermes is the host.** Open in Hermes Desktop with the swarm pane; every beat starts from a prompt or a `/swarm` command typed in Hermes.
- **Original content only.** The game is our own world (the spec's names); no other game's names on screen.
- **Under 88 s** so the upload never trips the 90 s limit.

## Capture

- 2560×1440 at 60 fps (Screen Studio or OBS), Hermes Desktop full screen, dark theme, browser zoom so canvas text is readable at 1080p.
- Record each beat separately from a fresh state, three takes each. Prebuild nothing that the video claims is built live; prebuild only what a beat skips (for example the app build runs off camera at 8×, but its first and last minutes are real).
- Keep the throwaway data dir (`SWARM_RUNS_DIR`) for the shoot, so the real builds stay untouched.
- Warm the models first: `/swarm models` on the fast routes, one dry run of each beat the same hour (InferHub capacity moves).

## Shot list

| Time | Beat | On screen | Typed |
|---|---|---|---|
| 0–4 | Hook | Black, then the prompt box. Caption: **"One prompt."** | `/swarm Neon Alley Nights: a neon night market in Taipei: street food stalls, a festival weekend in March, tickets and a vendor map` |
| 4–18 | The swarm | Theme and sitemap land, 16 cursors burst onto four pages, timer counts up. Slow push-in on one agent typing. Caption: **"16 agents. 4 pages. 32 seconds."** | — |
| 18–26 | Review | 🔎 Review: scan line, two flags, sections rewrite live; before/after wipe. | `/swarm review` |
| 26–34 | Play + video | ▶ Play, two clicks through pages; cut to the Video tab, the promo plays 3 s with sound. | `/swarm video kinetic` |
| 34–56 | App | App tab. Steps stream (enable_nitro, routes, admin) at 8×, then the preview: buy a ticket, success state, `/admin` table shows the order. 🚀 Deploy → the `vercel.app` link opens and works. Caption: **"Same design. Real app. Live."** | `/swarm app` then `/swarm deploy` |
| 56–60 | Change by chat | Type a change; the preview updates. | `/app add a sold-out badge when stock hits zero` |
| 60–82 | Game | 🎮: three chips (Roguelike → feel → 3D neon), Just build it, spec card (the original world), build at 8×, then 12 s of play: dodge, hit-stop, a room cleared. | `/swarm game a moth-winged courier escaping a drowned clocktower` |
| 82–88 | End card | Logo, **"Swarm Studio. One Hermes plugin. One Nous subscription."**, the repo URL. | — |

## Edit

- Cut on action (a click, a section landing); no dissolves except into the end card.
- Captions: one line each, bold sans, bottom third, in and out in 150 ms.
- Music: one track, 120–128 BPM, cuts on the beat; duck under the game's own sound for its last 4 s.
- Zooms: 1.0 → 1.6 on the area that matters, eased, never during typing.
- Build the edit with HyperFrames (already in the plugin's video tools) or Resolve; export H.264 1080p60, about 12 Mbps, plus a 15 s vertical cut for posts.

## Before recording

- [ ] App build passes on the Neon run start to finish (timed)
- [ ] Deploy returns a working `vercel.app` link with `/api` routes answering
- [ ] Game build playable to a win and a loss
- [ ] `warm hold` not needed (all local), but InferHub routes checked the same hour
- [ ] Throwaway data dir set; notifications off; clock hidden
