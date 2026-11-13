// Export (web/canvas/design.js exportRunNow, showExport): the build as files on this computer, the HTML pages, a
// React project and an app builder's spec, with the folder they went to and the .zip to download.
import { useEffect, useState } from 'react'
import { LinkButton } from '../../primitives/Button'
import { Dialog } from '../../primitives/Dialog'
import { exportRun, zipUrl } from './publish'
import { doneSections, type DeckModel } from './model'

export function ExportDialog({ model, isOpen, onOpenChange }: { model: DeckModel, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
  const [state, setState] = useState<{ busy: boolean, error: string, out: { pages: number, sections: number, dir: string, zip: boolean } | null }>({ busy: false, error: '', out: null })
  // opening the dialog exports the build as it is now
  useEffect(() => {
    if (!isOpen || !model.run) return
    let on = true
    setState({ busy: true, error: '', out: null })
    exportRun(model.run, doneSections(model)).then(
      o => on && setState({ busy: false, error: '', out: { pages: o.pages, sections: o.sections, dir: o.dir, zip: !!o.zip } }),
      (e: unknown) => on && setState({ busy: false, error: e instanceof Error ? e.message : String(e), out: null })
    )
    return () => { on = false }
  // the build as it is when the dialog opens; a later section is in the next export
  }, [isOpen, model.run])
  const out = state.out
  return (
    <Dialog title={out ? 'Exported, ready' : 'Export'} isOpen={isOpen} onOpenChange={onOpenChange}>
      {state.busy && <p role="status" aria-busy="true">Exporting the pages…</p>}
      {state.error && <p role="alert"><b className="text-hot-text">Not exported</b> · {state.error}</p>}
      {out && (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt className="font-semibold">html/</dt><dd className="text-muted">{out.pages} pages, open index.html</dd>
            <dt className="font-semibold">react/</dt><dd className="text-muted">{out.sections} section components · Vite + Tailwind · <code>npm i && npm run dev</code></dd>
            <dt className="font-semibold">aba/</dt><dd className="text-muted">spec.md + blueprint.json for an app builder</dd>
          </dl>
          <p className="break-all text-muted">{out.dir}</p>
          {out.zip && <div className="flex justify-end"><LinkButton role="primary" href={zipUrl(model.run!)} download>Download .zip</LinkButton></div>}
        </div>
      )}
    </Dialog>
  )
}
