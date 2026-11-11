# 4. Onboarding: first run and the Connections panel

## Problem

A new person opens the studio and finds an empty canvas and a prompt box. Nothing tells them:
- which model is used, or whether it works;
- that Supabase, Vercel or Stripe can be connected, and that doing so mostly means signing in, not pasting keys;
- what Auto, Game and Publish do.

Today, the setup they need is spread across `~/.hermes/.env`, the Publish menu and the Auto window.

## What we build

### 1. First-run welcome (shown once, in the Design Bakery theme)

It opens on the first visit, and again from **More → Setup**. It has four short steps. **Every step has "Skip, add later"**, and the last step always lets the person start, whatever they connected.

1. **Welcome:**
   - "SWARM STUDIO: one prompt, a dozen agents, a working product."
   - A 10 s looping clip of a build, and three cards: **Design**, **Auto** and **Game**.
2. **Models:**
   - Shows the planner and builder models Hermes picked, and tests one call with a green tick and the delay in ms.
   - If the call fails: a link to `hermes model` and a field for the InferHub key. The field writes the key through Hermes's own secret store, never into the canvas.
3. **Connect your stuff:** one row per service, each with a status (✓ connected / Connect / Skip):
   - **Supabase:** a Hermes sign-in connector (works today). "Saves orders, sign-ups and scores."
   - **Vercel:** a Hermes sign-in connector if its MCP can deploy, else the existing token paste. "Puts your app online."
   - **Stripe (test mode):** the Hermes sign-in connector or a `sk_test_` key. Without it, the clearly labelled demo checkout is used. Live keys are refused.
   - **Cloudflare Pages / GitHub:** optional, for static publishing.
   - **Meshy (3D):** optional, a paid key. "We ask before spending credits."
   - **Octo vault:** for people who keep their keys in Octo.
   - A connect button shows "Waiting for you to approve in the browser…" with a manual link, exactly like Connect Supabase today.
4. **Try it:**
   - Three example prompts as buttons: the Tidebreak game trial, a ticketed event, a small shop.
   - Plus "Start blank".
   - A one-line note on what each needs. For example: "Auto deploys only if Vercel is connected; everything else works now."

### 2. The Connections panel (anytime: More → Connections)

> Replaced by [spec 25](25-connections.md) (2026-11-11): one Settings sheet from the Projects user menu.

- It has the same rows as step 3. Each row offers **Disconnect** and shows which account is connected (an email or username from the provider, never a token).
- Whenever a step needs a connection, it links here: Auto's data step, deploy step and 3D step all say "connect X", and Publish does too.

### 3. Just-in-time prompts
- When Auto or Publish reaches a step whose connection is missing, it doesn't fail quietly. The step shows **Connect X now / Skip**.
- During an Auto run, the panel pauses at that step for up to 2 minutes, then skips it and carries on.

## Data and safety

- **What is stored:** the onboarding state lives in the plugin's data dir as `onboarding.json`, holding which steps were seen and skipped, and no secrets.
- **Tokens:** connections use Hermes's connectors (tokens kept by Hermes) or the existing mode-0600 `connections.json`. The canvas only ever learns `{connected, who}`.
- **Hermes config:** connecting adds the connector to `plugins.entries.swarm-studio.mcp_allowlist`, and the row says so: "Lets Swarm Studio use your Supabase connector".

## Done when

- [ ] A fresh `HERMES_HOME` opens the welcome. Skipping every step still lands on a working canvas, and design-only builds work.
- [ ] Connecting Supabase from the welcome works exactly like the Auto window's button, and the Connections panel shows the account.
- [ ] Auto's data step with no Supabase shows "Connect Supabase now / Skip", and both choices continue the run.
- [ ] Setup reopens from the More menu, and Disconnect removes the plugin's access.
- [ ] It works at 390 px wide (phone, for Remote Control).
