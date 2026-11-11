// The Systems card's modules (docs/specs/21-plan-before-spend.md, "Systems as ready modules"): each switch
// is a block of build instructions the coding agent gets. Existing blocks are reused word for word
// (AUTH from engine/appjob.mjs, SHOP_ASK from engine/auto.mjs); the rest are templates written here.
// No money moves without the person: payments and subscriptions are Stripe test mode or a labelled demo.
import { AUTH } from './appjob.mjs'
import { SHOP_ASK } from './auto.mjs'
import { SYSTEMS } from './plan.mjs'

export const SUBSCRIPTIONS = `Subscriptions (a monthly plan):
- A /plans page in the app's own theme lists one monthly plan with its price and what it unlocks (cosmetic or convenience only, never power).
- "Subscribe" calls POST /api/subscribe { visitor }. When process.env.STRIPE_SECRET_KEY starts with sk_test_, it creates a Stripe Checkout Session in subscription mode (add_dependency stripe; server code only; price_data with recurring { interval: "month" }; success_url /plans?session_id={CHECKOUT_SESSION_ID}), and GET /api/subscribe/verify?session_id=… marks the visitor subscribed once it is paid. Any other key, or none, is demo mode: a banner "DEMO · fake subscription, no money moves", the plan is recorded as { demo: true } and can be cancelled.
- The game asks GET /api/subscription?player=… at start and shows the perk only while it is active. A cancel button ends it at the period's end. Never store card numbers.`

export const LEADERBOARD = `Leaderboard:
- POST /api/scores { player, board, score, ms, run } records a run; GET /api/scores?board=…&limit=20 returns the best run per player, highest first (ties: the faster run).
- The server checks a run before keeping it: the score is a finite number within the board's limits, the run length (ms) is at least the board's shortest possible clear, one submission per player per 10 seconds, and the player is the signed-in one (or the guest pass).
- Boards: one per boss (the fastest clear) and one for the highest style rank. The game posts at the end of a run and shows the player's place; the app has a /leaderboard page in its theme.`

export const GACHA = `Gacha (cosmetics only):
- A summon banner with 1x and 10x pulls, a featured item, and its odds published on the banner itself.
- A pity counter guarantees the top tier by pull 50 and resets when it lands; the counter shows on the banner.
- Duplicates turn into shards that buy items directly. Items are cosmetic only (skins, trails, effects), never stronger weapons or stats.
- Pulls spend the app's credits; credits are bought only through the app's checkout (demo or Stripe test mode). No paid currency without the label "Credits are bought with real money in a live shop; this is a demo".
- The server rolls (crypto.randomInt), never the client; every pull is recorded (player, banner, item, tier, pity, time). A short reveal plays on the client after the server answers.
- Item names come from one items.json shared with the game, so a skin pulled in the app is worn in the game.`

export const PILOT = `Autoplay pilot:
- An "Autoplay" switch in the game's pause menu (and ?autoplay=1 in the URL) hands the controls to a simple pilot: it walks to the nearest enemy, attacks in combos, dodges telegraphed attacks, uses the ult when it is charged, and picks the first level-up card.
- The pilot drives the same inputs a player would (no direct state writes), so a run with the pilot is a real play test. It never posts to the leaderboard.
- A small "AUTO" mark shows while it plays; any key or touch gives control back.`

export const ENEMY_AI = `Enemy AI (state machines):
- Every enemy runs idle → notice → telegraph → attack → recover, with a readable telegraph (a glow or wind-up of at least 0.4 s) before any hit.
- Minions: chase and single attacks, in small groups that take turns. Elites: a two-hit combo and a guard that breaks after three hits.
- Bosses: three stages switched at 66 % and 33 % health, each with its own weapon and attack set; a short invulnerable stage-change moment with the boss's stage card; the final boss adds a grab that must be dodged.
- Difficulty comes from timing and numbers, never from hits without a telegraph.`

export const LOADOUT = `Loadout (the app's cosmetics in the game):
- GET /api/loadout?player=… returns { equipped: { slot: itemId }, owned: [itemId] } for the signed-in player (or the guest pass), from the app's store.
- The game reads it once at start and on returning to the hub, and shows the equipped skin, trail and effect; an unknown item falls back to the default look.
- Item ids and names come from the shared items.json.`

// payments: the app's existing demo checkout, reused word for word
export const MODULES = {
  logins: AUTH,
  payments: SHOP_ASK,
  subscriptions: SUBSCRIPTIONS,
  leaderboard: LEADERBOARD,
  gacha: GACHA,
  pilot: PILOT,
  enemyAI: ENEMY_AI,
  loadout: LOADOUT
}

// The switched-on modules, joined into the build prompt in the Systems card's order.
export function systemsAsk(plan) {
  const on = SYSTEMS.map(([id]) => id).filter(id => plan?.systems?.[id] && MODULES[id])
  if (!on.length) return ''
  return `Systems this game ships with (the plan's Systems card):\n\n${on.map(id => MODULES[id]).join('\n\n')}`
}
