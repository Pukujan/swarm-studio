#!/usr/bin/env node
// Speed test for the swarm idea: how fast can N agents each write one layer of a page?
//
//   node bench/speedtest.mjs probe  <model> [<model> ...]     one layer per model, all models at once
//   node bench/speedtest.mjs burst  <model> [--n 30]          N layers on one model, all at once
//
// Reads SWARM_BASE_URL / SWARM_API_KEY (defaults to Hermes's InferHub endpoint and key).
// Writes raw results to bench/results/<timestamp>-<mode>.json and prints a table.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { providerFromEnv, streamChat } from '../engine/llm.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// Shared opening: identical for every worker so providers can cache it.
const SYSTEM = `You are one member of a design swarm. Many agents are building ONE web page at the same time; you build exactly one layer of it.

Output ONLY an HTML fragment for your layer: a single <section> element using Tailwind utility classes. No <html>, <head>, <body>, no markdown fences, no explanation.

Rules:
- Use the theme's CSS variables through Tailwind arbitrary values, e.g. bg-[var(--background)], text-[var(--foreground)], bg-[var(--primary)], text-[var(--primary-foreground)], border-[var(--border)], text-[var(--muted-foreground)].
- Use the content you are given word for word. Never invent names, numbers or claims.
- Complete, finished markup. No placeholders, no lorem ipsum, no TODOs.
- Responsive: must work at 390px wide and at 1440px wide. No horizontal overflow.
- Considered design: clear hierarchy, generous whitespace, one coherent rhythm. No gradient text, no glassmorphism, no purple glow.
- Every 3 to 6 elements, write a short note of what you are doing as an HTML comment: <!-- say: ... --> (under 12 words).
- Links to other pages use data-goto="<page-id>" on the element.`

const THEME = `Theme (fixed, shared by every layer):
--background: #FAF7F2; --foreground: #1C1B19; --primary: #0F5C55; --primary-foreground: #FAF7F2;
--muted: #EFE9DF; --muted-foreground: #5E5A52; --border: #DDD5C8; --accent: #C8643B;
Fonts: headings "Fraunces", serif; body "Inter", sans-serif. Radius: 14px. Spacing scale: 4/8/12/16/24/32/48/64/96.
Product: "Kiln" — a pottery studio booking app for small ceramics studios.`

// 30 distinct layers so a burst is a realistic page, not 30 copies.
const LAYERS = [
  ['nav', 'Top navigation: logo "Kiln", links Studios, Classes, Pricing (data-goto="pricing"), Sign in (data-goto="signin"), button "Book a wheel".'],
  ['hero', 'Hero: headline "Fill every wheel, every week." Subline "Kiln handles bookings, waitlists and kiln schedules so you can stay at the wheel." Primary button "Start free" (data-goto="signup"), secondary "See a studio".'],
  ['logos', 'Trusted-by strip: "Used by 140 studios" with names Mudroom, Slip & Co, Earthbound, The Wheelhouse, Clayground.'],
  ['problem', 'Problem section, title "Spreadsheets were never a booking system." Three pains: double-booked wheels, no-shows nobody chases, kiln loads tracked on paper.'],
  ['feature-booking', 'Feature: "Bookings that fill themselves." Members book wheels and classes from their phone; waitlist auto-promotes when someone cancels.'],
  ['feature-kiln', 'Feature: "Kiln loads, scheduled." Track each firing: bisque or glaze, cone, shelf space left, whose pieces are in it.'],
  ['feature-members', 'Feature: "Memberships without the admin." Monthly plans, class packs, and studio hours in one place; card on file.'],
  ['stats', 'Stats row: 92% fewer no-shows; 6 hours saved a week; 31% more class revenue. Small caption "Averages across studios after 3 months."'],
  ['how-it-works', 'How it works, 3 steps: 1 Add your wheels and kilns. 2 Share your booking link. 3 Watch the calendar fill.'],
  ['testimonial-1', 'Testimonial: "We stopped losing Saturdays to no-shows." — Ana Ruiz, owner, Mudroom Ceramics.'],
  ['testimonial-2', 'Testimonial: "Our kiln schedule finally lives somewhere other than my head." — Theo Park, Slip & Co.'],
  ['pricing-header', 'Pricing header: title "Simple pricing per studio." Toggle labels Monthly / Yearly (save 2 months).'],
  ['pricing-cards', 'Three pricing cards: Starter $29/mo (1 location, 10 wheels); Studio $79/mo (unlimited wheels, kiln scheduling, waitlists) marked "Most popular"; Collective $149/mo (3 locations, shared members). Each with a "Choose" button.'],
  ['comparison', 'Comparison table rows: Wheel booking, Waitlists, Kiln scheduling, Memberships, Multi-location; columns Starter, Studio, Collective with checks.'],
  ['integrations', 'Integrations grid: Stripe, Google Calendar, Instagram, Mailchimp, Square, Zapier, each with a one-line description.'],
  ['mobile-app', 'Mobile app callout: "Your studio in their pocket." Members get reminders, book, and see when their pieces come out of the kiln.'],
  ['calendar-preview', 'Product preview: a week calendar mock with wheels as rows (Wheel 1-4) and booked time blocks labelled with member first names.'],
  ['kiln-preview', 'Product preview: a kiln load card showing "Glaze firing · Cone 6 · Thu 7pm · 78% full" with 5 member names.'],
  ['security', 'Trust section: "Payments by Stripe. Data stays yours." Three points: encrypted, export anytime, no lock-in.'],
  ['faq', 'FAQ with 5 questions: Can I import my members? Do members need an app? What happens when a class is full? Can I run several locations? Is there a contract?'],
  ['community', 'Community section: "Made with studio owners." Monthly owner calls, a shared glaze library, and a forum.'],
  ['case-study', 'Case study teaser: "How The Wheelhouse grew from 40 to 210 members." Button "Read the story".'],
  ['cta-band', 'Call to action band: "Your next firing is already on the calendar." Button "Start free" (data-goto="signup"), note "14 days free, no card".'],
  ['newsletter', 'Newsletter: "Studio notes, once a month." Email input and "Subscribe" button.'],
  ['blog', 'Three blog cards: "Pricing your classes", "Running a waitlist that works", "Kiln safety checklist", each with a 1-line summary.'],
  ['team', 'Team strip: "Built by potters and engineers." Four people: Mira Chen (CEO, potter), Jonah Bell (CTO), Sade Okoro (Design), Luis Ortega (Support).'],
  ['support', 'Support section: "Real people, real fast." Chat, email and phone; median reply 4 minutes.'],
  ['changelog', 'Changelog teaser: three recent updates with dates: Oct 28 Waitlist auto-promote; Oct 14 Kiln photos; Sep 30 Class packs.'],
  ['footer-links', 'Footer link columns: Product (Features, Pricing, Changelog), Company (About, Careers, Press), Resources (Blog, Help center, Owner calls).'],
  ['footer-legal', 'Footer bottom: "© 2026 Kiln Labs" and links Privacy, Terms, Status.']
]

function layerMessages([id, content]) {
  return [
    { role: 'system', content: `${SYSTEM}\n\n${THEME}` },
    { role: 'user', content: `Your layer id: ${id}\nContent (use word for word):\n${content}` }
  ]
}

async function runOne(provider, model, layer, extra) {
  try {
    const r = await streamChat(provider, { model, messages: layerMessages(layer), maxTokens: 2500, extra })
    return { model, layer: layer[0], ok: true, ...r, says: (r.text.match(/<!--\s*say:/g) || []).length }
  } catch (err) {
    return { model, layer: layer[0], ok: false, error: String(err.message || err) }
  }
}

const pct = (xs, p) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const sec = ms => (Number.isFinite(ms) ? (ms / 1000).toFixed(1) + 's' : '—')

function summarize(results, wallMs) {
  const ok = results.filter(r => r.ok)
  return {
    n: results.length,
    ok: ok.length,
    wall: sec(wallMs),
    firstToken: sec(Math.min(...ok.map(r => r.ttftMs ?? Infinity))),
    ttftP50: sec(pct(ok.map(r => r.ttftMs), 50)),
    doneP50: sec(pct(ok.map(r => r.totalMs), 50)),
    doneMax: sec(Math.max(...ok.map(r => r.totalMs))),
    visTokPerSecP50: Math.round(pct(ok.map(r => r.tokPerSec), 50)),
    visTokP50: Math.round(pct(ok.map(r => r.visibleTokens), 50)),
    thinking: ok.filter(r => r.reasoningChars).length,
    sayNotes: ok.reduce((a, r) => a + r.says, 0)
  }
}

function save(mode, payload) {
  const dir = join(here, 'results')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}.json`)
  writeFileSync(file, JSON.stringify(payload, null, 2))
  return file
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2)
  const provider = providerFromEnv()
  const flag = name => {
    const i = rest.indexOf(name)
    return i >= 0 ? rest[i + 1] : undefined
  }
  const n = Number(flag('--n') ?? 30)
  // --extra '<json>' is merged into the request body, e.g. to turn reasoning off.
  const extra = JSON.parse(flag('--extra') ?? '{}')
  const models = rest.filter((a, i) => !a.startsWith('--') && !['--n', '--extra'].includes(rest[i - 1]))

  if (mode === 'probe') {
    const t0 = performance.now()
    const results = await Promise.all(models.map(m => runOne(provider, m, LAYERS[1], extra)))
    const wall = performance.now() - t0
    console.table(
      results.map(r =>
        r.ok
          ? {
              model: r.model,
              think: r.reasoningChars ? `${sec(r.firstReasoningMs)}→${Math.round(r.reasoningChars / 4)}tok` : 'none',
              firstVisible: sec(r.ttftMs),
              done: sec(r.totalMs),
              'vis tok/s': Math.round(r.tokPerSec),
              visTok: r.visibleTokens,
              says: r.says
            }
          : { model: r.model, error: r.error.slice(0, 80) }
      )
    )
    console.log('saved', save('probe', { extra, wallMs: wall, results }))
  } else if (mode === 'burst') {
    const model = models[0]
    const layers = Array.from({ length: n }, (_, i) => LAYERS[i % LAYERS.length])
    const t0 = performance.now()
    const results = await Promise.all(layers.map(l => runOne(provider, model, l, extra)))
    const wall = performance.now() - t0
    const summary = { model, ...summarize(results, wall) }
    console.table([summary])
    const errors = results.filter(r => !r.ok)
    if (errors.length) console.log('errors:', [...new Set(errors.map(e => e.error.slice(0, 120)))])
    console.log('saved', save('burst', { extra, summary, results }))
  } else {
    console.log('usage: speedtest.mjs probe <model...> | burst <model> [--n 30]')
    process.exit(1)
  }
}

main()
