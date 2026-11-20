// The brand sheet (docs/specs/31-brand-sheet.md; web/brand.js), the screen: a project's sheet, opened from its Studio,
// at ?room=brand&project=<id>&step=<step>. Where the person is comes from the machine (useNav); the sheet from the
// project's brand routes (server/brand.mjs), made from the project's idea as the Studio's Brand card makes it
// (web/scaffold.js). The top bar reads Home › Projects › the project › Brand sheet, the project going back to its
// Studio, and carries the one primary, Lock. Locked, the sheet goes back where it came from.
//
// A sheet opened from a chat's brief is not this screen: the screen that chat is on draws it, beside the chat
// (brand/ChatSheet.tsx, brand/source.ts sheetHost). It has no address of its own, so a reload shows that screen.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNav } from '../nav/NavProvider'
import { change, getStudio, openSheet } from './brand/api'
import { Sheet } from './brand/Sheet'
import type { SheetSource } from './brand/source'
import type { BrandView } from './brand/types'

export function BrandSheet() {
  const { view, go } = useNav()
  const project = view.project
  const [title, setTitle] = useState<string | null>(null)
  // the project's name, then its sheet (made from its idea the first time: the slow part, under the skeleton)
  const source = useMemo((): SheetSource<BrandView> | null => (project ? {
    open: () => getStudio(project).then(d => {
      setTitle(d.project?.title || d.project?.name || 'Studio')
      return openSheet(project, { brief: d.studio?.idea || '', kind: d.studio?.kind === 'app' ? 'app' : 'site' })
    }).catch(err => { setTitle(t => t ?? 'Studio'); throw err }),
    change: (what, body) => change(project, what, body)
  } : null), [project])
  const back = useCallback(() => { go({ type: 'back' }) }, [go])
  // a sheet with nothing to show (no project, and no chat's screen under it) is nowhere: back where it came from
  useEffect(() => { if (!project) go({ type: 'back' }) }, [project, go])
  if (!source) return null
  return <Sheet key={project} source={source} name={title} onBack={back} />
}
