# 39. Story

The owner, 2026-11-12:
- "i wish instead of just these visuals it always tried to tell a story … when posting to feed, maybe
  automatically try to summerize and show based on what it is, if its for marketing, for about me … and show
  it here visually automatically so its automated tiktok or story contents they can also directly share from
  inside studio or from here to their social media as well and its ready for mobile view or desktop view …
  and also makes video and its all shown in overview as well"
- On sharing: "we are not gonna post, the users themself have to connect and do it" and "there is button for
  them to connect and post".

A build tells its story: five to eight beats, each a designed card in the project's own colours and type,
in three shapes, shown on the Overview, posted to the Feed as a story, and ready for each network. The Story
film (spec 26, video-director) renders the same beats.

## The beats: one format

`runs/<id>/story.json`, written by `engine/story.mjs`, read by the cards, the Overview, Post to Feed, the
launch kit's captions and the Story film:

```js
{ v: 1, run, type: 'launch' | 'about' | 'walkthrough' | 'trailer' | 'event' | 'making',
  name, url,                       // url: the real published https address, else null
  brand: { bg, text, accent, ink, heading, body },   // from the build's theme (the project's brand)
  beats: [{ id: 'b1', role: 'hook' | 'what' | 'who' | 'moment' | 'making' | 'next',
            kicker, headline, line,                    // ≤ 32, ≤ 60, ≤ 140 characters
            picture: { kind: 'image' | 'screen' | 'clip', src, page } | null,
            seconds, say }],
  edited, t }
```

- **image** is art painted for the build (`/img/<run>/…`); **screen** is a page of the build (`page` is its id),
  shot from the newest export; **clip** is footage (the film's, later).
- The first beat is always the hook and the last is always next (where to go).

## The types

Picked from what the project is, switchable on the Overview:

| Type | When | Beats |
|---|---|---|
| Launch | the default for a site | hook, what, who, moment, moment, how it was made, next |
| About me | a portfolio, a person's own site | hook, what I do, work, work, who I work with, next |
| Walkthrough | an app | hook, what, three screens, who, next |
| Trailer | a game | hook, moment, moment, what, moment, next |
| Event | a festival, a gig, tickets | hook, what, who, moment, next |
| How it was made | asked for | hook, what, two making beats, moment, next |

A **who** beat with nothing known about who it is for becomes one more moment, never an empty card.

## What it is written from

- The project's brand (spec 37, `projects/<pid>/brand.json`, else the chat's brand sheet, spec 31): what it is,
  who it is for, its voice.
- The build: its pages with their own first heading and the line under it, its pictures, its theme, the live
  link.
- The planner writes the beats (one call through Hermes's model, `storyPrompt`); with no model, or an answer
  that fails the check, rules write them. There is always a story.

## The check (`checkStory`)

Every story passes it, the model's, the rules' and every edit by the person:
- Never the person's words to the crew: anything that sounds like an instruction ("do u wanna grill me
  first") or repeats six of the prompt's words in a row is rewritten from the build.
- No counts of zero, no "0 reviews".
- "is live", "launched", "available now" only when there is a real published https link.
- Pictures only from this build. A number the model made up becomes the next unused picture.
- 5 to 8 beats; a hook first and next last are added when missing; lengths clipped.

## The cards

`engine/storycards.mjs` draws each beat as HTML and photographs it with the puppeteer-core and Chrome the page
shots already use (no new browser). With no browser, PIL draws a type card.

| Shape | Size | Layout |
|---|---|---|
| tall | 1080 × 1920 | picture on top (a screen sits in a phone), words below, story ticks at the top |
| wide | 1920 × 1080 | words left, picture right (a screen sits in a browser window) |
| square | 1080 × 1080 | picture on top, words below |

- Laid out for each frame, not one card shrunk. Words never sit on a picture. A beat with no picture is a
  type card.
- The heading and body fonts are the brand's (Google Fonts), the colours the brand's tokens.
- A card is drawn again only when what it shows changed: an edit redraws one beat.
- Saved as `runs/<id>/story/<shape>-<beat>.jpg`; the page shots it used in `story/screens/`.

## Routes (`server/story.mjs`)

- `GET /api/runs/:id/story` → `{ story, cards, types, shapes }` (404 before one is written).
- `POST /api/runs/:id/story { type? }` writes it (again) and draws the cards.
- `POST /api/runs/:id/story/edit { op }`: `reword { beat, kicker?, headline?, line? }`,
  `picture { beat, picture }`, `move { beat, by: ±1 }`, `order { order: [ids] }`, `type { type }`.
- `GET /api/runs/:id/story/<shape>-<beat>.jpg` and `…/story/screens/<page>-<desktop|phone>.jpg`.

## On the Overview (slice 2)

A **Story** lane: the cards in a row, a shape switch (Phone, Desktop, Square) and the type. Clicking a card
opens it in the inspector: reword, swap its picture (the build's own pictures and screens), move it earlier
or later. The launch kit's captions are written from the story.

## To the Feed (slice 3)

Post to Feed sends the story with the post: the beats as text and the cards in the three shapes, inside the
Feed's 8 MB limit (tall first; wide and square dropped first if it would not fit). A Feed post is then a
story you tap through, not a pile of pictures.

`feed.py` `story_of` adds one field to the `POST /api/feed/builds` body:

```
"story": {
  "type": "launch",                       // launch | about | walkthrough | trailer | event | making
  "beats": [{ "id": "b1", "role": "hook", "kicker": "", "headline": "Meet Saffron & Smoke", "line": "…" }, …],
  "cards": {                              // one JPEG data URL per beat, in beat order; a shape may be missing
    "tall":   ["data:image/jpeg;base64,…", …],   // 1080 × 1920
    "square": [ … ],                              // 1080 × 1080
    "wide":   [ … ]                               // 1920 × 1080
  }
}
```

5 to 8 beats; roles `hook` first and `next` last; kicker ≤ 32, headline ≤ 60, line ≤ 140 characters. The
cards are kept under 3 MB before encoding (about 4 MB in the body), phone first, then square, then wide; a
shape that would not fit is left out whole, never cut part-way. A Feed that refuses the field (400, 413 or
422) gets the post again without it, then without page shots, as before.

What the Feed shows: the tall cards as a story you tap or swipe through on a phone (the hook first), the
wide cards on a desktop (square where wide is missing), and the beats as the words under it and for
screen readers (each card's `alt` is its headline and line). A post without `story` shows as today.

## Sharing to networks (slice 4)

Nothing is ever posted without the person's own press, on their own account.

What works now, with no app approval from anyone:
- Per network, the caption written from the story and the card or film in that network's shape.
- **Share**: X, Threads and Bluesky open their own compose page with the caption; LinkedIn opens its share
  page with the link. The person presses Post there.
- On a phone, **Share** hands the card itself to the phone's share sheet (Web Share with files), so it goes to
  Instagram or TikTok through their own apps.
- **Download** the card or film.
- Discord, Slack and Telegram: through Hermes's gateway, as the launch kit does today, after the person
  confirms the exact text.

**Connect** and **Post** appear only for a network that is actually connected. No network is connectable
until the owner registers an app with it (below); until then neither button is shown.

### What each network needs before Connect and Post can exist

Not yet checked against each network's current developer documentation; scopes, review steps and limits
change, so confirm each row before registering.

| Network | API | What we must do first | Limits worth knowing |
|---|---|---|---|
| X | API v2 `POST /2/tweets`, media upload | A developer account and an app with OAuth 2.0 (PKCE), scopes `tweet.write`, `users.read`, `media.write`. Paid access tiers for any real volume. | Posting is metered by tier; video needs chunked upload. |
| LinkedIn | Posts API (`/rest/posts`), Images and Videos APIs | An app tied to a LinkedIn Page, the self-serve "Share on LinkedIn" product, scope `w_member_social`. | Member posts only, not a company page, without Marketing API approval. |
| Instagram | Instagram API with Instagram Login, content publishing | A Meta app, the person's Business or Creator account, scope `instagram_business_content_publish`, Meta App Review. Media must be at a public https URL Meta can fetch. | No personal accounts; about 50 published posts a day per account; Reels for video. |
| TikTok | Content Posting API (Direct Post, or Upload to the person's inbox as a draft) | A TikTok developer app, scopes `video.upload` (draft) or `video.publish`, and TikTok's audit before posts can be public. | Unaudited apps post as private only; the draft route leaves the final Post in the TikTok app, which suits "the person presses Post". |
| Bluesky | AT Protocol `com.atproto.repo.createRecord`, blob upload | Nothing to register: the person signs in with atproto OAuth (or an app password). | Images up to about 1 MB each, four per post; video supported. |
| Threads | Threads API (`threads_content_publish`) | A Meta app, scopes `threads_basic` and `threads_content_publish`, Meta App Review. Media at a public URL. | About 250 posts a day per profile. |

The decision is the owner's. The cheapest real Connect is Bluesky (no registration) then TikTok's draft
route (the person still presses Post in TikTok). The tokens would live with Hermes, never in the browser.

## Slices

1. The beats, the check, the cards and the routes (this PR), with `tests/story.test.mjs`.
2. The Story lane on the Overview, editing, and the launch kit's captions from the story.
3. Post to Feed carries the story; the Feed shows it (Feed session).
4. Per-network share: caption, shape, Share, Download; Connect and Post only once a network is connected.
