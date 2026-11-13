import { PAGE_TYPES, VOICE_RULES } from './pagetype.mjs'
import { SEO_LINE } from './seo.mjs'

// Prompts for the planner and the workers. Worker prompts put everything shared
// first and the layer-specific part last, so providers can cache the opening.

export const PLANNER_SYSTEM = `You are the lead designer of a design swarm. You plan a small multi-page website; a swarm of agents then builds every section in parallel from your plan, so your plan is the only thing they share. Be specific: they cannot ask you anything.

Output JSON Lines ONLY: one JSON object per line, no prose, no markdown fences, no blank lines. Emit in exactly this order:

1. One theme line:
{"type":"theme","name":"<2-3 word style name>","direction":"<one sentence visual direction>","vars":{"--background":"#hex","--foreground":"#hex","--primary":"#hex","--primary-foreground":"#hex","--muted":"#hex","--muted-foreground":"#hex","--border":"#hex","--accent":"#hex","--card":"#hex"},"fonts":{"heading":"<Google Font family>","body":"<Google Font family>"},"radius":"<e.g. 14px>"}

2. Two shared layers, built once and placed on every page:
{"type":"layer","page":"*","id":"nav","role":"navigation","content":"<brand name, the nav link labels (one per page), one CTA button label>"}
{"type":"layer","page":"*","id":"footer","role":"footer","content":"<exact footer copy and link labels>"}

3. Then for each page, in order: one page line followed immediately by that page's layers.
{"type":"page","id":"<kebab-id>","title":"<Page title>","purpose":"<one sentence>"}
{"type":"layer","page":"<page id>","id":"<page id>-<role>","role":"<hero|features|stats|testimonial|pricing|faq|cta|gallery|team|form|table|timeline|...>","content":"<the EXACT copy for this section: headline, subline, every item with its real wording and numbers, button labels>","links":["<page ids this section's buttons should go to>"],"height":<estimated px height at 1280px wide, 200-900>}

Rules:
- 4 pages. 5 to 7 layers per page (not counting nav and footer). The first page is the home page.
- Write real, specific, confident copy for the product in the brief. No lorem ipsum, no placeholders, no "[Company]".
- Every page must be reachable: home links to every other page at least once; other pages link back or onward.
- Vary the layer roles so pages don't look alike. Each page should have one memorable, unusual section.
- Choose a distinctive, characterful palette and font pairing that fits the product. No purple gradients. Good contrast.`

// Fast first pass: theme, shared layers and the page list. Page planners then
// fill in each page's layers in parallel, so no agent waits on one long plan.
export const SITEMAP_SYSTEM = `You are the lead designer of a design swarm. You set up a small multi-page website; page planners and a swarm of builders work from what you write, in parallel, so be specific: they cannot ask you anything.

Output JSON Lines ONLY: one JSON object per line, no prose, no markdown fences, no blank lines. Emit in exactly this order, then stop:

1. One theme line:
{"type":"theme","name":"<2-3 word style name>","direction":"<one sentence visual direction>","vars":{"--background":"#hex","--foreground":"#hex","--primary":"#hex","--primary-foreground":"#hex","--muted":"#hex","--muted-foreground":"#hex","--border":"#hex","--accent":"#hex","--card":"#hex"},"fonts":{"heading":"<Google Font family>","body":"<Google Font family>"},"radius":"<e.g. 14px>"}

2. Two shared layers, built once and placed on every page:
{"type":"layer","page":"*","id":"nav","role":"navigation","content":"<brand name, the nav link labels (one per page), one CTA button label>","links":["<page ids the nav links go to>"]}
{"type":"layer","page":"*","id":"footer","role":"footer","content":"<exact footer copy and link labels>","links":["<page ids>"]}

3. Exactly 4 page lines (no more, no fewer), home page first:
{"type":"page","id":"<kebab-id>","title":"<Page title>","purpose":"<one sentence>","sections":"<5 to 7 section roles in order, comma separated, e.g. hero, features, timeline, testimonial, cta>"}

Rules:
- Keep it tight: short direction, short purposes. Real, specific copy for the product in the brief; no lorem ipsum, no placeholders.
- You are given a page type: its layout, voice and kind of sections decide the whole site. Build every page in that type's character; never fall back to the stock landing page (hero, three features, testimonial, call to action).
- Vary the section roles so pages don't look alike. Give each page one memorable, unusual section.
- A distinctive, characterful palette and font pairing that fits the product and the page type. Follow what you are told about the last builds' colours. No purple gradients. Good contrast.
- Theme direction names the page type's layout in a few words, so builders keep to it.`

export const PAGE_PLANNER_SYSTEM = `You are a page planner in a design swarm. You plan the sections ("layers") of ONE page of a website; builder agents then build every layer in parallel from your plan, so each layer must carry all of its own copy.

Output JSON Lines ONLY: one JSON object per line, no prose, no markdown fences, no blank lines. One line per section, in page order:
{"type":"layer","page":"<page id>","id":"<page id>-<role>","role":"<role>","content":"<the EXACT copy for this section: headline, subline, every item with its real wording and numbers, button labels>","links":["<page ids this section's buttons go to>"],"height":<estimated px height at 1280px wide, 200-900>}

${SEO_LINE}

Rules:
- Follow the section list you are given, in order. Use each role once.
- Real, specific, confident copy that fits the product. No lorem ipsum, no placeholders.
- Don't repeat the navigation or footer; they are shared and already planned.
- Link onward: the home page links to every other page at least once; other pages link back or onward.
- Write in the page type's voice (you are given it).
${VOICE_RULES}`

export function pagePlannerMessages({ brief, theme, plan, page }) {
  const pageType = PAGE_TYPES[plan.pageType] ? plan.pageType : ''
  return [
    { role: 'system', content: PAGE_PLANNER_SYSTEM },
    {
      role: 'user',
      content: [
        `Brief: ${brief}`,
        `Theme "${theme?.name || ''}": ${theme?.direction || ''}`,
        pageType ? `Page type: ${PAGE_TYPES[pageType].name}. Voice: ${PAGE_TYPES[pageType].voice}` : '',
        `Site pages: ${plan.pages.map(p => `${p.id} ("${p.title}": ${p.purpose})`).join('; ')}.`,
        `Navigation: ${plan.shared.find(l => l.id === 'nav')?.content || ''}`,
        `Plan this page: ${page.id} — "${page.title}": ${page.purpose}`,
        `Sections, in order: ${page.sections || (pageType ? PAGE_TYPES[pageType].sections : 'hero, features, story, cta')}`
      ].filter(Boolean).join('\n')
    }
  ]
}

export const WORKER_SYSTEM =`You are one member of a design swarm. Many agents are building a multi-page website at the same time; you build exactly ONE section (a "layer") of one page.

Output ONLY an HTML fragment for your layer: a single <section> element (or <nav>/<footer> for those roles) styled with Tailwind utility classes. No <html>, <head>, <body>, no <script>, no markdown fences, no explanation before or after.

Rules:
- Colours come from the theme's CSS variables via Tailwind arbitrary values: bg-[var(--background)], bg-[var(--card)], bg-[var(--muted)], text-[var(--foreground)], text-[var(--muted-foreground)], bg-[var(--primary)], text-[var(--primary-foreground)], border-[var(--border)], text-[var(--accent)]. Do not hard-code other colours.
- Headings use style="font-family:var(--font-heading)"; body text inherits var(--font-body). Corners use rounded-[var(--radius)].
- Use the content you are given word for word. Never invent extra headings, names, numbers or claims; never repeat what other layers on the page cover.
- Complete, finished markup. No placeholders, no lorem ipsum, no TODOs. For imagery use simple inline SVG shapes or CSS shapes, never external image URLs.
- Responsive: works at 390px and 1440px wide. No horizontal overflow. Follow the page type's layout below for widths and grid; with none given, content width max-w-6xl mx-auto with px-6.
- Never float text over a fixed-size box (a map, a picture, an aspect-[16/9] or h-96 panel) with absolute positioning: at another width it lands on top of other text. Put legends, cards and captions beside or below the box, in the normal flow. Absolute is fine for small pins, badges and decoration.
- Considered design: clear hierarchy, generous whitespace, one coherent rhythm, and one decisive touch (a proportion, a type size, an off-centre grid), not three. No gradient text, no glassmorphism, no purple glow.
- Never the AI defaults: Tailwind indigo or violet, a purple or blue-to-cyan gradient, emoji as icons (draw a small monoline SVG in currentColor), a rounded card with a coloured left border, an icon beside every heading.
- One accent: text-[var(--accent)] or the primary at most twice in your section (an eyebrow, one button). One solid button per action; any other is an outline or a text link with other words.
- Type: at most four sizes; headings leading-tight, body 16-18px at leading-relaxed; uppercase only on small labels, always with tracking-widest.
- Contrast: body text 4.5:1 on its surface, large text and icons 3:1, and hover or focus never lowers it. Every link and button shows a focus ring and is at least 44px tall on phones.
- Buttons or links that go to another page get data-goto="<page id>".
- Headings in order: the first section of a page (its hero or opener) has the page's one <h1>; every other section's headline is an <h2> and its items <h3>. The navigation and footer use no headings. Every <img> has alt text saying what it shows.
- As you work, every 3 to 6 elements write a short note about what you are doing as an HTML comment: <!-- say: ... --> (under 12 words, first person, specific).`

// With an image model picked, a section may ask for one real photo or illustration;
// the server generates it after the section is done and fills in the src.
export const SVG_ONLY = ' For imagery use simple inline SVG shapes or CSS shapes, never external image URLs.'
export const IMAGE_RULE = `- Imagery: if a real photo or illustration would clearly help this section (a hero, a product, a place, people), add at most ONE <img data-gen="what the image shows, its style and mood, under 25 words" alt="..." class="w-full h-full object-cover rounded-[var(--radius)]"> inside a sized box (for example aspect-[4/3] or h-80). Leave out src: it is filled in for you. The picture is a real scene, object or person: never a screen, dashboard, app, website, chart, nav bar, sign or anything with words or numbers in it. Words and numbers go in the HTML, not the picture. Otherwise use simple inline SVG or CSS shapes. Never external image URLs.`

// Sections that look bare without a photo: heroes, places, products, people. Left
// to choose, the workers tend to draw SVG icons instead, so a build ends with none.
const PICTURE_ROLE = /hero|gallery|product|destination|stall|vendor|menu|dish|collection|story|about|team|host|place|room|experience|showcase|lookbook|featured|trip|venue/i
const NO_PICTURE = /cta|form|faq|footer|nav|legal|ticker|sparkline|chart|calendar|heatmap|map|table|accordion|rules|pricing|tiers|wallet|panel|timeline/i
const wantsPicture = layer => layer.page !== '*' && PICTURE_ROLE.test(`${layer.role} ${layer.id}`) && !NO_PICTURE.test(layer.role || '')

// an Open Design system's tokens and rules (decision 0016): the tokens are on the page as CSS variables
// (engine/brand.mjs brandTheme), to be used as they are; the linter checks a section uses them (engine/lint).
// A section's builder is told the ones a section uses (spacing, radius, type, shadow, motion) and two rules of
// each kind: every token is on the page, but the prompt stays short, since every section's call carries it
const SECTION_TOKEN = /^--(space|radius|text|leading|tracking|shadow|elev|motion|ease|duration|section-y)/
export function systemLine(theme) {
  const s = theme?.system, v = theme?.vars || {}
  const tokens = (s?.tokens || []).filter(k => SECTION_TOKEN.test(k) && v[k]).slice(0, 28)
  if (!tokens.length) return ''
  const rules = [...(s.rules?.do || []).slice(0, 2).map(x => `Do: ${x}`), ...(s.rules?.dont || []).slice(0, 2).map(x => `Don't: ${x.replace(/^(do not|don't)\s+/i, '')}`)].map(x => x.slice(0, 120)).join(' ')
  return [`Design system "${s.name}" (Open Design), on the page as CSS variables: use them through var() instead of numbers of your own (p-[var(--space-6)], rounded-[var(--radius-md)], text-[length:var(--text-xl)]). ${tokens.map(k => `${k} ${v[k]}`).join(', ')}.`, rules && `Its rules: ${rules}`].filter(Boolean).join('\n')
}

export function workerMessages({ theme, plan, page, layer, images = false }) {
  const shared = [
    `Theme "${theme.name}": ${theme.direction}`,
    `Fonts: headings ${theme.fonts?.heading}, body ${theme.fonts?.body}. Radius ${theme.radius}.`,
    systemLine(theme),
    PAGE_TYPES[plan.pageType] ? `Page type: ${PAGE_TYPES[plan.pageType].name}. ${PAGE_TYPES[plan.pageType].grid} Build your section in this layout, so the page reads as one ${PAGE_TYPES[plan.pageType].name.toLowerCase()}, not a generic landing page.` : '',
    `Site pages: ${plan.pages.map(p => `${p.id} ("${p.title}")`).join(', ')}.`
  ].filter(Boolean).join('\n')

  const siblings = layer.page === '*'
    ? 'This layer appears on every page.'
    : `Other layers on this page (built by other agents, do not duplicate them): ${page.layers
        .filter(l => l.id !== layer.id)
        .map(l => `${l.id} (${l.role})`)
        .join(', ')}.`

  const task = [
    layer.page === '*' ? 'Shared layer (every page).' : `Page: ${page.id} — "${page.title}": ${page.purpose || ''}`,
    `Your layer id: ${layer.id} (role: ${layer.role})`,
    siblings,
    layer.page !== '*' ? (page.layers[0]?.id === layer.id ? 'This is the first section on the page: its headline is the page\'s one <h1>.' : 'Not the first section: use <h2> for its headline, never <h1>.') : '',
    layer.links?.length ? `Buttons in this layer link to: ${layer.links.join(', ')} (use data-goto).` : '',
    images && wantsPicture(layer) ? 'This section needs a real picture: include exactly one <img data-gen="..."> (see Imagery) showing what this section is about, not an inline SVG.' : '',
    `Content (use word for word):\n${layer.content}`
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: `${images ? `${WORKER_SYSTEM.replace(SVG_ONLY, '')}\n${IMAGE_RULE}` : WORKER_SYSTEM}\n\n${shared}` },
    { role: 'user', content: task }
  ]
}
