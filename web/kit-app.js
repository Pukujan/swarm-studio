// The App kit (docs/specs/37-studio-first.md): the Plan step of an app in the Studio. On the shared board
// it shows who uses the app, a map of its screens with arrows between them, the things it keeps, what it
// connects to and where to start, all filled from the conversation (engine/appkit.mjs) and editable
// here. The project's brand is read, never redefined: the screen frames are drawn in its colours.
// Lock writes the kit into the locked spec; Build hands it to the app build, which builds those screens,
// data and connections and checks the app against them afterwards.
//
// Beyond the contract's fields it has: prepare(ctx) (await before sections, loads or drafts the kit),
// plan.answer(ctx, { id?, option?, text }) (the left chat's reply to a question or a free line; returns
// { say, options? }), and it calls ctx.refresh?.() when its cards change.
// Its names are prefixed (appKit…, ak-) because server/page.mjs joins the kits into one script.
import { ic } from './icons.js'
import { openSettings } from './settings.js'

const appKitState = new Map() // project -> { kit, connects, left, spec, sel, saving }
const appKitEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const APP_KIT_STARTS = [{ id: 'screens', name: 'Main screen' }, { id: 'signup', name: 'Sign-up' }, { id: 'data', name: 'Data' }]
const APP_KIT_STATE = { ready: 'Ready', key: 'Needs a key', none: 'Not chosen' }

function appKitStyle() {
  if (document.getElementById('ak-style')) return
  const st = document.createElement('style')
  st.id = 'ak-style'
  st.textContent = `
.ak-card { width: 190px; min-height: 96px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; background: var(--surface); }
.ak-card b { font: 600 15px var(--body); color: var(--text); }
.ak-card span { font: 13px var(--body); color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ak-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; border: 1.5px solid var(--muted); vertical-align: middle; }
.ak-dot.ready { background: var(--text); border-color: var(--text); }
.ak-dot.key { background: color-mix(in srgb, var(--text) 40%, transparent); }
.ak-map { position: relative; padding: 10px 6px 6px; background: none; border: 0; cursor: default; }
.ak-row { display: flex; flex-wrap: wrap; gap: 46px 54px; max-width: 900px; position: relative; z-index: 1; }
.ak-row + .ak-row { margin-top: 64px; }
.ak-fr { position: relative; width: 132px; cursor: pointer; border: 0; padding: 0; background: none; text-align: left; color: inherit; font: inherit; }
.ak-fr i { display: block; height: 90px; border-radius: 6px; border: 1px solid var(--line); background: var(--ak-bg, var(--surface-2)); overflow: hidden; position: relative; }
.ak-fr i::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 12px; background: var(--ak-ac, var(--line)); }
.ak-fr i::after { content: ''; position: absolute; left: 12px; right: 30px; top: 26px; height: 34px; border-radius: 3px; background: repeating-linear-gradient(var(--ak-ink, var(--muted)) 0 3px, transparent 3px 10px); opacity: .35; }
.ak-fr em { display: block; margin-top: 6px; font: 500 12px var(--body); font-style: normal; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ak-fr.on i { outline: 2px solid var(--accent); outline-offset: 2px; }
.ak-fr:focus-visible i { outline: 2px solid var(--text); outline-offset: 2px; }
.ak-arrows { position: absolute; inset: 0; pointer-events: none; overflow: visible; color: var(--muted); z-index: 0; }
.ak-ins { display: flex; flex-direction: column; gap: 12px; }
.ak-ins .ak-rowbtns { display: flex; gap: 6px; }
.ak-opt { display: flex; align-items: center; gap: 10px; min-height: 40px; cursor: pointer; font: 13px var(--body); color: var(--text); }
.ak-opt input { width: 16px; height: 16px; accent-color: var(--accent); margin: 0; }
.ak-opt small { margin-left: auto; font: 12px var(--mono); color: var(--muted); }
.ak-ins select { height: 32px; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: 13px var(--body); padding: 0 8px; }
.ak-add { width: 64px; min-height: 96px; display: grid; place-items: center; background: none; border-style: dashed; color: var(--muted); }
`
  document.head.append(st)
}

// the brand's colours, read from the project's brand (spec 31's shape), for the frames only
function appKitColours(brand) {
  const hexes = []
  const walk = v => { if (hexes.length > 8 || v == null) return; if (typeof v === 'string') { if (/^#[0-9a-f]{3,8}$/i.test(v.trim())) hexes.push(v.trim()); return } if (typeof v === 'object') for (const x of Object.values(v)) walk(x) }
  walk(brand?.palette)
  if (!hexes.length) return ''
  const [bg, ac, ink] = [hexes[0], hexes[1] || hexes[0], hexes[2] || hexes.at(-1)]
  return `--ak-bg:${bg};--ak-ac:${ac};--ak-ink:${ink}`
}

async function appKitApi(ctx, path, body, method = 'POST') {
  const r = await ctx.sw.api(path, body === undefined ? {} : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
const appKitOf = ctx => appKitState.get(ctx.project) || appKitState.set(ctx.project, { kit: null, connects: [], left: [], spec: null, sel: null }).get(ctx.project)
// a new kit from the server: keep it, save it to the project, and fetch the words, plan and proposal
async function appKitTake(ctx, out) {
  const st = appKitOf(ctx)
  Object.assign(st, { kit: out.kit, connects: out.connects || [], left: out.left || [] })
  ctx.refresh?.()
  clearTimeout(st.saving)
  st.saving = setTimeout(async () => {
    try {
      if (ctx.project) await appKitApi(ctx, `/api/kit/app/${encodeURIComponent(ctx.project)}`, { kit: st.kit }, 'PUT')
      st.spec = await appKitApi(ctx, '/api/kit/app/spec', { kit: st.kit })
      ctx.refresh?.()
    } catch (err) { ctx.board?.toast?.(err.message) }
  }, 400)
  return st
}
async function appKitEdit(ctx, op) {
  try { await appKitTake(ctx, await appKitApi(ctx, '/api/kit/app/edit', { kit: appKitOf(ctx).kit, op })) } catch (err) { ctx.board?.toast?.(err.message) }
}

// ---------- the cards at rest: names and one value
function appKitCard(name, value, dot = '') {
  return el => {
    el.classList.add('ak-card')
    el.innerHTML = `<b>${dot}${appKitEsc(name)}</b><span>${appKitEsc(value)}</span>`
  }
}
const appKitDot = state => `<i class="ak-dot ${state}" role="img" aria-label="${APP_KIT_STATE[state]}"></i>`

// the map of screens: frames in the order a person meets them, the admin's on a row of their own,
// and an arrow for every "leads to"
function appKitMap(ctx) {
  return el => {
    const st = appKitOf(ctx), k = st.kit
    el.classList.add('ak-map')
    const admin = s => /admin/i.test(s.for) || s.path.startsWith('/admin')
    const frame = s => `<button class="ak-fr${st.sel === `screen:${s.id}` ? ' on' : ''}" data-screen="${appKitEsc(s.id)}" aria-label="${appKitEsc(s.name)}"><i></i><em>${appKitEsc(s.name)}</em></button>`
    const rows = [k.screens.filter(s => !admin(s)), k.screens.filter(admin)].filter(r => r.length)
    el.setAttribute('style', appKitColours(ctx.brand))
    el.innerHTML = `<svg class="ak-arrows" aria-hidden="true"><defs><marker id="ak-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs></svg>${rows.map(r => `<div class="ak-row">${r.map(frame).join('')}</div>`).join('')}`
    // a click on a frame picks that screen; the card's own selection opens the inspector on it
    el.onclick = e => { const f = e.target.closest('[data-screen]'); if (f) st.sel = `screen:${f.dataset.screen}` }
    requestAnimationFrame(() => appKitArrows(el, k))
  }
}
function appKitArrows(el, k) {
  const svg = el.querySelector('.ak-arrows')
  if (!svg) return
  const box = id => { const f = el.querySelector(`[data-screen="${CSS.escape(id)}"]`); if (!f) return null; let x = 0, y = 0, n = f; while (n && n !== el) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent } return { x, y, w: f.offsetWidth, h: 90 } }
  const paths = []
  for (const s of k.screens) for (const to of s.next) {
    const a = box(s.id), b = box(to)
    if (!a || !b) continue
    const same = Math.abs(a.y - b.y) < 10
    // neighbours on a row: a straight arrow; further along the row (or back): an arc over the frames
    // between, so it never reads as an arrow to them; to another row: down (or up) between the rows
    const between = same && k.screens.some(x => { const c = box(x.id); return c && Math.abs(c.y - a.y) < 10 && c.x > Math.min(a.x, b.x) && c.x < Math.max(a.x, b.x) })
    if (same && !between && b.x > a.x) { paths.push(`M${a.x + a.w} ${a.y + a.h / 2} L${b.x - 4} ${b.y + b.h / 2}`); continue }
    if (same) {
      const lift = 22 + Math.min(40, Math.abs(b.x - a.x) * 0.08)
      paths.push(`M${a.x + a.w / 2} ${a.y} C${a.x + a.w / 2} ${a.y - lift} ${b.x + b.w / 2} ${b.y - lift} ${b.x + b.w / 2} ${b.y - 4}`)
      continue
    }
    const [x1, y1, x2, y2] = b.y > a.y ? [a.x + a.w / 2, a.y + a.h + 18, b.x + b.w / 2, b.y - 4] : [a.x + a.w / 2, a.y, b.x + b.w / 2, b.y + b.h + 22]
    paths.push(`M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`)
  }
  svg.insertAdjacentHTML('beforeend', paths.map(d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#ak-head)"/>`).join(''))
}

// ---------- the inspector: the selected part's fields, saved as they change
const appKitHead = name => `<h3><span>${appKitEsc(name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>`
const appKitField = (label, key, value, max = 160) => `<label class="pl-f"><span>${appKitEsc(label)}</span><input data-f="${key}" value="${appKitEsc(value)}" maxlength="${max}"></label>`
const appKitButtons = (what, id, { move = false, add = false } = {}) => `<div class="ak-rowbtns">${move ? `<button class="ib sm" data-move="-1" aria-label="Earlier">${ic('chl', 16)}</button><button class="ib sm" data-move="1" aria-label="Later">${ic('chr', 16)}</button>` : ''}${add ? `<button class="btn ghost" data-add-after>${ic('plus', 15)}Add</button>` : ''}<button class="btn ghost" data-remove>${ic('trash', 15)}Remove</button></div>`

function appKitInspect(ctx, what, id) {
  return el => {
    const st = appKitOf(ctx), k = st.kit
    // the map card: whichever frame was clicked, else the first screen
    if (what === 'map') { id = (st.sel || '').startsWith('screen:') ? st.sel.slice(7) : k.screens[0]?.id; what = 'screen' }
    const save = (op) => appKitEdit(ctx, { what, id, ...op })
    let html = ''
    if (what === 'user') {
      const u = k.users.find(x => x.id === id)
      if (!u) return
      html = appKitHead(u.name) + appKitField('Name', 'name', u.name, 40) + appKitField('Comes to', 'does', u.does) + appKitButtons('user', id)
    } else if (what === 'screen') {
      const s = k.screens.find(x => x.id === id)
      if (!s) { el.innerHTML = appKitHead('Screens') + `<button class="btn ghost" data-add-screen>${ic('plus', 15)}Add</button>`; appKitWire(ctx, el, 'screen', null); return }
      html = appKitHead(s.name) + appKitField('Name', 'name', s.name, 40) + appKitField('Purpose', 'purpose', s.purpose, 140) + appKitField('Path', 'path', s.path, 60) +
        `<label class="pl-f"><span>For</span><select data-f="for" class="ak-sel">${['', ...k.users.map(u => u.name)].map(n => `<option${n === s.for ? ' selected' : ''}>${appKitEsc(n)}</option>`).join('')}</select></label>` +
        `<div class="pl-f"><span>Leads to</span>${k.screens.filter(x => x.id !== s.id).map(x => `<label class="ak-opt"><input type="checkbox" data-next="${appKitEsc(x.id)}" ${s.next.includes(x.id) ? 'checked' : ''}><span>${appKitEsc(x.name)}</span></label>`).join('')}</div>` +
        appKitButtons('screen', id, { move: true, add: true })
    } else if (what === 'data') {
      const d = k.data.find(x => x.id === id)
      if (!d) return
      html = appKitHead(d.name) + appKitField('Name', 'name', d.name, 40) + appKitField('Fields', 'fields', d.fields.join(', '), 400) + appKitButtons('data', id)
    } else if (what === 'connect') {
      const c = st.connects.find(x => x.id === id)
      if (!c) return
      html = appKitHead(c.name) + c.options.map(o => `<label class="ak-opt"><input type="radio" name="ak-c" data-choice="${appKitEsc(o.id)}" ${c.choice === o.id ? 'checked' : ''}><span>${appKitEsc(o.name)}</span>${o.needs.length ? `<small>${appKitEsc(o.needs.includes('supabase') ? 'Supabase' : 'Key')}</small>` : ''}</label>`).join('') +
        (c.state === 'key' ? `<button class="btn pri" data-settings>Settings</button>` : '') + appKitButtons('connect', id)
    } else if (what === 'start') {
      html = appKitHead('Start') + APP_KIT_STARTS.map(s => `<label class="ak-opt"><input type="radio" name="ak-s" data-start="${s.id}" ${k.start === s.id ? 'checked' : ''}><span>${s.name}</span></label>`).join('')
    }
    el.innerHTML = `<div class="ak-ins">${html}</div>`
    appKitWire(ctx, el, what, id, save)
  }
}
function appKitWire(ctx, el, what, id, save = () => {}) {
  const st = appKitOf(ctx)
  let t = null
  el.oninput = e => {
    const f = e.target.dataset.f
    if (!f || e.target.tagName === 'SELECT') return
    clearTimeout(t)
    t = setTimeout(() => save({ op: 'set', value: { [f]: f === 'fields' ? e.target.value.split(',') : e.target.value } }), 500)
  }
  el.onchange = e => {
    const x = e.target
    if (x.dataset.f === 'for') return save({ op: 'set', value: { for: x.value } })
    if (x.dataset.next) return save({ op: 'set', value: { next: [...el.querySelectorAll('[data-next]:checked')].map(i => i.dataset.next) } })
    if (x.dataset.choice) return save({ op: 'set', value: { choice: x.dataset.choice } })
    if (x.dataset.start) return appKitEdit(ctx, { op: 'start', value: x.dataset.start })
  }
  el.onclick = e => {
    if (e.target.closest('.pj-x')) return ctx.board?.inspector?.(false)
    const mv = e.target.closest('[data-move]')
    if (mv) return save({ op: 'move', by: Number(mv.dataset.move) })
    if (e.target.closest('[data-remove]')) { st.sel = null; return save({ op: 'remove' }) }
    if (e.target.closest('[data-add-after]')) return appKitEdit(ctx, { op: 'add', what: 'screen', after: id, value: { name: 'Screen' } })
    if (e.target.closest('[data-add-screen]')) return appKitEdit(ctx, { op: 'add', what: 'screen', value: { name: 'Screen' } })
    if (e.target.closest('[data-settings]')) return openSettings({ sw: ctx.sw, esc: appKitEsc })
  }
}

// the "+" at the end of a section
const appKitAdder = (ctx, what, value) => ({ key: `add:${what}`, name: 'Add', add: true,
  render: el => { el.classList.add('ak-add'); el.setAttribute('aria-label', 'Add'); el.innerHTML = ic('plus', 18) },
  inspect: el => { el.innerHTML = ''; appKitEdit(ctx, { op: 'add', what, value }) } })

export const appKit = {
  kind: 'app',
  name: 'App',
  icon: 'code',
  steps: ['brand', 'references', 'assets', 'plan'],
  starts: APP_KIT_STARTS,
  reads: ['palette', 'type', 'voice'],

  // the kit as it stands for this project: saved, else drafted from the idea
  async prepare(ctx) {
    appKitStyle()
    const st = appKitOf(ctx)
    if (st.kit) return st
    if (ctx.project) {
      const saved = await appKitApi(ctx, `/api/kit/app/${encodeURIComponent(ctx.project)}`).catch(() => null)
      if (saved?.kit) { Object.assign(st, saved); st.spec = await appKitApi(ctx, '/api/kit/app/spec', { kit: st.kit }).catch(() => null); return st }
    }
    // the brief's own words at once, then the planner's fuller kit when it answers (never over an edit)
    const idea = ctx.studio?.idea || ctx.chat?.turns?.find(t => t.who === 'person')?.text || ''
    await appKitTake(ctx, await appKitApi(ctx, '/api/kit/app/draft', { brief: idea, quick: true }))
    const first = st.kit
    appKitApi(ctx, '/api/kit/app/draft', { brief: idea, said: ctx.chat?.turns || [] }).then(out => {
      if (st.kit !== first || !out.say) return
      appKitTake(ctx, out)
      ctx.sw?.say?.(out.say)
    }).catch(() => {})
    return st
  },

  plan: {
    sections(ctx) {
      appKitStyle()
      const st = appKitOf(ctx), k = st.kit
      if (!k) { appKit.prepare(ctx).then(() => ctx.refresh?.()).catch(err => ctx.board?.toast?.(err.message)); return [] }
      const conn = id => st.connects.find(c => c.id === id)
      return [
        { sec: 'Users', cards: [...k.users.map(u => ({ key: `user:${u.id}`, name: u.name, render: appKitCard(u.name, u.does), inspect: appKitInspect(ctx, 'user', u.id) })), appKitAdder(ctx, 'user', { name: 'User' })] },
        { sec: 'Screens', cards: [{ key: 'screens', name: 'Screens', wide: true, render: appKitMap(ctx), inspect: appKitInspect(ctx, 'map') }] },
        { sec: 'Data', cards: [...k.data.map(d => ({ key: `data:${d.id}`, name: d.name, render: appKitCard(d.name, d.fields.join(', ')), inspect: appKitInspect(ctx, 'data', d.id) })), appKitAdder(ctx, 'data', { name: 'Thing' })] },
        { sec: 'Connections', cards: k.connects.map(c => ({ key: `connect:${c.id}`, name: c.name, render: appKitCard(c.name, conn(c.id)?.option || APP_KIT_STATE.none, appKitDot(conn(c.id)?.state || 'none')), inspect: appKitInspect(ctx, 'connect', c.id) })) },
        { sec: 'Start', cards: [{ key: 'start', name: 'Start', render: appKitCard('Start', APP_KIT_STARTS.find(s => s.id === k.start)?.name || ''), inspect: appKitInspect(ctx, 'start') }] }
      ]
    },
    // the left chat's questions: one per connection still to choose
    questions(ctx) {
      const st = appKitOf(ctx)
      return st.connects.filter(c => c.state === 'none').map(c => ({ id: c.id, q: c.name, options: c.options.map(o => ({ id: o.id, name: o.name })), free: true }))
    },
    // a chip picked, or a line typed, in the left chat. "i need an air booking api?" is answered with a
    // choice; nothing here builds
    async answer(ctx, { id = '', option = '', text = '' } = {}) {
      const st = appKitOf(ctx)
      const said = id && option ? `${id}:${option}` : String(text)
      const out = await appKitApi(ctx, '/api/kit/app/say', { kit: st.kit, said, said_before: ctx.chat?.turns || [] })
      await appKitTake(ctx, out)
      return { say: out.say || '', options: out.options || [], left: out.left.length }
    },
    done: ctx => !!appKitOf(ctx).kit && appKitOf(ctx).left.length === 0,
    left: ctx => appKitOf(ctx).left.length
  },

  proposal(ctx) {
    const p = appKitOf(ctx).spec?.proposal
    return p ? { items: p.items, minutes: p.minutes, credits: p.credits } : { items: [], minutes: 0, credits: 0 }
  },
  // what goes under spec.kits.app: the kit itself (the build and the reviewer read it), and its words
  lock(ctx) {
    const st = appKitOf(ctx)
    return { kit: st.kit, words: st.spec?.words || '' }
  },
  // the person's Build press only: the app build from the locked kit
  async build(spec, ctx) {
    const a = spec?.kits?.app
    if (!a?.kit) throw new Error('lock the app plan first')
    const job = await appKitApi(ctx, '/api/auto', { prompt: a.kit.brief || ctx.studio?.idea || a.kit.title || 'an app', games: 'none', only: ['app', 'data', 'deploy'], appkit: a.kit, ...(ctx.project ? { project: ctx.project } : {}), ...(ctx.chat?.id ? { chat: ctx.chat.id } : {}) })
    return { run: job.run }
  },
  // the reviewer's result, recorded on the run by the build's last step (engine/appkit.mjs kitChecks)
  check(spec, run) {
    const e = (run?.events || []).findLast?.(x => x.type === 'appkit:checks')
    return (e?.checks || []).map(c => ({ part: c.part, ok: c.ok, note: c.note }))
  }
}
