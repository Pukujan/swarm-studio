// Scribble on the Overview (spec 29; web/project.js, moved as it is): the tool in hand, the marks not sent yet, what
// Eraser and Clear took (⌘Z brings it back until the marks are sent), and what the run says about the marks it has
// and the drafts the crew made from them. Sending goes with the chat's words (overview/OverviewChat.tsx).
//
// What a mark points at is found as the current Studio finds it (web/markanchor.js, run in a hidden copy of the
// page, sandboxed with scripts only): the section, and the element in it. A mark sent before that answer has come
// goes without it, and the crew read the picture alone.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ANCHOR_JS } from '@studio/markanchor'
import { doneSections, fold, type DeckModel } from '../deck/model'
import { pageDoc } from '../deck/playdoc'
import { DeckSourceContext } from '../deck/source'
import { post, said } from './api'
import { MARK_MAX, NO_MARKS, markFrom, markWords, runMarks, shotsOf, type Box, type Mark, type Pt, type RunMarks, type Target } from './scribble'

export type Tool = 'move' | 'scribble' | 'eraser'
type Say = { you: (text: string) => void, bot: (text: string) => void }
const enc = encodeURIComponent
const nothing = (why: string) => `Nothing happened: ${(why || 'the studio server is not answering').replace(/\.$/, '')}.`

// a hidden copy of the page at desktop width; ANCHOR_JS runs in it once it has loaded and answers by message
let seq = 0
function anchorIn(doc: string, box: Box, timeout = 30000): Promise<Record<string, unknown> | null> {
  const id = `mk${++seq}`
  const script = `<script>addEventListener('load', async () => {
  if (document.fonts) await document.fonts.ready
  await new Promise(r => setTimeout(r, 700))
  let out = {}
  try { out = (${ANCHOR_JS})(${JSON.stringify(box)}) } catch (err) { out = { error: String(err && err.message || err) } }
  parent.postMessage({ type: 'mark-anchor', seq: ${JSON.stringify(id)}, out }, '*')
})<\/script>`
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0;pointer-events:none'
  return new Promise(resolve => {
    const done = (out: Record<string, unknown> | null) => { clearTimeout(timer); removeEventListener('message', heard); frame.remove(); resolve(out) }
    const heard = (e: MessageEvent) => {
      const d = e.data as { type?: string, seq?: string, out?: Record<string, unknown> } | null
      if (e.source === frame.contentWindow && d?.type === 'mark-anchor' && d.seq === id) done(d.out && !d.out.error ? d.out : null)
    }
    const timer = setTimeout(() => done(null), timeout)
    addEventListener('message', heard)
    frame.srcdoc = doc.replace(/<\/body>/i, `${script}</body>`)
    document.body.append(frame)
  })
}

export function useScribble(run: string | null, { toast, hosted = false }: { toast: (text: string, opts?: { icon?: string, action?: string, onAction?: () => void }) => void, hosted?: boolean }) {
  const source = useContext(DeckSourceContext)
  const [tool, setToolState] = useState<Tool>('move')
  const [marks, setMarks] = useState<Mark[]>([])
  const [of, setOf] = useState<RunMarks>(NO_MARKS)
  const [busy, setBusy] = useState(false)
  const undo = useRef<Mark[][]>([])
  const n = useRef(0)
  // the build as a page copy needs it, read when a mark first asks and again before a send
  const read = useRef<{ run: string, m: Promise<DeckModel | null> } | null>(null)
  const model = useCallback((fresh = false) => {
    if (!run) return Promise.resolve(null)
    if (fresh || read.current?.run !== run) read.current = { run, m: source.events(run).then(ev => fold(ev, run), () => null) }
    return read.current.m
  }, [run, source])

  // another version: its own marks, and nothing left in hand from the last one
  useEffect(() => { setMarks([]); undo.current = []; setOf(NO_MARKS); setToolState('move'); read.current = null }, [run])

  // what the run has: its events, then the stream
  useEffect(() => {
    if (!run) return
    let live = true
    const late: Parameters<typeof runMarks>[1][] = []
    let ready = false
    const stop = source.stream?.(e => {
      if (e.run !== run) return
      if (!ready) { late.push(e); return }
      setOf(was => runMarks(was, e))
    })
    source.events(run).then(events => {
      if (!live) return
      setOf([...events, ...late].reduce(runMarks, NO_MARKS))
      ready = true
    }, () => { ready = true })
    return () => { live = false; stop?.() }
  }, [run, source])

  const setTool = useCallback((t: Tool) => setToolState(was => (was === t && t !== 'move' ? 'move' : t)), [])

  // a drag on a page ended: the mark, with what it points at when that is found
  const draw = useCallback((page: string, pts: Pt[], shift: boolean): Mark | null => {
    if (!run) { toast('Build it first'); return null }
    const made = markFrom(pts, shift)
    if (!made) return null
    if (marks.length >= MARK_MAX) { toast(`${MARK_MAX} marks at most: send these first`); return null }
    const m: Mark = { id: `k${++n.current}`, run, page, ...made, note: '', target: null }
    setMarks(all => [...all, m])
    void model().then(dm => (dm && dm.pages.some(p => p.id === page) ? anchorIn(pageDoc(dm, page), m.box).then(out => ({ dm, out })) : null)).then(got => {
      if (!got?.out) return
      const { dm, out } = got, layer = typeof out.layer === 'string' ? out.layer : null
      const target: Target = {
        section: layer ? (dm.layers[`${page}/${layer}`] ? `${page}/${layer}` : `*/${layer}`) : null,
        selector: typeof out.selector === 'string' ? out.selector : null, path: Array.isArray(out.path) ? out.path as number[] : [],
        text: typeof out.text === 'string' ? out.text : null, tag: typeof out.tag === 'string' ? out.tag : null, region: (out.region as Box | undefined) || null
      }
      setMarks(all => all.map(x => (x.id === m.id ? { ...x, target } : x)))
    }).catch(() => {})
    return m
  }, [run, marks.length, model, toast])

  const note = useCallback((id: string, text: string) => setMarks(all => all.map(m => (m.id === id ? { ...m, note: text.trim().slice(0, 200) } : m))), [])

  const undoLast = useCallback(() => {
    const back = undo.current.pop()
    if (!back) return false
    setMarks(all => [...all, ...back])
    return true
  }, [])
  // Eraser: an unsent mark goes (⌘Z brings it back); a sent one is closed on the run, so it is never sent again
  const erase = useCallback((id: string, sent: boolean) => {
    if (sent) { if (run) post(`/api/runs/${enc(run)}/marks/${enc(id)}/erase`, {}).catch(() => toast('That mark could not be erased')); return }
    const m = marks.find(x => x.id === id)
    if (!m) return
    undo.current.push([m])
    setMarks(all => all.filter(x => x.id !== id))
  }, [run, marks, toast])
  const clear = useCallback(() => {
    if (!marks.length) return
    undo.current.push(marks)
    setMarks([])
    toast('Marks cleared', { icon: 'trash', action: 'Undo', onAction: () => { undoLast() } })
  }, [marks, toast, undoLast])

  // S and E take the tools; ⌘Z while one is out brings back what Eraser or Clear took
  useEffect(() => {
    if (hosted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (tool === 'move' || !undo.current.length) return
        e.preventDefault(); e.stopImmediatePropagation()
        undoLast()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if (e.key === 's' || e.key === 'e') { e.preventDefault(); setTool(e.key === 's' ? 'scribble' : 'eraser') }
      else if (e.key === 'v' || (e.key === 'Escape' && tool !== 'move')) { if (e.key === 'Escape') e.preventDefault(); setToolState('move') }
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [hosted, tool, setTool, undoLast])

  // Send: the words, the marks, each marked page's picture with them drawn on it, a crop round each, and the
  // build's sections (POST /api/runs/<run>/comment, as web/canvas/hook.js marks.send). The crew answer with drafts.
  const send = useCallback(async (text: string, say: Say, picture: (page: string) => string | null | undefined) => {
    if (!run || busy || !marks.length) return false
    const list = marks
    setBusy(true)
    say.you(text || markWords(list.length))
    try {
      const [{ shots, crops }, dm] = await Promise.all([shotsOf(list, picture), model(true)])
      const sections = dm ? doneSections(dm).map(s => ({ ...s, role: dm.layers[s.key]?.role })) : []
      const out = await post<{ reply?: string }>(`/api/runs/${enc(run)}/comment`, {
        text, marks: list.map(({ id, kind, page, box, pts, note: nt, target }) => ({ id, kind, page, box, pts, note: nt, target })), shots, crops, sections
      })
      setMarks(all => all.filter(m => !list.includes(m)))
      undo.current = []
      say.bot(out.reply || 'On it.')
      return true
    } catch (err) {
      // the server's own reason; a request that never reached it has none of its own
      say.bot(nothing(err instanceof TypeError ? '' : said(err)))
      return false
    } finally { setBusy(false) }
  }, [run, busy, marks, model])

  // a draft is kept (it takes its section's place) or let go
  const closeDraft = useCallback((id: string, accept: boolean) => {
    if (!run) return Promise.resolve(false)
    return post(`/api/runs/${enc(run)}/drafts/${enc(id)}/${accept ? 'accept' : 'dismiss'}`, {}).then(() => true, () => false)
  }, [run])

  const sent = useMemo(() => of.sent.filter(m => m.status === 'open'), [of.sent])
  return { tool, setTool, marks, sent, reads: of.reads, drafts: of.drafts, drafting: of.drafting, busy, draw, note, erase, clear, undo: undoLast, send, closeDraft, model }
}
