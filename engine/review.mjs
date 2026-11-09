// Visual review: a vision model looks at a screenshot of one finished page and
// names the few problems a designer would fix first, each tied to a section.
// A builder then rewrites that section with the note, streamed like any build.

import { streamChat } from './llm.mjs'
import { WORKER_SYSTEM } from './prompts.mjs'

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
  const res = await streamChat(provider, { model, messages: reviewMessages({ brief, page, sections, image }), maxTokens: 900, temperature: 0.2, extra: NO_THINKING, signal })
  const raw = parse(res.text)
  const keys = new Set(sections.map(s => s.key))
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
  const issues = (raw.issues || [])
    .filter(i => keys.has(i.section) && i.problem)
    .slice(0, 3)
    .map(i => ({ section: i.section, problem: clip(i.problem, 120), fix: clip(i.fix, 200) }))
  return { verdict: clip(raw.verdict, 160), issues, ms: Math.round(res.totalMs) }
}

// Rewrite one section with the reviewer's note. Streams like a build.
export async function fixSection({ provider, model, theme, html, role, problem, fix, onDelta, signal }) {
  const messages = [
    {
      role: 'system',
      content: `${WORKER_SYSTEM}\n\nTheme "${theme?.name || ''}": ${theme?.direction || ''}\nFonts: headings ${theme?.fonts?.heading}, body ${theme?.fonts?.body}. Radius ${theme?.radius}.`
    },
    {
      role: 'user',
      content: `A design reviewer looked at this ${role} section on the live page and found a problem.
Problem: ${problem}
Fix: ${fix}

Rewrite the section so the problem is gone. Keep its content, links (data-goto), images (keep every <img> with its data-gen and src exactly) and everything that already works. Output the full corrected section only.

Current section:
${html}`
    }
  ]
  const res = await streamChat(provider, { model, messages, maxTokens: 3500, temperature: 0.4, extra: NO_THINKING, signal, onDelta })
  return res.text
}
