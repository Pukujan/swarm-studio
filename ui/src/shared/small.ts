// A picture at the size it is drawn (web/ui.js small): a small webp copy, its long side at most `max` px, made once
// per picture and size and kept. A big picture is decoded only to make the copy, so a row of thumbnails never holds
// full-size pictures. Until the copy is ready the hook answers '' (the tile shows nothing rather than the big one).
import { useEffect, useState } from 'react'

const made = new Map<string, string | Promise<string>>()
// one copy is made at a time: each decodes a full picture, and a dozen at once stalls the page
let queue: Promise<unknown> = Promise.resolve()

async function copy(src: string, max: number): Promise<string> {
  const im = new Image()
  im.decoding = 'async'
  im.src = src
  await im.decode()
  const nw = im.naturalWidth, nh = im.naturalHeight
  const s = Math.min(1, max / Math.max(nw, nh))
  if (s >= 1) return src // already small: kept as it is
  const w = Math.max(1, Math.round(nw * s)), h = Math.max(1, Math.round(nh * s))
  const bmp = await createImageBitmap(im, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
  im.src = ''
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  cv.getContext('2d')?.drawImage(bmp, 0, 0)
  bmp.close()
  const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/webp', 0.86))
  cv.width = cv.height = 0
  return blob ? URL.createObjectURL(blob) : src
}

function small(src: string, max: number): string | Promise<string> {
  const k = `${max}|${src}`
  const have = made.get(k)
  if (have) return have
  const p = (queue = queue.catch(() => {}).then(() => copy(src, max))).then(u => u as string, () => src).then(url => { made.set(k, url); return url })
  made.set(k, p)
  return p
}

export function useSmall(src: string | null | undefined, max = 256): string {
  const now = src ? made.get(`${max}|${src}`) : ''
  const [url, setUrl] = useState(typeof now === 'string' ? now : '')
  useEffect(() => {
    if (!src) return setUrl('')
    const s = small(src, max)
    if (typeof s === 'string') return setUrl(s)
    let live = true
    setUrl('')
    void s.then(u => { if (live) setUrl(u) })
    return () => { live = false }
  }, [src, max])
  return url
}
