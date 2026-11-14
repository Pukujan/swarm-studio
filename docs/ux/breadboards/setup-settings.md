# Setup and Settings

Two sheets reached from the You menu on Projects. **Setup** connects what the Studio runs on: the account, the models,
the pictures ([spec 6](../../specs/06-onboarding.md)). **Settings** shows what the Studio is connected to and where its
data goes ([spec 25](../../specs/25-connections.md); PATTERNS: iOS Settings, grouped lists, one level per tap).
Statechart: `projects.setup`, `me.settings` (no live state: both are sheets, not navigation). Code: `web/setup.js`,
`web/setup.css`, `web/settings.js`, the shared dialog in `web/ui.js`, the Models menu in `web/canvas/settings.js`.
How the models and connections reach Hermes: [docs/engines/hermes-and-connections.md](../../engines/hermes-and-connections.md).

PR #421 (setup-connections, open) reworks both: a Parts layer in Setup, and Settings' first layer as You, Setup,
Lite mode, Data. This breadboard is main as of 2026-11-13; update it when #421 lands.

## Places and affordances

```
You menu  (layer, on Projects)
  · Light / Dark · Crew sound · Models ──(none)──▶ Models menu · Setup ──setup──▶ Setup · Settings ──(none)──▶ Settings

Setup  (projects.setup; a sheet, "Setup"; opens by itself once, then from the You menu)
  · Account (state: @handle · Guest ⚠ · Waiting · Skipped)          ──(none)──▶ the row opens
      Google · GitHub · Discord                                     ──(none)──▶ the browser signs in; Waiting
      waiting: "Finish in your browser. Code X" · Open again · Cancel
  · Models (state: the builder's model ✓ or ⚠; Testing while it checks)
      Planner ✓/⚠ · Builders ✓/⚠
      a failed check: one line, the fix that fits it · Let Hermes set this up · Test again · Details (the raw text)
      the picker: Search · models by provider (8, then All n) · More providers · a provider's Sign in (key + Save,
      or browser + Open / Cancel)
      Media (untested)
  · Pictures (state: Painted · Stock photos · Drawn; ⚠ when Painted isn't ready)
      Painted · Stock photos · Drawn (one of three)
  · Start                                                            ──start──▶ Projects
  (one row open at a time; ×, Esc, a click outside close it, and every close counts as seen)

Settings  (me.settings; a sheet, "Settings")
  index (at rest)
  · You (the Feed name, or Not signed in)  ──(none)──▶ You
  · Crew (n of 8)                          ──models──▶ Crew
  · Publish (n of 5)                       ──connections──▶ Publish
  · Data                                   ──(none)──▶ Data
  a group (‹ Settings goes back)
  · You: Swarm Feed
  · Crew: Planner · Builders · Reviewer · Media reader · Pictures · Film · Stand-in photos · 3D
  · Publish: GitHub Pages · Vercel · Cloudflare Pages · Supabase · Gateways
  · a row (dot: connected, ring: not) ──(none)──▶ its "Goes to" line opens under it
  · Data: where each thing goes, nine lines

Models menu  (layer, also ☰ Models in a project)
  · each role's model · Lite mode · Change ──setup──▶ Setup on its Models row
```

## At 390 px

Both sheets become bottom sheets under 560 px. Setup's picker scrolls inside itself (at most 260 px); its provider
buttons share the width.

## Where the code differs

- **Two sheets for one subject.** Models live in Setup, in the Models menu and as Settings › Crew; spec 25 says the
  Models entries should open Settings › Crew. Settings doesn't open Setup yet; `web/home.js:32` says it will once its Crew rows are editable.
- **Esc closes all of Settings**, not one level (`web/ui.js:10-16`); only `‹ Settings` goes back.
- **No loading state in Settings.** Its rows fill in as seven requests answer, with no busy marker
  (`web/settings.js:115-126`).
- **Setup's Start does nothing but close** (`web/setup.js:275`); spec 6's Skip for now is not there.
- **Helper sentences at rest** in Setup ("Builds stay on this computer. Publish and Post make them public.",
  `web/setup.js:170`) and Data's two-column table at 390 (no narrow rule).
- **Not in the audit.** Neither sheet is one of the audited screens (AUDIT.md).
