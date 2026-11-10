# 15. Prompt-driven films

The Film studio makes a film from one prompt. A model writes a fresh storyboard each time. The storyboard is checked, then rendered with HyperFrames and scored to its own cue sheet. The old video plans (promo, kinetic, slideshow, teaser, story) and a new trailer and calm film are only **starting points** the writer may borrow from. The prompt shapes the film.

## What the storyboard sets (`engine/storyboard.mjs`)

Each beat sets:
- its length, which is snapped to the score's half beat when there is no voice;
- its **layer** (story, proof or type);
- its kind: picture, split, mosaic, real footage, a black type card, black, quote, list, stat, open or closing card;
- its camera move (push-in, pull-out, pans, tilts, punch-in, drift, shake, hold);
- the cut into it (`hard` or a named transition);
- a caption with one accent word;
- the music cue from that beat on (pulse, build, full, hit, stop, drop, resolve, calm);
- the sound effects on its first frame.

The whole film also gets a working title, a pace, a look, the music's tempo, mood and instruments, and an optional cast for narration. A trailer is usually captions and music only.

`checkBoard` fixes or drops anything the renderer can't play:
- unknown pictures or footage, and repeats;
- out-of-range lengths and speeds;
- a missing closing card with the name.

The prompt's pace wins over the writer's: a fast prompt is retimed to cut about every 1.6 s, and a calm one to about every 4.6 s. Each run gets a new seed, and the seed adds two "twists" to the writer's prompt (for example a hard stop two thirds in, or the name held back to the end), so the same prompt twice gives two different cuts. `fallbackBoard` cuts one in the prompt's pace when there is no model.

## Style references (`engine/reference.mjs`)

The person can add an image, a video or a sound file with **＋** beside the prompt, or paste a website or web-game link into the prompt. Each reference is measured:
- palette, from the pixels;
- cut rhythm, from ffmpeg's scene changes;
- tempo, silences, drop and loudness shape, from the audio;
- colours, fonts and motion, from the page's CSS.

A model (the reviewer's vision model when there is one) then turns those measurements, plus a few frames, into style words. These are: palette, type, pacing, cut rhythm, camera, motion, mood, and the music's tempo, instruments and structure.

**Nothing is copied.**
- No frames go into the film, no melody goes into the score.
- The page's own words are never sent to the model.
- `scrub` strips every name the reference brought (its title words, its host, the file name) and any quoted line.

The notes are saved as `video/style-notes.json` with the run and shown under **Style** in the panel. They steer:
- the storyboard;
- the painted stills (mood and palette);
- the score (tempo and instruments);
- the film's accent colours.

## Pictures and footage

- **Story shots** are the build's pictures, or new stills the Studio paints for the beat (`shot`), with camera motion. Every story beat's still and a motion line go into `video/flow-prompts.json`. When the `flow-video` skill animates a still into `<run>/flow/<still>.mp4`, the next cut plays that Veo clip in place of the still.
- **Proof shots** are real captures of the build (`engine/footage.mjs`). A long take sped up for its beat is really sped up with ffmpeg, and it wears the `8×` chip.

## Sound (`engine/score.mjs`)

The score follows the cue sheet:
- sections that swell or settle;
- booms on hits and on the drop;
- true silence in a hard stop;
- the beat's effects: hit, boom, riser, whoosh, tick, glitch, sting, chime, heartbeat.

With an ElevenLabs key, ElevenLabs writes the music (from tempo, mood, instruments and the timed shape, never from a reference's melody) and the effects. The key is `ELEVENLABS_API_KEY`, an optional secret in `plugin.yaml`. Hermes's secret scope hands it to the launcher, and the launcher passes it to the server as `SWARM_ELEVENLABS_KEY`. It is never read from a file. If ElevenLabs fails, the studio scores the film itself.

## Done when

One prompt like "a fast-paced movie trailer for our launch, scary but cute", plus an optional reference, makes a varied film in the Studio. The storyboard (beats with length, camera and cue) and the style notes are visible in the panel. `storyboard.json` keeps the prompt, the notes, the fixes the check made and every beat.

## Outside services: Hermes first, a key second, built in last

Music and effects (ElevenLabs), moving clips (Veo and other video models) and pictures
(image models) are each optional. `engine/media.mjs` decides where each comes from; the
first match wins:

| Service | 1. Hermes already has it | 2. A key pasted in the Film panel | 3. Built in |
|---|---|---|---|
| Music | `ELEVENLABS_API_KEY` in Hermes's secret scope (launcher.py), or Hermes's ElevenLabs MCP connector (`elevenlabs`), granted with one press | ElevenLabs key, checked against the API | the code-written score |
| Clips | a signed-in Hermes video provider plugin (`videogen.py`: FAL with Veo 3.1, xAI, OpenRouter, DeepInfra) | FAL key, which signs in Hermes's own FAL plugin | painted stills with camera moves |
| Pictures | a signed-in Hermes image provider (`imagegen.py`: Codex, FAL, xAI…) | FAL key, as above | the build's own art |

- Pasted keys are kept in `media-keys.json` (mode 0600) in the data dir. The canvas only
  learns where each service comes from (`GET /api/media`), never a key.
- `POST /api/media/key {service, key|null}` pastes or forgets a key;
  `POST /api/media/allow {name}` adds Hermes's ElevenLabs connector to the plugin's MCP allowlist.
- The helpers load Hermes's provider keys with Hermes's own loader, inside their own short-lived process.
- A cut animates at most 3 story stills (4 s, or 8 s for a long beat) into `<run>/flow/`,
  so a clip is paid for once and reused by later cuts. Clips made with Flow by hand go
  in the same folder. The Clips box in the Film panel turns this off.
- In the Film panel, three chips (Music, Clips, Pictures) say where each comes from. Pressing one
  shows its source, or a key field and a "Get a key" link.
