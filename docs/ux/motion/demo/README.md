# The demo, the current Studio and the next UI

Six beats of the owner's demo video (74.8 s, 1080p30; the video itself is not in the repository). Each is
cut into a short clip, `beatN.webm`, next to the same moment in the throwaway Studio of the motion check:
**demo | current Studio (`/`) | next UI (`/next/`)**. `beatN.jpg` is one frame of it. The `/` and `/next/`
parts come from `node scripts/motion-parity.mjs clips` ([MOTION.md](../../MOTION.md), "The next UI moves the
same"), recorded on 2026-11-13 from `main` (1fcf587) and the port branches named below.

Each difference is labelled **intended (PR #N)**, left for later on purpose by that PR, or **drift**, which
is to be fixed. "Not in the fixture" means the throwaway Studio has no data for it, so it was not compared.

| Beat | Demo (s) | `/` and `/next/` from | What differs |
|---|---|---|---|
| [1](beat1.webm) The Make bar on Home | 6.0–7.2 | Make flow, `feat/port-home` | The bar and Make's menu of ways match. The menu is not in the demo: **intended (PR #417)**. Hermia is missing from Projects in `/next/`: **drift**. `/next/` runs a 150 ms `filter` transition with reduced motion asked for: **drift**. |
| [2](beat2.webm) The crew building pages | 7.0–12.0 | Replay, `main` | `/` draws the crew's cursors with their tags and speech, the reviewer's scan, and pages taking shape. `/next/` shows the finished pages and no cursors. Replay is slice 5 of the deck: **intended (PR #432)**. |
| [4](beat4.webm) "real picture coming" slots | 16.0–19.5 | Overview, `feat/port-overview` | The Overview's layout and its loading tiles match. The fixture paints no pictures, so the stand-ins with the painter's name are not in the fixture. `/next/` lacks Hermia (her bob, dots and tap) and the crew's docked cursors: **drift**. |
| [5](beat5.webm) Live iteration with the inspector | 22.0–24.5 | Half-done build, `main` | `/` docks the crew on the build and draws the sections taking shape (`@draw`); `/next/` does neither: **drift**. The demo's Design inspector is slice 3 of the deck: **intended (PR #432)**. |
| [7](beat7.webm) The Publish menu | 30.0–32.2 | Publish flow, `main` | `/` opens Publish's pop; `/next/` has no Publish yet (slice 5): **intended (PR #432)**. |
| [10](beat10.webm) 3D characters on the Plan board | 42.5–48.0 | Plan board, `feat/port-plan` | The Plan board matches `/` in normal motion, Hermia's path included. 3D characters need a locked 3D plan and a Meshy key ([docs/engines/meshy.md](../../../engines/meshy.md): never by default; `server/plans.mjs:84-115`), so they are not in the fixture. With reduced motion, `/next/` runs `opacity` and `transform` transitions (200–250 ms) that `/` does not: **drift**. |

The moved screens side by side, `/` on the left and `/next/` on the right, are in [../parity/](../parity/).
