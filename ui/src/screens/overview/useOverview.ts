// The Overview's data, as web/project.js load() gets it: the open version's board, the project it belongs to, and
// that project's uploads and references, looked at again often while something is happening and rarely when
// nothing is. Which version is open is the machine's (useNav().view.version); this only fetches what it names, and
// an answer for a version that is no longer open is dropped, never drawn over the new one.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNav } from '../../nav/NavProvider'
import { api } from './api'
import { moveAfterLoad, pollMs, projectOf, type Board, type Project, type Ref, type Upload } from './model'

export interface OverviewData {
  run: string | null
  board: Board | null
  project: Project | null
  uploads: Upload[]
  refs: Ref[]
  // the version on screen has answered (false while it loads, and for a version just opened)
  ready: boolean
  error: string | null
}

const EMPTY: OverviewData = { run: null, board: null, project: null, uploads: [], refs: [], ready: false, error: null }
const enc = encodeURIComponent

export function useOverview() {
  const { view, go } = useNav()
  const run = view.version
  const [data, setData] = useState<OverviewData>(EMPTY)
  const openRun = useRef(run)
  openRun.current = run
  // a game still being built opens on its build once per version opened here (web/project.js P.toGame)
  const seenGame = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const load = useCallback(async () => {
    clearTimeout(timer.current)
    if (!run) { setData({ ...EMPTY, ready: true }); return }
    try {
      const [board, list] = await Promise.all([
        api<Board>(`/api/runs/${enc(run)}/board`),
        api<{ projects: Project[] }>('/api/projects').catch(() => null)
      ])
      if (openRun.current !== run) return
      const project = projectOf(list?.projects || [], run, view.project)
      const move = moveAfterLoad(board, project, run, seenGame.current.has(run))
      seenGame.current.add(run)
      if (move) { go(move); return }
      const pid = view.project || project?.id || null
      const [files, refs] = pid ? await Promise.all([
        api<{ files: Upload[] }>(`/api/projects/${enc(pid)}/files`).catch(() => ({ files: [] })),
        api<{ refs: Ref[] }>(`/api/projects/${enc(pid)}/refs`).catch(() => ({ refs: [] }))
      ]) : [{ files: [] }, { refs: [] }]
      if (openRun.current !== run) return
      setData({ run, board, project, uploads: files.files || [], refs: refs.refs || [], ready: true, error: null })
      timer.current = setTimeout(() => { void load() }, pollMs(board))
    } catch (err) {
      if (openRun.current !== run) return
      setData(d => ({ ...(d.run === run ? d : EMPTY), run, ready: true, error: String((err as Error).message || err) }))
    }
  }, [run, view.project, go])

  useEffect(() => {
    setData(d => (d.run === run ? d : { ...EMPTY, run }))
    void load()
    return () => clearTimeout(timer.current)
  }, [load, run])

  const pid = view.project || data.project?.id || null
  return { ...data, pid, reload: load, setUploads: (uploads: Upload[]) => setData(d => ({ ...d, uploads })), setRefs: (refs: Ref[]) => setData(d => ({ ...d, refs })) }
}
