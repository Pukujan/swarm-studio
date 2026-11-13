// The Studio first's data and its rules, ported from web/scaffold.js (spec 37, spec 42): the project's studio
// record, brand, references and assets from /api/studio/:pid; each step's state from what is there (unless skipped),
// and the record kept in step with it; the kit for the kind; Three takes; uploads. The selection is the screen's:
// selecting a card moves the address to its step (the machine's studio.step), never a copy of it here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KITS, type Kit, type KitCard, type KitCtx, type StoreItem, type Studio } from '../../legacy'
import { useNav } from '../../nav/NavProvider'
import { json, useFetch } from './source'

export const STEP_NAME: Record<string, string> = { brand: 'Brand', references: 'References', assets: 'Assets', plan: 'Plan', proposal: 'Lock' }
export const TAKES = 3

export interface Palette { bg: string, text: string, accent: string, link: string }
export interface Pack { slug: string, name: string, why?: string, for?: string, palette: Palette, type: { heading: string, body: string }, voice?: { lines?: string[] }, pictures?: { photos?: { url: string }[] } }
interface Brand { lockedAt?: unknown, palettes?: (Palette & { id: string })[], types?: { id: string, heading: string, body: string }[], pick?: { palette?: string, type?: string } }
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
  const sw = useMemo(() => ({ api: fetcher, esc, base: window.SWARM?.base || '', say: (text: string) => fail(text) }), [fetcher, fail])

  const select = useCallback((key: string | null) => {
    setSel(key)
    const cur = dRef.current
    if (!key || !cur) return
    // the step it is in is where the person is (the address follows)
    const step = key.startsWith('step:') ? key.slice(5) : key === 'brand:open' ? 'brand' : key.startsWith('ref:') ? 'references' : key.startsWith('asset:') ? 'assets' : key.startsWith('lock:') ? 'proposal' : key.startsWith('take:') ? null : 'plan'
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
    if (step === 'proposal') return cur.studio.locked ? 'done' : cur.studio.proposal ? 'started' : 'empty'
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
      // a kit that loads or drafts its own state does it once, before its cards are drawn
      const k = KITS[got.studio.kind] || KITS.site
      if (k.prepare && prepared.current !== pid && got.studio.idea) { prepared.current = pid; await k.prepare(ctx()); setTick(t => t + 1) }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }, [pid, api, post, fail])

  useEffect(() => { setD(null); setSel(null); setTakes(null); prepared.current = null; void load() }, [pid, load])

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
        const q = `?name=${encodeURIComponent(f.name)}&source=upload`
        try {
          const j = await api<{ refs?: StoreItem[], assets?: StoreItem[] }>(proj(to === 'asset' ? `/assets${q}` : `/refs${q}`), { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f })
          take(to === 'asset' ? { assets: j.assets } : { refs: j.refs })
        } catch (err) { fail(err) }
      }
    },
    removeRef: (id: string) => post<{ refs: StoreItem[] }>(proj(`/refs/${id}/remove`)).then(j => take({ refs: j.refs })),
    refAsAsset: (id: string) => post<{ refs: StoreItem[], assets: StoreItem[], asset: StoreItem }>(proj('/assets'), { ref: id }).then(j => { take({ refs: j.refs, assets: j.assets }); return j.asset }),
    removeAsset: (id: string) => api<{ assets: StoreItem[] }>(proj(`/assets/${id}`), { method: 'DELETE' }).then(j => take({ assets: j.assets })),
    assetRole: (id: string, role: string) => post<{ assets: StoreItem[] }>(proj(`/assets/${id}/role`), { role }).then(j => take({ assets: j.assets })),
    assetAsRef: (id: string) => post<{ refs: StoreItem[], assets: StoreItem[], ref: StoreItem }>(proj(`/assets/${id}/reference`)).then(j => { take({ refs: j.refs, assets: j.assets }); return j.ref }),
    useTake: (slug: string) => post(proj('/brand/pick'), { part: 'pack', id: slug }).then(() => post<StudioData>(at('/mode'), { mode: 'studio' })).then(take)
  }

  return { d, error, takes, sel, select, toast, fail, kit, ctx, stateOf, steps, gone, planSections, cards, board, actions, tick, reload: load }
}
