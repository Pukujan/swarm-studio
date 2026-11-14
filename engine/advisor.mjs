// The app advisor: before a design becomes a working app, it reads the pages
// and asks a few questions about what the business needs behind the site
// (who uses it, what gets saved, which dashboards, CRM or admin screens), each
// with a recommended answer. The answers become an app plan the person can
// tick through, and the plan becomes the app engine's brief.

import { streamChat } from './llm.mjs'

const FALLBACKS = ['deepseek-v4.1-flash', 'claude-haiku-5.5', 'gemini-3.8-flash']
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const text = html => String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

// what the advisor sees: each page, its sections and a little of their words
export function siteBrief(snap) {
  const pages = snap.pages.map((p, i) => {
    const secs = p.sections.filter(s => s.page !== '*').slice(0, 12).map(s => `  - ${s.role}: ${clip(text(s.html), 160)}`).join('\n')
    return `${i === 0 ? '/' : `/${p.id}`} ${p.title}${p.purpose ? `: ${p.purpose}` : ''}\n${secs}`
  }).join('\n')
  return clip(`${snap.brand}: ${snap.brief || ''}\n\nPages:\n${pages}`, 9000)
}

const ASK_RULES = `You are the app advisor in Swarm Studio. A designed website is about to become a real working app (React + server routes + a data store). Before it is built, you ask the owner a few questions about what the business needs BEHIND the site: who uses it, what gets saved, and which back-office screens it needs (dashboards, a CRM, an admin panel, staff views, a booking calendar, orders, inventory, reports).

Read the pages and decide what this kind of business really needs. Ask 4 to 6 short questions, the most important first. Each question has 2 to 5 concrete options written in plain words for a non-developer, and your recommended answer for THIS site (one option, or several when multi is true). "why" is one short sentence on why it matters for this site. Never ask about colours, fonts or the look: the design is done. Never ask about hosting or tech.

Reply with JSON only:
{"read": "one or two sentences: what this site is and what it will need behind it",
 "questions": [{"id": "short_id", "q": "the question", "why": "why it matters here", "options": ["...", "..."], "recommended": ["..."], "multi": false}]}`

const PLAN_RULES = `You are the app advisor in Swarm Studio. From the site and the owner's answers, write the app plan: what the working app has behind the designed site. Keep the public pages as they are. Be concrete for this business: name the data it stores and the screens staff use. Include only what the answers support; mark nice-to-haves as optional. 3 to 8 screens.

Reply with JSON only:
{"summary": "one or two sentences in plain words",
 "roles": [{"name": "Visitor", "can": "what they do"}],
 "data": [{"name": "Booking", "fields": ["name", "email", "date", "party size", "status"]}],
 "screens": [{"name": "Bookings", "path": "/admin/bookings", "for": "Staff", "what": "a calendar and list of bookings; confirm, move or cancel one", "optional": false}]}`

async function ask(provider, model, system, user, signal, maxTokens = 1800) {
  const models = [model, ...(/inferhub/.test(provider?.baseUrl || '') ? FALLBACKS.filter(m => m !== model) : [])].filter(Boolean)
  for (const m of models) {
    try {
      const res = await streamChat(provider, { trace: { kind: 'app-advisor' }, model: m, maxTokens, temperature: 0.5, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
      const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
      return { ...JSON.parse(res.text.slice(s, e + 1)), model: m }
    } catch (err) {
      if (signal?.aborted) break
      console.error(`app advisor: ${m} failed: ${String(err.message || err).slice(0, 200)}`)
    }
  }
  return null
}

const str = (v, n) => clip(String(v ?? '').trim(), n)
const list = (v, n) => (Array.isArray(v) ? v : []).map(x => str(x, 120)).filter(Boolean).slice(0, n)

function cleanQuestions(out) {
  const qs = (Array.isArray(out?.questions) ? out.questions : []).slice(0, 6).map((q, i) => {
    const options = list(q.options, 5)
    const rec = list(q.recommended, 5).filter(r => options.includes(r))
    return { id: str(q.id, 40).replace(/[^\w-]/g, '_') || `q${i + 1}`, q: str(q.q, 200), why: str(q.why, 200), options, recommended: rec.length ? (q.multi ? rec : rec.slice(0, 1)) : options.slice(0, 1), multi: !!q.multi }
  }).filter(q => q.q && q.options.length >= 2)
  return qs.length >= 2 ? qs : null
}

// When no model answers: questions that fit most sites with something to save.
const STOCK = [
  { id: 'users', q: 'Who uses the app besides visitors?', why: 'It decides which screens sit behind the site.', options: ['Just me', 'Me and a few staff', 'Staff with different jobs'], recommended: ['Me and a few staff'], multi: false },
  { id: 'saved', q: 'What should the app keep?', why: 'Everything a visitor sends needs a place to land.', options: ['Messages from the contact form', 'Bookings or appointments', 'Orders and payments', 'Sign-ups and members'], recommended: ['Messages from the contact form'], multi: true },
  { id: 'screens', q: 'Which screens do you want behind the site?', why: 'These are where you run the business day to day.', options: ['A dashboard with the numbers', 'A list of customers (CRM)', 'An admin panel to edit content', 'A calendar'], recommended: ['A dashboard with the numbers', 'A list of customers (CRM)'], multi: true },
  { id: 'notify', q: 'How should you hear about new activity?', why: 'So nothing waits unseen.', options: ['Only on the dashboard', 'An email to me', 'Both'], recommended: ['Only on the dashboard'], multi: false }
]

export async function questions({ provider, model, snap, signal }) {
  const out = await ask(provider, model, ASK_RULES, siteBrief(snap), signal)
  const qs = cleanQuestions(out)
  return { read: str(out?.read, 400) || `${snap.brand} is designed. Before it becomes a working app, a few questions about what it needs behind the site.`, questions: qs || STOCK, model: qs ? out.model : null }
}

function cleanPlan(out) {
  const screens = (Array.isArray(out?.screens) ? out.screens : []).slice(0, 10).map(s => ({ name: str(s.name, 60), path: str(s.path, 60).replace(/[^\w/-]/g, '') || '/admin', for: str(s.for, 40), what: str(s.what, 240), optional: !!s.optional })).filter(s => s.name)
  if (!screens.length) return null
  return {
    summary: str(out.summary, 400),
    roles: (Array.isArray(out.roles) ? out.roles : []).slice(0, 6).map(r => ({ name: str(r.name, 40), can: str(r.can, 200) })).filter(r => r.name),
    data: (Array.isArray(out.data) ? out.data : []).slice(0, 10).map(d => ({ name: str(d.name, 40), fields: list(d.fields, 14) })).filter(d => d.name),
    screens
  }
}

export async function writePlan({ provider, model, snap, qa, signal }) {
  const answers = (Array.isArray(qa) ? qa : []).slice(0, 8).map(x => `${str(x.q, 200)} ${list(x.a, 6).join('; ') || str(x.a, 300) || '(no answer)'}`).join('\n')
  const out = await ask(provider, model, PLAN_RULES, `${siteBrief(snap)}\n\nThe owner's answers:\n${answers}`, signal, 2200)
  return cleanPlan(out) || {
    summary: `A working ${snap.brand} with a back office for what visitors send.`,
    roles: [{ name: 'Visitor', can: 'uses the site and sends forms' }, { name: 'Owner', can: 'sees and manages everything saved' }],
    data: [{ name: 'Submission', fields: ['name', 'email', 'message', 'date', 'status'] }],
    screens: [{ name: 'Dashboard', path: '/admin', for: 'Owner', what: 'counts of new and handled items, the latest few', optional: false }, { name: 'Inbox', path: '/admin/inbox', for: 'Owner', what: 'everything visitors sent; mark one handled', optional: false }]
  }
}

// The approved plan, as the engine's instruction for what goes behind the site.
export function planBrief(plan) {
  if (!plan?.screens?.length) return ''
  const screens = plan.screens.map(s => `- ${s.name} at ${s.path}${s.for ? ` (for ${s.for})` : ''}: ${s.what}`).join('\n')
  const data = (plan.data || []).map(d => `- ${d.name}: ${d.fields.join(', ')}`).join('\n')
  const roles = (plan.roles || []).map(r => `- ${r.name}: ${r.can}`).join('\n')
  // a plan locked in the App kit (engine/appkit.mjs): its screens are the whole app, public and admin,
  // in the order a person meets them, with the arrows between them and what it connects to
  if (plan.kit) {
    const flow = (plan.flow || []).map(f => `- ${f}`).join('\n')
    const conns = (plan.connects || []).map(c => `- ${c.name}${c.choice ? ` (${c.choice})` : ''}: ${c.how}`).join('\n')
    const start = { screens: 'the main screen', signup: 'the sign-up flow', data: 'the data and its admin screens' }[plan.start]
    return `The owner locked this app plan. Build all of it, exactly these screens at these paths; it is checked against this plan afterwards.
${plan.summary ? `\n${plan.summary}\n` : ''}${roles ? `\nWho uses it:\n${roles}\n` : ''}${data ? `\nWhat it keeps (typed records in the server store, each with an id and created date):\n${data}\n` : ''}
Screens (path, who it is for, what it does). Screens for an admin sit under /admin behind the admin's sign-in (or a passcode from the ADMIN_PASSCODE env var, "admin" in development, when there is no sign-in), with a shared sidebar layout in the site's theme:
${screens}
${flow ? `\nHow the screens lead to each other (a button or link for each arrow):\n${flow}\n` : ''}${conns ? `\nWhat it connects to (keys are read from process.env in server code only, never sent to the browser):\n${conns}\n` : ''}${start ? `\nBuild ${start} first and make it work end to end before the rest.\n` : ''}
Every form writes into these records, and the screens read and change them through server routes.`
  }
  return `The owner approved this app plan. Build all of it.
${plan.summary ? `\n${plan.summary}\n` : ''}${roles ? `\nWho uses it:\n${roles}\n` : ''}${data ? `\nWhat it stores (typed records in the server store, each with an id and created date):\n${data}\n` : ''}
Screens behind the site, under /admin, not linked from the public nav, with a shared sidebar layout in the site's theme (shadcn Sidebar, Table, Card, Calendar, Dialog), and a simple passcode gate on /admin read from the ADMIN_PASSCODE env var (default "admin" in development):
${screens}

Every public form and booking writes into these records, and the screens read and change them through server routes.`
}
