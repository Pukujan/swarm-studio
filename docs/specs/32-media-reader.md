# 32. The media reader: the crew watches and listens

The owner, 2026-11-12: "i need audio reviewer too i have omni model in inferhub? or sometimes another multimodel with audio and video input", and "isnt there any in hermes for multimodal support".

Today a picture a person drops in the chat is read by the vision model, but a clip or a sound is "kept and marked not read" (spec 29). The crew also cannot hear its own films. This spec adds one reader that watches and listens. It reads what people give the crew, and it is the critic that checks the crew's own films (spec 26, step 6).

## What it does

### Two layers

1. **Always here, no new key.**
   - The pinned, checksum-checked ffmpeg (`engine/video.mjs` `videoTools`, catalog review point 7) samples frames from a clip: one just after each scene change, then an even spread, at most 10, 512 px across.
   - The reviewer's vision model looks at those frames.
   - The same ffmpeg measures the sound and picture with no model at all: integrated loudness and true peak (EBU R128), silences, black stretches, and the cuts in the picture.
2. **A media model that hears and/or watches.**
   - This is the `media` pick, beside planner, builders and reviewer. It uses the reviewer's endpoint and key.
   - A sound is sent as sound (`input_audio`, mp3).
   - A short clip is sent whole (`video_url`, data URL) to a model that takes video.
   - Otherwise the clip goes as frames plus its soundtrack in one call.
   - With no pick, the first tested model the endpoint offers is used (`MEDIA_PREFER`).
   - `off` sends no clip or sound to any model.

### Honest about what happened

Every read carries `says`, and the chat and the planner use those words:
- "watched the clip"
- "saw 9 frames of it and heard its sound (words and music)"
- "saw 9 frames of it; nothing here could hear its sound"
- "listened to it: words, music and tone"
- "not read: no model that hears is set"

"Not read" is never silent. A link to YouTube, Vimeo, TikTok, Instagram or Twitch is read as its page (title, description, words). The planner is told that "the video itself was not watched or heard". The video is not fetched: those sites' terms do not allow it.

### The person's media goes only to the model they chose

That is the media pick, or the reviewer's vision model for frames. Nothing else receives it.

## Limits and formats (`READ_LIMITS` in `engine/mediareader.mjs`)

| What | Limit |
|---|---|
| A file a person drops (spec 29) | picture 12 MB, clip 200 MB, sound 50 MB |
| Formats taken | clip: mp4, mov, webm; sound: mp3, wav, m4a, ogg (anything the pinned ffmpeg decodes) |
| Sent whole as video | at most 15 MB and 60 s; a longer or larger clip goes as frames plus sound |
| Frames from a clip | at most 10, 512 px wide, JPEG; scene changes first (score 0.3), then an even spread |
| Sound sent to the media model | the first 120 s, mono 16 kHz mp3 at 48 kb/s (about 360 KB a minute) |
| Longer than 15 minutes | still read, but only the first 2 minutes of its sound are heard |

## Which InferHub models passed (2026-11-12)

Tested with a 5 s spoken sentence over a hum (mp3) and a 5 s 640×360 clip of a red square sliding under the words "BLUE BICYCLE" with that sentence as its soundtrack (mp4). Formats tried:
- Audio: `input_audio` with base64 mp3, base64 wav, a data URL, and `audio_url`.
- Video: `video_url` with a data URL, and `file`.

| Model | Hears sound | Takes video | Hears a clip's soundtrack | Note |
|---|---|---|---|---|
| `mimotp/mimo-v2.6-flash` | yes (`input_audio` mp3) | no; frames as pictures, yes | n/a | Exact transcript and the hum. Three frames and the sound in one call: right object, colour, words and speech. Needs reasoning off, or the answer comes back empty. About $0.00001 a call. |
| `ali/qwen3.8-27b` | no | yes (`video_url`) | no | |
| `cb/minimax-m3` | no | yes | no | |
| `cb/kimi-k3` | no | yes | no | |
| `zai/glm-5.3-flash` | no | yes | no | It saw the square as striped. |
| `cbcn/kimi-k3`, `cbcn/kimi-k2.7`, `cbcn/minimax-m3`, `zai/glm-4.6v` | no | no | | They answered, but said no video reached them, or refused the format. |
| `ali/qwen3.8-omni-flash`, `alicn/qwen3.8-omni-flash`, `mimo/mimo-v2.6-flash`, `ocg/mimo-v2.5`, `ocg/mimo-v2.6-*` | **not tested** | **not tested** | | 402 `no_provider_under_bid`: the key's price cap (the account's budget) is below their ask. A per-request `x-max-*-price` header does not lift it. |
| `cb/gemini-3.1-pro` | | **not tested** | | 503: no free provider. |

No model that took video heard the clip's own soundtrack. That is why the reader sends a clip's sound as a separate part to a model that hears.

The same price cap also blocks `ali/qwen3.8-flash` on that key, and that is the reviewer model the dev server was started with. Until the budget is raised or the reviewer pick changes, pictures in the chat are read only by the fallbacks that are within the cap.

## In Hermes itself (checked in `~/.hermes/hermes-agent`)

- **Vision.** `vision_analyze` is a registered tool, reachable through `ctx.dispatch_tool`. `ctx.llm.complete` takes image blocks.
- **Video.** `video_analyze` is a registered tool. It sends the whole clip as a `video_url` data URL to Hermes's video or vision auxiliary model, capped at 50 MB.
- **Speech to text** (`tools/transcription_tools.py`: local whisper.cpp, OpenAI, Mistral, xAI) is not a registered tool. A plugin reaches it only through private imports (not allowed, catalog review point 1) or through the dashboard's `/api/audio/transcribe`.

So the plugin path has no "words only" transcript today. A voice note is heard by the media model, or not at all. When the catalog session's loopback proxy (review point 2) lands, `video_analyze` and `vision_analyze` can be routes beside the media pick; this spec does not add its own route.

## The critic: the crew checks its own film (`engine/filmcritic.mjs`)

It runs after every film, once `video:done` has handed the film over, so it never holds a film back. It writes `video/review.json` and sends `video:review`. The checks, each saying how it was made:

| Check | How | Fault when |
|---|---|---|
| black | ffmpeg `blackdetect`, 99.9% of pixels dark (a title card on black is not black) | 1 s or more |
| sound | the film has an audio stream with level | music was asked for and there is none |
| silence | `silencedetect` at -45 dB | 1.2 s or more inside the film, unless the storyboard planned a quiet passage there |
| level | EBU R128 | outside -24 to -9 LUFS, or a true peak above -0.3 dBFS |
| beat | cuts found in the picture (scene score 0.25), matched to the planned cuts, against the music's measured beat (`musiccut.analyse`) | fewer than 70% within 90 ms. It is not a fault, just "not checked", when the music has no clear beat or too few cuts could be found |
| voice | the media model transcribes the film's sound; that is compared with the script's words | under 60% of the script's words heard. "Not checked" with no model that hears |
| look | 8 frames to the media or vision model: blank, words cut off or too small, squashed pictures | any frame named |

## Where a person sees it (slice 2)

- **Settings › Crew › Media reader**: the model, or Off or None. Opened, it says where the media goes and what the model can take ("hears sound, sees frames of a clip"; "as its provider lists it, not tested here" for a model only the endpoint vouches for).
- **Setup › Models**: a Media line under Planner and Builders, with one note on what it takes. It has no test mark, because Setup's tiny call does not send media.
- **The film's chat**: after a film, one line, "checked by watching and listening: it plays clean" or "… N things to fix: …". It does not open the video panel.

## Not done yet

- **Fixing what the critic finds.** It names faults; it does not re-cut yet. The next slice: drop a black beat that is too long, raise or lower the mix to the level band, and re-cut once.
- **A game's sound.** `reviewFilm`'s measures work on any audio file, but `engine/game.mjs` belongs to the game session.
- **A direct link to an .mp4 or .mp3 file.** It is read as a page today; it should be fetched (public addresses only, size cap) and read like a dropped file.
- **The Hermes route** for `video_analyze` and `vision_analyze`. It waits for the catalog session's proxy.
