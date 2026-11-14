// The Layers tab: a project's pages and each page's sections. In the current Studio this is one tree shared by the
// Studio scaffold, the Design deck and the Overview (#416, web/layers.js), and its React version comes with the
// Studio's port (feat/port-studio). Until then this stand-in draws the same pages and their planned sections from
// the board, behind the interface the shared one will take, so swapping it is one import.
import { Icon } from '../../primitives/Icon'
import { planOf, shortTitle, type Page } from './model'

export interface Layers {
  pages: Page[]
  // the page whose artboard is selected, if any
  page: string | null
  onPickPage: (page: string) => void
}

export function LayersPanel({ pages, page, onPickPage }: Layers) {
  if (!pages.length) return <p className="m-0 px-4 py-3 font-monospace text-xs text-dim">No pages yet</p>
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Layers">
      {pages.map(p => (
        <div key={p.id} className="mt-1">
          <button type="button" aria-current={page === p.id || undefined} onClick={() => onPickPage(p.id)}
            className={`ov-row w-full ${page === p.id ? 'on' : ''}`}>
            <Icon name="site" size={14} /><span className="min-w-0 flex-1 truncate">{shortTitle(p.title) || p.id}</span>
          </button>
          {page === p.id && planOf(p).map(l => (
            <div key={l.id} className="flex h-8 items-center gap-2 pl-9 font-monospace text-xs text-muted">
              <Icon name="frame" size={12} /><span className="truncate">{l.role || l.id}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
