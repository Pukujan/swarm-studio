// web/canvas.js, split by area (web/canvas/README.md): the promo video and the film's outside services.
import { S, api, ico, store, els, commandOps } from './core.js'
import { viewing, openRun, claimed } from './replay.js'
import { feed, setText } from './panels.js'
import { autoM } from './auto.js'
import { view } from './rooms.js'
import { esc } from './design.js'
import { fitLive } from './start.js'
import { shortReason } from './publish.js'

// ---------- promo video
// The planner storyboards the build into a few scenes, each handed to an agent,
// and HyperFrames renders them in the site's theme. The panel shows the
// storyboard, the render, then the video.
export const video = { run: null, busy: false, pct: 0, stage: '', story: [], board: null, notes: null, notesOpen: false, src: '', file: '', message: '', el: null, cuts: [], pick: -1, next: null }
export const shownRun = () => (viewing && viewing !== 'new' ? viewing : S.run)
// The build the left chat and Hermes's commands work on. In the studio it is the navigation machine's
// (spec 34): its run in a build's room, none on Projects, a plan or a new talk. Without the studio
// it is the one shown.
export const BUILD_ROOMS = ['overview', 'deck', 'video', 'app', 'game']
export function runNow() {
  const v = window.swarmCosmos?.nav?.view
  if (!v) return shownRun()
  return BUILD_ROOMS.includes(v.room === 'brand' ? v.from : v.room) ? v.run : null
}
// Show a build. In the studio the machine is told and the canvas follows it: a build the person just
// started is `started` (it stays in the room it was started from), any other opens its project.
export function showRun(id, { started = false, room } = {}) {
  const studio = window.swarmCosmos
  if (!studio?.nav) return openRun(id)
  if (!started) return studio.open(id)
  const v = studio.nav.view, here = v.room === 'brand' ? v.from : v.room
  return studio.started(id, { project: BUILD_ROOMS.includes(here) ? v.project : null, room: room || (['overview', 'deck', 'app', 'video'].includes(here) ? here : undefined) })
}
// the canvas holds this build already, or asked for it and is not on a blank talk
export const holds = run => run === shownRun() || (run === claimed && viewing !== 'new')

export function videoEvent(e) {
  if (video.run !== e.run) Object.assign(video, { run: e.run, busy: false, pct: 0, stage: '', story: [], board: null, notes: null, src: '', file: '', message: '', cuts: [], pick: -1, next: null })
  const fresh = !e.t || Date.now() - e.t < 8000 // a replayed file shows its video quietly
  if (e.type === 'video:start') {
    Object.assign(video, { busy: true, pct: 0, stage: 'storyboard', story: [], board: null, notes: null, notesOpen: false, src: '', message: '', heard: fresh ? Date.now() : 0, next: { style: e.style, idea: e.prompt || e.idea } })
    if (fresh) feed(null, `🎬 ${e.model || 'the planner'} is storyboarding a film${(e.prompt || e.idea) ? `: “${e.prompt || e.idea}”` : ''}`, 'sys')
  } else if (e.type === 'video:style') {
    video.notes = e.notes
  } else if (e.type === 'video:story') {
    video.story = e.scenes
    video.board = { title: e.title, pace: e.pace, music: e.music, plan: e.plan }
    if (e.notes) video.notes = e.notes
    if (fresh) e.scenes.forEach((sc, i) => setTimeout(() => feed(S.agents.get(sc.agent), `scene ${i + 1} · ${sc.kind}: “${sc.headline}”`, ''), i * 350))
    if (fresh && e.cast?.narrator) feed(null, `🎙 cast for the theme: ${e.cast.narrator}${e.cast.second ? ` with ${e.cast.second}` : ''} reading, ${e.music || 'matching'} music`, 'sys')
  } else if (e.type === 'video:progress') {
    Object.assign(video, { busy: true, pct: e.pct, stage: e.stage, heard: Date.now() })
  } else if (e.type === 'video:done') {
    Object.assign(video, { busy: false, pct: 100, src: e.src, file: e.file, stage: 'done' })
    // every cut is kept in the build's video folder; the newest plays, the rest are a click away
    const name = String(e.file || '').split('/').pop()
    if (/-promo-v\d+\.mp4$/.test(name) && !video.cuts.some(c => c.name === name)) video.cuts.push({ name, file: e.file, seconds: e.seconds, ...(video.next || {}) })
    video.next = null
    video.pick = video.cuts.length - 1
    if (fresh) feed(null, `🎬 promo video ready (${Math.round(e.seconds)}s${e.voice ? ', with voiceover' : ''}${e.music ? ', with music' : ''}, made in ${Math.round(e.ms / 1000)}s)`, 'sys')
  } else if (e.type === 'video:clips') {
    if (fresh) feed(null, `🎬 ${e.by} animated ${e.made} stills`, 'sys')
  } else if (e.type === 'video:note') {
    if (fresh) feed(null, `🎬 ${e.message}`, 'err')
  } else if (e.type === 'video:review') {
    // the critic (spec 32) watched and listened to the finished film: one line with what it found
    if (fresh && e.state === 'done' && e.says) feed(null, `🎬 checked by watching and listening: ${e.says}`, e.ok ? 'sys' : 'err')
    if (fresh && e.state === 'failed') feed(null, `🎬 the film was not checked: ${e.message || 'the check failed'}`, 'err')
    video.review = e.state === 'done' ? { ok: e.ok, says: e.says } : null
  } else if (e.type === 'video:failed') {
    Object.assign(video, { busy: false, message: e.message, stage: 'failed' })
    if (fresh) feed(null, `🎬 video: ${e.message}`, 'err')
  }
  if (fresh && !video.el && e.type !== 'video:progress' && e.type !== 'video:review' && !(autoM.last?.state === 'working' && view !== 'video')) toggleVideo(true)
  renderVideo()
}

export function renderVideo() {
  const el = video.el
  if (!el) return
  // cuts made before this page was open come from the build's video folder
  if (video.run && video.listed !== video.run) {
    video.listed = video.run
    const run = video.run
    api(`/api/runs/${encodeURIComponent(run)}/cuts`).then(r => r.json()).then(({ cuts = [] }) => {
      if (video.run !== run) return
      const v = n => Number(n.match(/-v(\d+)\.mp4$/)[1])
      const known = new Map(video.cuts.map(c => [c.name, c]))
      video.cuts = [...new Map([...cuts.map(c => [c.name, c]), ...known]).values()].sort((a, b) => v(a.name) - v(b.name))
      video.pick = video.cuts.length - 1
      renderVideo()
    }).catch(() => {})
  }
  const stage = { storyboard: 'Writing the storyboard…', 'reading the style references': 'Reading the references…', scoring: 'Scoring the film…', rendering: 'Rendering frames in headless Chrome…', assembling: 'Encoding the MP4…', 'recording the voiceover': 'Kokoro is reading the voiceover…', 'mixing the sound': 'Mixing the music and the voice…' }[video.stage] || video.stage
  // progress only moves the bar, so the storyboard cards don't replay their entrance
  // once the composition is written (rendering onward), it plays live in the panel
  const liveOn = video.busy && /render|assembl|mixing/.test(video.stage || '')
  if (liveOn && !video.liveAt) video.liveAt = Date.now()
  if (!video.busy) video.liveAt = 0
  const sig = JSON.stringify([video.run, video.story.length, video.busy, video.src, video.message, video.pick, video.cuts.length, liveOn, !!video.min, !!video.notes, video.notesOpen, videoOpts.refs.length, media.v, media.open])
  if (el.dataset.sig === sig) {
    const bar = el.querySelector('.vbar i'), txt = el.querySelector('.vstage')
    if (bar) bar.style.width = `${Math.max(3, video.pct)}%`
    if (txt && video.busy) setText(txt, `${stage}${video.pct ? ` ${video.pct | 0}%` : ''}`)
    return
  }
  el.dataset.sig = sig
  // the storyboard: one card per beat, its length and camera; names only, the rest a click away
  const story = video.story.map((sc, i) => `<div class="vscene L-${esc(sc.layer || 'type')}">${sc.image ? `<img src="${esc(sc.image)}" alt="">` : `<span class="vkind">${esc(sc.kind === 'black' ? '' : sc.kind)}</span>`}<b>${esc(sc.headline || (sc.kind === 'black' ? '·' : ''))}</b><small>${sc.seconds ? `${Number(sc.seconds).toFixed(1)}s` : ''}${sc.camera && sc.image ? ` · ${esc(sc.camera)}` : ''}${sc.speed > 1 ? ` · ${sc.speed}×` : ''}${sc.cue ? ` · ${esc(sc.cue)}` : ''}</small></div>`).join('')
  const n = video.notes
  const notes = n ? `<button class="vnotes-btn" aria-expanded="${video.notesOpen}">Style${n.palette?.length ? n.palette.slice(0, 5).map(h => `<i style="background:${esc(h)}"></i>`).join('') : ''}</button>${video.notesOpen ? `<dl class="vnotes">${[['From', (n.from || []).map(x => x.what).join(', ')], ['Type', n.type], ['Pacing', n.pacing], ['Cuts', n.cutRhythm?.text], ['Camera', n.camera], ['Motion', n.motion], ['Mood', n.mood], ['Music', n.music && [n.music.tempo && `${n.music.tempo} BPM`, n.music.instruments?.join(', '), n.music.structure].filter(Boolean).join(' · ')]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}` : ''
  const head = video.board ? `<div class="vboard"><b>${esc(video.board.title || '')}</b><small>${esc(video.board.pace || '')}${video.board.music?.bpm ? ` · ${video.board.music.bpm} BPM` : ''}</small>${notes}</div>` : notes ? `<div class="vboard">${notes}</div>` : ''
  const refs = videoOpts.refs.map((r, i) => `<span class="vref">${esc(r.name || r.url)}<button data-unref="${i}" aria-label="Remove ${esc(r.name || r.url)}">${ico('x')}</button></span>`).join('')
  const opts = `<div class="vprompt-row"><textarea class="vprompt" rows="2" placeholder="Describe the film">${esc(videoOpts.idea || '')}</textarea><button class="vaddref" aria-label="Add a style reference">${ico('plus')}</button><input type="file" class="vreffile" accept="image/*,video/*,audio/*" hidden></div>${refs ? `<div class="vrefs">${refs}</div>` : ''}<div class="vopts"><label>Start from <select class="vstyle">${VIDEO_STYLES.map(([v, l]) => `<option value="${v}" ${videoOpts.style === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Voice <select class="vvoice">${VOICE_OPTS.map(([v, l]) => `<option value="${v}" ${videoOpts.voice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label><input type="checkbox" class="vmusic" ${videoOpts.music ? 'checked' : ''}> Music</label>${media.all?.clips?.on ? `<label><input type="checkbox" class="vclips" ${videoOpts.clips ? 'checked' : ''}> Clips</label>` : ''}</div>${mediaRow()}`
  const cut = video.cuts[video.pick], latest = video.pick < 0 || video.pick === video.cuts.length - 1
  const src = latest ? video.src : `/video/${video.run}/cut/${cut.name}`, file = cut?.file || video.file
  const cuts = video.cuts.length > 1 ? `<div class="vcuts">${video.cuts.map((c, i) => `<button class="${i === video.pick ? 'on' : ''}" data-cut="${i}" aria-label="${esc(c.idea || '')}"><b>v${c.name.match(/-v(\d+)\.mp4$/)[1]}</b> ${esc(VIDEO_STYLES.find(([k]) => k === c.style)?.[1] || '')}${c.idea ? ` · ${esc(c.idea.length > 28 ? `${c.idea.slice(0, 28)}…` : c.idea)}` : ''}${c.seconds ? ` <small>${Math.round(c.seconds)}s</small>` : ''}</button>`).join('')}</div>` : ''
  const body = video.src && !video.busy
    ? `${cuts}<video src="${esc(src)}" controls playsinline></video><div class="vfoot"><span>Saved to ${esc(String(file || 'video/promo.mp4').replace(/^\/(Users|home)\/[^/]+/, '~'))}</span><span class="vacts"><a class="vdl" href="${esc(src)}" download="${esc(cut?.name || 'promo.mp4')}">Download</a><button class="vreveal">Show in Finder</button><button class="vbig">⛶ Big screen</button></span></div>${opts}<div class="vfoot"><span></span><button class="vagain">Make a new cut</button></div>`
    : video.busy
      ? `${liveOn ? `<div class="vlive"><iframe sandbox="allow-scripts" src="/video/${encodeURIComponent(video.run)}/live/index.html?v=${video.liveAt}" aria-label="The video, playing while it renders" scrolling="no"></iframe><span class="vlive-tag">● live: the agents' cut, rendering</span></div>` : ''}<div class="vbar"><i style="width:${Math.max(3, video.pct)}%"></i></div><div class="vstage">${esc(stage)}${video.pct ? ` ${video.pct | 0}%` : ''}</div>`
      : video.message
        ? `<div class="vstage err">${esc(video.message)}</div><div class="vfoot"><span></span><button class="vagain">Try again</button></div>`
        : `${opts}<div class="vfoot"><span></span><button class="vagain">Make the film</button></div>`
  // minimized: only the title and the progress, so the canvas and the crew stay in view
  el.classList.toggle('min', !!video.min && !document.body.classList.contains('view-video'))
  el.innerHTML = `<div class="vhead pop-title"><span>The promo <em>video</em></span><span class="vhead-acts"><button class="vmin" aria-label="${video.min ? 'Expand' : 'Minimize'}" aria-expanded="${!video.min}">${ico(video.min ? 'up' : 'minus')}</button><button class="vclose" aria-label="Close">${ico('x')}</button></span></div>${head}${story ? `<div class="vstory">${story}</div>` : ''}${body}`
  el.querySelector('.vclose').onclick = () => toggleVideo(false)
  el.querySelector('.vmin').onclick = e => { e.stopPropagation(); video.min = !video.min; renderVideo() }
  const again = el.querySelector('.vagain')
  if (again) again.onclick = () => makeVideo()
  const vid = el.querySelector('video')
  // a new cut plays once, out loud, only in the window that asked for it (other
  // open windows of Swarm Studio would play the same sound over it)
  if (vid && (video.mine || document.hasFocus()) && video.played !== src) { video.played = src; vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}) }) }
  el.querySelector('.vbig')?.addEventListener('click', () => bigScreen(true))
  fitLive()
  for (const b of el.querySelectorAll('[data-cut]')) b.onclick = () => { video.pick = Number(b.dataset.cut); renderVideo() }
  el.querySelector('.vreveal')?.addEventListener('click', () => api(`/api/runs/${encodeURIComponent(video.run || viewing || S.run)}/reveal?what=video`, { method: 'POST' }))
  el.querySelector('.vstyle')?.addEventListener('change', e => { videoOpts.style = e.target.value; store.set('videoStyle', videoOpts.style) })
  el.querySelector('.vprompt')?.addEventListener('input', e => { videoOpts.idea = e.target.value })
  el.querySelector('.vnotes-btn')?.addEventListener('click', () => { video.notesOpen = !video.notesOpen; renderVideo() })
  const refFile = el.querySelector('.vreffile')
  el.querySelector('.vaddref')?.addEventListener('click', () => refFile?.click())
  refFile?.addEventListener('change', async () => {
    const f = refFile.files?.[0]
    if (!f || !video.run) return
    const r = await api(`/api/runs/${encodeURIComponent(video.run)}/video/ref?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }).then(x => x.json()).catch(() => null)
    if (r?.name) { videoOpts.refs.push({ name: r.name }); renderVideo() }
  })
  for (const b of el.querySelectorAll('[data-unref]')) b.onclick = () => { videoOpts.refs.splice(Number(b.dataset.unref), 1); renderVideo() }
  el.querySelector('.vvoice')?.addEventListener('change', e => { videoOpts.voice = e.target.value; store.set('videoVoice', videoOpts.voice) })
  el.querySelector('.vmusic')?.addEventListener('change', e => { videoOpts.music = e.target.checked; store.set('videoMusic', videoOpts.music) })
  el.querySelector('.vclips')?.addEventListener('change', e => { videoOpts.clips = e.target.checked; store.set('videoClips', videoOpts.clips) })
  mediaWire(el)
  if (!media.all && !media.loading) loadMedia()
}

// ---------- the film's outside services: music (ElevenLabs), clips (Veo…), pictures.
// Hermes's own secrets, connectors and providers are used as they are; otherwise a key
// pasted here switches one on; with nothing, the studio's own score and camera moves.
export const media = { all: null, v: 0, open: '', loading: false }
export const MEDIA_VIA = { hermes: 'Hermes', 'hermes-mcp': 'Hermes connector', key: 'Your key', 'built-in': 'Built in' }
export async function loadMedia() {
  media.loading = true
  media.all = await api('/api/media').then(r => (r.ok ? r.json() : null)).catch(() => null)
  media.loading = false
  media.v++
  renderVideo()
}
export function mediaRow() {
  const all = media.all
  if (!all) return ''
  const chips = ['music', 'clips', 'pictures'].map(k => all[k] && `<button class="vsrc-b${all[k].on ? ' on' : ''}" data-src="${k}" aria-expanded="${media.open === k}"><b>${esc(all[k].label)}</b><span>${esc(all[k].by)}</span></button>`).filter(Boolean).join('')
  const m = all[media.open]
  let pop = ''
  if (m) {
    const forget = m.pasted ? `<button class="vsrc-forget" data-key="${esc(m.key)}">Forget key</button>` : ''
    pop = m.on && m.via !== 'key'
      ? `<div class="vsrc-pop"><span>${MEDIA_VIA[m.via] || ''}</span>${forget}</div>`
      : `<div class="vsrc-pop">${m.on ? `<span>${MEDIA_VIA.key}</span>${forget}` : !m.key ? `<span>${esc(m.hint || '')}</span>` : `${m.grant && m.allow ? allowBox(m.allow, `To use Hermes's ${m.keyLabel}, run this once:`) : ''}<form class="vsrc-form" data-key="${esc(m.key)}"><input type="password" autocomplete="off" spellcheck="false" aria-label="${esc(m.keyLabel)} key" placeholder="${esc(m.keyLabel)} key"><button>Connect</button></form><a href="${esc(m.keyUrl)}" target="_blank" rel="noopener">Get a key</a>`}<div class="perr"></div></div>`
  }
  return `<div class="vsrc">${chips}</div>${pop}`
}
export function mediaWire(el) {
  for (const b of el.querySelectorAll('[data-src]')) b.onclick = () => { media.open = media.open === b.dataset.src ? '' : b.dataset.src; renderVideo() }
  const post = async (path, body, errEl) => {
    const res = await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const out = await res?.json().catch(() => ({}))
    if (res?.ok) { media.all = out; media.v++; renderVideo(); return }
    if (errEl) errEl.textContent = shortReason(out?.error)
  }
  for (const f of el.querySelectorAll('.vsrc-form')) f.onsubmit = ev => {
    ev.preventDefault()
    const input = f.querySelector('input'), key = input.value.trim()
    if (!key) return
    input.value = ''
    f.querySelector('button').textContent = 'Checking…'
    post('/api/media/key', { service: f.dataset.key, key }, f.parentElement.querySelector('.perr')).then(() => { f.querySelector('button').textContent = 'Connect' })
  }
  for (const b of el.querySelectorAll('.vsrc-forget')) b.onclick = () => post('/api/media/key', { service: b.dataset.key, key: null })
  allowWire(el, loadMedia)
}
// Which MCP servers Swarm Studio may call is the person's grant in Hermes (Nous catalog review, point 5):
// the canvas shows the one command to run, and never runs it.
export const allowBox = (cmd, why) => `<div class="mcp-allow"><span>${esc(why)}</span><code>${esc(cmd)}</code><button class="mcp-copy" data-cmd="${esc(cmd)}">Copy</button><button class="mcp-again">Check again</button></div>`
export function allowWire(el, again) {
  for (const b of el.querySelectorAll('.mcp-copy')) b.onclick = () => navigator.clipboard?.writeText(b.dataset.cmd).then(() => { b.textContent = 'Copied' }, () => {})
  for (const b of el.querySelectorAll('.mcp-again')) b.onclick = () => again()
}

// A render the canvas thinks is running but the server no longer has (it
// restarted, or the job died): ask now and then, and stop waiting if so.
setInterval(async () => {
  if (!video.busy || !video.run || Date.now() - (video.heard || 0) < 20000) return
  video.heard = Date.now()
  const job = await api(`/api/runs/${encodeURIComponent(video.run)}/video`).then(r => r.json()).catch(() => null)
  if (!job || job.state === 'working') return
  Object.assign(video, { busy: false, stage: 'failed', message: 'The video stopped before it finished (Swarm Studio restarted). Make it again.' })
  if (video.el) renderVideo()
}, 5000)

// The voiceover: Kokoro, on this machine, in one of its voices; or none.
export const VOICE_OPTS = [['', 'Kokoro · fits the theme'], ['af_heart', 'Kokoro · Heart'], ['af_bella', 'Kokoro · Bella'], ['am_michael', 'Kokoro · Michael'], ['bf_emma', 'Kokoro · Emma (UK)'], ['bm_george', 'Kokoro · George (UK)'], ['off', 'No voice']]
export const videoOpts = { voice: store.get('videoVoice') ?? '', music: store.get('videoMusic') ?? true, clips: store.get('videoClips') ?? true, style: store.get('videoStyle') || '', idea: '', refs: [] }
// video plans and cuts (the server has the same lists, in engine/video.mjs)
export const VIDEO_STYLES = [['', 'The prompt'], ['trailer', 'Movie trailer'], ['promo', 'Promo'], ['kinetic', 'Kinetic type'], ['slideshow', 'Slideshow'], ['teaser', 'Teaser'], ['story', 'Customer story'], ['calm', 'Calm film']]

// The video filling the whole pane (and the screen, where the app allows it).
export function bigScreen(on) {
  document.querySelector('.video-big')?.remove()
  if (!on || !video.src) return
  const wrap = document.createElement('div')
  wrap.className = 'video-big'
  wrap.innerHTML = `<video src="${esc(video.src)}" controls autoplay playsinline></video><button class="vbclose" aria-label="Back to the canvas (Esc)">×</button>`
  document.body.append(wrap)
  const v = wrap.querySelector('video')
  const small = video.el?.querySelector('video')
  if (small) { v.currentTime = small.currentTime; small.pause() }
  v.play().catch(() => { v.muted = true; v.play().catch(() => {}) })
  wrap.querySelector('.vbclose').onclick = () => bigScreen(false)
  wrap.requestFullscreen?.().catch(() => {}) // the pane may not allow it; filling the pane is the fallback
  const esc_ = e => { if (e.key === 'Escape' && !document.fullscreenElement) { bigScreen(false); removeEventListener('keydown', esc_) } }
  addEventListener('keydown', esc_)
}

export async function makeVideo({ idea = null, style = null } = {}) {
  const run = shownRun()
  if (!run || video.busy) return
  video.mine = true
  toggleVideo(true)
  const res = await api(`/api/runs/${encodeURIComponent(run)}/video`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice: videoOpts.voice || undefined, music: videoOpts.music, template: style || videoOpts.style || undefined, prompt: idea || videoOpts.idea || undefined, refs: videoOpts.refs, clips: videoOpts.clips, film: 'auto' }) })
  if (!res.ok) {
    const out = await res.json().catch(() => ({}))
    Object.assign(video, { run, message: out.error || `HTTP ${res.status}`, busy: false })
    renderVideo()
  }
}

export async function toggleVideo(open = !video.el) {
  if (!open) { video.el?.remove(); video.el = null; return }
  if (!video.el) {
    video.el = document.createElement('div')
    video.el.className = 'video-pop'
    document.body.append(video.el)
  }
  const run = shownRun()
  if (run && video.run !== run) {
    // a file opened from disk: ask whether it already has a video
    const st = await api(`/api/runs/${encodeURIComponent(run)}/video`).then(r => r.json()).catch(() => ({}))
    Object.assign(video, { run, busy: st.state === 'working', pct: st.pct || 0, stage: st.stage || '', story: [], src: st.src || '', file: st.file || '', message: st.state === 'failed' ? st.message : '' })
  }
  renderVideo()
}

els.videoBtn.onclick = () => (video.el ? toggleVideo(false) : video.src || video.busy ? toggleVideo(true) : makeVideo())
commandOps.video = c => makeVideo({ idea: c.idea, style: c.style })
