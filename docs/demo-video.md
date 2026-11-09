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

The video tells the pitch in [brand/PITCH.md](brand/PITCH.md):
1. the problem (agents are built for developers);
2. the turn (one prompt, a crew you watch);
3. the breadth (the whole launch);
4. the loop (the Feed).

Breadth is the proof, not the point, so each output gets one clear beat and no more. Plan backwards from what can be filmed on Tuesday night. If the app or game beat isn't ready to film, the fallback ending is the Swarm Wall: four packs building at once.

| Time | Beat | On screen | Typed | Caption |
|---|---|---|---|---|
| 0–6 | **The problem** | A real terminal agent session scrolling walls of text, one file at a time. Hold on the before line from the hero story ([brand/stories-swarm-studio.md](brand/stories-swarm-studio.md)). | — | the story's before line |
| 6–10 | **The Feed** | Hermes opens Swarm Feed; two quick swipes through real builds (Lantern Drift, Tidebreak). | — | **"Made with Swarm."** |
| 10–14 | **+ Create** | Tap + Create; Hermia appears; type the prompt. | `A night market in Taipei: street food, a festival weekend, tickets and a vendor map` | **"One prompt."** |
| 14–34 | **The crew builds** | Galaxy → orbit → the Design deck. Hermia draws the site map, then the crew cursors spread across four pages; a code check flags a section and a courier fixes it. Push in on one courier working. Then a one-line steer: the hero colour changes across every page. | `make the hero warmer` | **"A crew you can watch. And steer."**, then the real agent count, page count and time from this run |
| 34–50 | **The real app** | The Engine room's code wall at 8×, then the live app on a phone: buy a ticket, and the order shows in `/admin`. The `vercel.app` link opens. | — | **"Same design. Real app. Live."** |
| 50–64 | **The game** | Press Play: 10 s of the game from the same build, with a dodge, a hit and a room cleared. | — | **"And the game."** |
| 64–74 | **Film and posts** | The Film studio's promo plays 3 s with sound, then the launch posts as cards. | — | **"The film. The posts. The whole launch."** |
| 74–82 | **Post and remix** | Post to Feed; the card appears; someone remixes it into a winter festival, and the remix card says "remix of" with the crew credited. | — | **"Every build credits its crew."** |
| 82–88 | **End card** | Hermia's mark and the "SWARM *Studio*" lock-up, the Feed URL and the repo URL. | — | **"A whole creative studio, inside Hermes."** |

Captions follow [brand/BRAND.md](brand/BRAND.md): one yellow serif accent word per line, real numbers only, nothing claimed that isn't on screen.

## Edit

- Cut on action (a click, a section landing); no dissolves except into the end card.
- Captions: one line each, Big Shoulders Display with the one accent word in EB Garamond italic yellow, bottom third, in and out in 150 ms.
- Music: one track, 120–128 BPM, cuts on the beat; duck under the game's own sound for its last 4 s.
- Zooms: 1.0 → 1.6 on the area that matters, eased, never during typing.
- Build the edit with HyperFrames (already in the plugin's video tools) or Resolve; export H.264 1080p60, about 12 Mbps, plus a 15 s vertical cut for posts.

## Before recording

- [ ] App build passes on the Neon run start to finish (timed)
- [ ] Deploy returns a working `vercel.app` link with `/api` routes answering
- [ ] Game build playable to a win and a loss
- [ ] `warm hold` not needed (all local), but InferHub routes checked the same hour
- [ ] Throwaway data dir set; notifications off; clock hidden
