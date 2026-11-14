# The catalog pictures

The pictures for Swarm Studio's entry in the Hermes plugin catalog
([`plugin-catalog/swarm-studio.yaml`](https://github.com/NousResearch/hermes-agent/pull/154007) in
NousResearch/hermes-agent). Hermes Desktop and the docs site show them. The catalog's rules are in
`plugin-catalog/README.md` in that repo:

- `image:` is optional: one https image on a GitHub host, 2:1 (1200×600). It's shown on the catalog card.
- `screenshots:` takes up to 6 images. They're shown in the gallery on `/docs/plugins/swarm-studio`.
- Every URL is `raw.githubusercontent.com`, pinned to the entry's `sha`, so a picture changes only when a
  reviewed repin lands.

| File | Size | What it shows |
|---|---|---|
| `banner.png` | 1200×600 | the card image: the lock-up, "One prompt. The *whole* launch." and the real Design deck with the crew's cursors at work |
| `home.png` | 1440×900 | Projects (Recent) |
| `studio.png` | 1440×900 | the Studio scaffold (spec 37): Brand, References, Assets, Plan and Lock |
| `brand.png` | 1440×900 | the brand sheet: packs, story, palette and type |
| `crew.png` | 1440×900 | the crew building a version on the Design deck: 8 couriers, each cursor with what it's doing |
| `site.png` | 1440×900 | the finished site in Play |
| `setup.png` | 1440×900 | Setup on first open, with the Models row passing |

## Making them

```bash
node scripts/catalog-shots.mjs
```

```bash
node scripts/catalog-shots.mjs --banner
```

The first command takes the six screens. The second renders `banner.html` to `banner.png`. The banner uses
`crew.png`, so run the screens first. Playwright and Chromium are loaded the way `scripts/walkthrough.mjs`
loads them: `import('playwright')`, or `PLAYWRIGHT_DIR` pointing at a folder with `playwright` installed
(`npm i playwright@1.64.1` there), and `CHROMIUM_PATH` if needed. Other flags: `--only crew,site` takes some of
the screens, `--out dir` writes somewhere else, and `--keep` leaves the Studio running.

The script starts its own throwaway Studio (`scripts/walkthrough-fixtures.mjs`): its own port and data folder,
and a model that always fails. It never touches a real Studio or data folder. devrun has no Swarm app, and its
apps are Docker containers, so the script doesn't use `devrun up`. The script seeds one demo project, Lantern
& Loaf, a night bakery. It has two versions: a finished four-page site, and a second one that eight couriers
(Pip to Tofu, in the shades from white to graphite) are still building. For the Studio scaffold, it makes a
Studio project through `POST /api/studio`. Two things are stubbed in the browser and nothing else: Setup's
model check answers "Working", and the signed-in name is "Ana" instead of this computer's user.

A screen it can't reach is printed as `✗ <id>  not reached: <why>` and skipped, and the run exits 1. So after
the UI changes, a rerun says which selector moved. The selectors are in the `SHOTS` list at the top of the
script. The banner's crop of `crew.png` is the `.shot img` rule in `banner.html` (`left` / `top` at 0.8 scale).
If the deck's camera frames the crew differently after a change, move it there.

**When:** rerun both commands after tonight's React port, right before the repin. Look at all seven pictures,
then commit them. The Studio scaffold doesn't have Layers yet. If the Layers work has landed by then, the
script clicks a `[data-tab="layers"]` / "Layers" control when it finds one.

## At the repin

The release step edits the catalog entry, not this branch. In `plugin-catalog/swarm-studio.yaml`, replace the
two old `screenshots:` lines (`studio-home.png`, `studio-canvas.png`) and add `image:`. `<sha>` is the
entry's new `sha:`, the commit that has these pictures:

```yaml
image: https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/banner.png
screenshots:
- https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/home.png
- https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/studio.png
- https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/brand.png
- https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/crew.png
- https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/site.png
- https://raw.githubusercontent.com/Pukujan/swarm-studio/<sha>/docs/catalog/setup.png
```

Put `image:` after `docs_url:` and before `screenshots:`, in the order the catalog template uses. Bump
`version:` in the same edit. Before pushing, open each URL once at the new sha and check that it answers.
