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
- Vary the section roles so pages don't look alike. Give each page one memorable, unusual section.
- A distinctive, characterful palette and font pairing that fits the product. No purple gradients. Good contrast.`

export const PAGE_PLANNER_SYSTEM = `You are a page planner in a design swarm. You plan the sections ("layers") of ONE page of a website; builder agents then build every layer in parallel from your plan, so each layer must carry all of its own copy.

Output JSON Lines ONLY: one JSON object per line, no prose, no markdown fences, no blank lines. One line per section, in page order, then stop:
{"type":"layer","page":"<page id>","id":"<page id>-<role>","role":"<role>","content":"<the EXACT copy for this section: headline, subline, every item with its real wording and numbers, button labels>","links":["<page ids this section's buttons go to>"],"height":<estimated px height at 1280px wide, 200-900>}

Rules:
- Follow the section list you are given, in order. Use each role once.
- Real, specific, confident copy that fits the product. No lorem ipsum, no placeholders.
- Don't repeat the navigation or footer; they are shared and already planned.
- Link onward: the home page links to every other page at least once; other pages link back or onward.`

export function pagePlannerMessages({ brief, theme, plan, page }) {
  return [
    { role: 'system', content: PAGE_PLANNER_SYSTEM },
    {
      role: 'user',
      content: [
        `Brief: ${brief}`,
        `Theme "${theme?.name || ''}": ${theme?.direction || ''}`,
        `Site pages: ${plan.pages.map(p => `${p.id} ("${p.title}": ${p.purpose})`).join('; ')}.`,
        `Navigation: ${plan.shared.find(l => l.id === 'nav')?.content || ''}`,
        `Plan this page: ${page.id} — "${page.title}": ${page.purpose}`,
        `Sections, in order: ${page.sections || 'hero, features, testimonial, cta'}`
      ].join('\n')
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
- Responsive: works at 390px and 1440px wide. No horizontal overflow. Content width max-w-6xl mx-auto with px-6.
- Considered design: clear hierarchy, generous whitespace, one coherent rhythm. No gradient text, no glassmorphism, no purple glow.
- Buttons or links that go to another page get data-goto="<page id>".
- As you work, every 3 to 6 elements write a short note about what you are doing as an HTML comment: <!-- say: ... --> (under 12 words, first person, specific).`

export function workerMessages({ theme, plan, page, layer }) {
  const shared = [
    `Theme "${theme.name}": ${theme.direction}`,
    `Fonts: headings ${theme.fonts?.heading}, body ${theme.fonts?.body}. Radius ${theme.radius}.`,
    `Site pages: ${plan.pages.map(p => `${p.id} ("${p.title}")`).join(', ')}.`
  ].join('\n')

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
    layer.links?.length ? `Buttons in this layer link to: ${layer.links.join(', ')} (use data-goto).` : '',
    `Content (use word for word):\n${layer.content}`
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: `${WORKER_SYSTEM}\n\n${shared}` },
    { role: 'user', content: task }
  ]
}
