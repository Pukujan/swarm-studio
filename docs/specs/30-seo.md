# 27. Search and share: every build has its own SEO

Owner, 2026-11-11: "they can all use seo", "their own seo, and our agents should support it".

## What a build ships

Every page of an exported or published site has, between `<!-- seo -->` and `<!-- /seo -->` in its head (rewritten in place, so exporting again never doubles it):

- a `<title>` of the page's name and the site's name (60 characters at most) and a meta description written for that page (70–160)
- `lang` on `<html>`, a favicon (the brand's first letter in the theme's colours, `favicon.svg`)
- Open Graph and Twitter card tags, with a 1200×630 share picture cut from the page's own picture (`img/share-<hash>.jpg`), or a card in the theme's colours when the page has none
- JSON-LD that fits the page: the home page a `WebSite` plus the business, place, event, product or person it is about; other pages `WebPage`, `AboutPage`, `ContactPage`, `FAQPage` (with the page's real questions) and the like
- once the address is known (publish, or `--base`): `canonical`, `og:url` and absolute picture links

and the site has `robots.txt`, `sitemap.xml` (every page) and a `404.html` (`noindex`, the site's nav and footer). `seo.json` next to the export lists what each page got.

**Nothing invented.** A fact in JSON-LD (phone, address, opening hours, price, date, email) is kept only when the page or site says it; ratings and reviews are never written; an event with no date on the page becomes a plain `WebPage`.

## Who writes it

- **The page planner**, in the call it already makes: one more JSON line after its sections (`{"type":"seo",…}`). No extra model round.
- **The reviewer**, after the last section and before the build ends, with no model call: titles and descriptions present, within length and different on every page; one `<h1>` per page (the first section's; nav and footer have none); every picture has alt text; the share picture exists. It fixes what fails and says so in the feed (`🔎 Search & share: 4 pages checked · 2 fixed`).
- **The crew, on request.** "improve the SEO", "a better description for the menu page", "target people searching for ramen in Porto" in the project chat, `/swarm seo [n] [what]` or the `swarm_design` tool's `seo` action. One planner call rewrites the titles and descriptions it should, asks for at most two copy changes (reworked by the agent that owns the section, as a comment would be), and says what changed in plain words. An SEO ask never starts a new build.
- **The person.** The Design panel with nothing selected shows **Search & share** for the page in view: Title (n/60), Description (n/160), Share picture (the page's own pictures). A cleared field goes back to the crew's. Each change is an `seo` event (`by: person`), so undo, replay and other viewers see it.

## The thumbnail, picked with no one asked

Owner, 2026-11-11: "when publishing along with the thumnail image selected automatically?"

Publish needs no extra step. Each page's share picture (`og:image`, `twitter:image`) is picked in this order: the one the person chose, the page's own first picture (its hero), the build's key art, a shot of the top of the page (a headless Chrome: `SWARM_CHROME`, a Playwright headless shell already downloaded, or installed Chrome), and last a card in the site's colours. A picture is cover-cropped to 1200×630, with a 600×600 square as a second `og:image` for small cards; icons, logos and SVGs are skipped. A page shot is cut at the last quiet row above 630 px, so no line of text is sliced, and the square fits that same top whole. At publish, every link is absolute.

The site's thumbnail is the home page's pick. Export keeps it next to the run (`thumb.jpg`, `thumb-square.jpg`). **Post to Feed** uses it as the poster, and a person's pick becomes the project tile's cover too, so the Feed card, the link preview and the tile agree. The **Publish** menu shows the thumbnail at the top, with up to six of the build's other pictures under it. One click swaps it, and nothing is required.

## Apps, games and films

- An app or game deployed to Vercel gets the same head tags on its `index.html` (its own title kept), a `share.jpg` (a game's title picture, else the first picture) and a favicon.
- A build with a promo film (60 MB or less) exports `film.html`: the film with its poster, its own title and description, `og:video` and a `Movie` JSON-LD.

## Its own icon, nothing of Dyad's

- Every app and game gets its own icon in `public/`: `favicon.svg`, `favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180) and `icon-512.png`, in the theme's primary colour with the name's first letter, linked from `index.html`. A manifest already there gets the icons too.
- No name yet: a plain grey square. Never Dyad's icon, never Swarm's.
- A visitor sees nothing of Dyad: the title is the app's name, not `dyad-generated-app`; "Made with Dyad" renders nothing; `placeholder.svg` is a plain grey square; the README is the app's. The Apache-2.0 notices in `dyad/` stay.
- This runs when the project is made and again at every deploy, so an older app is fixed by deploying it again.
- An exported site links its own `favicon.svg` and ships no Dyad file. It has no `/favicon.ico`, so a browser asking for one gets a 404, not someone else's icon.
- Test: `tests/appicons.test.mjs` (no file identical to Dyad's favicon, no "dyad" in the served HTML).

## Builds made before this

- A saved build: export it again (⬇ Export, or `node scripts/seo.mjs <run id> [--base https://…/]`). The crew's fields are filled from the page copy.
- An exported site with no run behind it: `node scripts/seo.mjs <folder> --base https://…/ [--brand "Name"]` rewrites its HTML in place.
- **The 21 Swarm Feed samples** (`public/feed/demos/<slug>/` in the swarm-feed repo; that repo is not edited here): in a checkout of it, for each sample folder run
  `node <swarm-studio>/scripts/seo.mjs public/feed/demos/<slug> --base https://swarm.design-bakery.com/feed/demos/<slug>/`
  then commit and deploy as that repo does. The `robots.txt` each sample gets only counts at the domain root, so the root `robots.txt` there should list each sample's `sitemap.xml`.

## Publish

GitHub Pages, Vercel and Cloudflare Pages work out the address before the upload (`<login>.github.io/<repo>/`, `<project>.vercel.app`, `<sub>.pages.dev`) and rewrite the canonical links, sitemap and robots with it; if the host answers with another address, the site is rewritten and sent once more.

## Not checked

- Whether search engines index the sites: that takes days and a live address.
- Whether a painted picture has garbled lettering in it: nothing reads the words in a picture. The painter is asked for pictures without text, and the crop never adds any.
