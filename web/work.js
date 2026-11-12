// What the crew are working on: a chip in the top bar while anything builds (a site, an app,
// a game, a film), with one bar for how far the first job is. A click lists every job, each
// with its own bar; a row opens that project, or the room the job runs in.
export function makeWork({ sw, C }) {
  // the page joins its modules into one script: these stay inside, so their names cannot clash
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const WHAT = { site: 'Site', app: 'App', game: 'Game', film: 'Film' }
  const ROOM = { app: 'app', game: 'app', film: 'video' }
  const chip = document.createElement('button')
  chip.type = 'button'
  chip.className = 'toggle work-chip'
  chip.hidden = true
  chip.setAttribute('aria-haspopup', 'dialog')
  chip.setAttribute('aria-expanded', 'false')
  const anchor = document.querySelector('.topbar #crew-mute') || document.querySelector('.topbar .spacer')
  if (!anchor) return { refresh() {} }
  anchor.before(chip)
  // Stop: one button beside the chip, the same place in every room. Inside a project it stops that
  // project's work (the build, pictures, review and fixes, a film, an app or game build); on Projects
  // it stops all of it. No confirmation: what is built is kept, and the deck's chat offers Resume.
  const stopBtn = document.createElement('button')
  stopBtn.type = 'button'
  stopBtn.className = 'toggle work-stop'
  stopBtn.hidden = true
  stopBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="currentColor"/></svg><span>Stop</span>'
  chip.after(stopBtn)

  let jobs = [], pop = null, timer = 0
  // the work of the project (or build) on screen; on Projects, all of it
  const here = () => {
    if (C.mode === 'home') return { jobs, body: {} }
    const run = sw.S?.run
    const mine = jobs.filter(j => (C.project && j.project === C.project) || (run && j.run === run))
    return { jobs: mine, body: C.project && mine.some(j => j.project === C.project) ? { project: C.project } : { run } }
  }
  const bar = w => {
    const pct = w.pct == null ? null : Math.round(w.pct * 100)
    return `<span class="wk-bar${pct == null ? ' ind' : ''}" role="progressbar" aria-label="${esc(WHAT[w.what] || 'Work')}"${pct == null ? '' : ` aria-valuenow="${pct}"`}><i${pct == null ? '' : ` style="width:${Math.max(4, pct)}%"`}></i></span>`
  }
  const base = () => sw.base || ''
  function paint() {
    chip.hidden = !jobs.length
    const h = here()
    stopBtn.hidden = !h.jobs.length
    stopBtn.setAttribute('aria-label', 'Stop the crew')
    if (!jobs.length) { pop?.close(); return }
    const sig = jobs.map(j => `${j.run}:${j.what}:${j.pct == null ? '' : Math.round(j.pct * 100)}`).join('|')
    chip.setAttribute('aria-label', `Working on ${jobs.length}`)
    if (chip.dataset.sig !== sig) {
      chip.dataset.sig = sig
      chip.innerHTML = `<span class="wk-dot" aria-hidden="true"></span><span class="t">${jobs.length}</span>${bar(jobs[0])}`
      if (pop && !pop.closed) pop.el.innerHTML = list()
    }
  }
  const list = () => `<div class="wk-list" role="list">${jobs.map((j, i) => `<button type="button" class="wk-row" role="listitem" data-i="${i}" aria-label="${esc(j.title)}, ${esc(WHAT[j.what] || '')}">
      <span class="wk-cv">${j.cover ? `<img src="${esc(base() + j.cover)}" alt="">` : ''}</span>
      <span class="wk-tx"><b>${esc(j.title)}</b><span>${esc(WHAT[j.what] || '')}${j.stage ? ` · ${esc(j.stage)}` : ''}</span>${bar(j)}</span>
    </button>`).join('')}</div>`
  function open(j) {
    pop?.close()
    C.project = j.project
    if (ROOM[j.what] === 'app') { C.load(j.run); return C.go('station', 'app') }
    C.open(j.head, j.project)
    if (ROOM[j.what] === 'video') setTimeout(() => C.go('station', 'video'), 50)
  }
  chip.onclick = () => {
    if (pop && !pop.closed) return pop.close()
    pop = window.SwarmUI.popover(chip, list(), { className: 'wk-pop' })
    pop.el.addEventListener('click', e => { const r = e.target.closest('.wk-row'); if (r) open(jobs[Number(r.dataset.i)]) })
  }
  stopBtn.onclick = async () => {
    stopBtn.disabled = true
    try { await sw.api('/api/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(here().body) }) } catch {}
    stopBtn.disabled = false
    refresh()
  }
  async function refresh() {
    clearTimeout(timer)
    try {
      const r = await sw.api('/api/work')
      if (r.ok) jobs = (await r.json()).jobs || []
    } catch {}
    paint()
    timer = setTimeout(refresh, jobs.length ? 3000 : 15000)
  }
  sw.on?.(e => { if (['run:start', 'run:done', 'run:stopped', 'work:stopped', 'app:start', 'app:done', 'app:failed', 'video:done', 'video:failed', 'review:start', 'review:done', 'image:queued'].includes(e.type)) setTimeout(refresh, 400) })
  refresh()
  return { refresh, paint }
}
