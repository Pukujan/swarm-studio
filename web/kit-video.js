// @ts-check
// The Video kit (docs/specs/40-video-kit.md, against spec 37's kit contract): a film planned on the
// shared board from the project's brand, References and Assets, with no website needed.
//   Script        the film as beats, one line each
//   Storyboard    one small frame per beat: a Reference or Asset, a picture to paint, or a title card
//   Music         a dropped track, or a mood in words
//   Voice         who speaks, the tone, a sample line; or none
//   Look          the project's brand (read, never set here)
//   Length/shape  about how many seconds; tall, wide or square
// prepare(ctx) loads the project's draft (projects/<pid>/kit-video.json), else starts it from the build's
// story (spec 39); every change is saved there a moment later and ctx.refresh() draws the board again.
// lock() writes the fields engine/filmkit.mjs checkKit reads; build() hands them to POST /api/projects/:pid/film.
// The modules are joined into one script (server/page.mjs): only `videoKit` is at the top level, every
// helper stays inside its closure, and its styles are its own (kv-).
import { ic } from './icons.js'

export const videoKit = (() => {
  const SHAPES = [{ id: 'tall', name: 'Tall' }, { id: 'wide', name: 'Wide' }, { id: 'square', name: 'Square' }]
  const MOODS = ['Bright', 'Warm', 'Driving', 'Calm', 'Playful', 'Epic']
  const PIC = /\.(png|jpe?g|webp|gif)$/i, CLIP = /\.(mp4|webm|mov)$/i, SOUND = /\.(mp3|wav|m4a|ogg|aac)$/i
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)) : null }
  const blank = () => ({ beats: [], music: { file: null, mood: '' }, voice: null, seconds: 20, shape: 'wide', start: 'storyboard' })

  // the project's id: ctx.project is the id (an object with an id is read too)
  const pidOf = ctx => (typeof ctx.project === 'string' ? ctx.project : ctx.project?.id) || ''
  // the working draft, one per project, kept here and saved to the project
  const drafts = new Map()
  const fill = d => {
    if (!Array.isArray(d.beats)) d.beats = []
    d.beats = d.beats.map(b => ({ text: clip(b?.text, 90), say: clip(b?.say, 140), frame: b?.frame || null, seconds: b?.seconds ?? null }))
    if (!d.music || typeof d.music !== 'object') d.music = { file: null, mood: '' }
    for (const [k, v] of Object.entries(blank())) if (d[k] === undefined) d[k] = v
    return d
  }
  const draftOf = ctx => drafts.get(pidOf(ctx) || 'draft') || drafts.set(pidOf(ctx) || 'draft', blank()).get(pidOf(ctx) || 'draft')
  const api = async (ctx, path, body, method = 'POST') => {
    const r = await ctx.sw.api(path, body === undefined ? {} : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  }
  const saving = new Map()
  const save = ctx => {
    const pid = pidOf(ctx)
    if (!pid || !ctx.sw?.api) return
    clearTimeout(saving.get(pid))
    saving.set(pid, setTimeout(() => api(ctx, `/api/kit/video/${encodeURIComponent(pid)}`, { kit: draftOf(ctx) }, 'PUT').catch(err => ctx.board?.toast?.(err.message)), 400))
  }
  const style = () => {
    if (typeof document === 'undefined' || document.getElementById('kv-style')) return
    const st = document.createElement('style')
    st.id = 'kv-style'
    st.textContent = `
.ab.kv-frame { width: 210px; height: 118px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 12px; background: var(--surface-2); }
.ab.kv-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ab.kv-frame > b { font: 600 15px/1.2 var(--display); color: var(--text); text-align: center; }
.ab.kv-frame em { position: absolute; left: 8px; bottom: 6px; font: 11px var(--mono); font-style: normal; color: var(--muted); background: var(--bg); padding: 1px 6px; border-radius: 6px; }
.kv-beats { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; counter-reset: kv; }
.kv-beats li { display: flex; align-items: center; gap: 6px; }
.kv-beats li::before { counter-increment: kv; content: counter(kv); font: 11px var(--mono); color: var(--muted); width: 16px; }
.kv-beats input { flex: 1; min-width: 0; }
.kv-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.kv-chips .on { background: var(--accent); color: var(--accent-ink); }
.kv-sw { display: flex; gap: 6px; }
.kv-sw i { width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--line); }`
    document.head.append(st)
  }
  // References ("like this") and Assets ("use as given") as one list; a thumbnail needs a src
  const itemsOf = ctx => {
    const pid = pidOf(ctx)
    const one = (x, given) => x && !x.removed && x.id && { id: x.id, name: x.name || x.file || '', kind: x.kind || (PIC.test(x.file || '') ? 'image' : CLIP.test(x.file || '') ? 'video' : SOUND.test(x.file || '') ? 'audio' : 'file'), src: x.src || (x.file && !given ? `/ref/${encodeURIComponent(pid)}/${encodeURIComponent(x.file)}` : null), given }
    return [...(ctx.refs || []).map(x => one(x, false)), ...(ctx.assets || []).map(x => one(x, true))].filter(Boolean)
  }
  const base = ctx => ctx.sw?.base || ''
  const thumb = (ctx, item) => item?.src && item.kind === 'image' ? `<img src="${escape(base(ctx) + item.src)}" alt="" draggable="false" loading="lazy">` : item?.kind === 'video' ? ic('film', 28) : ''
  const brandName = ctx => clip(ctx.brand?.story?.name || ctx.project?.name || ctx.studio?.name || '', 60)
  const palette = ctx => (ctx.brand?.palettes || []).find(p => p.id === ctx.brand?.pick?.palette) || null

  // the frame a beat shows, in words for its card
  const frameName = (ctx, f) => !f ? 'Title card' : f.paint ? 'Paint' : f.item ? (itemsOf(ctx).find(x => x.id === f.item)?.name || 'Missing') : 'Title card'

  // ---------- the cards: render draws the artboard, inspect fills the inspector
  const head = name => `<h3><span>${escape(name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>`
  const changed = ctx => { save(ctx); ctx.refresh ? ctx.refresh() : ctx.board?.render?.() }

  const script = {
    key: 'video:script', name: 'Script',
    render(el, ctx) {
      const d = draftOf(ctx)
      el.innerHTML = `<b>Script</b><span aria-label="Beats">${d.beats.length} beats</span>`
    },
    inspect(el, ctx) {
      const d = draftOf(ctx)
      el.innerHTML = `${head('Script')}<ol class="kv-beats" aria-label="Beats">${d.beats.map((b, i) => `<li><input data-beat="${i}" value="${escape(b.text)}" maxlength="90" aria-label="Beat ${i + 1}"><button class="ib sm" data-del="${i}" aria-label="Remove beat ${i + 1}">${ic('x', 14)}</button></li>`).join('')}</ol>
        <button class="btn ghost" data-add ${d.beats.length >= 16 ? 'disabled' : ''}>${ic('plus', 15)}Add</button>`
      el.oninput = e => { const i = e.target.dataset.beat; if (i != null && d.beats[i]) d.beats[i].text = clip(e.target.value, 90) }
      el.onchange = () => changed(ctx)
      el.onclick = e => {
        const del = e.target.closest('[data-del]'), add = e.target.closest('[data-add]')
        if (del) d.beats.splice(Number(del.dataset.del), 1)
        else if (add && d.beats.length < 16) d.beats.push({ text: '', frame: null, seconds: null })
        else return
        script.inspect(el, ctx)
        changed(ctx)
      }
    }
  }

  const frameCard = i => {
    const card = {
      key: `video:frame:${i}`, name: `Beat ${i + 1}`,
      render(el, ctx) {
        const b = draftOf(ctx).beats[i] || {}
        const item = b.frame?.item && itemsOf(ctx).find(x => x.id === b.frame.item)
        el.classList.add('kv-frame')
        el.innerHTML = `${item ? thumb(ctx, item) : `<b>${escape(b.text || `Beat ${i + 1}`)}</b>`}<em>${escape(frameName(ctx, b.frame))}</em>`
      },
      inspect(el, ctx) {
        const b = draftOf(ctx).beats[i]
        if (!b) { el.innerHTML = ''; return }
        const pics = itemsOf(ctx).filter(x => x.kind === 'image' || x.kind === 'video')
        const on = b.frame?.item || (b.frame?.paint != null ? 'paint' : '')
        el.innerHTML = `${head(`Beat ${i + 1}`)}
          <label class="pl-f"><span>Frame</span><select data-frame>
            <option value="" ${on ? '' : 'selected'}>Title card</option>
            <option value="paint" ${on === 'paint' ? 'selected' : ''}>Paint</option>
            ${pics.map(x => `<option value="${escape(x.id)}" ${on === x.id ? 'selected' : ''}>${escape(x.name)}</option>`).join('')}
          </select></label>
          ${on === 'paint' ? `<label class="pl-f"><span>Picture</span><input data-paint value="${escape(b.frame.paint)}" maxlength="300"></label>` : ''}
          <label class="pl-f"><span>Seconds</span><input data-sec type="number" min="0.6" max="9" step="0.1" value="${b.seconds ?? ''}"></label>`
        el.onchange = e => {
          if (e.target.matches('[data-frame]')) {
            const v = e.target.value
            b.frame = !v ? null : v === 'paint' ? { paint: clip(b.text, 300) } : { item: v }
            card.inspect(el, ctx)
          } else if (e.target.matches('[data-paint]')) b.frame = { paint: clip(e.target.value, 300) }
          else if (e.target.matches('[data-sec]')) b.seconds = num(e.target.value, 0.6, 9)
          changed(ctx)
        }
      }
    }
    return card
  }

  const music = {
    key: 'video:music', name: 'Music',
    render(el, ctx) {
      const m = draftOf(ctx).music
      const track = m.file && itemsOf(ctx).find(x => x.id === m.file)
      el.innerHTML = `<b>Music</b><span>${escape(track ? track.name : m.mood || 'None')}</span>`
    },
    inspect(el, ctx) {
      const m = draftOf(ctx).music
      const tracks = itemsOf(ctx).filter(x => x.kind === 'audio')
      el.innerHTML = `${head('Music')}
        <label class="pl-f"><span>Track</span><select data-track>
          <option value="" ${m.file ? '' : 'selected'}>None</option>
          ${tracks.map(x => `<option value="${escape(x.id)}" ${m.file === x.id ? 'selected' : ''}>${escape(x.name)}</option>`).join('')}
        </select></label>
        <div class="kv-chips" role="group" aria-label="Mood">${MOODS.map(w => `<button class="btn ghost sm${m.mood === w ? ' on' : ''}" data-mood="${w}" aria-pressed="${m.mood === w}">${w}</button>`).join('')}</div>`
      el.onchange = e => { if (e.target.matches('[data-track]')) { m.file = e.target.value || null; changed(ctx) } }
      el.onclick = e => {
        const b = e.target.closest('[data-mood]')
        if (!b) return
        m.mood = m.mood === b.dataset.mood ? '' : b.dataset.mood
        music.inspect(el, ctx)
        changed(ctx)
      }
    }
  }

  const voice = {
    key: 'video:voice', name: 'Voice',
    render(el, ctx) {
      const v = draftOf(ctx).voice
      el.innerHTML = `<b>Voice</b><span>${escape(v ? v.who || 'On' : 'None')}</span>`
    },
    inspect(el, ctx) {
      const d = draftOf(ctx), v = d.voice
      el.innerHTML = `${head('Voice')}
        <label class="pl-sw"><input type="checkbox" data-on ${v ? 'checked' : ''}><span>Voice</span></label>
        ${v ? ['who', 'tone', 'sample'].map(k => `<label class="pl-f"><span>${{ who: 'Who', tone: 'Tone', sample: 'Sample line' }[k]}</span><input data-v="${k}" value="${escape(v[k])}" maxlength="${k === 'sample' ? 140 : 60}"></label>`).join('') : ''}`
      el.oninput = e => { const k = e.target.dataset.v; if (k && d.voice) d.voice[k] = clip(e.target.value, k === 'sample' ? 140 : 60) }
      el.onchange = e => {
        if (e.target.matches('[data-on]')) { d.voice = e.target.checked ? { who: '', tone: '', sample: '' } : null; voice.inspect(el, ctx) }
        changed(ctx)
      }
    }
  }

  // the look is the project's brand: shown, never set here (the Brand step sets it)
  const look = {
    key: 'video:look', name: 'Look',
    render(el, ctx) {
      const p = palette(ctx)
      el.innerHTML = `<b>Look</b>${p ? `<span class="kv-sw" aria-label="${escape(p.name || 'Palette')}">${[p.bg, p.text, p.accent, p.link].filter(Boolean).map(c => `<i style="background:${escape(c)}"></i>`).join('')}</span>` : '<span>Brand</span>'}`
    },
    inspect(el, ctx) {
      const p = palette(ctx)
      el.innerHTML = `${head('Look')}<p>${escape(p?.name || brandName(ctx) || 'Brand')}</p>`
    }
  }

  const size = {
    key: 'video:size', name: 'Length and shape',
    render(el, ctx) {
      const d = draftOf(ctx)
      el.innerHTML = `<b>Length and shape</b><span>${d.seconds || '—'} s · ${escape(SHAPES.find(s => s.id === d.shape)?.name || 'Wide')}</span>`
    },
    inspect(el, ctx) {
      const d = draftOf(ctx)
      el.innerHTML = `${head('Length and shape')}
        <label class="pl-f"><span>Seconds</span><input data-len type="range" min="6" max="90" step="1" value="${d.seconds || 20}" aria-valuetext="${d.seconds || 20} seconds"><output>${d.seconds || 20}</output></label>
        <div class="kv-chips" role="radiogroup" aria-label="Shape">${SHAPES.map(s => `<button class="btn ghost sm${d.shape === s.id ? ' on' : ''}" role="radio" aria-checked="${d.shape === s.id}" data-shape="${s.id}">${s.name}</button>`).join('')}</div>`
      el.oninput = e => { if (e.target.matches('[data-len]')) { d.seconds = num(e.target.value, 6, 90); e.target.nextElementSibling.textContent = d.seconds } }
      el.onchange = () => changed(ctx)
      el.onclick = e => {
        const b = e.target.closest('[data-shape]')
        if (!b) return
        d.shape = b.dataset.shape
        size.inspect(el, ctx)
        changed(ctx)
      }
    }
  }

  // what lock and build hand on: the shape engine/filmkit.mjs checkKit reads (the server checks it again)
  const plain = ctx => {
    const d = draftOf(ctx)
    const ids = new Set(itemsOf(ctx).map(x => x.id))
    const frame = f => !f ? null : f.item ? (ids.has(f.item) ? { item: f.item } : null) : f.paint ? { paint: clip(f.paint, 300) } : null
    return {
      beats: d.beats.map(b => ({ text: clip(b.text, 90), say: clip(b.say, 140), frame: frame(b.frame), seconds: num(b.seconds, 0.6, 9) })).filter(b => b.text).slice(0, 16),
      music: { file: d.music.file && ids.has(d.music.file) ? d.music.file : null, mood: clip(d.music.mood, 80) },
      voice: d.voice ? { who: clip(d.voice.who, 60), tone: clip(d.voice.tone, 60), sample: clip(d.voice.sample, 140) } : null,
      seconds: num(d.seconds, 6, 90),
      shape: SHAPES.some(s => s.id === d.shape) ? d.shape : 'wide',
      start: ['opening', 'storyboard', 'music'].includes(d.start) ? d.start : 'storyboard'
    }
  }

  return {
    kind: 'video',
    name: 'Video',
    icon: 'film',
    steps: ['brand', 'references', 'assets', 'plan'],
    starts: [{ id: 'opening', name: 'Opening shot' }, { id: 'storyboard', name: 'Storyboard' }, { id: 'music', name: 'Music' }],
    reads: ['palette', 'type', 'voice', 'pictures'],
    // the draft as it stands for this project: saved, else the build's story beats, else empty
    async prepare(ctx) {
      style()
      const pid = pidOf(ctx) || 'draft'
      if (drafts.has(pid)) return drafts.get(pid)
      let d = null
      if (pidOf(ctx) && ctx.sw?.api) d = (await api(ctx, `/api/kit/video/${encodeURIComponent(pid)}`).catch(() => null))?.kit || null
      if (!d) {
        d = blank()
        // the build's story (spec 39): as passed, else the newest build's runs/<id>/story.json
        let told = ctx.story?.beats || ctx.studio?.beats || []
        const head = typeof ctx.project === 'object' ? ctx.project?.head : null
        if (!told.length && head && ctx.sw?.api) told = (await api(ctx, `/api/runs/${encodeURIComponent(head)}/story`).catch(() => null))?.story?.beats || []
        d.beats = told.map(b => ({ text: clip(b.headline ?? b.text, 90), say: clip(b.say, 140), frame: null, seconds: num(b.seconds, 0.6, 9) })).filter(b => b.text).slice(0, 16)
      }
      drafts.set(pid, fill(d))
      return d
    },
    plan: {
      sections: ctx => {
        // not loaded yet: load it, then the board is drawn again
        if (!drafts.has(pidOf(ctx) || 'draft')) { videoKit.prepare(ctx).then(() => ctx.refresh?.()).catch(err => ctx.board?.toast?.(err.message)); return [] }
        const d = draftOf(ctx)
        return [
          { sec: 'Script', cards: [script] },
          { sec: 'Storyboard', cards: d.beats.map((_, i) => frameCard(i)) },
          { sec: 'Sound', cards: [music, voice] },
          { sec: 'Look', cards: [look, size] }
        ]
      },
      questions: ctx => {
        const d = draftOf(ctx)
        return [
          { id: 'start', q: 'Where to start?', options: [{ id: 'opening', name: 'Opening shot' }, { id: 'storyboard', name: 'Storyboard' }, { id: 'music', name: 'Music' }], free: false, pick: id => { d.start = id; save(ctx) } },
          { id: 'shape', q: 'Which shape?', options: SHAPES.map(s => ({ id: s.id, name: s.name })), free: false, pick: id => { d.shape = id; save(ctx) } },
          { id: 'script', q: 'What happens, beat by beat?', options: [], free: true, pick: text => { d.beats = String(text || '').split(/\n+/).map(t => clip(t.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''), 90)).filter(Boolean).slice(0, 16).map(t => ({ text: t, frame: null, seconds: null })); save(ctx) } }
        ]
      },
      done: ctx => plain(ctx).beats.length >= 2
    },
    // what Build makes: the film's cuts; a frame to paint costs a picture, the rest is free
    proposal: ctx => {
      const k = plain(ctx)
      const paint = k.beats.filter(b => b.frame?.paint).length
      return {
        items: [
          ...(paint ? [{ what: `${paint} frames painted`, order: 1 }] : []),
          { what: k.music.file ? 'Cut to your track' : 'Music scored', order: 2 },
          { what: `${SHAPES.find(s => s.id === k.shape).name} film, about ${k.seconds || 20} s`, order: 3 }
        ],
        minutes: Math.max(2, Math.ceil((k.seconds || 20) / 6)),
        credits: paint
      }
    },
    lock: ctx => plain(ctx),
    // the person's Build press only: the film job cuts it like any film and the critic checks it after
    build: async (spec, ctx) => {
      const pid = pidOf(ctx)
      if (!pid) throw new Error('Make the project first')
      const kit = spec?.kits?.video || plain(ctx)
      const j = await api(ctx, `/api/projects/${encodeURIComponent(pid)}/film`, { kit, shapes: [kit.shape || 'wide'] })
      return { run: j.run }
    },
    // the critic's findings (video/review.json) on the locked length and script, as the reviewer's parts
    check: (spec, run) => (run?.review?.checks || []).filter(c => c.id === 'length' || c.id === 'script').map(c => ({ part: c.id === 'length' ? 'Length' : 'Script', ok: !!c.ok, note: c.says || '' }))
  }
})()
