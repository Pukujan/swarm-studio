// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the hosted studio.
import { BOOT, els, S, api, store, cosmosHooks } from './core.js'
import { esc } from './design.js'
import { viewing } from './replay.js'
import { connect, es } from './start.js'
import { snapFrame } from './marks.js'
import { feed } from './panels.js'
import { live } from './deck.js'

// ---------- the hosted studio (docs/specs/13-hosted-studio.md): anyone can try a build in the
// browser as a named guest, with a small crew, a few builds a day and a daily spending cap.
// Everything the hosted server can't do (video, apps, publishing, models) is hidden by body.hosted.
export const hosted = BOOT.hosted && (() => {
  const H = BOOT.hosted, ui = window.SwarmUI
  document.body.classList.add('hosted')
  let me = H.guest || null, open = H.open !== false
  const plugin = `<a class="ui-btn ui-btn-outline ui-btn-sm" href="${esc(H.install)}" target="_blank" rel="noopener">Install the plugin</a>`
  // the crew picker offers only what a guest may use
  for (const o of [...els.agentsSel.options]) if (Number(o.value) > H.limits.agents) o.remove()
  els.agentsSel.value = String(H.limits.agents)
  els.agentsSel.dispatchEvent(new Event('change'))
  els.brief.maxLength = H.limits.promptChars
  els.brief.placeholder = `Describe a product (up to ${H.limits.promptChars} characters). A crew of ${H.limits.agents} builds its site.`

  const bar = document.createElement('div')
  bar.className = 'guest-bar'
  document.querySelector('.topbar .spacer').after(bar)
  let posted = new Set(), posting = false
  const shown = () => (viewing && viewing !== 'new' ? viewing : S?.run)
  const finished = () => shown() && S?.tEnd && S.frames.length
  function draw() {
    const left = me ? me.left : H.limits.builds
    const can = finished() && !posted.has(shown()) && !posting
    bar.innerHTML = `${me?.name ? `<span class="g-name">${esc(me.name)}</span>` : ''}`
      + `<span class="g-left">${open ? `${left} of ${H.limits.builds} builds left today` : 'Done for today'}</span>`
      + `<button class="ui-btn ${can ? 'ui-btn-default' : 'ui-btn-outline'} ui-btn-sm g-post" ${can ? '' : 'disabled'} aria-label="Post this build to Swarm Feed">${posting ? 'Posting…' : posted.has(shown()) ? 'Posted' : 'Post to Feed'}</button>`
      + plugin
    // @ts-ignore
    bar.querySelector('.g-post').onclick = postToFeed
  }
  async function refresh() {
    const st = await api('/api/state').then(r => r.json()).catch(() => null)
    if (st) { me = st.guest || me; open = st.open !== false }
    draw()
  }

  // a name, once: it is the credit on the Feed and on this computer's cookie
  // With the Feed, a guest is the Feed's guest (one name on both): the Feed makes one on the first
  // visit with a generated name ("Comet Otter"), and the guest confirms or changes it here, once.
  const feedApi = (path, opts) => fetch(`/api/feed${path}`, { credentials: 'same-origin', ...opts }).then(r => r.json().then(j => ({ ok: r.ok, ...j }))).catch(() => ({ ok: false }))
  // the event stream opened before the guest existed: open it again as this guest
  const reconnect = () => { connect(); return new Promise(r => { es.addEventListener('open', r, { once: true }); setTimeout(r, 2500) }) }
  // A build never waits for a name. With the Feed, the guest's generated name ("Comet Otter") is enough
  // to build, and the Feed makes the guest here if this is the first visit; the guest picks their own
  // name the first time they post, where it is the credit. Without a Feed (local testing) the name is asked.
  async function ready() {
    if (me?.name) return true
    if (!H.feedIdentity) return named('Start building')
    for (let i = 0; i < 2 && !me?.name; i++) {
      await feedApi('/me')
      const st = await api('/api/state?fresh=1').then(r => r.json()).catch(() => null)
      if (st?.guest) { me = st.guest; draw(); await reconnect() }
    }
    return me?.name ? true : named('Start building')
  }
  function named(go_label) {
    return new Promise(async resolve => {
      let done = false
      const had = !!me?.name // a guest who is only renaming keeps the stream (and the canvas) they have
      const d = ui.dialog({
        title: 'What should the crew <em>call you</em>?',
        body: `<form class="ui-field g-form"><label class="ui-label" for="g-name">Name</label><input id="g-name" class="ui-input" maxlength="24" autocomplete="nickname" required><p class="g-err" hidden></p></form>`,
        footer: `<button class="ui-btn ui-btn-default g-go">${go_label}</button>`,
        onClose: () => { if (!done) resolve(false) }
      })
      const input = d.body.querySelector('input'), err = d.body.querySelector('.g-err')
      setTimeout(() => input.focus(), 30)
      const fail = m => { err.textContent = m || 'That did not work. Try again.'; err.hidden = false }
      if (H.feedIdentity) feedApi('/me').then(j => { if (j.viewer?.name && !input.value) { input.value = j.viewer.name; input.select() } })
      const go = async e => {
        e?.preventDefault()
        const name = input.value.replace(/\s+/g, ' ').trim()
        if (H.feedIdentity) {
          if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u.test(name)) return fail('Use 2 to 24 letters or digits (spaces, - and _ are fine).')
          await feedApi('/me')
          const j = await feedApi('/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
          if (!j.ok) return fail(j.message)
          const st = await api('/api/state?fresh=1').then(r => r.json()).catch(() => null)
          if (!st?.guest) return fail('The studio could not see your guest name. Reload the page and try again.')
          me = st.guest
          store.set('guestNamed', true)
        } else {
          const res = await api('/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
          const j = await res?.json().catch(() => ({}))
          if (!res?.ok) return fail(j?.message)
          me = j.guest
        }
        done = true; d.close('ok'); draw()
        if (!had) await reconnect()
        resolve(true)
      }
      d.body.querySelector('form').onsubmit = go
      d.footer.querySelector('.g-go').onclick = go
    })
  }

  // a limit, the cap or a feature that needs the plugin: say which, and the way to more
  function refuse(j = {}) {
    if (j.error === 'closed') open = false
    if (j.guest) me = j.guest
    draw()
    ui.dialog({
      kicker: j.error === 'install' ? 'Needs the plugin' : 'Hosted studio',
      title: esc(j.title || 'Not right now'),
      desc: esc(j.message || 'That did not work.'),
      footer: `${plugin}<a class="ui-btn ui-btn-ghost ui-btn-sm" href="${esc(H.feed)}">See the Feed</a>`
    })
  }

  // the Feed takes a poster of at most 2 MB: 640 px wide, the top of the page, as JPEG
  function poster(src) {
    return new Promise((ok, fail) => {
      const img = new Image()
      img.onload = () => {
        const w = 640, k = w / img.naturalWidth, h = Math.min(Math.round(img.naturalHeight * k), 1600)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, img.naturalHeight * k)
        ok(c.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = () => fail(new Error('the poster did not load'))
      img.src = src
    })
  }

  async function postToFeed() {
    if (!finished() || posting) return
    // the name on the post: asked once, here (the Feed's generated name is the default)
    if (H.feedIdentity && !store.get('guestNamed', false) && !(await named('Post'))) return
    posting = true; draw()
    try {
      // a resting page is frozen into a picture (its frame emptied), so that picture is the poster
      const first = S.frames[0]
      const raw = first?.frozen ? first.frozen.img.src : (await snapFrame(first, 0.5).catch(() => null))?.image
      const shot = raw ? { image: await poster(raw).catch(() => null) } : null
      const run = shown()
      if (!shot?.image) return refuse({ title: 'Could not post', message: 'The canvas could not take a picture of the build. Try again.' })
      // the studio puts the pages online, then the Feed takes the card from this browser, as this guest
      const res = await api(`/api/runs/${encodeURIComponent(run)}/site`, { method: 'POST' })
      const site = await res.json().catch(() => ({}))
      if (!res.ok) return refuse(site)
      if (!H.feedIdentity) return refuse({ title: 'No Feed here', message: `The pages are online at ${site.card.liveUrl}, but this studio is not connected to Swarm Feed.` })
      const j = await feedApi('/builds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...site.card, poster: shot.image }) })
      if (!j.ok) return refuse({ title: 'Could not post', message: j.message || 'The Feed did not take it.' })
      posted.add(run)
      feed(null, `Posted to Swarm Feed: ${j.url}`, 'sys')
      window.open(j.url, '_blank', 'noopener')
    } catch (err) {
      refuse({ title: 'Could not post', message: String(err.message || err) })
    } finally { posting = false; draw() }
  }

  cosmosHooks.add(e => {
    if (e?.type !== 'run:done' && e?.type !== 'reset' && e?.type !== 'run:start') return
    if (e.type !== 'run:done') return draw()
    refresh()
    // a build that made nothing says so (the server does not count it): the canvas is never left blank and silent
    if (!e.done && live(e)) refuse({ title: 'That build did not start', message: 'The crew could not plan it. It did not count: try again in a moment.' })
  })
  draw()
  if (!open) setTimeout(() => refuse({ error: 'closed', title: 'Done for today', message: H.closedMessage }), 400)
  return { ready, refresh, refuse }
})()
