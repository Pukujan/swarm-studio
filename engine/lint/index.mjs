// The slop linter for one streamed section (decision 0016, issue #448): Open Design's rules
// (artifact.mjs, ported) and Swarm's own for Tailwind sections (rules.mjs). Model-free and quick, so it
// runs on every section a builder finishes (engine/run.mjs). P0 findings go back to that builder for one
// fix pass; what is left goes to the reviewer (server/server.mjs).
//
//   lintSection(html, { content })   [{ severity: 'P0'|'P1'|'P2', id, message, fix, snippet? }], P0 first.
//     content: what the planner gave the builder to use word for word; copy found in it is not flagged
//   forBuilder(list)    the findings as a problem and a fix, for fixSection (engine/review.mjs)
import { lintArtifact } from './artifact.mjs'
import { sectionFindings, chromeFindings } from './rules.mjs'

export { chromeFindings }

// upstream rules for a whole page or a deck, not one section: comment anchors (Swarm's sections are
// addressed by layer id), slide themes, and the serif display face (a Swarm theme picks its own fonts)
const NOT_FOR_SECTIONS = new Set(['missing-section-anchor', 'slide-theme-missing', 'slide-rhythm', 'sans-display'])
const RANK = { P0: 0, P1: 1, P2: 2 }

// rules about the words: the builder must use the planner's content as given, so they judge only what it added
const COPY = new Set(['invented-metric', 'filler-copy'])
const given = (content, snippet) => !!snippet && String(content || '').toLowerCase().includes(snippet.toLowerCase())

export function lintSection(html, { content = '' } = {}) {
  const seen = new Set(), out = []
  for (const f of [...lintArtifact(html), ...sectionFindings(html)]) {
    if (NOT_FOR_SECTIONS.has(f.id) || seen.has(f.id) || (COPY.has(f.id) && given(content, f.snippet))) continue
    seen.add(f.id)
    out.push(f)
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}

export function forBuilder(findings) {
  return {
    problem: findings.map(f => `[${f.severity}] ${f.message}${f.snippet ? ` (${f.snippet})` : ''}`).join(' '),
    fix: findings.map(f => f.fix).join(' ')
  }
}
