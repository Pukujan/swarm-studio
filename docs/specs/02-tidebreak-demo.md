# 2. Tidebreak demo run

## Goal

One Auto prompt that shows everything the studio can do, and runs every step end to end. Its result is what we show in the demo video and use for the hackathon thumbnail.

## The prompt

> Tidebreak — an original fast top-down action roguelike: a tide-witch escapes a drowned lighthouse city. Dark teal and gold painterly style. Trial page with a deep parallax hero of the sunken city, trailer, a showcase of sea-spirit blessings, launch-week events with playtest tickets, a founder's edition, and /play with the playable trial: dash, attack and a charged wave special, 6–8 rooms with blessing choices and a shop, three enemy types and a two-phase Lighthouse Keeper boss, screen shake and hit-stop, a shard hub for permanent upgrades, and a leaderboard.

## What a good result looks like

| Step | What we expect |
|---|---|
| Design | About 5 pages: Home (the trial), Blessings, Events, Founder's Edition, Press. The home hero has **5–6 parallax layers**, generated as separate images (sky, far towers, mid ruins, near debris, foreground drift) that move with scroll and the pointer. |
| Images | 20 or more generated images. Auto waits until the image queue is empty before moving on, as it already does. |
| Review | Every page is reviewed and the fixes are applied. |
| Video | A 20–30 s promo built from the hero images and the prompt. |
| App | Events with ticket tiers, wishlist sign-up, founder's edition orders, `/admin`. |
| Games | Big mode (spec 1): Tidebreak on `/play`. |
| Shop | The $2 = 20 credits demo checkout, labelled as fake. |
| Data | The Supabase connector reuses or makes a **free** `swarm-studio` project. Orders, sign-ups and scores are stored in `swarm_records`. |
| Deploy | A live Vercel link where every page and `/api/scores` returns 200. |

## Checks after the run

- [ ] The parallax hero moves smoothly, with no layer missing and no white gaps at the screen edges.
- [ ] One full game run is played by hand, from the first room to the boss, and the score shows up on the leaderboard (stored in Supabase).
- [ ] The demo purchase adds 20 credits and leaves a `demo_txn_…` row in Supabase.
- [ ] The total time and each step's time are recorded for the video script ([demo-video.md](../demo-video.md)).
- [ ] Screenshots: the canvas mid-build, the code wall, the finished home page, and gameplay.

## Before recording

- Keep the VPS services warm if any demo step depends on them (`warm hold`).
- Run Auto once more on the final build, so the video shows a clean run with no failed steps.
