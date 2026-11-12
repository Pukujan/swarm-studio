// The Studio's kits (docs/specs/37-studio-first.md, "The kit contract"): one module per kind, each
// exporting one `<kind>Kit`. A new kit adds its import line here and its name to the list, nothing else.
// (server/page.mjs joins every web/kit-<kind>.js in its own closure; only <kind>Kit leaves it.)
import { siteKit } from './kit-site.js'
import { brandKit } from './kit-brand.js'
import { appKit } from './kit-app.js'
import { gameKit } from './kit-game.js'
import { deckKit } from './kit-deck.js'
import { videoKit } from './kit-video.js'

export const KITS = Object.fromEntries([siteKit, appKit, gameKit, videoKit, deckKit, brandKit].map(k => [k.kind, k]))
// home.js offers a kind (Deck, …) only once its kit is here
window.swarmKits = KITS
