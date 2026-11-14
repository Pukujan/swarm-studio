// The photos a board paints its resting pages with. Today they are the Overview's saved snapshots (spec 36,
// server/snaps.mjs): two sizes per page version, small (`s`, a quarter of the page's width) and full (`f`). The image
// service (architecture §3.8) will add the whole power-of-two ladder; until then a size the tier manager asks for is
// served by the nearest of the two. A story gives its own source.
import { createContext, useContext, useEffect, useState } from 'react'

export interface PagePhoto { s?: string, f?: string }
export interface PhotoSource { pages(run: string): Promise<Record<string, PagePhoto>> }

// the two widths the snapshots come in, for a page 1280 wide
export const SNAP_W = { s: 320, f: 1280 }

export const serverPhotos: PhotoSource = {
  async pages(run) {
    const r = await fetch(`/api/runs/${encodeURIComponent(run)}/snaps`, { headers: { 'x-swarm-token': window.SWARM?.token ?? '' } })
    if (!r.ok) return {}
    return ((await r.json()) as { pages?: Record<string, PagePhoto> }).pages ?? {}
  }
}

export const PhotoSourceContext = createContext<PhotoSource>(serverPhotos)

// the build's saved photos, asked for again when `again` changes (a section done, a page dropping from live)
export function usePhotos(run: string | null, again: unknown = 0): Record<string, PagePhoto> {
  const source = useContext(PhotoSourceContext)
  const [photos, setPhotos] = useState<Record<string, PagePhoto>>({})
  useEffect(() => {
    if (!run) { setPhotos({}); return }
    let live = true
    source.pages(run).then(p => { if (live) setPhotos(p) }).catch(() => {})
    return () => { live = false }
  }, [run, source, again])
  return photos
}

// the photo for a size: the small one up to its width, else the full one, else whichever there is
export const photoFor = (p: PagePhoto | undefined, px: number) => (!p ? undefined : px <= SNAP_W.s ? p.s ?? p.f : p.f ?? p.s)
