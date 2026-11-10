# Trailer script: "There isn't one."

The demo video cut as a fast movie trailer, under 88 s. It tells one person's story, and the product proof is fast cuts between the beats. It follows the beats in [demo-video.md](demo-video.md) and the pitch in [brand/PITCH.md](brand/PITCH.md). The hero is Teodor from [brand/stories-swarm-studio.md](brand/stories-swarm-studio.md).

## Two layers, never mixed

- **Story layer (Google Flow / Veo):** only the people and the crew as characters: Teodor, his daughter, Hermia and the couriers in their world. These clips never show a product screen, so nobody mistakes a generated shot for the plugin working.
- **Proof layer (screen capture):** every product claim is real footage of the plugin in Hermes, as [demo-video.md](demo-video.md) says. A sped-up shot carries the `8×` chip.

**Dogfooding:** the Flow start frames are painted by Swarm's own crew. One Studio run makes the storyboard stills ("Teodor at a kitchen table at night, laptop glow, sketchbook of mole drawings", in the build's named art style), and Flow animates them. That can be one more line of the trailer: the crew drew its own trailer.

## The cut

Music: one track that builds, with a hard stop at 0:40 and a drop at 0:42. Cuts land on the beat. Captions follow [brand/BRAND.md](brand/BRAND.md): one line, one yellow accent word.

| Time | Layer | On screen | Caption / sound |
|---|---|---|---|
| 0:00–0:05 | Flow **F1** | Night kitchen. Teodor's face over a laptop; a sketchbook of mole drawings at his elbow. | *"His daughter keeps asking to play his game."* |
| 0:05–0:08 | Proof | A real terminal agent session, walls of text scrolling, one file at a time. Three hard cuts. | *"There isn't one."* Music: low pulse. |
| 0:08–0:11 | Proof | Black, then type on: | **"Agents are built for developers."** |
| 0:11–0:14 | Flow **F2** | Hermia raises one hand; the couriers lift off around her, gold trails. | *"Meet the crew."* Music: first hit. |
| 0:14–0:17 | Proof | Hermes Desktop: `/swarm`, the prompt typed in one take. | **"One prompt."** |
| 0:17–0:40 | Proof, montage | About 1 s each, cut on the beat: galaxy → orbit; Hermia's site map; crew cursors over four pages; a code check flags, a courier fixes; `make the hero warmer` and the colour changes everywhere; the app code wall at `8×`; a ticket bought on a phone and the order in `/admin`; the art wall filling; the Film studio; the posts as cards; the game card's **Godot** zip link. | Speed ramps up. Captions flash: **"Watch."** **"Steer."** **"Ship."** Last frame: the real agent count, page count and time from this run. |
| 0:40–0:42 | — | Hard stop. Black. Silence. | — |
| 0:42–0:46 | Flow **F3** | Close on Teodor leaning in, the screen's glow on his glasses, his finger going to the key. | *"Heavier. Like his bag's full of letters."* |
| 0:46–0:56 | Proof | He presses Play (cut on the key): 10 s of the real game: a dodge, a hit, a room cleared. Game sound up. | Music drop. **"And the game."** |
| 0:56–1:04 | Proof | The five makers' work, 1.5 s each, from real builds: a pixel artist's game, a hot-sauce brand site, a student's portfolio, a skate night's ticket app, a designer's client site. | **"For everyone who makes things."** |
| 1:04–1:14 | Proof | Post to Feed; the card appears; a remix appears with "remix of" and the crew credited. Then Hermes' plugin pane, `hermes swarm` in a shell, the Feed's MCP tools. | **"Built out of Hermes."** **"Every build credits its crew."** |
| 1:14–1:18 | Proof | The road as three quick cards, each marked *next*: Hermes Marketplace · Godot, Unity, Unreal · any tool Hermes can reach. | **"Day one."** |
| 1:18–1:23 | Flow **F4** | The living room. His daughter on the couch with the laptop on her knees, Teodor behind her, watching. | No caption. Music resolves. |
| 1:23–1:28 | — | Hermia's mark, the "SWARM *Studio*" lock-up, the Feed URL and the repo URL. | **"A whole creative studio, inside Hermes."** |

Total: 88 s. If a beat runs long, cut the 0:56 makers' row first.

## Flow shots

All four are image-to-video from a still the Studio paints, so the faces match across shots. Each uses the prompt rules in the `flow-video` skill: a locked-off camera, one continuous shot, small motions only, and nothing appears or changes shape. Only the first 3 to 5 s of each 8 s clip are used.

| Shot | Start still | Motion (the template's `action`) | Keep |
|---|---|---|---|
| **F1** | Teodor at a kitchen table at night, laptop glow on his face, a sketchbook open beside him | He rubs his eyes and looks back at the screen. | The same laptop and sketchbook stay put. |
| **F2** | Hermia in her command deck, couriers resting on a rail behind her | She raises her right hand; the couriers lift off the rail together. | Hermia stays in place; the room stays the same. |
| **F3** | Close on Teodor's face, screen glow on his glasses | He leans in slightly and a small smile starts. | Same face, glasses and shirt. |
| **F4** | His daughter on a couch with a laptop on her knees, Teodor out of focus behind her | She laughs and grips the laptop; he smiles. | The laptop stays on her knees. |

**Cost:** 4 clips × 20 credits (Veo 3.1 Fast) = 80 credits, plus about one retry per two clips. Run `node flow/doctor.mjs` (free) first; nothing is generated until you OK the batch.

**Fallback with no credits:** use the painted stills as slow push-ins (Ken Burns) in the edit. The trailer still works.

## Narration

None. Captions and music carry it, so it plays muted on a feed. A 15 s vertical cut uses 0:05–0:08, 0:14–0:17, the 0:17–0:40 montage at double speed, and the end card.
