// @ts-check
// A project's source on GitHub (docs/specs/45-intake.md, "The other direction"): one entry, GitHub, in a
// project's menu and on its card's menu, opens one small sheet. It says what is true (not linked, linked to
// owner/name, private or public, pushed or pulled when, changes not pushed, new commits to pull) and has the
// two moves: Push and Pull. A project with no app or game yet brings a repository in from here. The same
// moves typed in the chat: "push to github", "pull from github", "link owner/name", "where is this on github".
// Anything on its way shows a crew cursor with what it is doing. The server does the work (server/sourcehub.mjs)
// with the person's own gh login; the hosted studio has no such door.
// Imports only the icons, so node tests the words; the canvas hands it what it needs (web/canvas/loop.js).
import { cursor, CREW } from './icons.js'

/**
 * @typedef {object} GitHubState
 * @property {string} project @property {string} name @property {string} piece @property {string[]} pieces
 * @property {string | null} run @property {boolean} source @property {string | null} login @property {string} suggest
 * @property {{ repo: string, url: string, private: boolean, pushed: number | null, pulled: number | null, fits: boolean } | null} link
 * @property {{ repo: string, path: string, url: string, pulled: number | null } | null} origin
 * @property {boolean} ahead @property {boolean | null} behind @property {string | null} unreachable
 * @property {{ did: string, state: string, step: string, message: string, url?: string, repo?: string, pull?: boolean, run?: string } | null} job
 */
/**
 * @typedef {object} GitHubHost
 * @property {(path: string, opts?: any) => Promise<Response>} api
 * @property {(s: string) => string} esc
 * @property {() => string | null} project the open project (or its open run), null on Projects
 * @property {() => string | null} run the run on screen
 * @property {(text: string, working?: boolean) => HTMLElement} botMsg
 * @property {(text: string) => void} youSaid
 * @property {boolean} off the hosted studio: no door
 */

/**
 * The moves, typed in the chat. Only a message that is one of these, whole: "push the button to the left" is
 * a change for the crew, not a push.
 * @param {string} text @returns {{ did: 'push' | 'pull' | 'where' } | { did: 'link', repo: string } | null}
 */
export function githubAsk(text) {
  const t = String(text || '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  const s = t.toLowerCase()
  const it = '(?:it |this |the (?:project|game|app|site|source|code) )?'
  if (new RegExp(`^(?:please )?(?:push|send|put|upload) ${it}(?:to|on) github$`).test(s)) return { did: 'push' }
  if (new RegExp(`^(?:please )?(?:pull|update|sync) ${it}from github$`).test(s) || /^(?:please )?pull (?:the )?(?:new|latest) (?:commits|changes) from github$/.test(s)) return { did: 'pull' }
  if (/^(?:where is (?:it|this|the (?:project|game|app|source|code)) on github|is (?:it|this) on github|github status|which (?:github )?repo(?:sitory)? is (?:it|this))$/.test(s)) return { did: 'where' }
  const link = t.match(/^(?:please )?link (?:(?:it|this) )?(?:to )?(?:github )?((?:https:\/\/(?:www\.)?github\.com\/)?[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/i)
  if (link) return { did: 'link', repo: link[1].replace(/^https:\/\/(?:www\.)?github\.com\//i, '') }
  return null
}

/** "3 min ago", for a time of this computer's clock @param {number | null} t @param {number} [now] */
export function githubAgo(t, now = Date.now()) {
  if (!t) return ''
  const m = Math.max(0, Math.round((now - t) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}

/**
 * What is true, in a few plain lines (the sheet shows them; the chat joins them into its answer).
 * @param {GitHubState} st @param {number} [now] @returns {string[]}
 */
export function githubLines(st, now = Date.now()) {
  if (!st.source) return ['No app or game here yet']
  const out = []
  const from = st.origin ? `Brought in from ${st.origin.repo}${st.origin.path ? `/${st.origin.path}` : ''}` : ''
  if (!st.link) out.push(from || 'Not on GitHub')
  else {
    out.push(`${st.link.repo}, ${st.link.private ? 'private' : 'public'}`)
    const last = Math.max(st.link.pushed || 0, st.link.pulled || 0)
    if (last) out.push(`${last === st.link.pushed ? 'Pushed' : 'Pulled'} ${githubAgo(last, now)}`)
    if (!st.link.fits) out.push('This version needs a repository of its own')
  }
  if (!st.link && st.origin?.pulled) out.push(`Pulled ${githubAgo(st.origin.pulled, now)}`)
  if (st.ahead) out.push('Changes not pushed')
  if (st.behind) out.push('New commits to pull')
  if (st.link?.fits && !st.ahead && st.behind === false) out.push('Up to date')
  if (st.unreachable) out.push(st.unreachable)
  if (!st.login) out.push('Not signed in: run gh auth login')
  return out
}

/** the chat's answer to "where is this on github" @param {GitHubState} st @param {number} [now] */
export function githubWhere(st, now = Date.now()) {
  const lines = githubLines(st, now)
  const how = !st.source ? ' Bring one in from its GitHub menu.' : !st.link ? ' Say "push to github" to put its source there, private.' : ''
  return `${lines.join('. ')}.${how}`
}

const GH_DOING = { push: 'Pushing to GitHub', pull: 'Pulling from GitHub', bring: 'Bringing it in', check: 'Checking GitHub' }
const ghCap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The door: `open(project)` shows the sheet, `say(text)` takes a typed move (true when it was one).
 * @param {GitHubHost} host
 */
export function githubDoor(host) {
  const { esc } = host
  /** @param {string} id @param {any} [body] @param {string} [query] @returns {Promise<GitHubState>} */
  const ask = async (id, body, query = '') => {
    const r = await host.api(`/api/projects/${encodeURIComponent(id)}/github${query}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(String(j.error || 'That did not work')), j)
    return j
  }
  const runQ = () => (host.run() ? `&run=${encodeURIComponent(host.run() || '')}` : '')
  /** ask again until the job has ended; `tick` hears each step
   * @param {string} id @param {string} piece @param {(st: GitHubState) => void} tick @returns {Promise<GitHubState>} */
  const follow = async (id, piece, tick) => {
    for (;;) {
      const st = await ask(id, null, `?piece=${piece}`)
      if (st.job?.state !== 'working') return ask(id, null, `?piece=${piece}&check=1`).catch(() => st)
      tick(st)
      await new Promise(r => setTimeout(r, 900))
    }
  }
  const working = (/** @type {GitHubState['job']} */ job) => `<div class="gh-work" role="status" aria-busy="true">${cursor(CREW[1])}<span>${esc(ghCap(job?.step || GH_DOING[/** @type {keyof typeof GH_DOING} */ (job?.did || 'check')] || GH_DOING.check))}</span></div>`

  /** @param {string | null} [project] */
  function open(project = host.project()) {
    if (host.off || !project) return null
    const d = /** @type {any} */ (window).SwarmUI.dialog({ title: 'GitHub', className: 'gh-sheet', body: working(null) })
    /** @type {GitHubState | null} */
    let st = null
    let piece = '', kind = 'game', busy = false, said = ''
    // what was typed stays in the fields when the sheet is drawn again (a refusal leaves it there to mend)
    const typed = { repo: '', path: '' }
    const body = /** @type {HTMLElement} */ (d.body)
    /** @param {any} move */
    const go = async move => {
      if (busy || !st) return
      busy = true; said = ''
      const before = st
      st = { ...st, job: { did: move.action, state: 'working', step: '', message: '' } }
      draw()
      try {
        const got = await ask(project, { ...move, piece: move.action === 'bring' ? undefined : before.piece })
        piece = got.piece
        st = await follow(project, got.piece, s => { st = s; draw() })
        if (st.job?.state === 'done') Object.assign(typed, { repo: '', path: '' })
      } catch (e) {
        said = String(/** @type {any} */ (e)?.message || 'That did not work')
        st = { ...before, job: null }
      }
      busy = false
      if (!d.closed) draw()
    }
    function draw() {
      if (!st) return
      const s = st, job = s.job, at = s.link, mid = job?.state === 'working'
      const needsName = s.source && (!at || !at.fits)
      const toggle = (/** @type {string} */ name, /** @type {string[][]} */ opts, /** @type {string} */ on, /** @type {string} */ attr) => `<div class="ui-toggle-group ui-block" role="radiogroup" aria-label="${name}">${opts.map(([k, n]) => `<button type="button" class="ui-toggle" role="radio" aria-checked="${k === on}" data-${attr}="${k}">${n}</button>`).join('')}</div>`
      const lines = githubLines(s).filter(l => !at || !l.startsWith(`${at.repo},`))
      body.innerHTML = `<form class="gh-form" autocomplete="off">
        ${s.pieces.length > 1 ? toggle('Piece', [['game', 'Game'], ['app', 'App']], s.piece, 'piece') : ''}
        ${at ? `<p class="gh-repo"><a href="${esc(at.url)}" target="_blank" rel="noopener">${esc(at.repo)}</a><span>${at.private ? 'Private' : 'Public'}</span></p>` : ''}
        <ul class="gh-lines">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        ${mid ? working(job) : ''}
        ${!mid && !s.source ? `<label class="ui-field"><span class="ui-label">Repository</span><input class="ui-input" name="repo" value="${esc(typed.repo)}" placeholder="owner/name" maxlength="200" required></label>
          <label class="ui-field"><span class="ui-label">Subfolder</span><input class="ui-input" name="path" value="${esc(typed.path)}" placeholder="games/ares" maxlength="300"></label>
          ${toggle('Kind', [['game', 'Game'], ['app', 'App']], kind, 'kind')}` : ''}
        ${!mid && needsName ? `<label class="ui-field"><span class="ui-label">Repository</span><input class="ui-input" name="repo" value="${esc(typed.repo || s.suggest)}" placeholder="name or owner/name" maxlength="200" required></label>
          ${toggle('Who can see it', [['private', 'Private'], ['public', 'Public']], 'private', 'see')}` : ''}
        ${job?.state === 'done' && job.message ? `<p class="gh-done" role="status">${esc(job.message)}${job.url ? ` <a href="${esc(job.url)}" target="_blank" rel="noopener">${esc(String(job.url).replace(/^https:\/\//, ''))}</a>` : ''}</p>` : ''}
        ${said || job?.state === 'failed' ? `<p class="bring-err" role="alert">${esc(said || job?.message || '')}</p>` : ''}
        <button type="submit" hidden></button>
      </form>`
      // the move a refusal offers leads: Pull after "has commits this project does not have"
      const pullFirst = !!(job?.pull || s.behind)
      const canPull = s.source && !!(at || s.origin)
      const btn = (/** @type {string} */ k, /** @type {string} */ n, /** @type {boolean} */ lead) => `<button type="button" class="ui-btn ${lead ? 'ui-btn-default' : 'ui-btn-outline'}" data-go="${k}"${mid ? ' disabled' : ''}>${n}</button>`
      d.setFooter(!s.source ? btn('bring', 'Bring in', true) : `${canPull ? btn('pull', 'Pull', pullFirst) : ''}${btn('push', 'Push', !pullFirst || !canPull)}`)
      const form = /** @type {HTMLFormElement} */ (body.querySelector('form'))
      const field = (/** @type {string} */ n) => /** @type {HTMLInputElement | null} */ (form.elements.namedItem(n))
      for (const b of /** @type {NodeListOf<HTMLElement>} */ (form.querySelectorAll('[role="radio"]'))) b.onclick = () => {
        for (const x of b.parentElement?.children || []) x.setAttribute('aria-checked', String(x === b))
        if (b.dataset.kind) kind = b.dataset.kind
        if (b.dataset.piece && b.dataset.piece !== s.piece) { piece = b.dataset.piece; load() }
      }
      const move = (/** @type {string} */ k) => {
        const repo = field('repo')
        if (k !== 'pull' && repo && !repo.value.trim()) return repo.focus()
        Object.assign(typed, { repo: repo?.value.trim() || '', path: field('path')?.value.trim() || '' })
        if (k === 'bring') return go({ action: 'bring', repo: repo?.value.trim(), path: field('path')?.value.trim() || '', kind })
        if (k === 'pull') return go({ action: 'pull' })
        go({ action: 'push', ...(repo ? { ...(repo.value.trim() === s.suggest ? {} : { repo: repo.value.trim() }), public: form.querySelector('[data-see="public"]')?.getAttribute('aria-checked') === 'true' } : {}) })
      }
      for (const b of /** @type {NodeListOf<HTMLElement>} */ (d.footer.querySelectorAll('[data-go]'))) b.onclick = () => move(b.dataset.go || '')
      form.onsubmit = e => { e.preventDefault(); move(!s.source ? 'bring' : pullFirst && canPull ? 'pull' : 'push') }
    }
    // the first look asks GitHub what is new there (one request), with the crew's cursor meanwhile
    async function load() {
      try {
        st = await ask(project || '', null, `?check=1${piece ? `&piece=${piece}` : runQ()}`)
        if (st.job?.state === 'working') { draw(); st = await follow(project || '', st.piece, s => { st = s; draw() }) }
        // what an earlier push or pull said is not news in a sheet opened later
        else st = { ...st, job: null }
      } catch (e) { body.innerHTML = `<p class="bring-err" role="alert">${esc(String(/** @type {any} */ (e)?.message || 'That did not work'))}</p>`; return }
      if (!d.closed) draw()
    }
    load()
    return d
  }

  /** a typed move: answered here, never sent to the builder @param {string} text */
  function say(text) {
    const want = host.off ? null : githubAsk(text)
    if (!want) return false
    host.youSaid(text)
    const project = host.project()
    if (!project) { host.botMsg('Open a project first: its GitHub is in its menu.'); return true }
    const item = host.botMsg(GH_DOING[want.did === 'pull' ? 'pull' : want.did === 'where' ? 'check' : 'push'], true)
    item.classList.add('crew-wait')
    const head = item.querySelector('b'), txt = /** @type {HTMLElement} */ (item.querySelector('.txt'))
    const hermia = head?.innerHTML || ''
    if (head) head.innerHTML = `${cursor('')}${CREW[1]}`
    /** @param {string} words @param {string} [url] */
    const end = (words, url) => {
      item.classList.remove('working', 'crew-wait')
      if (head) head.innerHTML = hermia
      txt.textContent = words
      if (url) { const a = document.createElement('a'); a.className = 'gh-link'; a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = url.replace(/^https:\/\//, ''); txt.append(' ', a) }
    }
    ;(async () => {
      const first = await ask(project, null, `?check=1${runQ()}`)
      if (want.did === 'where') return end(githubWhere(first), first.link?.url || first.origin?.url)
      if (first.job?.state !== 'working') await ask(project, { action: want.did === 'link' ? 'push' : want.did, piece: first.piece, ...(want.did === 'link' ? { repo: want.repo } : {}) })
      const st = await follow(project, first.piece, s => { txt.textContent = ghCap(s.job?.step || txt.textContent || '') })
      const job = st.job
      end(job?.state === 'failed' ? `${job.message}${job.pull ? ' Say "pull from github".' : ''}` : job?.message || githubWhere(st), job?.state === 'failed' ? undefined : job?.url || st.link?.url)
    })().catch(e => end(String(e?.message || 'That did not work')))
    return true
  }
  return { open, say }
}
