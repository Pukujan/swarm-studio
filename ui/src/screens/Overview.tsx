// The Overview (docs/ux/OBJECTS.md; SITEMAP §8): a project's pages and files, as artboards in sections. The left
// panel lists them (Files) or the pages and sections (Layers); the stage shows the same files on one board; selecting
// one opens the inspector; a double-click opens its room. Files dropped on the screen, or + → Upload files, land in
// the project's uploads; + → Reference and Link keep things the crew read. The behaviour is web/project.js's, moved as
// it is (issue #404). What is drawn is the machine's (useNav().view: the project and version); the selection, the
// search and the panel are this screen's own.
//
// Not here yet, because they run on the Design deck's runtime in the current Studio (web/canvas/): a page's sections
// picked and edited by hand, Scribble and its drafts, the Critic's pins, pictures' stand-ins while painting, the
// crew's cursors and Follow, the live line, and new snapshots of a changed page. A page shows its saved snapshot,
// else its plan; the chat is the current Studio's (the Dock says how).
import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { search } from '../nav/address'
import { useNav } from '../nav/NavProvider'
import { MenuAt, MenuRow, MenuSeparator } from '../primitives/Menu'
import { ToastProvider, useToast } from '../primitives/Toast'
import { useScreenCrumb } from '../shell/crumb'
import { api, post, said, store, raw } from './overview/api'
import { Dock } from './overview/Dock'
import { FilesPanel } from './overview/FilesPanel'
import { Inspector } from './overview/Inspector'
import { download, findItem, groups as groupOf, opening, projectName, type Act, type Item, type Project, type Ref, type Section, type Sending, type Upload } from './overview/model'
import { ProjectCrumb } from './overview/ProjectCrumb'
import { Stage, type StageHandle } from './overview/Stage'
import { useOverview } from './overview/useOverview'
import './overview/overview.css'

const enc = encodeURIComponent
const narrow = () => matchMedia('(max-width: 760px)').matches

export function Overview() {
  return <ToastProvider><OverviewScreen /></ToastProvider>
}

function OverviewScreen() {
  const { view, go } = useNav()
  const toast = useToast()
  const o = useOverview()
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>(() => store.get('project.open', { code: false }))
  const [aspects, setAspects] = useState(() => new Map<string, number>())
  const [sending, setSending] = useState<Sending[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState(false)
  const [linking, setLinking] = useState(false)
  const [menu, setMenu] = useState<{ x: Item, at: { x: number, y: number } } | null>(null)
  const stage = useRef<StageHandle>(null)
  const ask = useRef<HTMLInputElement>(null)
  const fileIn = useRef<HTMLInputElement>(null)
  const refIn = useRef<HTMLInputElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const replacing = useRef<string | null>(null)
  const [dropping, setDropping] = useState(0)

  const waiting = !o.ready || o.run !== view.version
  const groups = useMemo(() => groupOf(waiting ? null : o.board, o.uploads, o.refs, q, sending), [waiting, o.board, o.uploads, o.refs, q, sending])
  const find = useCallback((key: string | null) => findItem(groups, key), [groups])
  const x = find(sel)
  const name = projectName(o.project, o.board)
  const studioAt = `/${search(view, location.search)}`

  // ---------- the breadcrumb: Projects › name ▾
  const rename = useCallback((title: string) => { if (o.pid) post('/api/projects', { op: 'rename', ids: [o.pid], title }).then(() => o.reload()).catch(err => toast(said(err))) }, [o, toast])
  const duplicate = useCallback(() => {
    if (!o.pid) return
    post<{ id: string, projects: Project[] }>('/api/projects', { op: 'duplicate', ids: [o.pid] })
      .then(out => { const np = out.projects.find(p => p.id === out.id); if (np?.head) go({ type: 'open.project', project: np.id, version: np.head }) })
      .catch(err => toast(said(err)))
  }, [o.pid, go, toast])
  const crumb = useMemo(() => <ProjectCrumb name={name} project={o.project} run={o.run} onProjects={() => go({ type: 'home' })}
    onRename={rename} onDuplicate={duplicate} onVersion={v => go({ type: 'open.version', version: v })} />, [name, o.project, o.run, go, rename, duplicate])
  useScreenCrumb(crumb)

  // ---------- selecting and opening
  const select = (key: string | null, { pan = false } = {}) => {
    setSel(key)
    if (pan && key) requestAnimationFrame(() => stage.current?.reveal(key))
  }
  const openItem = (it: Item) => {
    const to = opening(it, o.run)
    if (!to) return
    if ('tab' in to) { window.open(to.tab, '_blank', 'noopener'); return }
    go(to.event)
  }

  // ---------- files: save, export, rename, duplicate, delete, reveal
  const save = (it: Item) => {
    const d = download(it, o.pid)
    if (!d) return
    const a = Object.assign(document.createElement('a'), { href: d.href, download: d.name })
    document.body.append(a); a.click(); a.remove()
  }
  const exportZip = async () => {
    if (!o.run) return
    toast('Preparing', { icon: 'download' })
    try {
      const r = await raw(`/api/runs/${enc(o.run)}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!r.ok) throw new Error(String((await r.json().catch(() => ({}))).error || 'export failed'))
      const z = await raw(`/api/runs/${enc(o.run)}/export.zip`)
      if (!z.ok) throw new Error('export failed')
      const file = (z.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'build.zip'
      const url = URL.createObjectURL(await z.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: file })
      document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(file, { icon: 'check' })
    } catch (err) { toast(said(err)) }
  }
  const fileOp = async (body: Record<string, unknown>) => {
    if (!o.pid) return null
    try { const out = await post<{ files: Upload[], name?: string }>(`/api/projects/${enc(o.pid)}/files`, body); o.setUploads(out.files || o.uploads); return out } catch (err) { toast(said(err)); return null }
  }
  const renamed = (it: Item, to: string | null) => {
    setRenaming(null)
    if (to && to !== it.name) void fileOp({ op: 'rename', name: it.name, to }).then(out => { if (out) setSel(`up:${out.name || to}`) })
  }
  const reveal = (it: Item) => { if (o.pid) post(`/api/projects/${enc(o.pid)}/reveal`, it.kind === 'upload' ? { name: it.name } : { run: o.run }).catch(() => {}) }
  const remove = (it: Item) => void fileOp({ op: 'delete', name: it.name }).then(out => { if (!out) return; if (sel === it.key) setSel(null); toast('Deleted', { icon: 'trash' }) })

  // ---------- uploads: + → Upload files, the dock's Image, or files dropped anywhere on the screen
  const upload = (list: File[], as: string | null = null) => {
    if (!o.pid) { toast('Uploads need a saved project'); return }
    setOpen(p => ({ ...p, uploads: true }))
    for (const f of list) {
      const nm = as || f.name
      const s: Sending = { name: nm, pct: 0, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null }
      setSending(all => [...all.filter(y => y.name !== nm), s])
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/projects/${enc(o.pid)}/upload?name=${enc(nm)}${as ? '&replace=1' : ''}`)
      xhr.setRequestHeader('x-swarm-token', window.SWARM?.token || '')
      xhr.upload.onprogress = e => { if (e.lengthComputable) setSending(all => all.map(y => (y.name === nm ? { ...y, pct: e.loaded / e.total } : y))) }
      xhr.onloadend = async () => {
        setSending(all => all.filter(y => y.name !== nm))
        if (s.preview) setTimeout(() => URL.revokeObjectURL(s.preview!), 4000)
        let out: { name?: string, error?: string } = {}
        try { out = JSON.parse(xhr.responseText) } catch { /* no answer */ }
        if (xhr.status !== 200) toast(out.error || `${nm} did not upload`)
        const now = await api<{ files: Upload[] }>(`/api/projects/${enc(o.pid!)}/files`).catch(() => null)
        if (now) o.setUploads(now.files)
        if (out.name) setSel(`up:${out.name}`)
      }
      xhr.send(f)
    }
  }
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files')

  // ---------- references (spec 29): + → Reference or Link; Remove, with Undo; Use for…
  const refPost = async (path: string, body: unknown, file: File | null = null) => {
    if (!o.pid) { toast('References need a saved project'); return null }
    try {
      const out = file ? await api<{ refs: Ref[], ref?: Ref }>(`/api/projects/${enc(o.pid)}/refs?name=${enc(file.name)}`, { method: 'POST', body: file })
        : await post<{ refs: Ref[], ref?: Ref }>(`/api/projects/${enc(o.pid)}/refs${path ? `/${path}` : ''}`, body)
      o.setRefs(out.refs || o.refs)
      setOpen(p => ({ ...p, refs: true }))
      return out
    } catch (err) { toast(said(err)); return null }
  }
  const removeRef = (it: Item) => {
    if (!it.ref) return
    const id = it.ref.id
    void refPost(`${id}/remove`, {}).then(out => {
      if (!out) return
      if (sel === it.key) setSel(null)
      toast('Removed', { icon: 'trash', action: 'Undo', onAction: () => { void refPost(`${id}/restore`, {}).then(r => { if (r) setSel(it.key) }) } })
    })
  }
  const useFor = async (it: Item, use: string) => {
    const out = it.ref && await refPost(`${it.ref.id}/use`, { use, send: true })
    if (out) toast('Sent to the crew', { icon: 'check' })
    return !!out
  }

  // ---------- Replace: a picture is painted again (the words in "Tell the crew…" steer it); an upload takes a new file
  const replace = (it: Item) => {
    if (it.kind === 'upload') { replacing.current = it.name; if (fileIn.current) { fileIn.current.multiple = false; fileIn.current.click() } return }
    if (it.kind === 'art' && it.art && o.run) {
      post(`/api/runs/${enc(o.run)}/image`, { page: it.art.page, layer: it.art.layer, gen: it.art.gen, prompt: text.trim() })
        .then(() => { setText(''); toast('Painting', { icon: 'image' }); setTimeout(() => { void o.reload() }, 1500) })
        .catch(err => toast(said(err)))
    }
  }
  const act = (a: Act, it: Item) => {
    if (a === 'open') openItem(it)
    if (a === 'export') save(it)
    if (a === 'zip') void exportZip()
    if (a === 'replace') replace(it)
    if (a === 'ref-remove') removeRef(it)
  }

  // ---------- the dock
  const newPage = () => { setSel(null); setText('Add a page: '); requestAnimationFrame(() => ask.current?.focus()) }
  const send = () => {
    const t = text.trim()
    if (!t) { ask.current?.focus(); return }
    if (x?.kind === 'art') return replace(x)
    // the crew's chat is the current Studio's until the talk moves here: the words stay in the box
    toast('Tell the crew from the Studio', { icon: 'msg', action: 'Open', onAction: () => { location.href = studioAt } })
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const t = e.target as Element
    if (t.closest('input, textarea')) return
    // the inspector, the Files sheet and the link box close before Esc leaves the Overview
    if (sel || files || linking) { e.preventDefault(); setSel(null); setFiles(false); setLinking(false) }
  }

  const shut = (k: Section) => { const next = { ...open, [k]: !(open[k] === false || (k === 'code' && !open[k])) }; setOpen(next); store.set('project.open', next) }
  return (
    <div className={`ov ${x ? 'insp-on' : ''} ${files ? 'files-on' : ''}`} onKeyDown={onKey}
      onDragEnter={e => { if (hasFiles(e)) { e.preventDefault(); setDropping(d => d + 1) } }}
      onDragOver={e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
      onDragLeave={e => { if (hasFiles(e)) setDropping(d => Math.max(0, d - 1)) }}
      onDrop={e => { if (!hasFiles(e)) return; e.preventDefault(); setDropping(0); upload([...e.dataTransfer.files]) }}>
      <FilesPanel groups={groups} theme={o.board?.theme} selected={sel} open={open} onToggle={shut} q={q} onSearch={setQ}
        layers={{ pages: waiting ? [] : o.board?.pages || [], page: x?.kind === 'page' ? x.page! : null, onPickPage: p => select(`page:${p}`, { pan: true }) }}
        onSelect={k => { if (narrow()) { setSel(k); setFiles(false); requestAnimationFrame(() => stage.current?.zoomTo(k)) } else select(k, { pan: true }) }}
        onOpen={openItem} onMenu={(it, at) => setMenu({ x: it, at })} onRename={it => { if (it.kind === 'upload' && it.sending == null) setRenaming(it.key) }}
        renaming={renaming} onRenamed={renamed}
        onNewPage={newPage} onUpload={() => fileIn.current?.click()} onReference={() => refIn.current?.click()} onLink={() => setLinking(true)} />
      {linking && <LinkBox onDone={async u => { if (u) { const out = await refPost('link', { url: /^https?:\/\//i.test(u) ? u : `https://${u}` }); if (out?.ref) setSel(`rf:${out.ref.id}`) } setLinking(false) }} />}
      <Stage ref={stage} groups={groups} waiting={waiting} theme={o.board?.theme} selected={sel} inspector={!!x}
        aspects={aspects} onMeasure={(page, r) => setAspects(m => (Math.abs((m.get(page) || 0) - r) < 0.01 ? m : new Map(m).set(page, r)))}
        onSelect={k => select(k)} onOpen={openItem} onMenu={(it, at) => setMenu({ x: it, at })} find={find} />
      {o.error && !o.board && <p role="alert" className="ov-error">⚠ {o.error}</p>}
      {x && <Inspector x={x} theme={o.board?.theme} onClose={() => setSel(null)} onAct={act} onUseFor={useFor} />}
      <Dock ref={ask} text={text} onText={setText} onSubmit={send} files={files} onFiles={() => setFiles(!files)}
        onFrame={() => stage.current?.frameAll()} onNewPage={newPage} onUpload={() => fileIn.current?.click()} onChat={() => { location.href = studioAt }} />
      {dropping > 0 && <div className="ov-drop" aria-hidden />}
      <input ref={fileIn} type="file" multiple hidden onChange={e => {
        const fs = [...(e.target.files || [])]
        if (fs.length) upload(fs, replacing.current && fs.length === 1 ? replacing.current : null)
        replacing.current = null; e.target.multiple = true; e.target.value = ''
      }} />
      <input ref={refIn} type="file" multiple hidden accept="image/*,video/*,audio/*,.pdf,.txt,.md" onChange={async e => {
        const fs = [...(e.target.files || [])]
        e.target.value = ''
        let last: Ref | null = null
        for (const f of fs) last = (await refPost('', null, f))?.ref || last
        if (last) setSel(`rf:${last.id}`)
      }} />
      {/* the file menu opens at the pointer: this point is its anchor */}
      <span ref={anchor} aria-hidden className="fixed size-0" style={{ left: menu?.at.x ?? 0, top: menu?.at.y ?? 0 }} />
      {menu && (
        <MenuAt name={menu.x.name} triggerRef={anchor} isOpen onClose={() => setMenu(null)} placement="bottom start" onAction={k => {
          const it = menu.x
          setMenu(null)
          if (k === 'open') openItem(it)
          if (k === 'rename') setRenaming(it.key)
          if (k === 'dup') void fileOp({ op: 'duplicate', name: it.name })
          if (k === 'dl') { if (it.kind === 'page') void exportZip(); else save(it) }
          if (k === 'show') reveal(it)
          if (k === 'del') remove(it)
        }}>
          {fileMenu(menu.x)}
        </MenuAt>
      )}
    </div>
  )
}

// the file menu's items, as web/project.js fileMenu() lists them
function fileMenu(x: Item) {
  const up = x.kind === 'upload' && x.sending == null
  const items = [
    x.kind !== 'upload' || x.src ? <MenuRow key="open" id="open" icon="ext" label="Open" /> : null,
    up ? <MenuRow key="rename" id="rename" icon="type" label="Rename" /> : null,
    up ? <MenuRow key="dup" id="dup" icon="layers" label="Duplicate" /> : null,
    (['art', 'upload', 'film'].includes(x.kind) && x.sending == null) || x.kind === 'page' ? <MenuRow key="dl" id="dl" icon="download" label="Download" /> : null,
    x.sending == null ? <MenuRow key="show" id="show" icon="file" label="Show in Finder" /> : null,
    up ? <MenuSeparator key="sep" /> : null,
    up ? <MenuRow key="del" id="del" icon="trash" label="Delete" red /> : null
  ]
  return items.filter(Boolean)
}

// + → Link: one field under the panel's tabs; Enter keeps it as a reference, Esc closes it
function LinkBox({ onDone }: { onDone: (url: string | null) => void }) {
  return (
    <form className="ov-link" autoComplete="off" onSubmit={e => { e.preventDefault(); onDone(new FormData(e.currentTarget).get('u')?.toString().trim() || null) }}>
      <input name="u" autoFocus type="text" inputMode="url" placeholder="Paste a link" aria-label="Reference link" maxLength={1000}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDone(null) } }}
        className="h-8 w-full rounded-[8px] border border-line bg-deep px-2.5 font-monospace text-[12.5px] text-text outline-none focus:border-line-2" />
    </form>
  )
}
