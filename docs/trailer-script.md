# Trailer script: "There isn't one."

The demo video, cut as a fast movie trailer, under 90 s (we end at 88 s). It tells one person's story, with the product proof as fast cuts between its beats. It follows [demo-video.md](demo-video.md) and the pitch in [brand/PITCH.md](brand/PITCH.md). The hero is Teodor from [brand/stories-swarm-studio.md](brand/stories-swarm-studio.md).

## The music: "No Limits" by ArcticFoxMusic

Free to use with credit. The X post must carry: `Music: No Limits by ArcticFoxMusic – https://youtu.be/ypGySPBoOIg`.

We picked it over "High Impact" and "Breakthrough" after measuring all three:
- **No Limits** has a breath in the middle (it falls away at 45.5 s, lowest at 47 s) and a drop at 48.5 s. Our story needs exactly that: the silence before he presses Play, then the game.
- It also has a dip at 81 to 83.5 s before a final hit at 84 s, which is the couch and then the end card.
- **High Impact** builds once and stays loud from 40 s to the end, with no place for the silence.
- **Breakthrough** is loud almost all the way through.

What the track does, in seconds:

| Time | The track |
|---|---|
| 0.5 | opening hit |
| 2.5–4.0 | falls quiet |
| 4.5 | second hit, then a quiet bed to 12 |
| 12.5, 16.5, 20, 22.5, 24.5, 26.5 | hits that come faster and faster |
| 27–45 | full and driving (accent at 32.3) |
| 45.5–48.3 | **the breath** (we duck it to near silence) |
| 48.5 | **the drop** |
| 48.5–80.5 | full to the end |
| 81–83.5 | dip |
| 84.0 | **final hit** |
| 85–88 | we fade it out |

## Two layers, never mixed

- **Story layer (Google Flow / Veo):** only the people and the crew as characters, in their world. These shots never show a product screen, so no generated shot passes for the plugin working. A laptop screen in a story shot is plain light.
- **Proof layer (screen capture):** every product claim is real footage of the plugin in Hermes. A sped-up shot carries the `8×` chip.

The crew painted its own trailer: every Flow start frame is a still made by the Studio's image model, in one painted style.

## The cut

Cut on the hits. Captions follow [brand/BRAND.md](brand/BRAND.md): one line, one yellow accent word, in and out in 150 ms.

| Time | Layer | On screen | Caption / sound |
|---|---|---|---|
| 0.0–4.5 | Flow E0 | The sleeping town, one warm window. On the 0.5 hit, cut in closer. | *"His daughter keeps asking to play his game."* |
| 4.5–8.5 | Flow F1, E1 | On the hit: Teodor at the kitchen table, tired. Then the sketchbook of the mole. | *"There isn't one."* |
| 8.5–12.5 | Proof | A real terminal agent session, walls of text, one file at a time. Three hard cuts. | **"Agents are built for developers."** |
| 12.5–16.5 | Flow E3 | On the hit: Hermia's close-up, baton glowing. | *"Meet the crew."* Courier "hello" chirp. |
| 16.5–20 | Flow E4, F2 | On the hit: the couriers' goggle eyes blink; they lift off the rail. | Wing flutter. |
| 20–22.5 | Flow E5 | On the hit: the couriers pour out of the hatch into the stars. | Swarm whoosh. |
| 22.5–24.5 | Flow E6 | On the hit: they fly toward his lit window. | — |
| 24.5–26.5 | Flow B1 | On the hit: past his shoulder, they dive into the glowing laptop. | — |
| 26.5–27 | Flow B2 | On the hit: a courier turns into gold pixels... | — |
| 27–29 | Proof | ...**match cut**: the gold pixels land as the crew's real cursors on the canvas in Hermes. The `/swarm` prompt typed. | **"One prompt."** |
| 29–45.5 | Proof montage | About 1 s each, on the beat: Hermia's site map; cursors over four pages; a code check flags, a courier fixes; `make the hero warmer` and every page changes; the art wall filling; the app on a phone and the order in `/admin`; the film; the posts. On the 32.3 accent, the real counters (agents, pages, time). | **"Watch."** **"Steer."** **"Ship."** on hits. Courier babble under it. |
| 45.5–48.3 | Flow F3, E2 | The breath. Close on Teodor leaning in; his finger over Enter. | *"Heavier. Like his bag's full of letters."* The Enter click at 48.3. |
| 48.5–58 | Proof | **The drop:** the real game, a dodge, a hit, a room cleared. | **"And the game."** Boom. Game sound up. |
| 58–70 | Proof, chain reaction | Faster and faster, a courier flying through the frame between builds: the big game's fight; the play test catching a blank screen and fixing it; the same game as a Godot project (the zip); a second game in a new style; the grill-me interview; the Swarm Wall, four launches at once. | **"One build. Then the next."** |
| 70–81 | Proof | Post to Feed; a remix appears with "remix of" and the crew credited. Then Hermes: the plugin pane, `hermes swarm`, the Feed's MCP tools. A fast wall of who it's for (designers, game makers, studios, marketers, students, Godot · Unity · Unreal), each marked *live* or *next*. | **"Built out of Hermes."** **"For everyone who makes things."** |
| 81–84 | Flow F4, E7 | The dip: his daughter on the couch, laughing, playing his game. Teodor behind her. | No caption. Courier giggle. |
| 84–88 | Flow E8 → end card | On the final hit: Hermia salutes on a rooftop; cut to her mark, the "SWARM *Studio*" lock-up, the Feed URL and the repo URL. | **"A whole creative studio, inside Hermes."** Cheer. Music fades from 85. |

If the montage runs long, drop the second game first, then the grill-me shot.

## Flow shots

All are image-to-video from Studio-painted stills (`~/dev/projects/video-studio/output/flow/stills/swarm-trailer/`), with the `still-relief` template: a locked-off camera, one continuous shot, small motions only. Only 1 to 4 s of each 8 s clip is used.

| Shot | What | Used at |
|---|---|---|
| E0 | the sleeping town, one lit window | 0.0 |
| F1 | Teodor tired at the kitchen table | 4.5 |
| E1 | the sketchbook of the mole | 6.5 |
| E3 | Hermia close-up, baton glowing | 12.5 |
| E4 | three couriers blinking on the rail | 16.5 |
| F2 | Hermia raises the baton, the couriers lift off | 18 |
| E5 | the couriers pour out of the hatch | 20 |
| E6 | the couriers fly to his window | 22.5 |
| B1 | the couriers dive past his shoulder into the laptop | 24.5 |
| B2 | a courier turns into gold pixels | 26.5 |
| F3 | close on Teodor leaning in | 45.5 |
| E2 | his finger presses Enter | 47.5 |
| F4 | the couch, his daughter playing | 81 |
| E7 | his daughter laughing | 82.5 |
| E8 | Hermia salutes on a rooftop | 84 |
| B3, B4 | couriers carrying glowing tiles; Hermia conducting | spare, for the chain reaction |

## Sound

The music is No Limits, with the breath ducked to near silence from 45.5 to 48.3 and a fade from 85 s. The effects (ElevenLabs, ours) sit on top:
- courier chirps, babble, cheers and a giggle;
- wing flutters and swarm whooshes;
- the Enter key click;
- a boom on the drop.

No narration: captions and music carry it, so it also plays muted on a feed.

**15 s vertical cut:** 8.5–12.5 (the problem), 26.5–29 (the match cut), the montage at double speed, and the end card.
