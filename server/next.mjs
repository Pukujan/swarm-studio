// The Studio's next UI (ui/, docs/decisions/0013-react-ui-coexists.md) at /next/: its committed build, ui/dist/,
// as one document with the script and styles inline, like the canvas page (server/page.mjs), because the Desktop
// pane's frame has an opaque origin and cannot import. The token goes in here, at serve time, never into ui/dist/.
// Nothing is built or fetched: a plugin without ui/dist/ answers 404 at /next/ and the current Studio is unchanged.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { webVersion } from './page.mjs'

// The rooms the next UI draws for everyone (docs/decisions/0018-switching-on-a-ported-screen.md). The current Studio
// gets the list in its page (SWARM.next) and goes to /next/ when the person enters one (web/next.js). It stays empty
// until the owner switches a ported screen on: one line in its own PR, the old screen kept until then.
export const LIVE = []

const SCRIPT = /<script type="module" crossorigin src="\/next\/(assets\/[\w.-]+\.js)"><\/script>/
const STYLE = /<link rel="stylesheet" crossorigin href="\/next\/(assets\/[\w.-]+\.css)">/

// boot: what the page finds as window.SWARM (the token); the build's version is added here
export function nextPage(uiDist, boot) {
  if (!existsSync(join(uiDist, 'index.html'))) return null
  const read = f => readFileSync(join(uiDist, f), 'utf8')
  const page = read('index.html')
    // a "</script" or "</style" inside the code would end the element early; the escaped form is the same string
    .replace(SCRIPT, (_, f) => `<script type="module">${read(f).replace(/<\/script/gi, '<\\/script')}</script>`)
    .replace(STYLE, (_, f) => `<style>${read(f).replace(/<\/style/gi, '<\\/style')}</style>`)
    .replace('<!-- swarm:boot -->', () => `<script>window.SWARM = ${JSON.stringify({ ...boot, version: webVersion(uiDist) }).replace(/</g, '\\u003c')}</script>`)
  if (/(src|href)="\/next\/assets\//.test(page)) throw new Error('ui/dist/index.html: a file left to load from /next/assets/; the page must be one document')
  return page
}
