# 40. The Video kit, films with no website, and the Story film

The owner, 2026-11-12: "they can either use the branding + mood board itself to directly create video/motion design from it skipping website entirely". Spec 37 gives every kind one kit module on the Studio board; this is the Video kit's half, and what the film job needs to make a film from a brand plus References and Assets, with no build behind it.

## What a person gets

1. **The Video kit on the board** (`web/kit-video.js`, spec 37's contract). Its sections:

   | Section | What it holds |
   |---|---|
   | Script | The film as beats, one line each |
   | Storyboard | One small frame per beat: a Reference or Asset, a picture to paint, or none (a title card) |
   | Music | A dropped track from References or Assets, or a mood in words |
   | Voice | Who speaks, the tone, one sample line; or no voice |
   | Look | The project's brand (spec 37); nothing to set here |
   | Length and shape | About how many seconds; tall, wide or square |

   Where to start: **Opening shot**, **Storyboard** or **Music**. The draft is saved to the project (`GET|PUT /api/kit/video/:pid`, `projects/<pid>/kit-video.json`); a new one starts from the build's story beats when there are some. Lock writes the kit into the spec (`spec.kits.video`). Build makes the film. The critic checks the result against it.
2. **A film with no website.** The same director, music cut, renderer and critic, fed by the kit instead of a built site.
3. **The Story film.** Every build can tell its story in 5 to 8 beats, written once and used for cards, film and captions. It renders as a short film cut to music in tall, wide and square.

Swarm never posts. The film is made ready; the person connects their own account and presses Post.

## The kit as data (`engine/filmkit.mjs` `checkKit`)

```
{ beats: [{ text ≤90, say ≤140, frame, seconds 0.6–9 | null }]   at most 16
  music: { file: <Reference or Asset id> | null, mood }
  voice: { who, tone, sample } | null
  seconds: 6–90 | null
  shape: tall | wide | square            (wide when unsure)
  start: opening | storyboard | music }
```

A frame is `{ item: <id> }` (a Reference or Asset), `{ picture: n }`, `{ clip: n }`, `{ paint: '…' }` or null. Anything else is dropped, never refused.

`kitBoard` turns it into the director's storyboard without asking a model: a clip frame stays a clip, a picture becomes an image beat (split when the line is long), a paint frame is a shot to paint, no frame is a title card. It always closes on the brand's name. The pace comes from the seconds per beat. The board then goes through the same `checkBoard` as a planned film.

## A film from a brand (`server/film.mjs`)

`POST /api/projects/:pid/film { kit?, story?, shapes? }` → `{ run, state }`.

- The source is the project's brand (`projects/<pid>/brand.json`, its theme through `brandTheme`), its References (`refs`, "like this") and its Assets (`assets/index.json`, "use as given").
- It makes a run folder like any build's. `events.jsonl` starts with `run:start { kind: 'film', project }`, the theme, and `film:source` (what `brandSource` made). The pictures and clips are copied into the run's `img/`, and a music reference to `video/music.<ext>`.
- The film job reads `film:source` instead of a build's pages. A film run needs no `layer:done`.
- A music reference is the score (`scoredBy: 'reference'`); no music is generated. The cuts land on its beat (`cutToMusic`).

## The Story film reads the story (spec 39)

The story is build-seo's: `engine/story.mjs` writes `runs/<id>/story.json` once (`{ v, type, name, url, brand, beats: [{ id, role, kicker, headline, line, picture: { kind: image|screen|clip, src, page }, seconds, say }] }`), and the cards, the captions and the film all read it. The film never rewrites its words.

- `checkStory` in `engine/filmkit.mjs` reads that file as it is, and also a shorter shape (`text`, `sub`, `pic`) for a story passed inline.
- Pictures: `/img/<run>/<file>` is the run's `img/`; a screen with only its page is the Story cards' shot (`story/screens/<page>-desktop.jpg`); `refs/<file>` is a Reference; a clip plays as footage, sped up for How it was made.
- Each type has its pace, voice and music:

| Type | Pace | Voice | Music |
|---|---|---|---|
| Launch | medium | no | bright, confident, building |
| About me | calm | yes | warm, personal, light |
| Walkthrough | medium | yes | clean, steady, modern |
| Trailer | fast | no | driving, tense, big hits |
| Event | medium | no | upbeat, festive, punchy |
| How it was made | fast | no | playful, quick, ticking |

- The last beat (`next`) and the story's `url` become the closing card, with the name on it.

`POST /api/runs/:id/video { story: true, shapes: ['wide', 'tall', 'square'] }` cuts a built run's story. The film route takes a story inline too.

## Square

`SHAPES.square` is 1080 × 1080, `promo-square.mp4`. The words are set at 0.6 of the wide size. It renders after the tall cut and takes the wide cut's sound.

## The critic checks the lock

When the storyboard carries `locked: { seconds, script }`, `filmChecks` adds two checks:

| Check | Fault when |
|---|---|
| length | more than 3 s or 25 % off the length asked for |
| script | a locked line is not in any scene's headline, sub or spoken line |

## Not done yet

- **Hearing the music reference.** The media reader (spec 32) could describe a dropped track's mood and tempo before the cut. Today the mood is the person's words.
- **Footage from the replay** for How it was made. A replay picture with no file becomes a title card.
- **A Story film button.** The route is ready; the press belongs on the Story lane (build-seo) or the scaffold.
