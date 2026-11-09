// Visual review: a vision model looks at a screenshot of one finished page and
// names the few problems a designer would fix first, each tied to a section.
// A builder then rewrites that section with the note, streamed like any build.

import { streamChat } from './llm.mjs'
import { WORKER_SYSTEM, SVG_ONLY, IMAGE_RULE } from './prompts.mjs'

const NO_THINKING = { reasoning_effort: 'none', reasoning: { enabled: false } }

function reviewMessages({ brief, page, sections, image }) {
  const list = sections.map(s => `${s.key} "${s.role}": y ${s.top}-${s.top + s.height}px`).join('\n')
  return [
    {
      role: 'system',
      content: `You are a senior product designer reviewing a screenshot of one page of a website, built by a team of AI agents.

Name only real, visible problems a visitor would notice, worst first: text cut off, overlapping or unreadable; poor contrast; broken or lopsided layout; a section that looks empty or unfinished; an image box with nothing in it; inconsistent spacing between sections; buttons that don't look clickable. Ignore taste. If the page looks good, return no issues.

Return JSON only: {"verdict":"one short sentence on the page","issues":[{"section":"section key from the list","problem":"what is wrong, under 15 words","fix":"what to change, under 25 words"}]}
At most 3 issues. Use only section keys from the list; the y ranges say where each section is in the screenshot.`
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Site: ${brief}\nPage: ${page}\nSections, top to bottom:\n${list}` },
        { type: 'image_url', image_url: { url: image } }
      ]
    }
  ]
}

function parse(text) {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON in the review')
  return JSON.parse(text.slice(start, end + 1))
}

export async function reviewPage({ provider, model, brief, page, sections, image, signal }) {
  const res = await streamChat(provider, { trace: { kind: 'review', page }, model, messages: reviewMessages({ brief, page, sections, image }), maxTokens: 900, temperature: 0.2, extra: NO_THINKING, signal })
  const raw = parse(res.text)
  const keys = new Set(sections.map(s => s.key))
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
  const issues = (raw.issues || [])
    .filter(i => keys.has(i.section) && i.problem)
    .slice(0, 3)
    .map(i => ({ section: i.section, problem: clip(i.problem, 120), fix: clip(i.fix, 200) }))
  return { verdict: clip(raw.verdict, 160), issues, ms: Math.round(res.totalMs) }
}

// A person's comment ("make the hero darker"): which sections it is about, and a
// one-line reply from the agent who takes it. A comment made on a selected
// section skips this.
export async function routeComment({ provider, model, text, sections, signal }) {
  const list = sections.map(s => `${s.key} "${s.role}"${s.head ? `: ${s.head}` : ''}`).join('\n')
  const res = await streamChat(provider, {
    trace: { kind: 'route' },
    model,
    messages: [
      { role: 'system', content: 'A person left a comment on a website a team of agents built. Pick the section or sections it is about (at most 3; a change to something that appears on every page, like the nav or footer, is the shared "*/" section). Return JSON only: {"sections":["section key"],"reply":"what the agent taking it says back, first person, casual, under 12 words"}' },
      { role: 'user', content: `Sections:\n${list}\n\nComment: ${text}` }
    ],
    maxTokens: 300, temperature: 0.3, extra: NO_THINKING, signal
  })
  const raw = parse(res.text)
  const keys = new Set(sections.map(s => s.key))
  return { sections: (raw.sections || []).filter(k => keys.has(k)).slice(0, 3), reply: String(raw.reply || '').replace(/\s+/g, ' ').trim().slice(0, 90) }
}

// Rewrite one section with the reviewer's note, or with a person's comment.
// Streams like a build.
export async function fixSection({ provider, model, theme, html, role, problem, fix, comment, images = false, onDelta, signal }) {
  const messages = [
    {
      role: 'system',
      content: `${images ? `${WORKER_SYSTEM.replace(SVG_ONLY, '')}\n${IMAGE_RULE}` : WORKER_SYSTEM}\n\nTheme "${theme?.name || ''}": ${theme?.direction || ''}\nFonts: headings ${theme?.fonts?.heading}, body ${theme?.fonts?.body}. Radius ${theme?.radius}.`
    },
    {
      role: 'user',
      content: `${comment
        ? `The person designing this site left a comment on this ${role} section: "${comment}"\n\nRewrite the section to do what they ask, and nothing else. Keep everything else as it is: links`
        : `A design reviewer looked at this ${role} section on the live page and found a problem.\nProblem: ${problem}\nFix: ${fix}\n\nRewrite the section so the problem is gone. Keep its content, links`} (data-goto), images (keep every <img> with its data-gen and src exactly) and everything that already works. Output the full corrected section only.

Current section:
${html}`
    }
  ]
  // room for the whole section again plus what is added: a big section (a map, a
  // table) cut off at a fixed limit loses its end and breaks
  const maxTokens = Math.min(16000, Math.max(8000, Math.ceil(html.length / 1.2)))
  const res = await streamChat(provider, { trace: { kind: comment ? 'fix' : 'review-fix' }, model, messages, maxTokens, temperature: 0.4, extra: NO_THINKING, signal, onDelta })
  const out = res.text.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '')
  if (!/<\/(section|nav|footer|header|div)>\s*(<!--[\s\S]*?-->\s*)*$/i.test(out)) throw new Error('the rewrite was cut off before the end, so the section was kept as it was')
  return res.text
}
