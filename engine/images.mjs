// The image service (step 3 of the image-first boards plan, §3.8): one store for every picture the studio shows,
// page photos, generated art, stand-ins, uploads and the Assets library.
//
// - Stored by content hash, so the same picture used in fifty places is stored, resized and decoded once.
// - Capped on import: a side over 4096 px is scaled down (as Figma does); the person's own file is never touched.
// - Served on a size ladder, `/img/<hash>?w=256`: 64, 128, 256, 512, 1024, 2048, or the original. Each size is
//   made the first time it is asked for, then kept.
// - A ThumbHash (about 30 bytes) for each, sent with the board data, so a tile shows a blurred preview at once.
//
// The pixels are worked by @napi-rs/image (MIT, Rust, a prebuilt binary per platform) and the preview by
// thumbhash (MIT, plain JS). Both are pinned in engine/imagetools/package-lock.json and installed into the data
// folder the first time a picture is resized (`npm ci --ignore-scripts`: nothing is compiled, nothing runs on
// install). Until they are there, or where they cannot be, every picture is served as it is.
//
// Existing pictures move in lazily: the first time one is served by its old address, it is added to the store.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from './proc.mjs'

export const LADDER = [64, 128, 256, 512, 1024, 2048]
export const CAP = 4096
export const HASH = /^[a-f0-9]{32}$/
// the preview is made from at most 100 × 100 pixels (ThumbHash's own limit)
const PREVIEW = 100
const TOOLS = join(dirname(fileURLToPath(import.meta.url)), 'imagetools')

// the width a request gets: the next step up the ladder, or the original past the top (or past the picture)
export function rung(w, width = Infinity) {
  const n = Number(w)
  if (!Number.isFinite(n) || n <= 0) return 0
  const step = LADDER.find(s => s >= n)
  return !step || step >= width ? 0 : step
}

// the picture's type from its first bytes, never from a name
export function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.length > 11 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (buf.length > 5 && buf.toString('latin1', 0, 3) === 'GIF') return 'gif'
  return null
}
export const TYPE = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

// The libraries, from the plugin's own engine/imagetools/node_modules when a developer installed them there,
// else from the data folder, installed there once from the lockfile. `npm` is Node's own, beside its binary.
export function imageTools(dataDir, { install = true, own = true } = {}) {
  const from = dir => {
    try {
      const req = createRequire(join(dir, 'package.json'))
      const { Transformer } = req('@napi-rs/image')
      return { Transformer, thumbhash: req('thumbhash') }
    } catch { return null }
  }
  return (own && from(TOOLS)) || (async () => {
    const dir = join(dataDir, 'image-tools')
    const have = from(dir)
    if (have || !install) return have
    mkdirSync(dir, { recursive: true })
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(TOOLS, f), join(dir, f))
    const args = ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev']
    await new Promise((ok, fail) => {
      const cli = npmCli()
      const done = err => (err ? fail(err) : ok())
      // npm's own script, run by this Node: no shell, the same on Windows, macOS and Linux
      if (cli) execFile(process.execPath, [cli, ...args], { cwd: dir, timeout: 300000, maxBuffer: 1 << 24 }, done)
      else execFile('npm', args, { cwd: dir, timeout: 300000, maxBuffer: 1 << 24, shell: process.platform === 'win32' }, done)
    })
    return from(dir)
  })()
}

// npm's own entry, beside the Node that runs the studio (Windows keeps it next to node.exe, macOS and Linux
// under lib/)
const npmCli = (exe = process.execPath) => [join(dirname(exe), 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(dirname(exe), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find(f => existsSync(f))

export function makeImages({ dataDir, tools = () => imageTools(dataDir), now = Date.now }) {
  const root = join(dataDir, 'images')
  const at = (hash, name) => join(root, hash.slice(0, 2), name)
  const metaOf = hash => { try { return JSON.parse(readFileSync(at(hash, `${hash}.json`), 'utf8')) } catch { return null } }
  // the old addresses already moved in: a file's path, size and time → its hash, so a changed file moves again
  const pathsFile = join(root, 'paths.json')
  let paths = null
  const known = () => (paths ||= (() => { try { return new Map(Object.entries(JSON.parse(readFileSync(pathsFile, 'utf8')))) } catch { return new Map() } })())
  let saving = null
  const savePaths = () => {
    clearTimeout(saving)
    saving = setTimeout(() => { mkdirSync(root, { recursive: true }); writeAtomic(pathsFile, JSON.stringify(Object.fromEntries(known()))) }, 500)
    saving.unref?.()
  }

  // the libraries: asked for once, again ten minutes after a failed install
  let lib = null, failedAt = 0
  const libs = async () => {
    if (lib) return lib
    if (failedAt && now() - failedAt < 10 * 60e3) return null
    const t = await Promise.resolve(tools()).catch(() => null)
    if (t) lib = t; else failedAt = now()
    return t
  }

  // one picture worked at a time: a 4096 px picture is 64 MB decoded, and the server keeps its memory low
  let queue = Promise.resolve()
  const one = job => { const p = queue.then(job, job); queue = p.catch(() => {}); return p }
  const busy = new Map()
  const once = (key, job) => { if (!busy.has(key)) busy.set(key, one(job).finally(() => busy.delete(key))); return busy.get(key) }

  // Add a picture: its hash, size and preview. The same bytes are stored once, however often they are added.
  async function add(buf) {
    const type = sniff(buf)
    if (!type) return null
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 32)
    const have = metaOf(hash)
    if (have) return have
    return once(`add:${hash}`, async () => {
      const again = metaOf(hash)
      if (again) return again
      const t = await libs()
      mkdirSync(dirname(at(hash, hash)), { recursive: true })
      if (!t || type === 'gif') {
        // kept as it is, without sizes or a preview until the libraries are there (a gif keeps its frames)
        writeAtomic(at(hash, `${hash}.${type}`), buf)
        if (!t) return { hash, type, w: null, h: null, th: null, worked: false }
        const meta = { hash, type, w: null, h: null, th: null }
        writeAtomic(at(hash, `${hash}.json`), JSON.stringify(meta))
        return meta
      }
      const img = new t.Transformer(buf)
      const { width, height } = await img.metadata()
      let out = buf, w = width, h = height
      if (Math.max(width, height) > CAP) {
        const k = CAP / Math.max(width, height)
        w = Math.round(width * k); h = Math.round(height * k)
        const big = new t.Transformer(buf).resize(w, h)
        out = type === 'png' ? await big.png() : type === 'webp' ? await big.webp(90) : await big.jpeg(90)
      }
      writeAtomic(at(hash, `${hash}.${type}`), out)
      const meta = { hash, type, w, h, th: await preview(t, out, w, h) }
      writeAtomic(at(hash, `${hash}.json`), JSON.stringify(meta))
      return meta
    })
  }

  async function preview(t, buf, w, h) {
    const k = PREVIEW / Math.max(w, h)
    const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k))
    const rgba = await new t.Transformer(buf).resize(pw, ph).rawPixels()
    if (rgba.length !== pw * ph * 4) return null
    return Buffer.from(t.thumbhash.rgbaToThumbHash(pw, ph, rgba)).toString('base64')
  }

  // A file the studio already serves by its old address: into the store the first time, by its hash after
  async function addFile(file) {
    let st
    try { st = statSync(file) } catch { return null }
    const key = `${file}|${st.size}|${Math.round(st.mtimeMs)}`
    const hash = known().get(key)
    if (hash) { const m = metaOf(hash); if (m) return m }
    const meta = await add(readFileSync(file))
    if (meta && meta.worked !== false) { known().set(key, meta.hash); savePaths() }
    return meta
  }
  // what is known of a file without reading it: its hash and preview once it has been served
  function lookup(file) {
    try {
      const st = statSync(file)
      const hash = known().get(`${file}|${st.size}|${Math.round(st.mtimeMs)}`)
      return hash ? metaOf(hash) : null
    } catch { return null }
  }

  // A picture at a rung of the ladder: { file, type }. The original when w is past it, or nothing can resize.
  async function sized(hash, w) {
    if (!HASH.test(hash)) return null
    let meta = metaOf(hash)
    if (!meta) {
      // kept before the libraries were there: worked now
      const raw = ['png', 'jpeg', 'webp', 'gif'].map(x => at(hash, `${hash}.${x}`)).find(f => existsSync(f))
      if (!raw) return null
      // its name is the hash of its bytes, so adding them again finds the same picture
      meta = (await libs()) ? await add(readFileSync(raw)) : { hash, type: raw.split('.').pop(), w: null }
      if (!meta) return null
    }
    const original = { file: at(hash, `${hash}.${meta.type}`), type: TYPE[meta.type] }
    const step = rung(w, meta.w ?? Infinity)
    if (!step || meta.type === 'gif' || !meta.w) return original
    const file = at(hash, `${hash}-${step}.webp`)
    if (existsSync(file)) return { file, type: 'image/webp' }
    const t = await libs()
    if (!t) return original
    await once(`size:${hash}:${step}`, async () => {
      if (existsSync(file)) return
      const h = Math.max(1, Math.round(meta.h * step / meta.w))
      writeAtomic(file, await new t.Transformer(readFileSync(original.file)).resize(step, h).webp(82))
    })
    return { file, type: 'image/webp' }
  }
  // the ladder for a picture's address, for an <img srcset>: each rung below the picture's own width
  const srcset = (src, width = Infinity) => LADDER.filter(s => s < width).map(s => `${src}${src.includes('?') ? '&' : '?'}w=${s} ${s}w`).join(', ')

  return { add, addFile, lookup, sized, srcset, meta: metaOf, dir: root }
}

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

// Generated pages ask for their pictures at the size they show: every <img> whose address the studio serves
// (/img/…) gets the ladder as srcset, and sizes="100vw" unless it says its own. Nothing else in the page changes:
// it stays sandboxed, and an <img> that already has a srcset keeps it.
export function withSrcset(html) {
  return String(html).replace(/<img\b[^>]*>/gi, tag => {
    if (/\ssrcset\s*=/i.test(tag)) return tag
    const src = /\ssrc\s*=\s*(["'])(\/img\/[^"'?#\s]+)\1/i.exec(tag)?.[2]
    if (!src || !/^\/img\/(?:[a-f0-9]{32}|[\w-]{1,64}\/[\w.-]{1,120})$/.test(src)) return tag
    const set = LADDER.map(s => `${src}?w=${s} ${s}w`).join(', ')
    const sizes = /\ssizes\s*=/i.test(tag) ? '' : ' sizes="100vw"'
    return tag.replace(/\s*\/?>$/, m => ` srcset="${set}"${sizes}${m.trim() === '/>' ? ' />' : '>'}`)
  })
}
