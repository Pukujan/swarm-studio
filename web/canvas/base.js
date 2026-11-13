// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the build on the canvas (fresh, setTitle, navBrand), the frame sandbox, and media dragged into the chat.
import { layerLink } from '../layerlink.js'
import { els, api, BASE, S, cam, setS, history } from './core.js'
import { talk } from './talk.js'
import { shownRun } from './film.js'
import { feed, botMsg } from './panels.js'
import { slotFor, toScreen, banter } from './deck.js'
import { shutPlayer } from './player.js'
import { renderUndo } from './design.js'

// Every frame that shows model-written HTML is sandboxed with allow-scripts and no allow-same-origin (Nous catalog review,
// point 4): its origin is opaque, so it cannot read the studio, its token or its storage.
// The canvas and the frames talk only by postMessage (frame.html).
export const FRAME_SANDBOX = 'allow-scripts'
// layers dragged into the left chat: chips, and lines from each chip to its layer (web/layerlink.js)
export const links = layerLink({ form: els.form, feed: els.feed, rect: layerRect, open: () => window.swarmCosmos?.chat(true), files: list => chatFiles(list) })
// Media in the chat (spec 29, server/chatmedia.mjs): in a talk, a picture goes to the chat and the vision
// model reads it now; in a project, it joins the project's References. Either way it is a chip until sent.
async function chatFiles(list) {
  const talking = talk.on && talk.kind !== 'game'
  const pid = !talk.on && shownRun() ? window.swarmCosmos?.projectView?.pid : null
  if (!talking && !pid) return feed(null, talk.on ? 'Pictures in a game talk come later.' : 'Open a project or start a talk first.', 'err')
  for (const f of list.slice(0, 6)) {
    const name = encodeURIComponent(f.name || 'picture.png')
    const wait = talking && /^image\//.test(f.type) ? botMsg('Looking at it…', true) : null
    const path = talking ? `/api/chats/${talk.chat || 'new'}/media?name=${name}&kind=${talk.kind}${talk.from ? `&from=${encodeURIComponent(talk.from)}` : ''}` : `/api/projects/${encodeURIComponent(pid)}/refs?name=${name}&source=chat`
    const res = await api(path, { method: 'POST', body: f }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    wait?.remove()
    if (!res?.ok || !j.ref) { feed(null, j.error || `${f.name} did not come through.`, 'err'); continue }
    if (talking && j.chat) talk.chat = j.chat
    links.add({ kind: 'ref', key: j.ref.id, name: j.ref.name, thumb: j.ref.kind === 'image' ? `${BASE}${j.ref.src}` : null, data: { kind: j.ref.kind, src: j.ref.src, read: j.ref.read || null } })
  }
}
// a project message's attached references, named for the crew (the brief lists the store with its links)
export const refLines = (text, media) => media.length ? `${text}\n${media.map(m => `Use the reference ${m.data?.kind === 'image' ? 'picture' : 'file'} "${m.name}" (${m.data?.src || ''}).`).join('\n')}` : text
// where a layer is on screen: the Overview's artboard or the Studio scaffold's card when one shows, else
// the Design deck's frame
function layerRect(key) {
  const o = window.swarm?.overviewRect?.(key)
  if (o !== false && o !== undefined) return o
  const st = window.swarm?.studioRect?.(key)
  if (st !== false && st !== undefined) return st
  const l = S.layers.get(key), s = l && slotFor(l)
  if (!s || !els.viewport.offsetParent) return null
  const v = els.viewport.getBoundingClientRect(), p = toScreen(s.f.x + s.box.left, s.box.top)
  return { left: v.left + p.x, top: v.top + p.y, width: s.box.width * cam.s, height: s.box.height * cam.s }
}

export function fresh(run = null) {
  // the player plays one build: another build on the canvas closes it (it never carries over)
  // (the canvas only: the machine's player stays as it is, and a reload's player opens once its build is here)
  if (S && run !== S.run && !els.player.hidden) shutPlayer()
  setS({ run, title: '', t0: 0, tEnd: 0, agents: new Map(), frames: [], layers: new Map(), order: [], wires: new Map(), plans: new Map(), planDirty: true, treeDirty: true, done: 0, planned: 0, theme: null, closed: new Set(), cheerUntil: 0, edits: new Set(), classEdits: [], sel: null, images: new Map(), imgQueued: 0, imgSettled: 0, seo: new Map() })
  banter.queue = []
  history.undo = []; history.redo = []; renderUndo()
  els.world.innerHTML = '<div class="ghosts" id="ghosts"></div>'
  els.cursors.innerHTML = ''
  els.wires.innerHTML = ''
  els.feed.innerHTML = '<div class="empty-chat">Describe a product below. A planner picks the pages, then a swarm of agents builds them on the canvas.</div>'
  els.log.innerHTML = ''
  S.progress = null
  els.theme.innerHTML = ''
  els.plan.textContent = ''
  els.timer.textContent = '00.0s'
  els.planState.textContent = run ? 'planning' : 'idle'
  els.dock.hidden = true
  setTitle('')
}

// navbrand:start (the same lines as engine/naming.mjs; tests/naming.test.mjs runs both)
export function navBrand(html) {
  const s = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
  const a = s.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i)
  if (!a) return ''
  const label = (a[1].match(/aria-label="([^"]{2,60})"/i) || [])[1]?.replace(/\s+(home|homepage|logo)$/i, '').trim()
  const bits = (label ? [label] : []).concat(a[2].split(/<[^>]+>/).map(t => t.replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()))
  const ok = bits.filter(t => (t.match(/\p{L}/gu) || []).length >= 2 && t.length <= 40 && t.split(' ').length <= 4)
  // the wordmark comes first; a tagline after it ("loose-leaf tea, Portland") is not the name
  return (ok[0] || '').replace(/[\s—–|:·-]+$/, '')
}
// navbrand:end

export function setTitle(t) {
  S.title = t
  els.fileName.textContent = t || 'Untitled'
  document.title = t ? `${t} · Swarm Studio` : 'Swarm Studio'
}
