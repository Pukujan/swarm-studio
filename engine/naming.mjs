// One idea is one project with one name, everywhere (docs/specs/18-projects.md).
// The name comes from the brief's brand ("ARES" from "ARES — Boss Rush…" and from
// "ARES Player Hub — the account app…"), else a brand the run gave itself, else the
// brief's first words. It is never a page or screen title: "Sign In to ARES" names a
// screen, not a project, so it never becomes a title, a package name or a deploy name.

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

// screens every app has; a name that is one of these (or "<screen> to …") names a screen
const SCREENS = ['sign', 'sign in', 'signin', 'sign up', 'signup', 'log in', 'login', 'log out', 'logout', 'register', 'home', 'homepage',
  'dashboard', 'welcome', 'untitled', 'index', 'admin', 'account', 'profile', 'settings', 'overview', 'landing page', 'main page', 'new project']
const FILLER = new Set(['to', 'for', 'the', 'your', 'my', 'our', 'a', 'an', 'page', 'screen', 'panel', 'area', 'view', 'back', 'in', 'up', 'now', 'here', 'of'])
export function isScreenName(name) {
  let n = norm(name)
  while (/^(your|my|our|the) /.test(n)) n = n.replace(/^\S+ /, '')
  if (!n || /^\d+$/.test(n)) return true
  for (const w of SCREENS) {
    if (n === w) return true
    if (!n.startsWith(`${w} `)) continue
    const rest = n.slice(w.length + 1).split(' ')
    // "Sign In to ARES", "Welcome to Tempo", "Home page", "Admin panel": still a screen
    if (['to', 'for', 'page', 'screen', 'panel', 'area', 'view'].includes(rest[0]) || rest.every(x => FILLER.has(x))) return true
  }
  return false
}

// words that say which piece of a project a brief is about, not what the project is called:
// "ARES Player Hub" is the hub piece of ARES, "Atelier Nord client portal" the portal of Atelier Nord
const PIECE_WORDS = new Set(('app apps webapp site website web hub portal player players account accounts companion dashboard game film trailer '
  + 'video landing page store launcher admin mobile member members client clients fan fans official homepage community panel console').split(' '))
const APP_WORDS = new Set('app apps webapp hub portal account accounts dashboard admin console companion'.split(' '))
const LEAD = new Set('a an the make build create design me us please i want need we my our new some'.split(' '))
const BREAK = new Set('for with in on at that which where who whose and to of from by so where while about'.split(' '))
const CAP = /^[\p{Lu}\d][\p{L}\d'&.+-]*$/u
const cap = w => w.charAt(0).toUpperCase() + w.slice(1)

// the brief's first line, split into the brand, the words taken off it, and what comes after
function parse(brief) {
  const line = String(brief ?? '').split('\n')[0].trim()
  let head = '', rest = ''
  const m = line.match(/^\s*([^\n—–:,(]{1,60}?)\s*(?:—|–| - |:|,|\()\s*(.*)$/)
  const words = m ? m[1].trim().split(/\s+/) : []
  const firstReal = words.find(w => !LEAD.has(w.toLowerCase()))
  if (m && words.length <= 6 && firstReal && CAP.test(firstReal)) { head = m[1].trim(); rest = m[2] }
  else {
    // a capitalised name at the start: "Atelier Nord client portal for a small studio …"
    const all = line.split(/\s+/), caps = []
    for (const w of all) { if (caps.length < 5 && CAP.test(w)) caps.push(w); else break }
    while (caps.length && LEAD.has(caps[0].toLowerCase())) caps.shift()
    head = caps.join(' ')
    rest = all.slice(caps.length).join(' ')
  }
  const hw = head.split(/\s+/).filter(Boolean), stripped = []
  while (hw.length > 1 && PIECE_WORDS.has(norm(hw.at(-1)))) stripped.unshift(hw.pop())
  // the piece words can follow the brand in lower case too: "Atelier Nord client portal for …"
  const after = rest.split(/\s+/).filter(Boolean)
  while (after.length && PIECE_WORDS.has(norm(after[0]))) stripped.push(after.shift())
  return { brand: hw.join(' ').replace(/[.,;!]+$/, ''), stripped, rest: after.join(' '), line }
}

// the brand a brief names, or '' when it names none
export function brandOf(brief) {
  const { brand, line } = parse(brief)
  if (brand && !isScreenName(brand)) return brand.slice(0, 48)
  // "a site for Lumen Coffee, a roastery …", "an app called Tempo"
  const m = line.match(/\b(?:for|called|named)\s+((?:[\p{Lu}\d][\p{L}\d'&.+-]*\s?){1,4})/u)
  const named = m ? m[1].trim().split(/\s+/) : []
  while (named.length > 1 && PIECE_WORDS.has(norm(named.at(-1)))) named.pop()
  const got = named.join(' ').replace(/[.,;!]+$/, '')
  return got && !isScreenName(got) && !LEAD.has(got.toLowerCase()) ? got.slice(0, 48) : ''
}

// the brief's first words, as a name: "a tiny ramen bar in Osaka" -> "Tiny Ramen Bar"
export function firstWords(brief) {
  const ws = (String(brief ?? '').split('\n')[0].match(/[\p{L}\d][\p{L}\d'&-]*/gu) || []).map(w => w.toLowerCase())
  while (ws.length && LEAD.has(ws[0])) ws.shift()
  const out = []
  for (const w of ws) { if (BREAK.has(w) || out.length >= 4) break; out.push(w) }
  while (out.length > 1 && PIECE_WORDS.has(out.at(-1))) out.pop()
  const name = out.map(cap).join(' ')
  return name && !isScreenName(name) ? name : ''
}

// "Tidebreak — Escape the Drowned Lighthouse City" -> "Tidebreak"
const head = t => String(t ?? '').split(/\s[—–|:-]\s|:\s/)[0].replace(/\s+/g, ' ').trim().slice(0, 48)

// The project's one name. given: a name the person asked for; brand: one the run gave itself
// (a game spec's brand); title: the run's own start title. Page titles never count.
export function projectName({ given, brief, brand, title } = {}) {
  for (const c of [given, brandOf(brief), brand, head(title), firstWords(brief)]) {
    const n = String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, 48)
    if (n && !isScreenName(n)) return n
  }
  return 'Swarm build'
}

export const sameName = (a, b) => !!norm(a) && norm(a) === norm(b)

// Which piece of its project a run is: site, app, game or film.
export const PIECES = ['site', 'app', 'game', 'film']
export function pieceKind({ piece, kind, game, brief, pages = 0, video = false } = {}) {
  if (PIECES.includes(piece)) return piece
  if (kind === 'game' || game) return 'game'
  if (kind === 'film' || (!pages && video)) return 'film'
  const { stripped, rest } = parse(brief)
  const said = [...stripped, ...rest.split(/\s+/).slice(0, 8)].map(norm)
  if (said.some(w => APP_WORDS.has(w))) return 'app'
  return 'site'
}

// a folder-, package- and URL-safe name
export const slug = s => norm(s).replace(/ /g, '-').slice(0, 60).replace(/-$/, '')

// The deploy name: <project>-<kind>, "ares-app", "ares-site". A screen word never names a deploy.
export function deployName(name, kind = 'site') {
  const k = PIECES.includes(kind) ? kind : 'site'
  let s = isScreenName(name) ? '' : slug(name)
  if (!s) s = 'swarm'
  return s.endsWith(`-${k}`) ? s : `${s}-${k}`.slice(0, 80)
}

// a package name: the project's slug, never a screen's
export const packageName = (name, fallback = 'swarm-app') => (!isScreenName(name) && slug(name)) || fallback

// The brand a run gave itself: the wordmark in its shared nav (the first link, usually to home).
// "Tidepool", "SkyLedger"; an aria-label "Hopliner home" names it too. '' when the nav has none.
// navbrand:start (web/canvas.js has the same lines; tests/naming.test.mjs runs both)
export function navBrand(html) {
  const s = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
  const a = s.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i)
  if (!a) return ''
  const label = (a[1].match(/aria-label="([^"]{2,60})"/i) || [])[1]?.replace(/\s+(home|homepage|logo)$/i, '').trim()
  const bits = (label ? [label] : []).concat(a[2].split(/<[^>]+>/).map(t => t.replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()))
  const ok = bits.filter(t => (t.match(/\p{L}/gu) || []).length >= 2 && t.length <= 40 && t.split(' ').length <= 4)
  // the wordmark comes first; a tagline after it ("loose-leaf tea, Portland") is not the name
  return (ok[0] || '').replace(/[\s—–|:·-]+$/, '')
}
// navbrand:end
