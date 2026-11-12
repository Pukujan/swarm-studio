// The App kit (docs/specs/37-studio-first.md): what an app is, decided before it is built. Who uses it,
// a map of its screens with arrows between them, the things it keeps, what it connects to, and where to
// start. It is filled from the conversation (a planner model when there is one, the brief's own words
// when there is none), edited on the board, and locked into the spec the app build and its reviewer read.
//
//   draftKit(brief)                 -> kit   the brief's own words, no model
//   kitMessages(brief, said, kit)   -> chat messages for one planner call; readKit(reply, kit) cleans it
//   cleanKit(raw)                   -> kit   every kit that comes in (a model, the web) goes through it
//   editKit(kit, op)                -> kit   one edit from the board
//   connectsOf(kit, have)           -> each connection with its state: ready, key or none
//   askConnect(text, kit)           -> { kit, say, options } when the person asks what to connect to
//   kitLeft(kit)                    -> what is still open ("2 left")
//   kitWords(kit)                   -> the locked spec in plain words
//   kitPlan(kit, have)              -> the app plan the app engine builds (engine/advisor.mjs planBrief)
//   kitProposal(kit)                -> { items, minutes, credits }
//   kitChecks(kit, appDir)          -> [{ part, ok, note }]  the built app against the locked kit
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s)
const slug = s => clip(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'
const uniq = (list, key = x => x.id) => { const seen = new Set(); return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true }) }

export const STARTS = ['screens', 'signup', 'data']
export const KINDS = ['signin', 'payments', 'email', 'storage', 'api']
export const LIMITS = { users: 6, screens: 16, data: 10, fields: 10, connects: 8 }

// ---------- what each kind of connection can be. `needs` is what has to be connected first: env names
// the studio gets from Hermes's secret scope, or 'supabase' (Hermes's Supabase connector or its keys).
// `how` is the build's instruction for that choice. Names only ever reach the person, never a key.
export const CONNECT = {
  signin: { name: 'Sign-in', options: [
    { id: 'email', name: 'Email and password', needs: [], how: 'Email and password sign-in built into the app: passwords hashed with scrypt, the session in an httpOnly cookie, sign-up, sign-in, sign-out and a reset link (sent through the email connection). Never a sign-in that accepts any password.' },
    { id: 'magic', name: 'Email link', needs: [], how: 'Passwordless sign-in: the person types their email and gets a one-time link (through the email connection) that signs them in for 30 days; the session in an httpOnly cookie.' },
    { id: 'supabase', name: 'Supabase Auth', needs: ['supabase'], how: 'Sign-in through Supabase Auth (email and password via supabase-js on the server, the session in an httpOnly cookie); when SUPABASE_URL is missing fall back to built-in email and password.' }
  ] },
  payments: { name: 'Payments', options: [
    { id: 'stripe', name: 'Stripe', needs: ['STRIPE_SECRET_KEY'], how: 'Payments through Stripe Checkout in test mode only (process.env.STRIPE_SECRET_KEY starting sk_test_, server code only); a paid order is confirmed by verifying the session on return. With no test key, the demo checkout below.' },
    { id: 'demo', name: 'Demo checkout', needs: [], how: 'A demo checkout in the app\'s own theme with a clear "DEMO · no money moves" banner, prefilled with the test card 4242 4242 4242 4242; it records a fake paid transaction. Never store a full card number.' }
  ] },
  email: { name: 'Email', options: [
    { id: 'resend', name: 'Resend', needs: ['RESEND_API_KEY'], how: 'Emails sent through Resend\'s HTTP API with process.env.RESEND_API_KEY (server code only). With no key, every email goes to the outbox below instead.' },
    { id: 'outbox', name: 'Outbox', needs: [], how: 'Emails are not sent: each one is saved to an Outbox record (to, subject, body, time) and listed on an admin Outbox screen, so sign-in links and receipts can be tried without a mail service.' }
  ] },
  storage: { name: 'Files', options: [
    { id: 'supabase', name: 'Supabase Storage', needs: ['supabase'], how: 'Uploads go to a Supabase Storage bucket from the server; when Supabase is missing, to the server folder below.' },
    { id: 'local', name: 'Server folder', needs: [], how: 'Uploads are saved to a data/uploads folder on the server and served back by id, images only, 5 MB at most.' }
  ] },
  api: { name: 'API', options: [] }
}

// The APIs people ask for by what they do, not by name: "an air booking api" is a flights API.
// Each has one or two real services (a key each) and made-up data, which is always ready.
export const APIS = [
  { id: 'flights', name: 'Flights', words: /\b(flights?|air(line|port)?s?|air ?booking|plane|airfare)\b/i, options: [['duffel', 'Duffel', 'DUFFEL_API_KEY'], ['amadeus', 'Amadeus', 'AMADEUS_API_KEY']] },
  { id: 'hotels', name: 'Hotels', words: /\b(hotels?|stays?|rooms? booking|lodging)\b/i, options: [['amadeus-hotels', 'Amadeus', 'AMADEUS_API_KEY']] },
  { id: 'maps', name: 'Maps', words: /\b(maps?|directions|geocod\w*|locations? search)\b/i, options: [['mapbox', 'Mapbox', 'MAPBOX_TOKEN'], ['osm', 'OpenStreetMap', '']] },
  { id: 'weather', name: 'Weather', words: /\bweather|forecast\b/i, options: [['open-meteo', 'Open-Meteo', '']] },
  { id: 'sms', name: 'Text messages', words: /\b(sms|text messages?|whatsapp)\b/i, options: [['twilio', 'Twilio', 'TWILIO_AUTH_TOKEN']] },
  { id: 'calendar', name: 'Calendar', words: /\b(google calendar|calendar sync|ical)\b/i, options: [['ics', 'Calendar file', '']] }
]
const MOCK = { id: 'mock', name: 'Made-up data', needs: [], how: 'Made-up data in the same shape a real service returns, behind one server module, so a real service can replace it later without touching the screens.' }
const apiOptions = a => [
  ...a.options.map(([id, name, env]) => ({ id, name, needs: env ? [env] : [], how: `${a.name} from ${name}${env ? ` with process.env.${env} (server code only); with no key, the made-up data below` : ' (no key needed)'}, behind one server module.` })),
  MOCK
]
export function optionsOf(c) {
  if (c.kind !== 'api') return CONNECT[c.kind]?.options || []
  const a = APIS.find(x => x.id === c.api)
  return a ? apiOptions(a) : [{ id: 'own', name: c.name, needs: [], how: `${c.name}: the person's own service, called from one server module.` }, MOCK]
}

// ---------- the shape every kit goes through
function cleanScreen(s, i) {
  const name = clip(s?.name, 40)
  if (!name) return null
  const id = slug(s.id || name)
  const path = clip(s.path, 60).replace(/[^\w/:-]/g, '') || (i === 0 ? '/' : `/${id}`)
  return { id, name, purpose: clip(s.purpose ?? s.what, 140), for: clip(s.for, 40), path: path.startsWith('/') ? path : `/${path}`, next: (Array.isArray(s.next) ? s.next : []).map(slug).slice(0, 6) }
}
export function cleanKit(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const users = uniq((Array.isArray(r.users) ? r.users : []).map(u => ({ id: slug(u?.id || u?.name), name: clip(u?.name, 40), does: clip(u?.does ?? u?.can, 160) })).filter(u => u.name)).slice(0, LIMITS.users)
  const screens = uniq((Array.isArray(r.screens) ? r.screens : []).map(cleanScreen).filter(Boolean)).slice(0, LIMITS.screens)
  const ids = new Set(screens.map(s => s.id))
  for (const s of screens) s.next = [...new Set(s.next)].filter(n => ids.has(n) && n !== s.id)
  const data = uniq((Array.isArray(r.data) ? r.data : []).map(d => ({ id: slug(d?.id || d?.name), name: clip(d?.name, 40), fields: [...new Set((Array.isArray(d?.fields) ? d.fields : String(d?.fields || '').split(',')).map(f => clip(f, 40)).filter(Boolean))].slice(0, LIMITS.fields) })).filter(d => d.name)).slice(0, LIMITS.data)
  const connects = uniq((Array.isArray(r.connects) ? r.connects : []).map(c => {
    const kind = KINDS.includes(c?.kind) ? c.kind : null
    if (!kind) return null
    const api = kind === 'api' ? (APIS.find(a => a.id === c.api)?.id || null) : undefined
    const name = clip(c.name, 40) || (kind === 'api' ? (APIS.find(a => a.id === api)?.name || 'API') : CONNECT[kind].name)
    const out = { id: kind === 'api' ? `api-${api || slug(name)}` : kind, kind, name, ...(kind === 'api' ? { api } : {}), choice: null }
    out.choice = optionsOf(out).some(o => o.id === c.choice) ? c.choice : null
    return out
  }).filter(Boolean)).slice(0, LIMITS.connects)
  return { v: 1, title: clip(r.title, 60), brief: clip(r.brief, 1200), users, screens, data, connects, start: STARTS.includes(r.start) ? r.start : 'screens' }
}

// ---------- the brief's own words, when no planner model answers
const DOMAINS = [
  { words: /\b(tickets?|events?|concerts?|shows?|gigs?|festival)\b/i, item: 'Event', fields: ['name', 'date', 'venue', 'seats', 'price'], order: 'Booking', ofields: ['member', 'event', 'seats', 'total', 'status'], browse: 'Events', verb: 'books tickets' },
  { words: /\b(flights?|air ?booking|airlines?|trips?)\b/i, item: 'Flight', fields: ['from', 'to', 'date', 'airline', 'price'], order: 'Booking', ofields: ['traveller', 'flight', 'passengers', 'total', 'status'], browse: 'Flights', verb: 'searches and books flights' },
  { words: /\b(appointments?|salon|clinic|classes|sessions?|reserv\w*|tables?)\b/i, item: 'Slot', fields: ['service', 'date', 'time', 'staff', 'price'], order: 'Appointment', ofields: ['member', 'slot', 'notes', 'status'], browse: 'Times', verb: 'books a time' },
  { words: /\b(shop|store|products?|orders?|e-?commerce|sell)\b/i, item: 'Product', fields: ['name', 'price', 'stock', 'photo'], order: 'Order', ofields: ['member', 'items', 'total', 'status'], browse: 'Shop', verb: 'buys products' },
  { words: /\b(courses?|lessons?|students?|learn\w*)\b/i, item: 'Course', fields: ['title', 'teacher', 'lessons', 'price'], order: 'Enrolment', ofields: ['member', 'course', 'progress', 'status'], browse: 'Courses', verb: 'takes courses' },
  { words: /\b(posts?|community|forum|social|blog)\b/i, item: 'Post', fields: ['author', 'title', 'body', 'likes'], order: 'Comment', ofields: ['author', 'post', 'body'], browse: 'Feed', verb: 'posts and comments' }
]
const GENERIC = { item: 'Item', fields: ['name', 'notes', 'status'], order: 'Request', ofields: ['member', 'item', 'status'], browse: 'Items', verb: 'uses the app' }

export function draftKit(brief = '') {
  const t = String(brief)
  const d = DOMAINS.find(x => x.words.test(t)) || GENERIC
  const admin = /\b(admin|staff|back ?office|dashboard|operations?|manage)\b/i.test(t)
  const pay = /\b(pay|payments?|checkout|tickets?|book\w*|orders?|buy|sell|subscri\w*|saas|pricing)\b/i.test(t)
  const signin = /\b(sign[- ]?(in|up)|log[- ]?in|accounts?|members?|users?|auth\w*|saas)\b/i.test(t)
  const emailIn = /\bemail\b/i.test(t)
  const files = /\b(upload\w*|photos?|images?|files?|documents?)\b/i.test(t)
  const one = d.order.toLowerCase(), many = `${d.browse}`
  const screens = []
  const add = (name, purpose, who, next = []) => screens.push({ name, purpose, for: who, next: next.map(slug) })
  const member = 'Member'
  if (signin) add('Sign up', 'make an account with an email', member, ['Home'])
  if (signin) add('Sign in', 'come back with the same email', member, ['Home'])
  add('Home', `what is new, and the way to ${many.toLowerCase()}`, member, [many])
  add(many, `browse and search ${many.toLowerCase()}`, member, [d.item])
  add(d.item, `one ${d.item.toLowerCase()}: details and ${one}`, member, [pay ? 'Checkout' : `My ${one}s`])
  if (pay) add('Checkout', `pay for the ${one}`, member, [`My ${one}s`])
  add(`My ${one}s`, `the ${one}s this member made`, member)
  if (admin) {
    add('Admin', 'the numbers today and what needs attention', 'Admin', [`${cap(one)}s`, 'Members', 'Operations'])
    add(`${cap(one)}s`, `every ${one}: find, refund or cancel one`, 'Admin')
    add('Members', 'every member, their history, block or restore', 'Admin')
    add('Operations', `${d.browse.toLowerCase()}, capacity and what runs today`, 'Admin')
  }
  // the screen names a brief uses are its own: an admin list named after the order is fine as "Bookings"
  const fixed = screens.map((s, i) => ({ ...s, path: s.for === 'Admin' ? (s.name === 'Admin' ? '/admin' : `/admin/${slug(s.name)}`) : i === 0 && s.name === 'Home' ? '/' : s.name === 'Home' ? '/' : `/${slug(s.name)}` }))
  const users = [{ name: member, does: d.verb }]
  if (admin) users.push({ name: 'Admin', does: `runs ${one}s, members and operations` })
  const data = [
    ...(signin ? [{ name: 'Member', fields: ['name', 'email', 'joined', 'status'] }] : []),
    { name: d.item, fields: d.fields },
    { name: cap(d.order), fields: d.ofields },
    ...(pay ? [{ name: 'Payment', fields: [one, 'amount', 'method', 'status'] }] : [])
  ]
  const connects = [
    ...(signin ? [{ kind: 'signin', choice: emailIn ? (/\b(link|passwordless|magic)\b/i.test(t) ? 'magic' : 'email') : null }] : []),
    ...(pay ? [{ kind: 'payments', choice: null }] : []),
    ...(signin || pay ? [{ kind: 'email', choice: null }] : []),
    ...(files ? [{ kind: 'storage', choice: null }] : []),
    ...APIS.filter(a => a.words.test(t)).map(a => ({ kind: 'api', api: a.id, choice: null }))
  ]
  const title = clip((t.match(/\bcalled ([\w' -]{2,40}?)(?:[,.]|$| for | with )/i) || [])[1], 40)
  return cleanKit({ title, brief: t, users, screens: fixed, data, connects, start: signin && !admin ? 'signup' : 'screens' })
}

// ---------- one planner call: the conversation so far in, the whole kit back
export const KIT_PROMPT = `You are the app planner in Swarm Studio. A person describes an app; you write its plan in plain words for a non-developer, as JSON only, in this shape:
{"title": "a short name",
 "users": [{"name": "Member", "does": "what they come to do"}],
 "screens": [{"name": "Sign up", "purpose": "one line", "for": "a user's name", "path": "/signup", "next": ["Home"]}],
 "data": [{"name": "Booking", "fields": ["member", "event", "seats", "total", "status"]}],
 "connects": [{"kind": "signin|payments|email|storage|api", "name": "for an api: what it does, e.g. Flights", "choice": null}],
 "start": "screens|signup|data",
 "say": "one short line for the chat"}
Rules: 2 to 4 kinds of user. 5 to 12 screens in the order a person meets them (sign-up, home, the main task, then the admin screens), each with the screens it leads to in "next". 2 to 8 things it keeps, 3 to 8 fields each, plain words, no types or schema syntax. A connection only when the app needs it; leave "choice" null unless the person chose. When the person asks whether they need a service (an API, payments, email), answer in "say" in one line and add it to "connects" for them to choose. Keep what the person already decided.`
export function kitMessages(brief, said = [], kit = null) {
  const talk = said.filter(m => m && String(m.text || '').trim()).slice(-12).map(m => ({ role: m.who === 'planner' ? 'assistant' : 'user', content: clip(m.text, 1500) }))
  return [
    { role: 'system', content: KIT_PROMPT },
    { role: 'user', content: `The app: ${clip(brief, 1200)}${kit ? `\n\nThe plan so far (keep what is there unless the person changes it):\n${JSON.stringify(kitView(kit))}` : ''}` },
    ...talk
  ]
}
const kitView = k => ({ title: k.title, users: k.users.map(({ name, does }) => ({ name, does })), screens: k.screens.map(s => ({ name: s.name, purpose: s.purpose, for: s.for, path: s.path, next: s.next.map(n => k.screens.find(x => x.id === n)?.name || n) })), data: k.data.map(({ name, fields }) => ({ name, fields })), connects: k.connects.map(c => ({ kind: c.kind, name: c.name, choice: c.choice })), start: k.start })
// a reply's JSON, cleaned; a choice the person already made is never lost to the model
export function readKit(reply, before = null) {
  const s = String(reply || '')
  let j = null
  try { j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  for (const sc of Array.isArray(j.screens) ? j.screens : []) if (sc && Array.isArray(sc.next)) sc.next = sc.next.map(slug)
  for (const c of Array.isArray(j.connects) ? j.connects : []) if (c?.kind === 'api' && !c.api) c.api = APIS.find(a => a.words.test(`${c.name} ${c.api || ''}`))?.id || null
  const kit = cleanKit({ ...j, brief: before?.brief || j.brief })
  if (!kit.screens.length) return null
  if (before) {
    for (const c of before.connects) {
      const now = kit.connects.find(x => x.id === c.id)
      if (!now) { if (c.choice) kit.connects.push(c); continue }
      if (c.choice) now.choice = c.choice
    }
    kit.title ||= before.title
  }
  return { kit, say: clip(j.say, 300) }
}

// ---------- the person asks what to connect to: a real answer and a choice, never a build
export function askConnect(text, kit) {
  const t = String(text || '')
  const asks = /\b(api|need|connect|integrat\w*|service|do i|should i|which)\b/i.test(t) || /\?/.test(t)
  const a = APIS.find(x => x.words.test(t))
  const k = cleanKit(kit)
  if (a && asks) {
    const id = `api-${a.id}`
    if (!k.connects.some(c => c.id === id)) k.connects = cleanKit({ ...k, connects: [...k.connects, { kind: 'api', api: a.id, choice: null }] }).connects
    const c = k.connects.find(x => x.id === id)
    const real = optionsOf(c).filter(o => o.id !== 'mock')
    return { kit: k, connect: id, say: `Yes: ${a.name.toLowerCase()} come from a ${a.name.toLowerCase()} API. ${real.map(o => o.name).join(' or ')} (${real.some(o => o.needs.length) ? 'a key each' : 'no key'}), or made-up ${a.name.toLowerCase()} first and a real one later.`, options: optionsOf(c).map(o => ({ id: `${id}:${o.id}`, label: o.name })) }
  }
  for (const kind of ['payments', 'email', 'signin', 'storage']) {
    const words = { payments: /\b(pay\w*|stripe|checkout)\b/i, email: /\b(e-?mails?|resend|newsletter)\b/i, signin: /\b(sign[- ]?in|log[- ]?in|auth\w*)\b/i, storage: /\b(upload\w*|files?|storage)\b/i }[kind]
    if (!asks || !words.test(t)) continue
    if (!k.connects.some(c => c.kind === kind)) k.connects = cleanKit({ ...k, connects: [...k.connects, { kind }] }).connects
    const c = k.connects.find(x => x.kind === kind)
    return { kit: k, connect: c.id, say: `${CONNECT[kind].name}: ${optionsOf(c).map(o => o.name).join(' or ')}.`, options: optionsOf(c).map(o => ({ id: `${c.id}:${o.id}`, label: o.name })) }
  }
  return null
}

// ---------- each connection's state: ready (chosen, and whatever it needs is connected), key (chosen,
// waiting for a key or a sign-in in Settings), none (not chosen yet). have: the names that are connected.
export function connectsOf(kit, have = []) {
  const h = new Set(have)
  return cleanKit(kit).connects.map(c => {
    const o = optionsOf(c).find(x => x.id === c.choice)
    const missing = o ? o.needs.filter(n => !h.has(n)) : []
    return { ...c, option: o?.name || '', state: !o ? 'none' : missing.length ? 'key' : 'ready', needs: missing, options: optionsOf(c).map(x => ({ id: x.id, name: x.name, needs: x.needs })) }
  })
}

// ---------- one edit from the board; anything else is said in the chat
export function editKit(kit, op = {}) {
  const k = cleanKit(kit)
  const list = { user: 'users', screen: 'screens', data: 'data', connect: 'connects' }[op.what]
  if (op.op === 'start') return cleanKit({ ...k, start: op.value })
  if (op.op === 'title') return cleanKit({ ...k, title: op.value })
  if (!list) throw Object.assign(new Error('edit what?'), { status: 400 })
  const arr = k[list]
  const at = arr.findIndex(x => x.id === op.id)
  if (op.op === 'add') {
    const v = op.value || {}
    if (arr.length >= LIMITS[list]) throw Object.assign(new Error(`${LIMITS[list]} at most`), { status: 400 })
    let name = clip(v.name, 40) || { users: 'User', screens: 'Screen', data: 'Thing', connects: 'API' }[list]
    for (let n = 2; arr.some(x => x.id === slug(name)); n++) name = `${name.replace(/ \d+$/, '')} ${n}`
    const item = list === 'connects' ? { kind: v.kind || 'api', api: v.api, name } : list === 'screens' ? { name, purpose: v.purpose || '', for: v.for || '', path: v.path || '', next: [] } : list === 'data' ? { name, fields: v.fields || ['name'] } : { name, does: v.does || '' }
    const after = op.after ? arr.findIndex(x => x.id === op.after) : -1
    arr.splice(after >= 0 ? after + 1 : arr.length, 0, item)
    // a new screen after another: the arrow comes with it
    if (list === 'screens' && after >= 0) arr[after].next = [...arr[after].next, slug(name)]
    return cleanKit(k)
  }
  if (at < 0) throw Object.assign(new Error('no such part'), { status: 404 })
  if (op.op === 'remove') {
    const [gone] = arr.splice(at, 1)
    if (list === 'screens') for (const s of arr) s.next = s.next.filter(n => n !== gone.id)
    return cleanKit(k)
  }
  if (op.op === 'move') {
    const to = Math.max(0, Math.min(arr.length - 1, at + (Number(op.by) || 0)))
    const [x] = arr.splice(at, 1)
    arr.splice(to, 0, x)
    return cleanKit(k)
  }
  if (op.op === 'set') {
    const v = op.value || {}
    const x = arr[at]
    if (list === 'connects') { if ('choice' in v) x.choice = v.choice || null }
    else for (const f of { users: ['name', 'does'], screens: ['name', 'purpose', 'for', 'path', 'next'], data: ['name', 'fields'] }[list]) if (f in v) x[f] = v[f]
    // a renamed screen keeps its arrows
    if (list === 'screens' && 'name' in v && !('id' in v)) {
      const old = x.id, nu = slug(v.name)
      if (nu && nu !== old && !arr.some(s => s.id === nu)) { x.id = nu; for (const s of arr) s.next = s.next.map(n => (n === old ? nu : n)) }
    }
    return cleanKit(k)
  }
  throw Object.assign(new Error('unknown edit'), { status: 400 })
}

// ---------- what is still open, as a count for the chat ("2 left") and the step's dot
export function kitLeft(kit) {
  const k = cleanKit(kit), left = []
  if (!k.users.length) left.push('users')
  if (k.screens.length < 2) left.push('screens')
  if (!k.data.length) left.push('data')
  for (const c of k.connects) if (!c.choice) left.push(c.id)
  return left
}
export const kitDone = kit => kitLeft(kit).length === 0

// ---------- the locked spec, in plain words (the proposal, the chat, the design brief)
export function kitWords(kit, have = []) {
  const k = cleanKit(kit)
  const name = id => k.screens.find(s => s.id === id)?.name || id
  const flow = k.screens.filter(s => s.next.length).map(s => `${s.name} → ${s.next.map(name).join(', ')}`).join('; ')
  const cs = connectsOf(k, have)
  return [
    `${k.title || 'The app'}: ${k.users.map(u => `${u.name} (${u.does})`).join('; ')}.`,
    `Screens: ${k.screens.map(s => `${s.name}${s.purpose ? ` (${s.purpose})` : ''}`).join('; ')}.`,
    flow && `Flow: ${flow}.`,
    k.data.length && `It keeps: ${k.data.map(d => `${d.name} (${d.fields.join(', ')})`).join('; ')}.`,
    cs.length && `Connects to: ${cs.map(c => `${c.name}: ${c.option || 'not chosen'}${c.state === 'key' ? ' (needs a key)' : ''}`).join('; ')}.`,
    `Start with: ${{ screens: 'the main screen', signup: 'the sign-up flow', data: 'the data' }[k.start]}.`
  ].filter(Boolean).join('\n')
}

// ---------- the app plan the app engine builds from (engine/advisor.mjs planBrief reads this shape)
export function kitPlan(kit, have = []) {
  const k = cleanKit(kit)
  const name = id => k.screens.find(s => s.id === id)?.name || id
  return {
    summary: clip(`${k.title ? `${k.title}: ` : ''}${k.brief}`, 400),
    roles: k.users.map(u => ({ name: u.name, can: u.does })),
    data: k.data.map(d => ({ name: d.name, fields: d.fields })),
    screens: k.screens.map(s => ({ name: s.name, path: s.path, for: s.for, what: s.purpose, optional: false })),
    flow: k.screens.flatMap(s => s.next.map(n => `${s.name} → ${name(n)}`)),
    connects: connectsOf(k, have).map(c => {
      const o = optionsOf(c).find(x => x.id === c.choice)
      return { kind: c.kind, name: c.name, choice: c.option || null, state: c.state, how: o ? o.how : `${c.name} is not chosen yet: leave a clearly marked stand-in.` }
    }),
    start: k.start,
    kit: true
  }
}

// ---------- the proposal before Lock: what is made, in what order, how long; an app costs no credits
export function kitProposal(kit) {
  const k = cleanKit(kit)
  const first = { screens: 'The main screen', signup: 'The sign-up flow', data: 'The data and its admin' }[k.start]
  const items = [
    { what: first, order: 1 },
    { what: `${k.screens.length} screens`, order: 2 },
    { what: `${k.data.length} kinds of record`, order: 3 },
    ...(k.connects.length ? [{ what: `${k.connects.length} connections`, order: 4 }] : [])
  ]
  // the design run, then about two minutes of the app engine per screen (measured on past app builds)
  return { items, minutes: Math.round(12 + k.screens.length * 2 + k.connects.length * 2), credits: 0 }
}

// ---------- the reviewer's check: the built app against the locked kit, read from its source files
const SRC = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
function sources(dir, out = [], depth = 0) {
  if (depth > 6 || out.length > 400) return out
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (n === 'node_modules' || n.startsWith('.') || n === 'dist' || n === 'build') continue
    const p = join(dir, n)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) sources(p, out, depth + 1)
    else if (SRC.has(extname(n)) && st.size < 400e3) out.push(p)
  }
  return out
}
const words = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function kitChecks(kit, appDir) {
  const k = cleanKit(kit)
  const text = sources(appDir).map(f => { try { return readFileSync(f, 'utf8') } catch { return '' } }).join('\n')
  const low = text.toLowerCase(), flat = words(text)
  const out = []
  for (const s of k.screens) {
    const route = s.path === '/' || low.includes(`"${s.path}"`) || low.includes(`'${s.path}'`) || low.includes(`\`${s.path}`) || low.includes(`path: "${s.path.slice(1)}"`)
    out.push({ part: `screen:${s.id}`, ok: route, note: route ? s.path : `no route ${s.path}` })
  }
  for (const d of k.data) {
    const n = words(d.name), found = flat.includes(n) || flat.includes(`${n}s`) || flat.includes(n.replace(/ /g, ''))
    out.push({ part: `data:${d.id}`, ok: found, note: found ? d.name : `${d.name} is not kept` })
  }
  for (const c of k.connects) {
    const o = optionsOf(c).find(x => x.id === c.choice)
    if (!o) { out.push({ part: `connect:${c.id}`, ok: false, note: `${c.name} not chosen` }); continue }
    const envs = o.needs.filter(n => /^[A-Z][A-Z0-9_]+$/.test(n))
    const ok = envs.length ? envs.every(e => text.includes(e)) : c.kind === 'signin' ? /sign[\s_-]?(in|up)|log[\s_-]?in/i.test(text) : c.kind === 'email' ? /outbox|sendmail|send_?email|resend/i.test(text) : c.kind === 'payments' ? /checkout/i.test(text) : true
    out.push({ part: `connect:${c.id}`, ok, note: ok ? `${c.name}: ${o.name}` : `${c.name}: ${o.name} is not wired` })
  }
  return out
}

// ---------- what is connected, by name only: the env names the studio holds (from Hermes's secret
// scope) and 'supabase' when its keys or its connector are there. Never a value.
const NAMES = ['STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'DUFFEL_API_KEY', 'AMADEUS_API_KEY', 'MAPBOX_TOKEN', 'TWILIO_AUTH_TOKEN']
export function haveOf(env = process.env, { supabase = false } = {}) {
  const have = NAMES.filter(n => env[n])
  if (have.includes('STRIPE_SECRET_KEY') && !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)) have.splice(have.indexOf('STRIPE_SECRET_KEY'), 1)
  if (supabase || (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) have.push('supabase')
  return have
}
