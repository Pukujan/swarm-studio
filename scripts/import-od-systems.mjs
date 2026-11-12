#!/usr/bin/env node
// Open Design's generic design systems as brand packs (docs/specs/35-open-design.md).
//
// A developer runs this by hand against a checkout of nexu-io/open-design at the pinned commit; its output,
// engine/opendesign/packs.json, is committed. Nothing is fetched or run when the plugin is installed or used.
//
//   node scripts/import-od-systems.mjs <open-design checkout>
//
// Get the checkout small (only what is read here):
//   git init od && cd od && git remote add origin https://github.com/nexu-io/open-design.git
//   git sparse-checkout set --no-cone '/design-systems/*/manifest.json' '/design-systems/*/DESIGN.md' '/design-systems/*/tokens.css' '/LICENSE'
//   git fetch --depth 1 --filter=blob:none origin <COMMIT> && git checkout FETCH_HEAD
//
// What is read from each system, and from where:
//   palette   DESIGN.md "## 2. Color": Surface → bg, Text → text, Primary → accent, Secondary → link. When that
//             list is the upstream placeholder (#3B82F6 / #8B5CF6 / #FFFFFF / #111827) the system has no colours of
//             its own there, so tokens.css is read instead (--bg, --fg, --accent).
//   type      DESIGN.md "Families: primary=…, display=…" (display → heading, primary → body), else tokens.css
//             --font-display / --font-body. Only Google Fonts families (what the Studio loads); anything else is
//             swapped for the nearest one in SWAP, and the original is kept in `dropped`.
//   radius    tokens.css --radius-md.
//   notes     DESIGN.md "## 1. Visual Theme": its first line, for the build's art direction.
// What is ours, written here: who each look is for, the words that suggest it, the voice, the picture style and
// the storyboard (their format has none of these).
// Systems named after a real company, product, person or game are never imported (their README: "aesthetic
// inspirations, not official assets"); only the generic styles in PICK are.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const COMMIT = 'bc06128813c99fa63f5af53ad2c903c27db057f2'
export const BERGSIDE = 'f631a09b4fcc0166f2e2c1a8c81906ef680c57e8'
// the systems Open Design normalised from bergside/awesome-design-skills (MIT); the rest of PICK are its own
const FROM_BERGSIDE = new Set('agentic artistic bento bold brutalism cafe claymorphism clean colorful contemporary corporate cosmic creative dithered doodle dramatic editorial enterprise expressive fantasy flat friendly futuristic glassmorphism gradient levels minimal modern mono neobrutalism neon neumorphism paper perspective premium professional refined retro skeumorphism sleek spacious storytelling vibrant vintage'.split(' '))

// The voices, picture styles and storyboards we write, one per kind of look
const KINDS = {
  product: {
    voice: { name: 'Clear and exact', lines: ['Set it up in an afternoon. Keep it for years.', 'Everything in one place, and nothing to learn twice.'] },
    pictures: { style: 'photo', tags: ['laptop', 'workspace', 'office', 'desk', 'technology'], mood: ['clean', 'modern', 'focused', 'professional'], people: null },
    storyboard: ['One promise and the product beside it', 'Three things it does', 'A real person using it', 'Start for free']
  },
  data: {
    voice: { name: 'Precise and calm', lines: ['Every number, live, in one view.', 'See what changed since this morning.'] },
    pictures: { style: 'photo', tags: ['technology', 'office', 'screen', 'workspace', 'city'], mood: ['focused', 'modern', 'professional', 'clean'], people: null },
    storyboard: ['The live view, large', 'What it watches, in three panels', 'An alert, and what happens next', 'Get access']
  },
  corporate: {
    voice: { name: 'Assured and plain', lines: ['Trusted by teams who cannot afford to get it wrong.', 'Talk to us. We answer within a day.'] },
    pictures: { style: 'photo', tags: ['office', 'meeting', 'team', 'architecture', 'city'], mood: ['professional', 'confident', 'calm', 'modern'], people: true },
    storyboard: ['A clear promise over a real team', 'What we do, in three columns', 'Proof: numbers and a quote', 'Book a call']
  },
  editorial: {
    voice: { name: 'Measured and literate', lines: ['A longer read, worth the time it takes.', 'Notes from the people who were there.'] },
    pictures: { style: 'photo', tags: ['books', 'city', 'street', 'portrait', 'paper'], mood: ['calm', 'thoughtful', 'quiet', 'warm'], people: true },
    storyboard: ['A headline and one strong photo', 'The story in columns', 'A pull quote', 'More to read']
  },
  warm: {
    voice: { name: 'Warm and welcoming', lines: ['Pull up a chair. The kettle is on.', 'Made by hand, a little every day.'] },
    pictures: { style: 'photo', tags: ['coffee', 'kitchen', 'craft', 'market', 'home'], mood: ['warm', 'cozy', 'friendly', 'relaxed'], people: true },
    storyboard: ['A warm photo and one line', 'What we make', 'A little about us', 'Come and visit']
  },
  luxe: {
    voice: { name: 'Quiet and certain', lines: ['Made in small numbers, for a few.', 'By appointment.'] },
    pictures: { style: 'photo', tags: ['interior', 'fashion', 'architecture', 'detail', 'hotel'], mood: ['elegant', 'calm', 'luxurious', 'serene'], people: null },
    storyboard: ['One picture, almost alone', 'The collection, slowly', 'The craft behind it', 'Make an appointment']
  },
  loud: {
    voice: { name: 'Loud and short', lines: ['No filler. Just the good part.', 'It starts now. Be there.'] },
    pictures: { style: 'photo', tags: ['crowd', 'concert', 'street', 'sport', 'night'], mood: ['energetic', 'bold', 'joyful', 'active'], people: true },
    storyboard: ['One huge line over a crowd', 'What is happening, in a grid', 'The date and the place', 'Get in']
  },
  playful: {
    voice: { name: 'Bright and friendly', lines: ['Come as you are. Bring a friend.', 'Small things, done with a grin.'] },
    pictures: { style: 'photo', tags: ['friends', 'park', 'community', 'colour', 'play'], mood: ['playful', 'joyful', 'friendly', 'social'], people: true },
    storyboard: ['People having fun, and a hello', 'What you can do here', 'What people say', 'Join in']
  },
  future: {
    voice: { name: 'Sharp and forward', lines: ['Built for what comes next.', 'Faster than you expect. Quieter than you think.'] },
    pictures: { style: 'concept', tags: ['technology', 'night', 'city', 'space', 'light'], mood: ['futuristic', 'dramatic', 'modern', 'mysterious'], people: null },
    storyboard: ['A dark stage and one bright line', 'Three capabilities', 'A closer look', 'Request access']
  },
  story: {
    voice: { name: 'Told like a story', lines: ['It started with a question nobody had asked.', 'Here is what happened next.'] },
    pictures: { style: 'gouache', tags: ['landscape', 'journey', 'village', 'forest', 'sea'], mood: ['warm', 'dreamy', 'nostalgic', 'calm'], people: true },
    storyboard: ['A painted opening scene', 'Chapter one, in pictures', 'The turn', 'The ending, and what to do now']
  },
  retro: {
    voice: { name: 'Friendly and nostalgic', lines: ['Like it used to be, only faster.', 'Press start.'] },
    pictures: { style: 'pixel', tags: ['retro', 'computer', 'arcade', 'toys', 'vintage'], mood: ['nostalgic', 'playful', 'fun'], people: null },
    storyboard: ['A title screen', 'What is inside, in tiles', 'High scores', 'Play now']
  }
}

// id → [kind, who it is for, the words that suggest it, a picture style when it differs from its kind's]
export const PICK = {
  bento: ['product', 'a product with many small features to show at once', 'bento|grid|features?|widgets?|tiles?'],
  levels: ['product', 'an app with steps, stages or progress', 'levels?|progress|steps?|stages?|habits?|goals?'],
  perspective: ['product', 'a product launch with depth and motion', 'launch|3d|depth|perspective'],
  spacious: ['editorial', 'a calm site with lots of room to breathe', 'calm|spacious|wellness|retreat|spa|yoga'],
  dithered: ['retro', 'a lo-fi indie site with a printed, dotted look', 'lo-?fi|indie|zine|dither\\w*|print'],
  paper: ['editorial', 'notes, a journal or a newsletter on paper', 'paper|journal|notes?|newsletter|stationery|writing'],
  retro: ['retro', 'a nostalgic shop, show or club', 'retro|nostalgi\\w*|70s|80s|vinyl|records?|diner'],
  vintage: ['retro', 'an old-computer, desktop-era look', 'vintage|windows|desktop|old computer|y2k|pixel'],
  bold: ['loud', 'a brand that wants to be seen from across the street', 'bold|loud|statement|sneakers?|streetwear'],
  brutalism: ['loud', 'an art space, a zine or a raw manifesto', 'brutal\\w*|raw|manifesto|underground|gallery|zine'],
  colorful: ['playful', 'a kids\' or family brand full of colour', 'colou?rful|kids|children|family|toys?|rainbow'],
  dramatic: ['future', 'a premiere, a trailer or a big reveal', 'dramatic|premiere|trailer|cinema|film|reveal|theatre'],
  energetic: ['loud', 'sport, fitness or an event with energy', 'energ\\w*|fitness|gym|sport|run(ning)?|race|training'],
  expressive: ['loud', 'a creator or a studio with strong opinions', 'expressive|creator|agency|studio|opinion'],
  neobrutalism: ['playful', 'a startup with a cheeky, chunky look', 'neo-?brutal\\w*|chunky|cheeky|startup'],
  vibrant: ['playful', 'a festival, a market or a food brand full of colour', 'vibrant|festival|market|street food|tropical|summer'],
  artistic: ['story', 'an artist, an illustrator or a gallery show', 'artist|illustrat\\w*|painter|exhibition|art show', 'gouache'],
  cafe: ['warm', 'a café, a bakery or a tea room', 'caf[eé]|coffee|bakery|tea|brunch|pastr\\w*'],
  cosmic: ['future', 'space, astronomy or a night-sky event', 'cosmic|space|astronom\\w*|stars?|planet\\w*|galaxy|eclipse'],
  creative: ['playful', 'a comic, a fan club or a loud creative project', 'comic|creative|fan|pop art|cartoon', 'anime'],
  doodle: ['playful', 'a playful hand-drawn brand', 'doodle|hand-?drawn|sketch\\w*|notebook|school', 'watercolour'],
  editorial: ['editorial', 'a magazine, a blog or long reads', 'magazine|editorial|blog|essays?|long reads?|journalism|press'],
  fantasy: ['story', 'a fantasy book, a tabletop game or a story world', 'fantasy|dragons?|quest|tabletop|rpg|novel|legend', 'gouache'],
  friendly: ['warm', 'a gentle service: care, therapy, a small clinic', 'friendly|gentle|care|therap\\w*|clinic|counsel\\w*|pets?'],
  publication: ['editorial', 'a newspaper or a news site', 'news(paper)?|daily|report\\w*|headlines?|publication'],
  storytelling: ['story', 'a story told over a scroll', 'story\\w*|narrative|memoir|documentary|history', 'watercolour'],
  agentic: ['product', 'an AI tool or an assistant', 'ai|agents?|assistant|automation|copilot|llm'],
  futuristic: ['future', 'a deep-tech or robotics brand', 'futur\\w*|robot\\w*|deep tech|sci-?fi|hardware'],
  hud: ['data', 'a mission control, a sim or a game companion', 'hud|mission|control|cockpit|simulat\\w*|telemetry'],
  'trading-terminal': ['data', 'a trading, markets or analytics tool', 'trading|markets?|stocks?|crypto|analytics|terminal'],
  claymorphism: ['playful', 'a soft, rounded app for everyone', 'clay|soft|rounded|cute|friendly app'],
  glassmorphism: ['product', 'a sleek app with frosted panels', 'glass\\w*|frosted|translucent|music app|weather'],
  gradient: ['product', 'a modern launch with colour gradients', 'gradients?|launch|creator tool|social app'],
  neon: ['future', 'a night club, a gaming event or esports', 'neon|club|nightlife|esports|gaming|arcade|synth\\w*'],
  neumorphism: ['product', 'a calm utility or a smart-home app', 'neumorph\\w*|smart home|utility|controls?|thermostat'],
  skeumorphism: ['warm', 'a tactile app that looks like real objects', 'skeuomorph\\w*|skeumorph\\w*|tactile|leather|notebook|real objects'],
  application: ['product', 'a web app with a clear job', 'web app|app|tool|workspace|software'],
  corporate: ['corporate', 'a company site that needs to look trusted', 'corporate|company|consult\\w*|firm|b2b|enterprise'],
  dashboard: ['data', 'an admin panel or a dashboard', 'dashboard|admin|panel|reports?|metrics|kpis?'],
  elegant: ['luxe', 'a wedding, a hotel or a fine restaurant', 'elegant|wedding|hotel|fine dining|boutique|bridal'],
  enterprise: ['corporate', 'a large organisation, a bank or an insurer', 'enterprise|bank\\w*|insur\\w*|logistics|industrial'],
  luxury: ['luxe', 'a luxury label, jewellery or watches', 'luxury|jewel\\w*|watch(es)?|couture|perfume|high-end'],
  premium: ['luxe', 'a premium product or membership', 'premium|membership|exclusive|members club|private'],
  professional: ['corporate', 'a professional service: law, accounting, architecture', 'law(yer)?|legal|account\\w*|architect\\w*|professional'],
  clean: ['product', 'anything that should simply be clear', 'clean|clear|simple|plain'],
  contemporary: ['loud', 'a contemporary art or design brand', 'contemporary|design studio|art space|modern art'],
  flat: ['playful', 'a flat, cheerful illustration-led site', 'flat|cheerful|illustrat\\w*|onboarding'],
  minimal: ['editorial', 'a quiet portfolio or a minimal shop', 'minimal\\w*|portfolio|quiet|monochrome|less'],
  modern: ['corporate', 'a modern service or agency', 'modern|agency|service|consultancy'],
  mono: ['data', 'a developer tool, docs or a terminal look', 'developers?|docs|terminal|cli|code|mono\\w*|hacker'],
  refined: ['luxe', 'a refined brand: a winery, a florist, a stationer', 'refined|winery|wine|florist|flowers|stationer\\w*'],
  simple: ['product', 'a one-page site that just works', 'simple|one-page|landing|single page'],
  sleek: ['future', 'a sleek product in the dark', 'sleek|dark|night|premium tech|gadget|device']
}

// Google Fonts the Studio can load; anything else is swapped. Only the families these systems name.
const GOOGLE = new Set(['Inter', 'Poppins', 'Oswald', 'Open Sans', 'Montserrat', 'Space Grotesk', 'Roboto', 'Macondo', 'Silkscreen', 'Archivo Black', 'Darker Grotesque', 'Outfit', 'Limelight', 'IBM Plex Mono', 'IBM Plex Sans', 'IBM Plex Serif', 'Noto Sans', 'Fascinate', 'Audiowide', 'Bangers', 'Delius Swash Caps', 'Gelasio', 'New Rocker', 'Noto Serif Display', 'Nunito', 'Abril Fatface', 'Playfair Display', 'Plus Jakarta Sans', 'STIX Two Text', 'Space Mono', 'Germania One', 'Ubuntu', 'Jost', 'JetBrains Mono', 'Source Serif 4', 'Archivo', 'Bodoni Moda', 'Nunito Sans', 'Courier Prime', 'Lora', 'Libre Franklin'])
const SWAP = { 'Google Sans': 'Plus Jakarta Sans', 'Source Serif Pro': 'Source Serif 4', Georgia: 'Lora', 'Times New Roman': 'Lora', Arial: 'Archivo', Helvetica: 'Archivo', 'Arial Black': 'Archivo Black', Impact: 'Archivo Black', 'Courier New': 'Courier Prime', Didot: 'Bodoni Moda', 'Bodoni 72': 'Bodoni Moda', 'Avenir Next': 'Nunito Sans', Canela: 'Playfair Display', 'Franklin Gothic': 'Libre Franklin', 'Comic Sans MS': 'Delius Swash Caps' }
const PLACEHOLDER = ['#3b82f6', '#8b5cf6', '#ffffff', '#111827']
// display faces: fine for a heading, unreadable as a paragraph, so the body gets a reading face instead
const DISPLAY = new Set(['Limelight', 'Bangers', 'New Rocker', 'Macondo', 'Silkscreen', 'Fascinate', 'Audiowide', 'Delius Swash Caps', 'Germania One', 'Abril Fatface', 'Archivo Black', 'Noto Serif Display', 'Oswald'])
const READ = { story: 'Lora', editorial: 'Lora', luxe: 'Lora', warm: 'Nunito', retro: 'Space Mono' }

const hex = s => { const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(String(s || '')); if (!m) return null; const h = m[1].toLowerCase(); return `#${h.length === 3 ? [...h].map(c => c + c).join('') : h}` }
const token = (css, name) => { const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css); return m ? m[1].replace(/\s+/g, ' ').trim() : '' }
const first = stack => String(stack || '').split(',').map(f => f.replace(/["']/g, '').trim()).find(f => f && !/^(system-ui|ui-\w+|sans-serif|serif|monospace|-apple-system|BlinkMacSystemFont)$/i.test(f)) || ''
function font(name, dropped, role) {
  if (GOOGLE.has(name)) return name
  const to = SWAP[name] || (role === 'heading' ? 'Space Grotesk' : 'Inter')
  dropped.push(`${role} font ${name || '(none)'} → ${to}`)
  return to
}
const title = s => s.replace(/(^|[\s-])\w/g, c => c.toUpperCase()).replace(/-/g, ' ')

export function convert(root, id) {
  const dir = join(root, 'design-systems', id)
  const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  const md = readFileSync(join(dir, 'DESIGN.md'), 'utf8')
  const css = readFileSync(join(dir, 'tokens.css'), 'utf8')
  const [kind, forWhom, words, style] = PICK[id]
  const k = KINDS[kind]
  const dropped = []
  // the colours: DESIGN.md's own, unless they are the placeholder
  const col = n => hex(new RegExp(`^- \\*\\*${n}:\\*\\*\\s*\`(#[0-9a-fA-F]+)\``, 'm').exec(md)?.[1])
  const own = { accent: col('Primary'), link: col('Secondary'), bg: col('Surface'), text: col('Text') }
  const placeholder = [own.accent, own.link, own.bg, own.text].join() === PLACEHOLDER.join()
  const palette = (own.bg && own.text && own.accent && !placeholder)
    ? { bg: own.bg, text: own.text, accent: own.accent, link: own.link && own.link !== own.bg ? own.link : own.accent, from: 'DESIGN.md' }
    : { bg: hex(token(css, 'bg')), text: hex(token(css, 'fg')), accent: hex(token(css, 'accent')), link: hex(token(css, 'link')) || hex(token(css, 'accent')), from: 'tokens.css' }
  // the fonts: DESIGN.md's families, else the token stack
  const fam = /\*\*Families:\*\*\s*([^\n]+)/.exec(md)?.[1] || ''
  const famOf = r => new RegExp(`${r}=([^,]+)`).exec(fam)?.[1]?.trim()
  const lab = r => first(new RegExp(`^${r}:\\s*([^\\n]+)`, 'm').exec(md)?.[1])
  const heading = font(famOf('display') || lab('Display') || first(token(css, 'font-display')), dropped, 'heading')
  let body = font(famOf('primary') || lab('Body') || first(token(css, 'font-body')), dropped, 'body')
  if (DISPLAY.has(body)) { const to = READ[kind] || 'Inter'; dropped.push(`body font ${body} (a display face) → ${to}`); body = to }
  const theme = /## 1\. Visual Theme[^\n]*\n+([^\n]+)/.exec(md)?.[1] || /^>\s*(?!Category)([^\n]+)/m.exec(md)?.[1] || ''
  const name = title(String(man.name || id).replace(/\s*design system$/i, ''))
  return {
    slug: `od-${id}`, name, for: forWhom, words, kind,
    palette: { name, bg: palette.bg, text: palette.text, accent: palette.accent, link: palette.link },
    type: { name, heading, body },
    radius: token(css, 'radius-md') || '8px',
    notes: theme.replace(/\s+/g, ' ').trim().slice(0, 240),
    pictures: { style: style || k.pictures.style },
    source: { repo: 'nexu-io/open-design', commit: COMMIT, path: `design-systems/${id}/`, colours: palette.from, upstream: FROM_BERGSIDE.has(id) ? `bergside/awesome-design-skills skills/${id} (MIT)` : null },
    dropped
  }
}

export function importAll(root) {
  const out = [], seen = new Map()
  for (const id of Object.keys(PICK)) {
    if (!existsSync(join(root, 'design-systems', id, 'manifest.json'))) { console.error(`missing: ${id}`); continue }
    const p = convert(root, id)
    // two systems that come out the same look are one pack
    const key = [p.palette.bg, p.palette.text, p.palette.accent, p.type.heading, p.type.body].join('|')
    if (seen.has(key)) { console.error(`same look as ${seen.get(key)}: ${id} (left out)`); continue }
    seen.set(key, id)
    out.push(p)
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) { console.error('usage: node scripts/import-od-systems.mjs <open-design checkout>'); process.exit(2) }
  let at = ''
  try { at = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch {}
  if (at !== COMMIT) console.error(`warning: the checkout is at ${at || 'an unknown commit'}, not ${COMMIT}; update COMMIT and the NOTICE when moving the pin`)
  const packs = importAll(root)
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'opendesign', 'packs.json')
  mkdirSync(dirname(file), { recursive: true })
  const line = x => JSON.stringify(x)
  const text = `{"source": ${line({ repo: 'nexu-io/open-design', commit: COMMIT, bergside: BERGSIDE, licence: 'Apache-2.0 (Open Design); MIT (bergside/awesome-design-skills)' })},\n"kinds": {\n${Object.entries(KINDS).map(([k, v]) => `${line(k)}: ${line(v)}`).join(',\n')}\n},\n"packs": [\n${packs.map(line).join(',\n')}\n]}\n`
  writeFileSync(file, text)
  console.log(`${packs.length} packs → ${file}`)
}
