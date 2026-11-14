// @ts-check
// A page's picture, taken inside the page (docs/specs/36-overview-speed.md, image-first boards §3.7). A generated page
// is sandboxed with allow-scripts and no same-origin, so nothing outside can read it: the frame photographs its own
// document (web/frame.html `capture`, with snapDOM, web/vendor/snapdom/) at the largest size asked for, and posts out
// one ImageBitmap, transferred, not copied. A worker makes every size's JPEG from it with
// createImageBitmap({ resizeWidth, resizeHeight }) and OffscreenCanvas.convertToBlob(), off the main thread, and
// closes every bitmap it is given or makes. Used by the current Studio (web/canvas/marks.js snapFrame, web/project.js)
// and the next UI alike.
//
//   const cap = makeCapture({ base })
//   const out = await cap.shoot(frame.contentWindow, { scales: [0.25, 0.6] })
//   // { width, height, jpegs: Map(scale → Blob), ms: { page, resize, total } }

// the page is photographed this long at most: the Overview shows a page nine widths long (web/project.js pageH)
export const MAX_HEIGHT = 9 * 1280
export const LIB = 'vendor/snapdom/snapdom.js'

// The worker's whole program, sent as its source: { seq, bitmap, sizes: [{ w, h }], quality } in, a JPEG Blob per
// size out. A size equal to the bitmap's own is encoded straight from it.
function workerMain() {
  // the worker's own scope (this file is checked as a page script)
  const me = /** @type {any} */ (self)
  me.onmessage = async e => {
    const { seq, bitmap, sizes, quality } = e.data
    const t0 = performance.now()
    try {
      const blobs = []
      for (const { w, h } of sizes) {
        const same = w === bitmap.width && h === bitmap.height
        const b = same ? bitmap : await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
        const c = new OffscreenCanvas(w, h)
        c.getContext('2d').drawImage(b, 0, 0)
        blobs.push(await c.convertToBlob({ type: 'image/jpeg', quality }))
        if (!same) b.close()
      }
      me.postMessage({ seq, ok: true, blobs, ms: performance.now() - t0 })
    } catch (err) {
      me.postMessage({ seq, ok: false, error: String(err && err.message || err) })
    } finally { bitmap.close() }
  }
}

// the same work on the main thread, for a document that may not start a worker
async function resizeHere(bitmap, sizes, quality) {
  const t0 = performance.now()
  try {
    const blobs = []
    for (const { w, h } of sizes) {
      const same = w === bitmap.width && h === bitmap.height
      const b = same ? bitmap : await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
      const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
      c.getContext('2d').drawImage(b, 0, 0)
      blobs.push(c instanceof OffscreenCanvas ? await c.convertToBlob({ type: 'image/jpeg', quality }) : await new Promise(ok => c.toBlob(ok, 'image/jpeg', quality)))
      if (!same) b.close()
    }
    return { blobs, ms: performance.now() - t0 }
  } finally { bitmap.close() }
}

// the size of a picture at `scale` of a page `width` × `height` (a page is photographed at its largest scale)
export const sizeAt = (width, height, scale) => ({ w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) })

/** @param {Blob} blob @returns {Promise<string>} */
export const dataUrl = blob => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(blob) })

/**
 * @param {{ base?: string, quality?: number, timeout?: number }} [options]
 */
export function makeCapture({ base = '', quality = 0.82, timeout = 30000 } = {}) {
  let seq = 0
  /** @type {Promise<string> | null} */
  let lib = null
  /** @type {Worker | null | false} */
  let worker = null
  const waits = new Map()
  // the library's text, from the plugin's own server, once (it is served with CORS open: server.mjs sendFile)
  const libText = () => (lib ||= fetch(`${base}/${LIB}`).then(r => { if (!r.ok) throw new Error(`the capture library did not load (HTTP ${r.status})`); return r.text() }).catch(err => { lib = null; throw err }))

  const startWorker = () => {
    if (worker !== null) return worker
    try {
      const url = URL.createObjectURL(new Blob([`(${workerMain})()`], { type: 'text/javascript' }))
      worker = new Worker(url)
      worker.onmessage = e => { const w = waits.get(e.data.seq); if (w) { waits.delete(e.data.seq); w(e.data) } }
      worker.onerror = () => { worker = false }
    } catch { worker = false }
    return worker
  }
  const resize = (bitmap, sizes) => {
    const w = startWorker()
    if (!w) return resizeHere(bitmap, sizes, quality)
    const n = ++seq
    return new Promise((ok, fail) => {
      waits.set(n, out => (out.ok ? ok(out) : fail(new Error(out.error))))
      w.postMessage({ seq: n, bitmap, sizes, quality }, [bitmap])
    })
  }

  // one request into a frame and its one answer; `lib` goes along when the frame has said it has none yet
  const ask = (win, msg) => new Promise((ok, fail) => {
    const n = `cap${++seq}`
    const onMessage = e => {
      if (e.source !== win || e.data?.type !== 'capture' || e.data.seq !== n) return
      removeEventListener('message', onMessage); clearTimeout(t)
      ok(e.data)
    }
    const t = setTimeout(() => { removeEventListener('message', onMessage); fail(new Error('the picture timed out')) }, timeout)
    addEventListener('message', onMessage)
    win.postMessage({ ...msg, type: 'capture', seq: n }, '*')
  })

  return {
    /**
     * Photographs the page in `win` once, at the largest of `scales`, and makes a JPEG at each.
     * `fit` caps the largest picture's height in px, lowering every scale alike (the reviewer's whole page).
     * @param {Window} win @param {{ scales?: number[], maxHeight?: number, fit?: number }} [opts]
     */
    async shoot(win, { scales = [0.25], maxHeight = MAX_HEIGHT, fit = 0 } = {}) {
      const t0 = performance.now()
      const top = Math.max(...scales)
      let out = await ask(win, { scale: top, maxHeight, fit })
      if (out.need === 'lib') out = await ask(win, { scale: top, maxHeight, fit, lib: await libText() })
      if (!out.ok) throw new Error(out.error || 'the page could not be photographed')
      /** @type {ImageBitmap} */
      const bitmap = out.bitmap
      // the page's own size, from what it photographed; the bitmap is the page at out.scale, and each other size
      // keeps its ratio to the largest
      const width = out.width, height = out.height, k = out.scale / top
      const sizes = scales.map(s => (s === top ? { w: bitmap.width, h: bitmap.height } : sizeAt(width, height, s * k)))
      const done = await resize(bitmap, sizes)
      const jpegs = new Map(scales.map((s, i) => [s, done.blobs[i]]))
      return { width, height, scale: out.scale, jpegs, ms: { page: out.ms, resize: done.ms, total: performance.now() - t0 } }
    },
    // the worker goes when nothing will be photographed any more
    close() { if (worker) worker.terminate(); worker = null }
  }
}
