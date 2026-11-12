// web/canvas.js, split by area (web/canvas/README.md): publishing a live link.
import { fillThumbRow } from '../seo.js'
import { ico, api, S, els, $, commandOps } from './core.js'
import { closeable } from './start.js'
import { shownRun } from './film.js'
import { esc } from './design.js'
import { feed } from './panels.js'

// ---------- publish: a live link on GitHub Pages (the person's gh login), or this computer
export const pub = { run: null, state: 'none', stage: '', target: 'github', el: null, hosts: undefined, live: {}, liveTarget: '', message: '', pending: false }
export const PUB_STAGES = {
  github: { export: 'Exporting the pages', repo: 'Making the GitHub repo', push: 'Pushing the site', pages: 'Turning on GitHub Pages', building: 'GitHub is building it' },
  vercel: { export: 'Exporting the pages', project: 'Setting up the Vercel project', upload: 'Uploading the files', building: 'Vercel is deploying it' },
  cloudflare: { export: 'Exporting the pages', project: 'Setting up the Pages project', upload: 'Uploading the files', building: 'Cloudflare is going live' },
}

export function pubPop(html, title = 'Publish the <em>website</em>') {
  pub.el?.remove()
  pub.el = document.createElement('div')
  pub.el.className = 'export-pop publish-pop'
  pub.el.innerHTML = `<div class="vhead pop-title"><span>${title}</span><button class="vclose" aria-label="Close">${ico('x')}</button></div>${html}`
  document.body.append(pub.el)
  pub.el.querySelector('.vclose').onclick = () => { pub.el.remove(); pub.el = null }
  closeable(pub.el, () => { pub.el?.remove(); pub.el = null }, { extra: ['#pub-menu', '.pubwrap'] })
  return pub.el
}

// Name plus three words at most; never an account name or email (docs/ux/RULES.md).
export const HOSTS = {
  github: { label: 'GitHub Pages', how: 'public link', off: 'run gh auth login' },
  vercel: { label: 'Vercel', how: 'public link' },
  cloudflare: { label: 'Cloudflare', how: 'public link' },
  local: { label: 'This computer', how: 'only you' },
}
// the build's link: the newest public one, or the local one if it has no public one
export const liveUrl = () => pub.run === shownRun() ? (pub.live[pub.liveTarget] || '') : ''
export const shortUrl = u => String(u).replace(/^https?:\/\//, '').replace(/\/$/, '')

// Copy that works inside Hermes's sandboxed frame too: the Clipboard API is refused
// there (no clipboard-write), so fall back to a hidden textarea and execCommand,
// and if that fails as well, select the link so ⌘C works. The button says what happened.
export function copyText(text, btn, selectEl) {
  let ok = false
  const legacy = () => {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'
    document.body.append(ta); ta.focus(); ta.select()
    try { ok = document.execCommand('copy') } catch { ok = false }
    ta.remove()
  }
  const done = () => {
    if (!ok && selectEl) { const r = document.createRange(); r.selectNodeContents(selectEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r) }
    if (!btn) return
    const was = btn.dataset.label || (btn.dataset.label = btn.textContent)
    btn.textContent = ok ? 'Copied' : 'Press ⌘C'
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = was }, 1800)
  }
  // inside Hermes (a sandboxed frame): the plugin copies it with the system clipboard
  if (framed) return hostAsk({ type: 'swarm-studio:copy', text }).then(r => { ok = !!r?.ok; if (!ok) legacy(); done() })
  // the legacy path first while the click still counts as a user gesture; the async API after
  legacy()
  if (ok || !navigator.clipboard?.writeText) return done()
  navigator.clipboard.writeText(text).then(() => { ok = true }, () => {}).finally(done)
}
// Hermes's frame can't open a window either: links go out through the plugin
export const framed = window.parent !== window
export let hostSeq = 0
export function hostAsk(msg, ms = 1500) {
  const id = ++hostSeq
  return new Promise(resolve => {
    const t = setTimeout(() => { removeEventListener('message', on); resolve(null) }, ms)
    const on = ev => { if (ev.source === window.parent && ev.data?.type === 'swarm-studio:copied' && ev.data.id === id) { clearTimeout(t); removeEventListener('message', on); resolve(ev.data) } }
    addEventListener('message', on)
    window.parent.postMessage({ ...msg, id }, '*')
  })
}
if (framed) document.addEventListener('click', e => {
  const a = e.target.closest?.('a[target="_blank"][href^="http"]')
  if (!a) return
  e.preventDefault()
  window.parent.postMessage({ type: 'swarm-studio:open', url: a.href }, '*')
}, true)

export async function publishMenu(force) {
  if (pub.hosts === undefined || force) {
    if (!pub.el) pubPop('<div class="pstage">Checking…</div>')
    const res = await api('/api/publish').catch(() => null)
    pub.hosts = (await res?.json().catch(() => null)) || {}
  }
  const h = pub.hosts
  const signed = id => (id === 'github' ? h.github : h[id]?.user)
  const opt = (id, on = true) => `<button class="popt" data-target="${id}"${on ? '' : ' disabled'}><b>${HOSTS[id].label}</b><span>${on ? HOSTS[id].how : HOSTS[id].off}</span></button>`
  const row = id => {
    if (signed(id) || id === 'github') return `<div class="prow">${opt(id, !!signed(id))}${signed(id) && id !== 'github' && !h[id]?.env ? `<button class="pdisc" data-disc="${id}" aria-label="Disconnect ${HOSTS[id].label}">Disconnect</button>` : ''}</div>`
    const url = h.providers?.[id]?.tokenUrl || '#'
    return `<details class="pconn"><summary><b>Connect ${HOSTS[id].label}</b><span><a href="${esc(url)}" target="_blank" rel="noopener">Get a token</a></span></summary>
      <form data-conn="${id}"><input type="password" autocomplete="off" spellcheck="false" aria-label="${HOSTS[id].label} token" placeholder="Paste the token"><button>Connect</button></form><div class="perr"></div></details>`
  }
  const el = pubPop(`<div class="pthumb-slot"></div>${['github', 'vercel', 'cloudflare'].map(row).join('')}<div class="prow">${opt('local')}</div>`)
  fillThumbRow(el, { run: shownRun(), api })
  el.querySelectorAll('.popt').forEach(b => { b.onclick = () => publishNow(b.dataset.target) })
  el.querySelectorAll('[data-disc]').forEach(b => {
    b.onclick = async () => {
      await api('/api/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: b.dataset.disc }) }).catch(() => null)
      publishMenu(true)
    }
  })
  el.querySelectorAll('form[data-conn]').forEach(f => {
    f.onsubmit = async ev => {
      ev.preventDefault()
      const input = f.querySelector('input'), err = f.parentElement.querySelector('.perr')
      if (!input.value.trim()) return
      f.querySelector('button').textContent = 'Checking…'
      const res = await api('/api/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: f.dataset.conn, token: input.value.trim() }) }).catch(() => null)
      input.value = ''
      const out = await res?.json().catch(() => ({}))
      if (res?.ok) return publishMenu(true)
      f.querySelector('button').textContent = 'Connect'
      err.textContent = shortReason(out?.error)
    }
  })
}

// one short reason, never a stack or a wall of text
export const shortReason = m => {
  const t = String(m || 'the studio server is not answering').split('\n')[0].replace(/^Error:\s*/, '')
  return t.length > 90 ? `${t.slice(0, 88).replace(/\s+\S*$/, '')}…` : t
}

// The three states, always shown: publishing (the steps), live (the link, Copy, Open), failed (why, Retry).
export function pubShow() {
  posted.alone = false
  if (pub.state === 'working') {
    const names = PUB_STAGES[pub.target]
    if (!names) return pubPop('<div class="pstage">Publishing…</div>')
    const steps = Object.keys(names), at = Math.max(0, steps.indexOf(pub.stage))
    return pubPop(`<div class="psteps">${steps.map((k, i) => `<div class="${i < at ? 'did' : i === at ? 'now' : ''}">${i < at ? '✓' : i === at ? '◌' : '·'} ${names[k]}</div>`).join('')}</div>`)
  }
  if (pub.state === 'failed') {
    const el = pubPop(`<div class="pstate err"><b>Not published</b><span>${esc(shortReason(pub.message))}</span></div>
      <div class="vfoot"><button class="vagain pother">Other host</button><button class="vagain pretry">Retry</button></div>`)
    el.querySelector('.pretry').onclick = () => publishNow(pub.target)
    el.querySelector('.pother').onclick = () => publishMenu()
    return el
  }
  const url = liveUrl()
  if (!url) return publishMenu()
  const el = pubPop(`<div class="pstate live"><b>Live</b><span>${esc(HOSTS[pub.liveTarget]?.label || '')}${pub.pending ? ' · going live' : ''}</span></div>
    <div class="plink"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(shortUrl(url))}</a></div>
    <div class="vfoot"><button class="vagain pagain">Publish again</button><button class="vagain pcopy">Copy link</button><a class="vagain" href="${esc(url)}" target="_blank" rel="noopener">Open ↗</a></div>
    ${feedRow()}`)
  el.querySelector('.pcopy').onclick = ev => copyText(url, ev.currentTarget, el.querySelector('.plink a'))
  el.querySelector('.pagain').onclick = () => publishMenu()
  wireFeedRow(el)
  return el
}

// Post to Feed, under the Live link: Public (in the feed) or Unlisted (link only), one button.
export const posted = { runs: new Map(), busy: false, unlisted: false, note: '', connect: null, alone: false }
export function feedPop() {
  posted.alone = true
  const el = pubPop(feedRow(), 'Post to the <em>Feed</em>')
  wireFeedRow(el)
}
export const feedRefresh = () => (posted.alone ? feedPop() : pubShow())
export function feedRow() {
  const run = shownRun(), done = posted.runs.get(run)
  if (done) return `<div class="pfeed"><div class="pstate live"><b>In the Feed</b><span>${done.unlisted ? 'Unlisted' : 'Public'}</span></div><div class="plink"><a href="${esc(done.url)}" target="_blank" rel="noopener">${esc(shortUrl(done.url))}</a></div></div>`
  if (posted.connect) return `<div class="pfeed"><div class="pstate"><b>Connect Hermes</b><span>${posted.connect.code ? esc(posted.connect.code) : ''}</span></div>
    <div class="vfoot">${posted.connect.url ? `<a class="vagain" href="${esc(posted.connect.url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}<button class="vagain pfpost">Post</button></div></div>`
  return `<div class="pfeed"><div class="pseg" role="radiogroup" aria-label="Who can find it">
      <button role="radio" aria-checked="${!posted.unlisted}" class="${posted.unlisted ? '' : 'on'}" data-v="public">Public</button>
      <button role="radio" aria-checked="${posted.unlisted}" class="${posted.unlisted ? 'on' : ''}" data-v="unlisted">Unlisted</button></div>
    <button class="ui-btn ui-btn-default pfpost" ${posted.busy ? 'disabled' : ''}>${posted.busy ? 'Posting…' : 'Post to Feed'}</button>
    ${posted.note ? `<div class="pstate err"><span>${esc(shortReason(posted.note))}</span></div>` : ''}</div>`
}
export function wireFeedRow(el) {
  el.querySelectorAll('.pseg button').forEach(b => { b.onclick = () => { posted.unlisted = b.dataset.v === 'unlisted'; feedRefresh() } })
  const go = el.querySelector('.pfpost')
  if (go) go.onclick = postToFeedNow
}
export async function postToFeedNow() {
  const run = shownRun()
  if (!run || posted.busy) return
  Object.assign(posted, { busy: true, note: '' })
  feedRefresh()
  const json = { method: 'POST', headers: { 'content-type': 'application/json' } }
  const post = () => api(`/api/runs/${encodeURIComponent(run)}/feed`, { ...json, body: JSON.stringify({ unlisted: posted.unlisted }) }).then(r => r.json()).catch(() => ({ ok: false }))
  let out = await post()
  if (!out.ok && out.connect) {
    // not linked yet: start (or finish) Connect Hermes; once the code is approved, post straight away
    const c = await api('/api/feed/connect', { ...json, body: '{}' }).then(r => r.json()).catch(() => ({}))
    if (c.connected) out = await post()
    else posted.connect = c
  }
  posted.busy = false
  if (out.ok) {
    posted.connect = null
    posted.runs.set(run, { url: out.url, unlisted: !!out.unlisted || posted.unlisted })
  } else if (!out.connect) posted.note = out.message || 'The Feed did not take it.'
  feedRefresh()
}

export async function publishNow(target = 'github') {
  const run = shownRun()
  if (!run) return
  Object.assign(pub, { run, state: 'working', stage: 'export', target, message: '' })
  pubShow()
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, sections }) }).catch(() => null)
  if (!res?.ok) {
    const out = await res?.json().catch(() => ({}))
    Object.assign(pub, { state: 'failed', message: out?.error })
    pubShow()
  }
}

// Every publish event, replayed or live, updates the build's state, so the Live link
// is back after a reload or a server restart (the events are saved with the build).
export function publishEvent(e) {
  if (e.run !== shownRun()) return
  if (pub.run !== e.run) Object.assign(pub, { run: e.run, live: {}, state: 'none', liveTarget: '' })
  const fresh = !e.t || Date.now() - e.t < 8000
  if (e.type === 'publish:start' || e.type === 'publish:stage') {
    if (!fresh) return
    Object.assign(pub, { state: 'working', stage: e.stage || 'export', target: e.target || pub.target })
  } else if (e.type === 'publish:failed') {
    Object.assign(pub, { state: 'failed', message: e.message, target: e.target || pub.target })
  } else {
    pub.live[e.target] = e.url
    if (e.target !== 'local' || !pub.liveTarget || pub.liveTarget === 'local') pub.liveTarget = e.target
    Object.assign(pub, { state: 'done', pending: !!e.pending })
    if (fresh) feed(null, `🌐 live: ${e.url}`, 'sys')
  }
  pubButton()
  // a pop that is open follows along; a fresh result opens it, so it never ends silently
  if (fresh || pub.el) pubShow()
}

// The Publish button says the state: Publishing…, Live, or Publish.
export function pubButton() {
  const mine = pub.run === shownRun()
  const live = mine && liveUrl() && pub.state !== 'working'
  els.publishBtn.classList.toggle('live', !!live)
  const box = $('#pub-menu .pub-live')
  if (!box) return
  box.hidden = !live
  if (live) {
    const url = liveUrl(), a = box.querySelector('a')
    a.href = url; a.textContent = shortUrl(url)
  }
}

commandOps.publish = c => publishNow(['local', 'vercel', 'cloudflare'].includes(c.target) ? c.target : 'github')
