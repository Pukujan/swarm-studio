// The OpenSpec scenarios as Gherkin (decision 0019, point 2; issue #461): openspec/specs/<screen>/spec.md becomes
// tests/bdd/features/<screen>.feature, one Rule per `### Requirement:`, one Scenario per `#### Scenario:`, its
// WHEN and THEN as the steps, its Gate line as tags. playwright-bdd then binds every step to tools/dev/bdd/steps/,
// and the run fails on a step with no binding: a scenario has a test, or it is marked pending.
//
//   node tests/bdd/gen.mjs            (npm run --prefix tools/dev bdd runs it first)
//
// A scenario not tested yet is listed in tests/bdd/pending.json, "<screen> › <requirement> › <scenario>": "#N",
// the issue that will bind it. It is tagged @pending and left out of the run. A listed scenario that no longer
// exists, or a mark without an issue number, fails here, so the list cannot go stale.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SPECS = join(ROOT, 'openspec/specs')
const OUT = join(ROOT, 'tests/bdd/features')
const pending = JSON.parse(readFileSync(join(ROOT, 'tests/bdd/pending.json'), 'utf8'))

// one spec.md: its requirements, each with its scenarios (title, when, then, gates)
export function parse(text) {
  const reqs = []
  let req = null, sc = null, field = null
  for (const line of text.split(/\r?\n/)) {
    let m
    if ((m = line.match(/^### Requirement:\s*(.+)$/))) { req = { name: m[1].trim(), scenarios: [] }; reqs.push(req); sc = null; field = null; continue }
    if ((m = line.match(/^#### Scenario:\s*(.+)$/)) && req) { sc = { name: m[1].trim(), when: '', then: '', gates: [] }; req.scenarios.push(sc); field = null; continue }
    if (!sc) continue
    if ((m = line.match(/^- \*\*(WHEN|THEN)\*\*\s*(.+)$/))) { field = m[1].toLowerCase(); sc[field] = m[2].trim(); continue }
    if ((m = line.match(/^- Gate:\s*(.+)$/))) { sc.gates = [...m[1].matchAll(/`([\w-]+)`/g)].map(g => g[1]); field = null; continue }
    // a WHEN or THEN that wraps onto the next lines
    if (field && /^\s{2,}\S/.test(line)) { sc[field] += ' ' + line.trim(); continue }
    if (line.trim() === '' || /^#/.test(line)) field = null
  }
  return reqs
}

export const key = (screen, req, sc) => `${screen} › ${req} › ${sc}`
const tag = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function feature(screen, reqs) {
  const lines = [`# Generated from openspec/specs/${screen}/spec.md by tests/bdd/gen.mjs. Do not edit: edit the spec.`, `@screen-${screen}`, `Feature: ${screen}`, '']
  for (const r of reqs) {
    lines.push(`  Rule: ${r.name}`, '')
    for (const s of r.scenarios) {
      const mark = pending[key(screen, r.name, s.name)]
      const tags = [...s.gates.map(g => `@gate-${tag(g)}`), ...(mark ? ['@pending', `@pending-${mark.slice(1)}`] : [])]
      if (tags.length) lines.push(`    ${tags.join(' ')}`)
      lines.push(`    Scenario: ${s.name}`, `      When ${s.when}`, `      Then ${s.then}`, '')
    }
  }
  return lines.join('\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const seen = new Set(), problems = []
  let n = 0, marked = 0
  for (const screen of readdirSync(SPECS).sort()) {
    const reqs = parse(readFileSync(join(SPECS, screen, 'spec.md'), 'utf8'))
    for (const r of reqs) for (const s of r.scenarios) {
      const k = key(screen, r.name, s.name)
      if (seen.has(k)) problems.push(`two scenarios are called "${k}"`)
      seen.add(k)
      if (!s.when || !s.then) problems.push(`"${k}" has no WHEN or no THEN`)
      n++
      if (pending[k]) marked++
    }
    writeFileSync(join(OUT, `${screen}.feature`), feature(screen, reqs))
  }
  for (const [k, v] of Object.entries(pending)) {
    if (!seen.has(k)) problems.push(`tests/bdd/pending.json lists "${k}", which no spec has`)
    if (!/^#\d+$/.test(v)) problems.push(`tests/bdd/pending.json marks "${k}" with "${v}": a mark is an issue number, "#N"`)
  }
  if (problems.length) { console.log(problems.join('\n')); process.exit(1) }
  console.log(`${n} scenarios from ${readdirSync(SPECS).length} specs: ${n - marked} to run, ${marked} pending`)
}
