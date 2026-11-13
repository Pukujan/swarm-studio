// Projects: the studio's file browser (docs/ux/PATTERNS.md, "Projects is a file browser").
// A project is one idea and every run of it: re-runs and versions stack on one card. Folders,
// names, Trash and the grouping live in runs/folders.json (v2), next to the runs themselves, in
// $HERMES_HOME/swarm-studio. A run's own folder is never touched here except by Empty Trash or
// Delete forever, which the person asks for (and confirms) themself.
//
//   folders.json v2: { v: 2, folders: [name], projects: { <pid>: { runs: [id], name, title, folder, trashed, made, studio? } } }
//
// A Studio project (docs/specs/37-studio-first.md, `studio: kind`) is made before anything is built, so
// it is kept with no runs and listed with the status Studio; its first build joins it like any run.
//
// A project has one name (engine/naming.mjs): its brand, never a screen title. A new run joins
// a project it names (meta.project / meta.projectName, from the start request) or whose name its
// brief's brand matches, as a piece (site, app, game, film); a run of a kind the project already
// has is that piece's next version. See docs/specs/18-projects.md.
//
// The first run of a project gives it its id. Runs written before v2 are grouped once, by how
// alike their briefs and titles are, and their per-run folder (meta.json) becomes the project's.

import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brandOf, isScreenName, pieceKind, projectName, sameName } from '../engine/naming.mjs'

export const RUN_ID = /^[\w-]{1,64}$/
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// ---------- alike: the same idea asked again ("a tiny ramen bar in Osaka" and "… in Leeds")
const STOP = new Set(('the and for with from into about over under your our their its this that are was were who what where when how all any some new real very just also than then them they not can will would should could may might does did done make build site website page pages app called based like using use want need one two get has have had more most only own per via onto while plus every each '
  + 'sell selling online shop store small little tiny big').split(' '))
const words = s => new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !STOP.has(w)).map(w => (w.length > 4 ? w.replace(/(ies|es|s)$/, m => (m === 'ies' ? 'y' : '')) : w)))
// the name before the tagline: "Tidebreak — Escape the Drowned Lighthouse City" → "Tidebreak"
export const shortTitle = t => clip(String(t || '').split(/\s[—–|:-]\s|:\s/)[0], 60) || clip(t, 60)
const nameKey = t => shortTitle(t).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
export function alike(a, b) {
  if (!a || !b) return false
  const ka = nameKey(a.title), kb = nameKey(b.title)
  if (ka.length >= 4 && ka === kb) return true
  const A = words(a.brief), B = words(b.brief)
  if (!A.size || !B.size) return false
  let n = 0
  for (const w of A) if (B.has(w)) n++
  const lo = n / Math.min(A.size, B.size), hi = n / Math.max(A.size, B.size)
  return n >= 3 && (lo >= 0.8 || (lo >= 0.6 && hi >= 0.45))
}

// ---------- what a run makes, for the kind icons: site, app, game, film
export function kindsOf(card) {
  const k = []
  const game = card.kind === 'game' || card.game
  if (card.pages > 0) k.push('site')
  if (card.app && !game) k.push('app')
  if (game) k.push('game')
  if (card.video) k.push('film')
  return k
}

// what a build is and how far it got, in words, from its real events (never a guess):
// kind Website, App, Game or Video; status Draft, Building, Designed, App built, App failed or Live with its host
const hostOf = url => { try { return new URL(url).host } catch { return null } }
// how far a game build is, from its step lines: painting its art (n of N), then stage x of y
export function gameProgress(steps = []) {
  const t = steps.map(s => String(s?.text ?? s ?? ''))
  let from = -1
  for (let i = t.length - 1; i >= 0; i--) if (/^painting the game's art: \d+ pictures/.test(t[i])) { from = i; break }
  const stage = t.findLast(x => /^stage \d+ of \d+/.test(x))?.match(/^stage (\d+) of (\d+)/)
  const stageAt = t.findLastIndex(x => /^stage \d+ of \d+/.test(x))
  if (stage && stageAt > from) return { stage: [Number(stage[1]), Number(stage[2])] }
  if (from < 0) return null
  const total = Number(t[from].match(/(\d+) pictures/)[1])
  const after = t.slice(from + 1)
  const kept = Number(after.map(x => x.match(/^using (\d+) pictures painted before/)).find(Boolean)?.[1] || 0)
  const done = Math.min(total, kept + after.filter(x => /^painted the /.test(x)).length)
  return { art: [done, total] }
}
export function stateOf(card, cards = [card]) {
  const game = card.kind === 'game' || card.game
  const kind = game ? 'Game' : card.build || card.app ? 'App' : card.pages > 0 || card.planned > 0 ? 'Website' : card.video ? 'Video' : 'Website'
  const made = game ? 'Game' : 'App'
  // live once any version went out: its newest published address
  const out = [...cards].reverse().map(c => c.deployed || Object.values(c.sites || {})[0]).find(Boolean)
  // a build still writing steps in the last ten minutes is running, here or on another Studio server
  const busy = game && card.build === 'working' && Date.now() - (card.updated || 0) < 600000
  const g = game ? card.work?.progress || (busy ? card.gameAt : null) : null
  const status = out ? 'Live'
    : g?.art ? `Painting art · ${g.art[0]} of ${g.art[1]}`
    : g?.stage ? `Building · stage ${g.stage[0]} of ${g.stage[1]}`
    : card.live || card.work ? 'Building'
    // a game build that was stopped (or whose server went away) keeps app:start as its last word
    : busy ? 'Building'
    : game && (card.build === 'working' || card.build === 'stopped') ? 'Stopped'
    : card.build === 'failed' ? `${made} failed`
    : card.build === 'built' || (card.app && !card.build) ? `${made} built`
    : card.layers > 0 || card.video ? 'Designed'
    : 'Draft'
  return { kind, status, host: out ? hostOf(out) : null }
}

// removeDir: how a folder is deleted for good (a test hands in one that fails like a held file on Windows)
export function makeProjects({ runsDir, dataDir, runCard, runMeta, isLive, removeDir = path => rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }) {
  const file = () => join(runsDir, 'folders.json')
  const projectsDir = join(dataDir, 'projects')
  let cache = null // { mtime, data }

  function read() {
    let raw = {}
    try { raw = JSON.parse(readFileSync(file(), 'utf8')) } catch {}
    if (raw.v === 2 && raw.projects) return { v: 2, folders: raw.folders || [], projects: raw.projects }
    // v1 ({ folders }) or nothing: keep a copy of the old file once, then build v2 from the runs
    if (existsSync(file()) && !existsSync(join(runsDir, 'folders.v1.json'))) { try { copyFileSync(file(), join(runsDir, 'folders.v1.json')) } catch {} }
    return { v: 2, folders: Array.isArray(raw.folders) ? raw.folders : [], projects: {}, migrating: true }
  }
  function write(data) {
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true })
    const tmp = `${file()}.tmp`
    writeFileSync(tmp, JSON.stringify({ v: 2, folders: [...new Set(data.folders)], projects: data.projects }, null, 1))
    renameSync(tmp, file())
    cache = null
  }
  const runIds = () => (existsSync(runsDir) ? readdirSync(runsDir).filter(id => RUN_ID.test(id) && existsSync(join(runsDir, id, 'events.jsonl'))).sort() : [])

  // the project's one name: the one it was given, else from its first run
  function nameOfProject(p) {
    if (p.name) return p.name
    const first = p.runs.map(id => runCard(id)).find(Boolean)
    if (!first) return p.title || 'Swarm build'
    return projectName({ given: runMeta(first.id).projectName, brief: first.brief, title: first.autoTitle || first.title })
  }
  // a game is a build of its own (kind game); a site with a play page is still a site
  const pieceOfCard = card => pieceKind({ piece: runMeta(card.id).piece, kind: card.kind, brief: card.brief, pages: card.pages, video: card.video })
  // a project by its id or its name (not one in Trash)
  function findIn(data, ref) {
    const r = String(ref ?? '').trim()
    if (!r) return null
    if (data.projects[r] && !data.projects[r].trashed) return r
    const live = Object.entries(data.projects).filter(([, p]) => !p.trashed)
    return (live.find(([, p]) => !p.own && sameName(nameOfProject(p), r)) || live.find(([, p]) => sameName(nameOfProject(p), r)) || [])[0] || null
  }

  // every run belongs to exactly one project; new and old runs are placed here, oldest first
  function load() {
    const data = read()
    const ids = runIds()
    const owner = new Map()
    for (const [pid, p] of Object.entries(data.projects)) {
      p.runs = (p.runs || []).filter(id => ids.includes(id) && !owner.has(id))
      for (const id of p.runs) owner.set(id, pid)
      if (!p.runs.length && !p.studio) delete data.projects[pid]
    }
    let changed = !!data.migrating
    for (const id of ids) {
      if (owner.has(id)) continue
      const card = runCard(id)
      if (!card) continue
      const meta = runMeta(id)
      // 1. the start request named the project (by id or by name)
      let pid = meta.project && data.projects[meta.project] ? meta.project : findIn(data, meta.projectName)
      // 2. the brief's brand is a project's name: "ARES Player Hub — …" joins ARES
      const brand = meta.projectName || brandOf(card.brief)
      if (!pid && brand) pid = findIn(data, brand)
      // 3. the same idea asked again, unless the brief names another brand
      if (!pid) {
        for (const [qid, q] of Object.entries(data.projects)) {
          if (q.trashed || q.own) continue
          if (brand && !sameName(brand, nameOfProject(q))) continue
          if (q.runs.some(r => alike(runCard(r), card))) { pid = qid; break }
        }
      }
      if (!pid) {
        pid = id
        data.projects[pid] = { runs: [], name: projectName({ given: meta.projectName, brief: card.brief, title: card.autoTitle || card.title }), title: null, folder: null, trashed: null, made: card.t || Date.now() }
      }
      const p = data.projects[pid]
      p.runs.push(id)
      p.runs.sort()
      // a folder set on a run before v2 becomes the project's
      if (!p.folder && meta.folder) { p.folder = clip(meta.folder, 40); if (!data.folders.includes(p.folder)) data.folders.push(p.folder) }
      owner.set(id, pid)
      changed = true
    }
    // one idea, one card: a project named the same as another, or as another plus more words
    // ("Rooftop Signal Art Test" of "Rooftop Signal"), folds into the older one. A project the
    // person split off or renamed themself stays apart.
    const key = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
    const open = Object.entries(data.projects).filter(([, p]) => !p.trashed && !p.own).map(([pid, p]) => ({ pid, p, k: key(nameOfProject(p)) })).filter(x => x.k)
      .sort((a, b) => a.k.length - b.k.length || (a.p.made || 0) - (b.p.made || 0))
    for (const child of open) {
      if (!data.projects[child.pid]) continue
      const parent = open.find(x => x !== child && data.projects[x.pid] && (x.k === child.k ? (x.p.made || 0) < (child.p.made || 0) || ((x.p.made || 0) === (child.p.made || 0) && x.pid < child.pid) : !child.p.title && child.k.startsWith(`${x.k} `)))
      if (!parent) continue
      parent.p.runs = [...new Set([...parent.p.runs, ...child.p.runs])].sort()
      for (const id of child.p.runs) owner.set(id, parent.pid)
      if (!parent.p.folder && child.p.folder) parent.p.folder = child.p.folder
      delete data.projects[child.pid]
      changed = true
    }
    if (changed) write(data)
    return { data, owner }
  }

  // ---------- cards
  const coverOf = card => card.cover || null
  function project(pid, p) {
    const all = p.runs.map(id => runCard(id)).filter(Boolean)
    if (!all.length && p.studio) return studioCard(pid, p)
    if (!all.length) return null
    // a game made from a site in this project is part of that site's version, not a version of its own
    const ids = new Set(all.map(c => c.id))
    const isPart = c => c.from && c.from !== c.id && ids.has(c.from)
    // a game try that stopped or failed with nothing to show (no art, no app) is not a version of
    // its own once a newer try of the same piece exists: a retry replaces it on the card
    const empty = c => (c.kind === 'game' || c.game) && !c.cover && !c.app && !c.deployed && !c.work && !c.live && ['failed', 'stopped', 'working'].includes(c.build) && Date.now() - (c.updated || 0) > 600000
    const kept = all.filter(c => !isPart(c))
    const cards = kept.filter((c, i) => !(empty(c) && kept.slice(i + 1).some(n => pieceOfCard(n) === pieceOfCard(c))))
    const parts = Object.fromEntries(all.filter(isPart).map(c => [c.id, c.from]))
    // a version is working while it or one of its parts is
    const workOf = c => c.work || all.find(x => x.from === c.id && x.work)?.work || null
    const withWork = c => ({ ...c, work: workOf(c), kinds: [...new Set([...kindsOf(c), ...all.filter(x => x.from === c.id).flatMap(kindsOf)])] })
    // the version being built leads the card: its status, cover and the one a click opens
    const busyCard = [...cards].reverse().find(c => c.live || workOf(c))
    const newest = withWork(busyCard || cards.at(-1))
    const withCover = (busyCard?.cover && busyCard) || [...cards].reverse().find(c => c.cover) || null
    const kinds = [...new Set(all.flatMap(kindsOf))]
    const name = nameOfProject(p)
    // the project's pieces: one per kind, each its newest run (older runs of a kind are its versions)
    const byKind = new Map()
    for (const c of all) byKind.set(pieceOfCard(c), c)
    const pieces = [...byKind].sort((a, b) => a[1].t - b[1].t).map(([kind, c]) => ({
      kind, runId: c.id, title: c.title, live: c.deployed || Object.values(c.sites || {}).find(u => /^https:/.test(u)) || null,
      versions: all.filter(x => pieceOfCard(x) === kind).length
    }))
    const working = all.find(c => c.live || c.work)
    const live = !!working
    const pct = working ? (working.work?.pct ?? working.progress ?? null) : null
    return {
      id: pid,
      name,
      title: p.title || name,
      pieces,
      folder: p.folder || null,
      trashed: p.trashed || null,
      made: p.made || all[0].t,
      updated: Math.max(...all.map(c => c.updated || c.t || 0)),
      cover: coverOf(withCover || {}),
      peek: withCover ? null : ([...cards].reverse().find(c => c.preview) || {}).id || null,
      // no picture yet: the newest theme's colours and fonts make a type cover
      theme: withCover ? null : (([...cards].reverse().find(c => c.theme?.colors?.length) || {}).theme || null),
      head: newest.id,
      parts,
      kinds,
      state: stateOf(newest, cards),
      live,
      progress: pct,
      work: working ? (working.work || { what: 'site', stage: null, pct }) : null,
      count: cards.length,
      versions: [...cards].reverse().map(withWork).map(c => ({ id: c.id, piece: pieceOfCard(c), title: c.title, t: c.t, updated: c.updated, cover: c.cover || null, theme: c.cover ? null : c.theme || null, kinds: c.kinds, state: stateOf(c), live: !!(c.live || c.work), work: c.work, pages: c.pages })),
      uploads: uploadsOf(pid).length
    }
  }
  // a Studio project with nothing built yet: its name, its kind, the status Studio, no versions
  const STUDIO_KIND = { site: 'Website', app: 'App', game: 'Game', video: 'Video', deck: 'Deck', brand: 'Brand' }
  function studioCard(pid, p) {
    return {
      id: pid, name: p.name || 'New project', title: p.title || p.name || 'New project', studio: p.studio, pieces: [], folder: p.folder || null,
      trashed: p.trashed || null, made: p.made, updated: p.made, cover: null, peek: null, theme: null, head: null, parts: {}, kinds: [],
      state: { kind: STUDIO_KIND[p.studio] || 'Website', status: 'Studio', host: null }, live: false, progress: null, work: null, count: 0, versions: [],
      uploads: uploadsOf(pid).length
    }
  }
  // a new Studio project: { name, kind } -> its id
  function makeStudio({ name = '', kind = 'site' } = {}) {
    const { data } = load()
    const pid = `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    // own: kept apart from the projects it shares a name with (no folding into an older one)
    data.projects[pid] = { runs: [], name: clip(name, 48) || 'New project', title: null, folder: null, trashed: null, made: Date.now(), own: true, studio: STUDIO_KIND[kind] ? kind : 'site' }
    write(data)
    return pid
  }
  function list() {
    const { data } = load()
    const projects = Object.entries(data.projects).map(([pid, p]) => project(pid, p)).filter(Boolean)
    const live = projects.filter(p => !p.trashed)
    const folders = [...new Set([...data.folders, ...live.map(p => p.folder).filter(Boolean)])].map(name => ({ name, count: live.filter(p => p.folder === name).length }))
    return { folders, projects }
  }
  function projectOf(runId) { return load().owner.get(runId) || null }
  function get(pid) { const { data } = load(); const p = data.projects[pid]; return p ? project(pid, p) : null }

  // ---------- changes
  function op(input = {}) {
    const { data } = load()
    const ids = (Array.isArray(input.ids) ? input.ids : [input.id]).map(String).filter(id => data.projects[id])
    const name = v => clip(v, 40)
    const at = Date.now()
    let out = {}
    switch (input.op) {
      case 'rename': for (const id of ids) {
        const t = clip(input.title, 80)
        data.projects[id].title = t || null
        // the project's one name follows a rename, unless the new title is a screen word
        if (t && !isScreenName(t)) data.projects[id].name = clip(t, 48)
      } break
      case 'move': {
        const f = name(input.folder)
        if (f && !data.folders.includes(f)) data.folders.push(f)
        for (const id of ids) data.projects[id].folder = f || null
        break
      }
      case 'trash': for (const id of ids) { if (!data.projects[id].runs.some(isLive)) data.projects[id].trashed = at } break
      case 'restore': for (const id of ids) data.projects[id].trashed = null; break
      // Delete forever (one or more in Trash) and Empty Trash: the runs' folders go too
      case 'purge':
      case 'empty': {
        const gone = input.op === 'empty' ? Object.keys(data.projects).filter(id => data.projects[id].trashed) : ids.filter(id => data.projects[id].trashed)
        // each project on its own: a file held open (EBUSY, EPERM on Windows) keeps that one in Trash, named in
        // `failed`, and the rest still go
        out.removed = 0
        out.failed = []
        for (const id of gone) {
          try {
            for (const run of data.projects[id].runs) if (RUN_ID.test(run) && !isLive(run)) removeDir(join(runsDir, run))
            removeDir(join(projectsDir, id))
            delete data.projects[id]
            out.removed++
          } catch (err) {
            out.failed.push({ id, title: data.projects[id].title || data.projects[id].name || id, code: err.code || '', error: err.message })
          }
        }
        break
      }
      case 'duplicate': {
        const src = data.projects[ids[0]]
        if (!src || !src.runs.length) break
        const from = src.runs.at(-1), to = new Date().toISOString().replace(/[:.]/g, '-')
        cpSync(join(runsDir, from), join(runsDir, to), { recursive: true, filter: s => !/[\\/](node_modules|\.git)$/.test(s) })
        // the copy is its own build: its events and pictures name the new id
        for (const f of ['events.jsonl', 'trace.jsonl']) {
          const p = join(runsDir, to, f)
          if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').split(from).join(to))
        }
        if (existsSync(join(projectsDir, ids[0]))) cpSync(join(projectsDir, ids[0]), join(projectsDir, to), { recursive: true })
        data.projects[to] = { runs: [to], name: src.name || null, title: `${src.title || shortTitle(runCard(from)?.title)} copy`, folder: src.folder, trashed: null, made: at, own: true }
        out.id = to
        break
      }
      // one version out of its stack, as a project of its own
      case 'split': {
        const run = String(input.run || '')
        const pid = Object.keys(data.projects).find(k => data.projects[k].runs.includes(run))
        if (!pid || data.projects[pid].runs.length < 2) break
        data.projects[pid].runs = data.projects[pid].runs.filter(r => r !== run)
        if (pid === run) { data.projects[data.projects[pid].runs[0]] = data.projects[pid]; delete data.projects[pid] }
        data.projects[run] = { runs: [run], title: null, folder: null, trashed: null, made: at, own: true }
        out.id = run
        break
      }
    }
    write(data)
    return { ...list(), ...out }
  }

  // a run started inside a project joins it; one started from Home finds its own place
  function claim(runId, pid) {
    if (!pid || !RUN_ID.test(runId)) return
    const { data } = load()
    if (!data.projects[pid]) return
    for (const p of Object.values(data.projects)) p.runs = p.runs.filter(r => r !== runId)
    data.projects[pid].runs.push(runId)
    data.projects[pid].runs.sort()
    for (const [k, p] of Object.entries(data.projects)) if (!p.runs.length && !p.studio) delete data.projects[k]
    write(data)
  }

  // ---------- folders: add, rename, delete (its projects stay, out of any folder), reorder
  function folderOp(input = {}) {
    const { data } = load()
    const name = v => clip(v, 40)
    if (input.op === 'add' && name(input.name) && !data.folders.includes(name(input.name))) data.folders.push(name(input.name))
    if (input.op === 'order' && Array.isArray(input.folders)) data.folders = [...input.folders.map(name).filter(n => data.folders.includes(n)), ...data.folders]
    if (input.op === 'rename' && name(input.from) && name(input.to)) {
      data.folders = data.folders.map(n => (n === name(input.from) ? name(input.to) : n))
      for (const p of Object.values(data.projects)) if (p.folder === name(input.from)) p.folder = name(input.to)
    }
    if (input.op === 'delete' && name(input.name)) {
      data.folders = data.folders.filter(n => n !== name(input.name))
      for (const p of Object.values(data.projects)) if (p.folder === name(input.name)) p.folder = null
    }
    write(data)
    return { folders: list().folders.map(f => f.name) }
  }

  // ---------- uploads: the person's own files, in projects/<pid>/uploads, usable by the crew
  const UP_NAME = /^[\w][\w .()+-]{0,118}\.[a-z0-9]{1,8}$/i
  const UP_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv', zip: 'application/zip' }
  const uploadsDir = pid => join(projectsDir, pid, 'uploads')
  const cleanName = n => clip(String(n || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, ''), 120)
  function uploadsOf(pid) {
    const dir = uploadsDir(pid)
    if (!RUN_ID.test(pid) || !existsSync(dir)) return []
    return readdirSync(dir).filter(n => UP_NAME.test(n)).map(n => {
      const st = statSync(join(dir, n)), ext = extname(n).slice(1).toLowerCase()
      return { name: n, size: st.size, t: st.mtimeMs, type: UP_TYPES[ext] || 'application/octet-stream', src: `/up/${pid}/${encodeURIComponent(n)}` }
    }).sort((a, b) => a.t - b.t)
  }
  function saveUpload(pid, given, buf, replace = false) {
    if (!RUN_ID.test(pid) || !load().data.projects[pid]) throw new Error('no such project')
    let n = cleanName(given)
    if (!UP_NAME.test(n)) n = `upload-${Date.now()}${extname(n) || '.bin'}`
    const dir = uploadsDir(pid)
    mkdirSync(dir, { recursive: true })
    const stem = n.replace(/\.[^.]+$/, ''), ext = extname(n)
    if (!replace) for (let i = 2; existsSync(join(dir, n)); i++) n = `${stem} (${i})${ext}`
    writeFileSync(join(dir, n), buf)
    return uploadsOf(pid).find(u => u.name === n)
  }
  function uploadOp(pid, input = {}) {
    const dir = uploadsDir(pid), n = cleanName(input.name)
    if (!RUN_ID.test(pid) || !UP_NAME.test(n) || !existsSync(join(dir, n))) throw new Error('no such file')
    if (input.op === 'rename') {
      let to = cleanName(input.to)
      if (!UP_NAME.test(to)) throw new Error('that name will not work')
      if (!extname(to)) to += extname(n)
      if (existsSync(join(dir, to))) throw new Error('a file has that name')
      renameSync(join(dir, n), join(dir, to))
      return { name: to }
    }
    if (input.op === 'duplicate') {
      const stem = n.replace(/\.[^.]+$/, ''), ext = extname(n)
      let to = `${stem} copy${ext}`
      for (let i = 2; existsSync(join(dir, to)); i++) to = `${stem} copy ${i}${ext}`
      copyFileSync(join(dir, n), join(dir, to))
      return { name: to }
    }
    if (input.op === 'delete') {
      // deleted uploads wait in the project's .trash, so a slip can be undone from Finder
      mkdirSync(join(projectsDir, pid, '.trash'), { recursive: true })
      renameSync(join(dir, n), join(projectsDir, pid, '.trash', `${Date.now()}-${n}`))
      return { ok: true }
    }
    throw new Error('unknown op')
  }
  const uploadFile = (pid, n) => {
    const name = cleanName(decodeURIComponent(n))
    const p = join(uploadsDir(pid), name)
    return RUN_ID.test(pid) && UP_NAME.test(name) && existsSync(p) ? { file: p, type: UP_TYPES[extname(name).slice(1).toLowerCase()] || 'application/octet-stream' } : null
  }

  // run id -> { project, name, piece, version (1 for the first build) } for every run (the run list, the Feed and deploy names read it)
  function runIndex() {
    const { data } = load()
    const out = new Map()
    for (const [pid, p] of Object.entries(data.projects)) {
      const name = nameOfProject(p)
      // version: the build's number among the project's builds of the same piece (its sites, its apps)
      const seen = {}
      for (const id of p.runs) { const c = runCard(id), piece = c ? pieceOfCard(c) : 'site'; seen[piece] = (seen[piece] || 0) + 1; out.set(id, { project: pid, name, piece, version: seen[piece] }) }
    }
    return out
  }
  const resolve = ref => findIn(load().data, ref)

  return { list, get, op, claim, makeStudio, projectOf, runIndex, resolve, folderOp, uploadsOf, saveUpload, uploadOp, uploadFile, uploadsDir, projectsDir }
}
