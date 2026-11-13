// Projects (docs/ux/OBJECTS.md): the Studio's home, a file browser after Figma's and Canva's (docs/ux/PATTERNS.md),
// moved from web/home.js with the same behaviour. A sidebar (Recent, All projects, Chats, Assets, Trash, Folders,
// you), the Make box, and a grid or list of project cards. Click opens; Shift, ⌘ or Ctrl picks several; … or a
// right-click manages one; a card dragged onto a folder moves there. Re-runs of one idea stack on one card.
// Where the person is (Projects, a project, a room) is the machine's: opening anything is a go(). What Projects
// itself shows (the view, folder, sort, filter, layout) is kept under web/home.js's own keys, so both apps agree.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton, PlainButton } from '../primitives/Button'
import { ConfirmDialog } from '../primitives/ConfirmDialog'
import { Icon } from '../primitives/Icon'
import { MenuAt, MenuRow, MenuSeparator, Submenu } from '../primitives/Menu'
import { useToast } from '../primitives/Toast'
import { useNav } from '../nav/NavProvider'
import { api, post, raw, said, useStored } from './projects/api'
import { MakeBox } from './projects/MakeBox'
import {
  SORTS, KIND_ICON, STATUS_ICON, VIEW_NAME, ago, assetGroups, filterKinds, filterStates, live, purgeSaid, seenAt, shown, versionCards, withPlans, working,
  type Asset, type Chat, type Folder, type Layout, type Plan, type Project, type Sort, type View
} from './projects/model'
import { Cover, ProjectCard, RenameInput } from './projects/ProjectCard'
import { DRAG_TYPE, Logo, Sidebar, Who, type Me } from './projects/Sidebar'

interface Data { folders: Folder[], projects: Project[] }
type Op = 'trash' | 'restore' | 'purge' | 'move' | 'rename' | 'duplicate' | 'split'
type MenuFor = { k: 'card', id: string } | { k: 'version', id: string } | { k: 'move', ids: string[] } | { k: 'filter' } | { k: 'sort' } | { k: 'chat', id: string } | { k: 'you' }

const NONE: Record<string, [string, string, boolean]> = {
  recent: ['clock', 'Projects you open show up here', true],
  all: ['grid', 'Every project the crew builds lives here', true],
  folder: ['folder', 'Drag a project here to file it', false],
  trash: ['trash', 'Deleted projects wait here until you empty Trash', false]
}
const CHAT_ICON: Record<string, string> = { site: 'site', app: 'code', game: 'game', film: 'film' }
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] content-start gap-x-[22px] gap-y-[26px] max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-[18px]'

// the list on its way: the cards' shape, nothing to click
const Waiting = () => (
  <div aria-busy="true" aria-label="Loading projects" className={GRID}>
    {[0, 1, 2, 3].map(i => <div key={i} className="wait-in"><div className="aspect-[16/10] rounded-[12px] bg-surface-2" /><b className="mt-2.5 block h-2.5 w-[42%] rounded-full bg-surface-2" /></div>)}
  </div>
)

function None({ icon, line, make, onMake }: { icon: string, line: string, make?: boolean, onMake?: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center gap-3 px-4 py-24 text-center text-dim">
      <Icon name={icon} size={28} />
      <p className="m-0 max-w-[36ch] text-sm">{line}</p>
      {make && <Button role="ghost" className="border !border-line" onPress={onMake}><Icon name="plus" size={15} />Make something</Button>}
    </div>
  )
}

export function Projects() {
  const { go } = useNav()
  const toast = useToast()
  const [view, setView] = useStored<View>('home.view', 'recent')
  const [folder, setFolder] = useStored<string | null>('home.folder', null)
  const [sort, setSort] = useStored<Sort>('home.sort', 'edited')
  const [filter, setFilter] = useStored<string>('home.filter', '')
  const [layout, setLayout] = useStored<Layout>('home.layout', 'grid')
  const [opened, setOpened] = useStored<Record<string, number>>('home.opened', {})
  const [stack, setStack] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const last = useRef<string | null>(null)
  const [data, setData] = useState<Data>({ folders: [], projects: [] })
  const [loaded, setLoaded] = useState(false)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [chats, setChats] = useState<Chat[] | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [adding, setAdding] = useState<string[] | null>(null)
  const [confirm, setConfirm] = useState<null | { ids: string[] | null, n: number }>(null)
  const [menu, setMenu] = useState<MenuFor | null>(null)
  const [drawer, setDrawer] = useState(false)
  const anchor = useRef<Element | null>(null)
  const point = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const input = useRef<HTMLInputElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const who = useRef<HTMLButtonElement>(null)

  // ---------- data
  const fix = useCallback((d: Data, plans: Plan[] | null) => ({ folders: d.folders || [], projects: working(plans ? withPlans(d.projects || [], plans) : d.projects || []) }), [])
  const plansRef = useRef<Plan[]>([])
  const refresh = useCallback(async () => {
    const [d, plans] = await Promise.all([
      api<Data>('/api/projects').catch(() => null),
      api<{ plans?: Plan[] }>('/api/plans').then(j => j.plans || [], () => [] as Plan[])
    ])
    plansRef.current = plans
    if (d) setData(fix(d, plans))
    setLoaded(true)
    return d
  }, [fix])
  const loadAssets = useCallback(() => api<{ assets?: Asset[] }>('/api/assets').then(j => setAssets(j.assets || []), () => setAssets(a => a || [])), [])
  const loadChats = useCallback(() => api<{ chats?: Chat[] }>('/api/chats').then(j => setChats(j.chats || []), () => setChats(c => c || [])), [])
  useEffect(() => { void api<Me>('/api/me').then(setMe, () => setMe(null)) }, [])
  // a live build refreshes every 4 s, else every 20 s
  const anyLive = data.projects.some(p => p.live)
  useEffect(() => {
    let off = false, t: ReturnType<typeof setTimeout>
    const tick = async () => { await refresh(); if (!off) t = setTimeout(tick, anyLive ? 4000 : 20000) }
    void tick()
    return () => { off = true; clearTimeout(t) }
  }, [refresh, anyLive])
  useEffect(() => { if (view === 'assets') void loadAssets(); if (view === 'chats') void loadChats() }, [view, loadAssets, loadChats])
  useEffect(() => { if (loaded && view === 'folder' && !data.folders.some(f => f.name === folder)) goView('recent') }, [loaded, data.folders]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- what this view shows
  const choices = { view, folder, q, filter, sort }
  const list = useMemo(() => {
    if (stack) { const p = data.projects.find(x => x.id === stack); return p ? versionCards(p) : [] }
    return shown(data.projects, choices, opened)
  }, [data, stack, view, folder, q, filter, sort, opened]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = stack ? data.projects.find(p => p.id === stack)?.title || 'Versions' : view === 'folder' ? folder || '' : VIEW_NAME[view]
  const trash = view === 'trash' && !stack
  const narrowed = !!(q || filter)

  // ---------- moving around
  function goView(v: View, f: string | null = null) {
    setView(v); setFolder(f); setStack(null); setSel(new Set()); setQ(''); setSearching(false); setDrawer(false)
  }
  function openProject(p: Project | undefined, version: string | null = null) {
    if (!p) return
    if (p.plan) return void go({ type: 'plan', plan: p.id })
    setOpened({ ...opened, [p.id]: Date.now() })
    // a Studio project with nothing built yet opens on its scaffold (spec 37)
    if (p.studio && !p.head) return void go({ type: 'studio', project: p.id })
    go({ type: 'open.project', project: p.id, version: version || p.head })
  }
  function open(id: string) {
    if (view === 'trash') return
    if (stack) return openProject(data.projects.find(x => x.id === stack), id)
    const p = data.projects.find(x => x.id === id)
    if (p && p.count > 1) { setStack(p.id); setSel(new Set()); return }
    openProject(p)
  }
  const idsFor = (id: string) => (sel.has(id) && sel.size > 1 ? [...sel] : [id])

  // ---------- actions
  async function act(op: Op, ids: string[], extra: Record<string, unknown> = {}) {
    if (!ids.length) return
    if (op === 'purge') return setConfirm({ ids, n: ids.length })
    try {
      const out = await post<Data & { id?: string }>('/api/projects', { op, ids, ...extra })
      setData(fix(out, plansRef.current))
      setSel(new Set())
      if (op === 'split' && stack && !out.projects.find(p => p.id === stack && p.count > 1)) setStack(null)
      if (op === 'trash') toast(ids.length > 1 ? `${ids.length} in Trash` : 'In Trash', { icon: 'trash', action: 'Undo', onAction: () => void act('restore', ids) })
      if (op === 'duplicate' && out.id) setRenaming(out.id)
    } catch (err) { toast(said(err)) }
  }
  // Delete forever (ids) or Empty Trash (null), once confirmed: the toast says how many went; one the server could
  // not remove (a file in it held open) stays in Trash, named, with Retry; so does a failed call
  async function purge(ids: string[] | null) {
    let out: Data & { removed?: number, failed?: { id: string, title: string, code?: string, error?: string }[] }
    try { out = await post('/api/projects', ids ? { op: 'purge', ids } : { op: 'empty' }) } catch (err) {
      return toast(said(err), { action: 'Retry', onAction: () => void purge(ids) })
    }
    setData(fix(out, plansRef.current))
    setSel(new Set())
    const s = purgeSaid(out)
    toast(s.text, s.retry ? { action: 'Retry', onAction: () => void purge(s.retry) } : { icon: 'check' })
  }
  async function download(run: string | null) {
    if (!run) return
    toast('Preparing', { icon: 'download' })
    try {
      const r = await raw(`/api/runs/${encodeURIComponent(run)}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'export failed')
      const z = await raw(`/api/runs/${encodeURIComponent(run)}/export.zip`)
      if (!z.ok) throw new Error('export failed')
      const name = (z.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'build.zip'
      const url = URL.createObjectURL(await z.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(name, { icon: 'check' })
    } catch (err) { toast(said(err)) }
  }
  const reveal = (pid: string, run?: string) => void post(`/api/projects/${encodeURIComponent(pid)}/reveal`, run ? { run } : {}).catch(() => {})
  async function newFolder(name: string | null, ids: string[]) {
    if (!name) return
    await post('/api/folders', { op: 'add', name }).catch(() => {})
    if (ids.length) await act('move', ids, { folder: name })
    else await refresh()
  }

  // ---------- menus: one at a time, at its button or at the pointer
  const menuAt = (m: MenuFor, where: Element | { x: number, y: number }) => {
    if (where instanceof Element) anchor.current = where
    else { setAt(where); anchor.current = point.current }
    setMenu(m)
  }
  function cardMenu(id: string, where: Element | { x: number, y: number }) {
    if (stack) return menuAt({ k: 'version', id }, where)
    if (!sel.has(id)) setSel(new Set())
    menuAt({ k: 'card', id }, where)
  }
  const moveRows = (ids: string[]) => {
    const cur = ids.length === 1 ? data.projects.find(p => p.id === ids[0])?.folder : null
    return [
      ...data.folders.map(f => <MenuRow key={`f:${f.name}`} id={`f:${f.name}`} icon="folder" label={f.name} on={cur === f.name} />),
      ...(data.folders.length ? [<MenuSeparator key="-" />] : []),
      <MenuRow key="new" id="new" icon="plus" label="New folder" />,
      ...(ids.some(id => data.projects.find(p => p.id === id)?.folder) ? [<MenuRow key="out" id="out" icon="x" label="No folder" />] : [])
    ]
  }
  const moveTo = (ids: string[], k: string) => {
    if (k === 'new') return setAdding(ids)
    if (k === 'out') return void act('move', ids, { folder: '' })
    if (k.startsWith('f:')) void act('move', ids, { folder: k.slice(2) })
  }

  // ---------- keys: Esc clears the selection, then closes a stack; ⌘/Ctrl+A picks every card, ⌘/Ctrl+F searches
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || menu || confirm) return
      const typing = (e.target as Element)?.closest?.('input, textarea')
      if (e.key === 'Escape') {
        if (sel.size) { setSel(new Set()); e.preventDefault() }
        else if (stack) { setStack(null); e.preventDefault() }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !typing && !stack && view !== 'assets' && view !== 'chats') { e.preventDefault(); setSel(new Set(list.map(p => p.id))) }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !typing) { e.preventDefault(); setSearching(true); setTimeout(() => search.current?.focus(), 0) }
    }
    // before App's Esc (back to Projects), which this screen has no use for
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [sel, stack, menu, confirm, list, view])
  // the box has the cursor when Projects opens on a wide screen
  useEffect(() => { if (innerWidth > 760) input.current?.focus({ preventScroll: true }) }, [])

  // ---------- the parts
  const counts = { all: live(data.projects).length, trash: data.projects.filter(p => p.trashed).length }
  const p1 = menu?.k === 'card' ? data.projects.find(p => p.id === menu.id) : undefined
  const ids = menu?.k === 'card' ? idsFor(menu.id) : []
  const light = typeof document !== 'undefined' && (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light'
  const crew = (() => { try { return localStorage.getItem('swarm.crew') || 'muted' } catch { return 'muted' } })()

  const bodyCards = !loaded ? <Waiting /> : (
    <div className={layout === 'grid' ? GRID : 'flex flex-col gap-0.5'}
      onPointerDown={e => { if (e.target === e.currentTarget && sel.size) setSel(new Set()) }}>
      {list.length ? list.map(p => (
        <ProjectCard key={p.id} p={p} layout={layout} selected={sel.has(p.id)} framed={menu?.k === 'card' && menu.id === p.id && ids.length === 1}
          stacked={!!stack} trash={view === 'trash'} folderShown={view !== 'folder'} seen={seenAt(p, opened)} renaming={renaming === p.id}
          onOpen={m => {
            if ((m.shift || m.meta) && !stack) {
              const next = new Set(sel)
              if (m.shift && last.current) {
                const all = list.map(x => x.id), a = all.indexOf(last.current), b = all.indexOf(p.id)
                if (a >= 0 && b >= 0) for (const x of all.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x)
              } else if (next.has(p.id)) next.delete(p.id)
              else next.add(p.id)
              last.current = p.id
              return setSel(next)
            }
            open(p.id)
          }}
          onMenu={w => cardMenu(p.id, w)}
          onAct={op => void act(op, [p.id])}
          onKey={k => { if (k === 'menu') return cardMenu(p.id, document.querySelector(`[data-id="${CSS.escape(p.id)}"]`) || document.body); if (!stack && !p.plan) void act(trash ? 'purge' : 'trash', idsFor(p.id)) }}
          onRename={v => { setRenaming(null); if (v) void act('rename', [p.id], { title: v }) }}
          onDragStart={e => {
            if (stack) return e.preventDefault()
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(idsFor(p.id)))
            e.dataTransfer.effectAllowed = 'move'
          }} />
      )) : stack ? null : narrowed ? <None icon="search" line="Nothing matches" /> : (() => { const [i, l, m] = NONE[view] || NONE.all; return <None icon={i} line={l} make={m} onMake={() => input.current?.focus()} /> })()}
    </div>
  )

  const bodyAssets = () => {
    if (!assets) return <Waiting />
    const groups = assetGroups(assets, data.projects, data.folders, { q, filter, sort })
    if (!groups.length) return narrowed ? <None icon="search" line="Nothing matches" /> : <None icon="image" line="Pictures, sections, films and files from every project, to reuse in later builds" make onMake={() => input.current?.focus()} />
    return groups.map(g => (
      <div key={g.folder || ''}>
        {g.folder && <h3 className="mt-6 mb-1 flex items-center gap-2 font-label text-sm font-semibold tracking-[.12em] text-muted uppercase"><Icon name="folder" size={15} />{g.folder}</h3>}
        {g.groups.map(({ project: p, assets: as }) => (
          <section key={p.id} className="mb-6">
            <PlainButton aria-label={`Open ${p.title}`} onPress={() => openProject(p)} className="mb-3 flex items-center gap-1 rounded-[8px] font-display text-lg font-extrabold uppercase"><b>{p.title}</b><Icon name="chr" size={16} /></PlainButton>
            <div className={layout === 'grid' ? GRID : 'flex flex-col gap-0.5'}>
              {as.map((a, i) => {
                const img = a.kind === 'film' ? a.poster : a.kind === 'upload' && !/^image\//.test(a.type || '') ? null : a.src
                return (
                  <PlainButton key={`${a.name}${i}`} aria-label={a.name} onPress={() => openProject(p)} className={`min-w-0 rounded-[12px] ${layout === 'list' ? 'flex items-center gap-4' : 'block'}`}>
                    <div className={`relative aspect-[16/10] rounded-[12px] bg-surface-2 ${layout === 'list' ? 'w-24 flex-none' : ''}`}>
                      {img ? <Cover src={img} /> : <div className="absolute inset-0 grid place-items-center text-dim"><Icon name={a.kind === 'film' ? 'film' : 'file'} size={28} /></div>}
                    </div>
                    <b className="mt-2.5 block truncate font-display text-base font-extrabold uppercase">{a.name}</b>
                  </PlainButton>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    ))
  }

  const bodyChats = () => {
    const cs = (chats || []).filter(c => !q || c.title.toLowerCase().includes(q.toLowerCase()))
    const row = 'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 data-[hovered]:bg-deep'
    return (
      <div className="flex flex-col gap-0.5">
        {/* a new idea starts here, outside every project: the Design deck's talk with nothing built */}
        <PlainButton className={row} onPress={() => go({ type: 'draft' })}><Icon name="plus" size={16} /><b className="font-semibold">New chat</b></PlainButton>
        {!chats && <Waiting />}
        {cs.map(c => (
          <div key={c.id} className="group relative">
            <PlainButton aria-label={c.title} className={`${row} pr-12`} onPress={() => void openChat(c.id)}
              onKeyDown={e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void deleteChat(c.id) } }}>
              <Icon name={CHAT_ICON[c.kind || ''] || 'msg'} size={16} />
              <b className={`min-w-0 flex-1 truncate font-semibold ${renaming === `chat:${c.id}` ? 'invisible' : ''}`}>{c.title}</b>
              {c.state === 'locked' && <span className="font-monospace text-xs text-muted">Locked</span>}
              <span className="font-monospace text-xs text-dim">{ago(c.updated)}</span>
            </PlainButton>
            {renaming === `chat:${c.id}` && <RenameInput value={c.title} className="absolute top-1/2 left-10 w-[50%] -translate-y-1/2" onDone={v => { setRenaming(null); if (v) void post(`/api/chats/${encodeURIComponent(c.id)}`, { title: v }).then(loadChats, err => toast(said(err))) }} />}
            <IconButton icon="more" label="More" size={16} aria-haspopup="menu" className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              onPress={e => menuAt({ k: 'chat', id: c.id }, e.target as Element)} />
          </div>
        ))}
        {chats && !cs.length && (q ? <None icon="search" line="Nothing matches" /> : <None icon="msg" line="Talks with the planner that built nothing yet" />)}
      </div>
    )
  }
  // Chats (spec 29): a game chat opens its Plan board; the others open in the Design deck's chat, which has not moved
  async function openChat(id: string) {
    const chat = await api<{ id?: string, kind?: string, plan?: string }>(`/api/chats/${encodeURIComponent(id)}`).catch(() => null)
    if (!chat?.id) return void loadChats()
    if (chat.kind === 'game') return void go({ type: 'plan', plan: chat.plan || null })
    go({ type: 'draft' })
  }
  const deleteChat = (id: string) => api(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(loadChats, err => toast(said(err)))

  const side = (
    <Sidebar view={view} folder={folder} stacked={!!stack} counts={counts} folders={data.folders} me={me}
      adding={!!adding} onAdding={on => setAdding(on ? [] : null)}
      onGo={goView} onNewFolder={v => { const ids = adding || []; setAdding(null); void newFolder(v, ids) }}
      onRenameFolder={async (from, to) => { await post('/api/folders', { op: 'rename', from, to }).catch(err => toast(said(err))); if (folder === from) setFolder(to); void refresh() }}
      onDeleteFolder={async name => { await post('/api/folders', { op: 'delete', name }).catch(err => toast(said(err))); if (folder === name) goView('recent'); void refresh() }}
      onDrop={(ids, to) => void ('trash' in to ? act('trash', ids) : act('move', ids, { folder: to.folder }))}
      account={<Who ref={who} me={me} onPress={() => menuAt({ k: 'you' }, who.current!)} />} />
  )

  return (
    <div className="flex h-[calc(100dvh-56px)] bg-void text-sm text-text">
      <div className="max-md:hidden">{side}</div>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onKeyDown={e => { if (e.key === 'Escape') setDrawer(false) }}>
          <div className="absolute inset-0 bg-[rgb(var(--shade-rgb)/.5)]" onClick={() => setDrawer(false)} />
          <div className="relative h-full w-[248px]">{side}</div>
        </div>
      )}
      <main className="relative flex min-w-0 flex-1 flex-col px-10 pt-7 max-md:px-4 max-md:pt-3">
        <div className="mb-3.5 flex items-center gap-2.5 md:hidden">
          <IconButton icon="menu" label="Menu" onPress={() => setDrawer(!drawer)} />
          <Logo />
        </div>
        <MakeBox inputRef={input} />
        <div className="relative mb-4 flex items-center gap-1.5">
          {stack && <IconButton icon="chl" label="Back" onPress={() => setStack(null)} />}
          <h2 className="m-0 mr-auto min-w-0 truncate font-display text-[26px] leading-none font-extrabold uppercase max-md:text-[22px]">{title}</h2>
          {(searching || q) && (
            <input ref={search} type="search" placeholder="Search" aria-label="Search projects" value={q} autoFocus
              onChange={e => setQ(e.target.value.trim() ? e.target.value : '')}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setQ(''); setSearching(false) } }}
              className="h-10 w-[220px] rounded-[9px] border border-line bg-deep px-2.5 font-monospace text-[13px] text-text outline-none focus:border-line-2 max-md:absolute max-md:inset-x-0 max-md:z-[2] max-md:w-full" />
          )}
          {trash && list.length > 0 && <Button role="ghost" className="border !border-line" onPress={() => setConfirm({ ids: null, n: data.projects.filter(p => p.trashed).length })}><Icon name="trash" size={15} />Empty</Button>}
          <IconButton icon="search" label="Search" on={searching || !!q} onPress={() => { if (searching || q) { setSearching(false); setQ('') } else { setSearching(true) } }} />
          {filter && !stack && <Button role="secondary" aria-label={`Clear filter ${filter.slice(2)}`} className="!h-8 !min-h-8 !px-3 !font-monospace !text-xs !normal-case !tracking-normal" onPress={() => setFilter('')}>{filter.slice(2)}<Icon name="x" size={13} /></Button>}
          {!(view === 'chats' && !stack) && <>
            {!stack && <IconButton icon="filter" label="Filter" aria-haspopup="menu" on={!!filter} onPress={e => menuAt({ k: 'filter' }, e.target as Element)} />}
            <IconButton icon="sort" label="Sort" aria-haspopup="menu" onPress={e => menuAt({ k: 'sort' }, e.target as Element)} />
            <IconButton icon="grid" label="Grid view" on={layout === 'grid'} className="max-md:hidden" onPress={() => setLayout('grid')} />
            <IconButton icon="list" label="List view" on={layout === 'list'} className="max-md:hidden" onPress={() => setLayout('list')} />
          </>}
        </div>
        <div className="-mx-10 flex-1 overflow-y-auto px-10 pt-2 pb-[120px] max-md:-mx-4 max-md:px-4">
          {view === 'assets' && !stack ? bodyAssets() : view === 'chats' && !stack ? bodyChats() : bodyCards}
        </div>
        {sel.size > 1 && (
          <div role="toolbar" aria-label="Selection" className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[14px] border border-line-2 bg-surface-2 py-1 pr-1 pl-4 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)]">
            <b className="mr-2 font-monospace">{sel.size}<span className="sr-only"> selected</span></b>
            {view === 'trash'
              ? <>
                <IconButton icon="restore" label="Restore" onPress={() => void act('restore', [...sel])} />
                <IconButton icon="trash" label="Delete forever" onPress={() => void act('purge', [...sel])} />
              </>
              : <>
                <IconButton icon="folder" label="Move to" aria-haspopup="menu" onPress={e => menuAt({ k: 'move', ids: [...sel] }, e.target as Element)} />
                <IconButton icon="trash" label="Delete" onPress={() => void act('trash', [...sel])} />
              </>}
            <IconButton icon="x" label="Clear selection" onPress={() => setSel(new Set())} />
          </div>
        )}
      </main>

      <span ref={point} aria-hidden className="fixed h-0 w-0" style={{ left: at.x, top: at.y }} />
      {menu && (
        <MenuAt name={menu.k === 'you' ? 'You' : menu.k === 'filter' ? 'Filter' : menu.k === 'sort' ? 'Sort' : menu.k === 'move' ? 'Move to' : 'More'}
          triggerRef={anchor} isOpen onClose={() => setMenu(null)} placement={menu.k === 'you' ? 'top start' : 'bottom end'}
          onAction={k => {
            const key = String(k)
            if (menu.k === 'sort') return setSort(key as Sort)
            if (menu.k === 'filter') return setFilter(key === 'all' || key === filter ? '' : key)
            if (menu.k === 'move') return moveTo(menu.ids, key)
            if (menu.k === 'chat') return key === 'rename' ? setRenaming(`chat:${menu.id}`) : void deleteChat(menu.id)
            if (menu.k === 'you') {
              if (key === 'theme') { const t = light ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('swarm-theme', t) } catch { /* this page */ } }
              // the crew's voices and sounds (web/chatter.js): the same keys as the current Studio's switch
              if (key === 'sound') { const on = crew !== 'on'; try { localStorage.setItem('swarm.crew', on ? 'on' : 'muted'); localStorage.setItem('swarm.chatter', JSON.stringify({ ...JSON.parse(localStorage.getItem('swarm.chatter') || '{}'), on })) } catch { /* this page */ } }
              return
            }
            if (menu.k === 'version') {
              const p = data.projects.find(x => x.id === stack)!
              if (key === 'open') return openProject(p, menu.id)
              if (key === 'split') return void act('split', [p.id], { run: menu.id })
              if (key === 'dl') return void download(menu.id)
              if (key === 'show') return reveal(p.id, menu.id)
            }
            if (menu.k === 'card' && p1) {
              if (key.startsWith('f:') || key === 'new' || key === 'out') return moveTo(ids, key)
              if (key === 'open') return open(p1.id)
              if (key === 'plan') return void go({ type: 'plan', plan: p1.planId })
              if (key === 'rename') return setRenaming(p1.id)
              if (key === 'restore' || key === 'purge' || key === 'trash' || key === 'dup') return void act(key === 'dup' ? 'duplicate' : key, key === 'dup' ? [p1.id] : ids)
              if (key === 'dl') return void download(p1.head)
              if (key === 'show') return reveal(p1.id)
            }
          }}>
          {menu.k === 'sort' && SORTS.map(([k, label]) => <MenuRow key={k} id={k} icon={k === 'name' ? 'type' : k === 'created' ? 'cal' : 'clock'} label={label} on={sort === k} />)}
          {menu.k === 'filter' && [
            <MenuRow key="all" id="all" icon="grid" label="Everything" on={!filter} />,
            <MenuSeparator key="-1" />,
            ...filterKinds(data.projects).map(k => <MenuRow key={k} id={`k:${k}`} icon={KIND_ICON[k]} label={k} on={filter === `k:${k}`} />),
            ...(filterStates(data.projects).length ? [<MenuSeparator key="-2" />] : []),
            ...filterStates(data.projects).map(v => <MenuRow key={v} id={`s:${v}`} icon={STATUS_ICON[v]} label={v} on={filter === `s:${v}`} />)
          ]}
          {menu.k === 'move' && moveRows(menu.ids)}
          {menu.k === 'chat' && [<MenuRow key="r" id="rename" icon="pencil" label="Rename" />, <MenuRow key="d" id="del" icon="trash" label="Delete" red />]}
          {menu.k === 'version' && [
            <MenuRow key="o" id="open" icon="ext" label="Open" />,
            <MenuRow key="s" id="split" icon="layers" label="Make its own project" />,
            <MenuRow key="d" id="dl" icon="download" label="Download" />,
            <MenuRow key="f" id="show" icon="file" label="Show in Finder" />
          ]}
          {menu.k === 'card' && p1 && (view === 'trash' ? [
            <MenuRow key="r" id="restore" icon="restore" label="Restore" />,
            <MenuSeparator key="-" />,
            <MenuRow key="p" id="purge" icon="trash" label="Delete forever" red />
          ] : ids.length > 1 ? [
            <Submenu key="m" icon="folder" label="Move to" name="Move to">{moveRows(ids)}</Submenu>,
            <MenuSeparator key="-" />,
            <MenuRow key="t" id="trash" icon="trash" label="Delete" red />
          ] : [
            <MenuRow key="o" id="open" icon="ext" label="Open" />,
            ...(p1.planId ? [<MenuRow key="pl" id="plan" icon="layers" label="Open the plan" />] : []),
            <MenuRow key="r" id="rename" icon="type" label="Rename" />,
            <MenuRow key="d" id="dup" icon="layers" label="Duplicate" />,
            <Submenu key="m" icon="folder" label="Move to" name="Move to">{moveRows(ids)}</Submenu>,
            <MenuRow key="dl" id="dl" icon="download" label="Download" />,
            <MenuRow key="f" id="show" icon="file" label="Show in Finder" />,
            <MenuSeparator key="-" />,
            <MenuRow key="t" id="trash" icon="trash" label="Delete" red />
          ])}
          {menu.k === 'you' && [
            <MenuRow key="t" id="theme" icon={light ? 'moon' : 'sun'} label={light ? 'Dark' : 'Light'} />,
            <MenuRow key="s" id="sound" icon="sound" label="Crew sound" on={crew === 'on'} />,
            <MenuSeparator key="-" />,
            // Models, Setup and Settings are sheets of the current Studio, which have not moved: they open there
            <MenuRow key="m" id="models" icon="sliders" label="Models" href="/" />,
            <MenuRow key="u" id="setup" icon="check" label="Setup" href="/" />,
            <MenuRow key="c" id="settings" icon="link" label="Settings" href="/" />
          ]}
        </MenuAt>
      )}
      <ConfirmDialog isOpen={!!confirm}
        title={confirm?.ids ? `Delete ${confirm.n > 1 ? `${confirm.n} projects` : 'this project'} for good?` : 'Empty Trash?'}
        line={confirm && (confirm.n > 1 || !confirm.ids) ? `${confirm.n} project${confirm.n > 1 ? 's' : ''} and their files can't be brought back.` : "Its files can't be brought back."}
        yes={confirm?.ids ? 'Delete' : 'Empty Trash'}
        onDone={ok => { const c = confirm; setConfirm(null); if (ok && c) void purge(c.ids) }} />
    </div>
  )
}
