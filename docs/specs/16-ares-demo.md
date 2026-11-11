# 16. ARES: the flagship demo

## The idea

One original game, and Swarm Studio builds everything around it: the game, its website, its player app, its trailer and its launch posts. One product shows the whole engine. The game is a fast first-person arena shooter. Its bosses are members of the Nous Hermes hackathon Discord, and Jev plays through them on camera. The trailer cuts it like a superhero blockbuster.

Why this one: the earlier demos (the Atelier Nord portal and the Tempo launch) prove the studio works for professionals. ARES shows the studio's ceiling. It is a real 3D game on a real GPU, on Windows, with a full launch around it, and its trailer lands in front of the people who judge the hackathon.

## The game

**ARES** (the Olympian god of war: Hermes's swift messenger storms the war god's arena, where the community bosses are his champions) is a fast first-person arena shooter boss rush, built in Godot 4 on the Windows PC (RTX 4060).

- **Look:** anime, cel-shaded with thick ink outlines. Fiery red, orange and gold on dark. Kills burst into stylized ink splashes, never gore. No blue, purple or green as the main colours.
- **Hero:** "Design Bakery", in winged sandals (the dash and double jump are Hermes's speed). Jev pilots the hero, and first person needs no animated hero model.
- **Movement:** high speed, a dash with two charges, a double jump, jump pads and grab bars on vertical arenas. Standing still gets punished.
- **The resource loop** (the core):
  - **Stagger:** damaged enemies reel and flash gold.
  - **Finisher → health:** melee a staggered enemy for a short close-up kill with hit-stop. The player can't be hurt during it, and the enemy bursts into ink and health orbs.
  - **Rip → ammo:** a heavy fuel-limited rip attack makes enemies drop ammo. Ammo stays scarce on purpose.
  - **Fire burst → armor:** burning enemies drop armor shards.
  - **Power punch:** each finisher charges one area blast that breaks shields.
  - **Weapons:** 3 of them (rapid, burst and a charged heavy shot). A quick swap gives a short damage boost.
- **Bosses:** a ladder of community members, by Discord handle only. Each boss is an original anime character with the handle as its name tag. Themes come from the channel's running jokes and stay affectionate, with nothing about anyone's health, money or job. The whole roster lives in one `bosses.json`, so anyone can be renamed or removed in one edit.

  | # | Handle | Title | Fight |
  |---|---|---|---|
  | 1 | Lokee | (theme picked in build) | |
  | 2 | salt555 | (theme picked in build) | |
  | 3 | flownium | YES SIR | a charging rush |
  | 4 | MikeMonty | Needs a Beating | a tanky brawler |
  | 5 | GhostBear | The Ghost | phases in and out |
  | 6 | HotDawg | The Discount | fires 80%-off price tags |
  | 7 | UKG | Three-Business Tycoon | splits into three copies |
  | 8 | rahlquist | The Slow Clanker | a robot with a long wind-up and a huge hit |
  | 9 | Adolan | (theme picked in build) | |
  | 10 | Nicho | The Microfreak | 25-key synth; sound waves fire in key patterns |
  | 11 | Suzu | The Bell | chime shockwaves in rings, calm and graceful |
  | 12 | LocutusOfTheEye | The Eye | a giant floating eye with sweeping gaze beams |
  | 13 | sovthpaw | The Moderator | a timeout hammer freezes the player; an on-topic shockwave |
  | 14 | **Teknium** | **The Hermes Architect** | the final boss: a winged messenger who summons glowing model checkpoints; the biggest, most flattering fight |

- **Boss craft:**
  - **Phases:** each boss changes at 66% and 33% health.
  - **Telegraphs:** heavy attacks wind up big and readable.
  - **Weak points:** 1–2 glowing parts can be shot off to disable an attack, with a slow-mo flash when one breaks.
  - **Minions:** they keep coming, so there is always something to finish for health.
  - **Hazards:** later phases add arena hazards.
  - **Name card:** every boss opens on a freeze-frame card with slammed type ("sovthpaw — THE MODERATOR").
- **Jev plays it.** The game exposes its state (positions, projectiles, stagger, health, ammo, armor, fuel, cooldowns). Jev (`typesafe/jev-1.14`) makes the decisions: which resource to chase, which weak point, when to burn a group. A local reflex controller strafes, aims and dashes in real time between decisions.
- **Credits:** "Bosses: the Nous Hermes hackathon Discord".

## Everything Swarm Studio builds around it

Each is one prompt in the studio, recorded live for the trailer.

| Piece | What it is | Shows off |
|---|---|---|
| Game | ARES in Godot, playable on Windows | big-game mode, the Godot port, existing 3D models |
| Website | A launch site: a hero with gameplay, the boss roster (one card per boss with art, handle and title), the trailer, download | multi-page design, painted art, stock fill, motion |
| Player app | Sign-in; a leaderboard of the fastest clear per boss; "beat Jev's time" ghost runs; **the Armory** (a weapon and skin marketplace with rarity tiers, bought with credits); **the Oracle** (a gacha summon banner); an inventory; an admin dashboard | a real app with a database, credits checkout, gacha logic, admin |
| Trailer | The blockbuster cut below, plus the studio's own film step | the film studio |
| Posts | X and Discord posts with each boss's name card, so every boss can share their own | launch kit |
| Feed | Published to Swarm Feed for remix, with credit | the community loop |

## The Armory and the Oracle (in the player app)

- **Credits:** bought through the studio's credits checkout (demo checkout, or Stripe test mode). No real money in the demo.
- **Rarity tiers:** Bronze, Silver, Gold, Crimson (the top tier, flame-edged). They stay inside the palette, so no blue, purple or green rarity colours.
- **The Armory:** browse and buy weapon skins, hero sandal trails and finisher effects directly, each with a price in credits. Looter-shooter style item cards with stats flavour text.
- **The Oracle of Ares:** a gacha banner with 1x and 10x summons and a featured item per banner (e.g. "Teknium's Checkpoint Blade"). It follows good-practice rules:
  - the odds are published on the banner;
  - a pity counter guarantees a Crimson item by pull 50;
  - duplicates turn into shards that buy items in the Armory;
  - it is cosmetic only, never stronger weapons.
- A summon plays a short reveal: a sealed bronze urn cracks, then gold or crimson light shows the tier.
- **Inventory:** owned items, and the one equipped per slot.
- **Admin:** banner setup (featured item, odds, dates), sales and summons per day, credits sold.
- The item names are shared with the game through one `items.json`, so the trailer can show a skin bought in the app and worn in the game.

## The trailer: blockbuster, under 90 s

Superhero-blockbuster grammar: cold open, bass hits on title slams, fast cuts, a hard silence before the reveal and a stinger after the logo. Everything is original, with no studio logos, music or characters from any film. Music: "No Limits" by ArcticFoxMusic (credit in the post).

1. **Cold open (0–6 s):** black. A typed line in Hermes: `/swarm make ARES…`. A single heartbeat bass.
2. **The crew assembles (6–20 s):** the canvas fills, cursors fly, and the website and app build live in quick cuts. Slam: **ONE PROMPT.**
3. **The world (20–35 s):** gameplay at full speed (dash, finisher, ink burst). Slam: **A WHOLE LAUNCH.**
4. **The roster (35–60 s):** boss name cards hit one per beat, each with a 1–2 s fight clip: flownium, HotDawg, UKG, rahlquist, Nicho, Suzu, LocutusOfTheEye. They come faster and faster.
5. **The Moderator (60–68 s):** sovthpaw's timeout hammer. The screen freezes on "TIMED OUT", then Jev dashes out of it.
6. **Silence (68–70 s):** cut to black, no sound.
7. **The reveal (70–80 s):** Teknium, THE HERMES ARCHITECT. The arena floods with checkpoints, then the biggest hit of the cut.
8. **Title (80–86 s):** SWARM STUDIO, then "for Hermes Agent".
9. **Stinger (after the logo):** a short gag, e.g. the Slow Clanker finally finishes winding up after everyone has left.

The professional builds (Atelier Nord, Tempo) appear for a beat in part 2, so the trailer still says "for every kind of maker".

## Order of work (deadline 2026-11-11 17:00 EST)

The game and the web pieces run **in parallel**. The game is the long pole and runs on the Windows PC. The Mac studio builds the site and the app at the same time, and those live builds are recorded, because the recordings are the trailer's "the crew builds it" footage. The studio builds one app at a time, so the site and the app go one after the other on the Mac.

| When | Windows PC (game) | Mac (studio) |
|---|---|---|
| Tonight | Hermes, the plugin and Godot set up; **one polished boss arena** (sovthpaw or Teknium) with the full resource loop; Jev playing it | Restart the studio on current main; build the **ARES website** live and record it |
| Tonight / early morning | The rest of the boss ladder (simple fights are fine; the name cards and clips carry the trailer) | Build the **player app** live and record it: sign-in, the leaderboard, "beat Jev's time", the skins shop with credits, admin |
| Morning | Export boss renders, gameplay clips (Godot movie maker or a screen capture) and Jev's clear times | One more studio turn on the site and the app swaps the stand-in photos for boss renders and puts Jev's real times on the leaderboard |
| Late morning | | Veo hero shots (the cold open, sovthpaw's freeze, the Teknium reveal) made from the real boss designs; owner approved spending credits |
| Noon | | Cut the blockbuster trailer to "No Limits", plus the posts |
| By 15:00 EST | | Post on X tagging @NousResearch; submit the form |

The Tempo launch rerun is cut: Atelier Nord already covers the professionals beat. Tempo runs only if there is slack.

If the Windows setup stalls, the fallback is the existing trailer plan with Atelier Nord and Lokee. ARES is the upgrade, not a dependency.

Tracker: the GitHub issue "ARES flagship demo: tracker".

## Done when

- ARES runs on Windows: one full boss fight with the resource loop, played by Jev on camera.
- The website and the app are built by the studio from one prompt each and recorded.
- The trailer is under 90 s, follows the beats above and is posted.
- `bosses.json` holds the roster, and the credits name the Discord.
