// The Studio first's data and its rules, ported from web/scaffold.js (spec 37, spec 42): the project's studio
// record, brand, references and assets from /api/studio/:pid; each step's state from what is there (unless skipped),
// and the record kept in step with it; the kit for the kind; Three takes; uploads. The selection is the screen's:
// selecting a card moves the address to its step (the machine's studio.step), never a copy of it here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KITS, type Kit, type KitCard, type KitCtx, type StoreItem, type Studio } from '../../legacy'
import { useNav } from '../../nav/NavProvider'
import { isResearchStop, stopText } from '@studio/researchstop'
import { json, useFetch } from './source'

export const STEP_NAME: Record<string, string> = { brand: 'Brand', references: 'What you have', assets: 'Assets', plan: 'Plan', proposal: 'Lock' }
// The walk's order (decision 0015): What you have (what the person brings, then the files the crew uses) → Brand →
// Lock (the look) → Plan → Build. A kit's own steps are drawn in this order, with Lock among them.
export const WALK = ['references', 'assets', 'brand', 'proposal', 'plan']
const inWalk = (s: string) => { const i = WALK.indexOf(s); return i < 0 ? WALK.length : i }
export const walkOf = (steps: string[]) => [...steps, 'proposal'].sort((a, b) => inWalk(a) - inWalk(b))
export const TAKES = 3

export interface Palette { bg: string, text: string, accent: string, link: string }
export interface Pack { slug: string, name: string, why?: string, for?: string, palette: Palette, type: { heading: string, body: string }, voice?: { lines?: string[] }, pictures?: { photos?: { url: string }[] } }
interface Brand { lockedAt?: unknown, radius?: string, palettes?: (Palette & { id: string })[], types?: { id: string, heading: string, body: string }[], pick?: { palette?: string, type?: string }, pack?: string | null, story?: { what?: string, who?: string }, voice?: { lines?: string[] } | null, pictures?: { photos?: { url: string }[] } | null }
// the brand routes' view (server/brand.mjs): the sheet and its three options
export interface BrandView { brand: Brand | null, packs?: Pack[] }
export interface StudioData { project: { id: string, name: string, title?: string | null }, studio: Studio, brand: Brand | null, refs: StoreItem[], assets: StoreItem[] }
export type StepState = 'empty' | 'started' | 'done' | 'skipped'

// the brand's picked palette and type, for the kits' samples
export function lookOf(b: Brand | null): KitCtx['look'] {
  if (!b?.palettes?.length) return null
  const p = b.palettes.find(x => x.id === b.pick?.palette) || b.palettes[0]
  const t = (b.types || []).find(x => x.id === b.pick?.type) || b.types?.[0]
  return { bg: p.bg, text: p.text, accent: p.accent, link: p.link, heading: t?.heading || '', body: t?.body || '' }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export interface Board { focus(target: string | HTMLElement, animate?: boolean): boolean, frameAll(animate?: boolean): void }

export function useStudio(pid: string | null) {
  const { view, go } = useNav()
  const fetcher = useFetch()
  const [d, setD] = useState<StudioData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [takes, setTakes] = useState<{ pid: string, packs: Pack[] } | null>(null)
  // the Brand step's own board (decision 0015): the options to pick a mood from, and the moodboard that follows
  // `failed`: the options could not be made (no model, Hermes not there): the skeletons stop, the reason and Try again show
  const [moods, setMoods] = useState<{ pid: string, view: BrandView | null, failed?: string } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // a kit's own state changed (it asked to be drawn again)
  const [tick, setTick] = useState(0)
  const board = useRef<Board | null>(null)
  const prepared = useRef<string | null>(null)
  const dRef = useRef(d)
  dRef.current = d

  const api = useCallback(<T = any>(path: string, init?: RequestInit) => fetcher(path, init).then(r => json<T>(r)), [fetcher])
  const post = useCallback(<T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }), [api])
  const at = (p: string) => `/api/studio/${encodeURIComponent(pid || '')}${p}`
  const proj = (p: string) => `/api/projects/${encodeURIComponent(pid || '')}${p}`
  const fail = useCallback((err: unknown) => { setToast(err instanceof Error ? err.message : String(err)); setTimeout(() => setToast(null), 3000) }, [])
  const take = useCallback((next: Partial<StudioData>) => setD(cur => (cur && next.project && next.project.id !== cur.project.id ? cur : { ...(cur as StudioData), ...next })), [])

  const kit: Kit = (d && KITS[d.studio.kind]) || KITS.site

  // the Studio's own `sw`, as much of it as the kits use: the server, escaping, the chat's one line (there is no
  // chat here: the talk has not moved, so the line is shown as a toast)
  // `submit` is the current Studio's (web/canvas/hook.js) as a website's Build uses it: a build of this project,
  // resolving to the new run's id, or null with the reason said (Hermia's question first, the crew still busy, no Hermes)
  // a build that looked something up first (decision 0025): what it found is in this project's References; the
  // next Build, once the person has seen it there, builds with what is left
  const looked = useRef(false)
  const sw = useMemo(() => {
    const say = (text: string) => fail(text)
    const submit = async (brief: string, _auto = false, project: string | null = null, from: string | null = null, opts: { chat?: string | null } = {}) => {
      const r = await fetcher('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief, ...(project ? { project } : {}), ...(from ? { from } : {}), ...(opts.chat ? { chat: opts.chat } : {}), ...(looked.current ? { researched: true } : {}) }) }).catch(() => null)
      const j = await r?.json().catch(() => ({})) as { run?: string, error?: string, text?: string, message?: string } | undefined
      if (r?.ok && j?.run) { looked.current = false; return j.run }
      if (r?.status === 409 && isResearchStop(j)) {
        looked.current = true
        say(`${stopText(j)} They are in References: take out any there, then press Build again.`)
        return null
      }
      say(r?.status === 409 && j?.error === 'ask' ? j.text || 'Hermia has a question first: answer it in the chat.'
        : r?.status === 409 ? 'The crew are still on the last change.'
        : j?.message || j?.error || "Couldn't start the build. Is the studio server running?")
      return null
    }
    return { api: fetcher, esc, base: window.SWARM?.base || '', say, submit }
  }, [fetcher, fail])

  const select = useCallback((key: string | null) => {
    setSel(key)
    const cur = dRef.current
    if (!key || !cur) return
    // the step it is in is where the person is (the address follows)
    const step = key.startsWith('step:') ? key.slice(5) : key === 'brand:open' || key.startsWith('mood:') ? 'brand' : key.startsWith('ref:') ? 'references' : key.startsWith('asset:') ? 'assets' : key.startsWith('lock:') ? 'proposal' : key.startsWith('take:') ? null : 'plan'
    if (step && view.room === 'studio' && view.step !== step) go({ type: 'studio.step', step })
  }, [view.room, view.step, go])

  const ctx = useCallback((): KitCtx => {
    const cur = dRef.current as StudioData
    return {
      project: cur.project, studio: cur.studio, brand: cur.brand, refs: cur.refs, assets: cur.assets, chat: cur.studio.chat, sw,
      C: { nav: { get view() { return view } } },
      board: { toast: fail, focus: (t, a) => board.current?.focus(t, a) ?? false },
      state: (cur.studio.kit || {}) as Record<string, unknown>, look: lookOf(cur.brand),
      save: data => post(at('/kit'), { data }).then(take).catch(fail),
      select: key => select(key),
      refresh: () => setTick(t => t + 1),
      say: text => sw.say(text)
    }
  }, [sw, view, fail, post, take, select, pid])

  // each step's state: what is there, unless the person skipped it
  const stateOf = useCallback((step: string): StepState => {
    const cur = dRef.current
    if (!cur) return 'empty'
    if (cur.studio.steps[step] === 'skipped') return 'skipped'
    if (step === 'brand') return cur.brand?.lockedAt ? 'done' : cur.brand ? 'started' : 'empty'
    if (step === 'references') return cur.refs.length ? 'done' : 'empty'
    if (step === 'assets') return cur.assets.length ? 'done' : 'empty'
    if (step === 'plan') return kit.plan?.done?.(ctx()) ? 'done' : Object.keys(cur.studio.kit || {}).length ? 'started' : 'empty'
    // Lock is the look only (decision 0015): done once the brand's look is locked
    if (step === 'proposal') return cur.brand?.lockedAt ? 'done' : lookOf(cur.brand) ? 'started' : 'empty'
    return 'empty'
  }, [kit, ctx])

  const load = useCallback(async () => {
    if (!pid) return
    try {
      const got = await api<StudioData>(at(''))
      setD(got)
      setError(null)
      dRef.current = got
      // Three takes: the first three looks of the project's brand, the brand made from the idea first
      if (got.studio.mode === 'takes' && got.studio.idea) {
        setTakes(cur => cur?.pid === pid ? cur : { pid, packs: [] })
        const made = got.brand ? api<{ packs?: Pack[] }>(proj('/brand')) : post<{ packs?: Pack[] }>(proj('/brand'), { brief: got.studio.idea, kind: got.studio.kind === 'app' ? 'app' : 'site' })
        made.then(j => setTakes({ pid, packs: (j.packs || []).slice(0, TAKES) })).catch(fail)
      }
      // the Brand step: its options and moodboard, the brand made from the idea first (the slow part, under skeletons)
      if (got.studio.mode !== 'takes' && 'brand' in got.studio.steps && got.studio.idea) {
        setMoods(cur => cur?.pid === pid && !cur.failed ? cur : { pid, view: null })
        const made = got.brand ? api<BrandView>(proj('/brand')) : post<BrandView>(proj('/brand'), { brief: got.studio.idea, kind: got.studio.kind === 'app' ? 'app' : 'site' })
        made.then(view => setMoods({ pid, view })).catch(err => { setMoods({ pid, view: null, failed: err instanceof Error ? err.message : String(err) }); fail(err) })
      }
      // a kit that loads or drafts its own state does it once, before its cards are drawn
      const k = KITS[got.studio.kind] || KITS.site
      if (k.prepare && prepared.current !== pid && got.studio.idea) { prepared.current = pid; await k.prepare(ctx()); setTick(t => t + 1) }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }, [pid, api, post, fail])

  useEffect(() => { setD(null); setSel(null); setTakes(null); prepared.current = null; void load() }, [pid, load])
  // a picture kept from the chat (decision 0025 e, ui/src/chat/useTalk.ts pickCard): its References again, nothing else;
  // when chat clarifies and refreshes an unlocked brand sheet, reload Studio so the story/idea stay in sync
  useEffect(() => {
    if (!pid) return
    const again = () => { api<{ refs: StoreItem[] }>(proj('/refs')).then(j => take({ refs: j.refs })).catch(() => {}) }
    const brandAgain = () => { void load() }
    window.addEventListener('swarm:refs', again)
    window.addEventListener('swarm:brand', brandAgain)
    return () => { window.removeEventListener('swarm:refs', again); window.removeEventListener('swarm:brand', brandAgain) }
  }, [pid, api, take, load])

  // What you have: while the crew reads something the person brought (or walks a site for its look), its card
  // follows; once a read is done, what it filled in (the idea, the brand's story) is loaded with the rest
  const reading = !!d?.refs.some(r => r.found?.state === 'reading' || r.look?.state === 'walking')
  useEffect(() => {
    if (!reading || !pid) return
    const t = setInterval(() => {
      api<{ refs: StoreItem[] }>(proj('/refs')).then(j => {
        const was = dRef.current?.refs || []
        const done = j.refs.some(r => r.found?.state === 'ready' && was.find(x => x.id === r.id)?.found?.state === 'reading')
        if (done) void load(); else take({ refs: j.refs })
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(t)
  }, [reading, pid, api, load, take])

  // the record follows what the board shows
  useEffect(() => {
    if (!d) return
    for (const s of Object.keys(d.studio.steps)) {
      const now = stateOf(s)
      if (now !== d.studio.steps[s]) { d.studio.steps[s] = now; post(at('/step'), { step: s, state: now }).catch(() => {}) }
    }
  }, [d, tick])

  // the plan's cards, as the kit draws them now
  const planSections = useMemo(() => (d && kit.plan ? kit.plan.sections(ctx()) : []), [d, kit, ctx, tick])
  const cards = useMemo(() => new Map<string, KitCard>(planSections.flatMap(s => s.cards).map(c => [c.key, c])), [planSections])
  const steps = d ? kit.steps.filter(s => s in d.studio.steps) : []
  const gone = d ? kit.steps.filter(s => !(s in d.studio.steps)) : []

  const actions = {
    setStep: (step: string, state: string) => post<StudioData>(at('/step'), { step, state }).then(take),
    upload: async (to: 'ref' | 'asset', files: File[]) => {
      for (const f of files.slice(0, 12)) {
        // what is brought to the first step is read for what it says (source import); an asset is used as given
        const q = `?name=${encodeURIComponent(f.name)}&source=${to === 'ref' ? 'import' : 'upload'}`
        try {
          const j = await api<{ refs?: StoreItem[], assets?: StoreItem[] }>(proj(to === 'asset' ? `/assets${q}` : `/refs${q}`), { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f })
          take(to === 'asset' ? { assets: j.assets } : { refs: j.refs })
        } catch (err) { fail(err) }
      }
    },
    // the store as a drop to References left it (shared/RefDrop.tsx), and after its Use as is
    stored: (refs: StoreItem[], assets?: StoreItem[]) => take(assets ? { refs, assets } : { refs }),
    // a website given on the first step: read for what it says, and walked for its look
    addLink: (url: string) => post<{ refs: StoreItem[] }>(proj('/refs/link'), { url, source: 'import' }).then(j => take({ refs: j.refs })),
    // Lock (decision 0015): the look, locked or opened again
    lock: (on: boolean) => post<BrandView>(proj(on ? '/brand/lock' : '/brand/unlock')).then(view => { take({ brand: view.brand }); setMoods(cur => cur?.pid === pid && cur.view ? { pid, view: { ...cur.view, brand: view.brand } } : cur) }),
    removeRef: (id: string) => post<{ refs: StoreItem[] }>(proj(`/refs/${id}/remove`)).then(j => take({ refs: j.refs })),
    refAsAsset: (id: string) => post<{ refs: StoreItem[], assets: StoreItem[], asset: StoreItem }>(proj('/assets'), { ref: id }).then(j => { take({ refs: j.refs, assets: j.assets }); return j.asset }),
    removeAsset: (id: string) => api<{ assets: StoreItem[] }>(proj(`/assets/${id}`), { method: 'DELETE' }).then(j => take({ assets: j.assets })),
    assetRole: (id: string, role: string) => post<{ assets: StoreItem[] }>(proj(`/assets/${id}/role`), { role }).then(j => take({ assets: j.assets })),
    assetAsRef: (id: string) => post<{ refs: StoreItem[], assets: StoreItem[], ref: StoreItem }>(proj(`/assets/${id}/reference`)).then(j => { take({ refs: j.refs, assets: j.assets }); return j.ref }),
    // a mood picked on the Brand step: the option fills the sheet (story, colours, type, voice, pictures)
    pickMood: (slug: string) => post<BrandView>(proj('/brand/pick'), { part: 'pack', id: slug }).then(view => { setMoods({ pid: pid || '', view }); take({ brand: view.brand }) }),
    useTake: (slug: string) => post(proj('/brand/pick'), { part: 'pack', id: slug }).then(() => post<StudioData>(at('/mode'), { mode: 'studio' })).then(take)
  }

  return { d, error, takes, moods: moods?.pid === pid ? moods.view : null, moodsFailed: moods?.pid === pid ? moods.failed ?? null : null, sel, select, toast, fail, kit, ctx, stateOf, steps, gone, planSections, cards, board, actions, tick, reload: load }
}
