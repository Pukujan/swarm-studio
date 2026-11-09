// The Auto show's small helpers (spec 07): a QR code encoder for the summary card's live
// link, and the share pages the launch kit's Post buttons open. A classic script
// (window.SwarmShow), like crew.js, so it works inlined or on its own. No network calls.
;(function () {
  // ---------- QR code (ISO/IEC 18004), byte mode, error correction M, versions 1–15:
  // enough for any URL up to about 400 bytes. Written from the standard's tables.
  const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24]
  const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10]
  const rawModules = v => {
    let r = (16 * v + 128) * v + 64
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36 }
    return r
  }
  const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_M[v] * BLOCKS_M[v]
  const alignPos = v => {
    if (v === 1) return []
    const n = Math.floor(v / 7) + 2, size = v * 4 + 17
    const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
    const out = [6]
    for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p)
    return out
  }
  // GF(256) with the QR polynomial 0x11D
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x } return z & 0xff }
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1
    let root = 1
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < deg; j++) { r[j] = gmul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1] }
      root = gmul(root, 2)
    }
    return r
  }
  function rsRemainder(data, div) {
    const r = new Array(div.length).fill(0)
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f) }) }
    return r
  }
  const bit = (x, i) => ((x >>> i) & 1) !== 0

  function encode(text) {
    const bytes = [...new TextEncoder().encode(String(text))]
    let v = 1
    for (; v <= 15; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v) * 8) break
    if (v > 15) throw new Error('too long for a QR code here')
    // the bit stream: mode, count, data, terminator, padding
    const bits = []
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8)
    const cap = dataCodewords(v) * 8
    put(0, Math.min(4, cap - bits.length))
    put(0, (8 - bits.length % 8) % 8)
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8)
    const data = []
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
    // blocks, error correction, interleaving
    const nb = BLOCKS_M[v], ecl = ECC_M[v], raw = Math.floor(rawModules(v) / 8)
    const shortN = nb - raw % nb, shortLen = Math.floor(raw / nb)
    const div = rsDivisor(ecl), blocks = []
    for (let i = 0, k = 0; i < nb; i++) {
      const d = data.slice(k, k + shortLen - ecl + (i < shortN ? 0 : 1))
      k += d.length
      const e = rsRemainder(d, div)
      if (i < shortN) d.push(0)
      blocks.push(d.concat(e))
    }
    const all = []
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= shortN) all.push(b[i]) })

    // the matrix
    const size = v * 4 + 17
    const mod = Array.from({ length: size }, () => new Array(size).fill(false))
    const fn = Array.from({ length: size }, () => new Array(size).fill(false))
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true }
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
    const ap = alignPos(v)
    ap.forEach((a, i) => ap.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }))
    const format = mask => {
      const d = (0 << 3) | mask // level M is 00
      let r = d
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
      const b = ((d << 10) | r) ^ 0x5412
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i))
      set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8))
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i))
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i))
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i))
      set(8, size - 8, true)
    }
    format(0) // reserve the format areas before the data goes in
    if (v >= 7) {
      let r = v
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
      const b = (v << 12) | r
      for (let i = 0; i < 18; i++) { const x = size - 11 + i % 3, y = Math.floor(i / 3); set(x, y, bit(b, i)); set(y, x, bit(b, i)) }
    }
    // the codewords, in the zig-zag
    let i = 0
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert
        if (!fn[y][x] && i < all.length * 8) { mod[y][x] = bit(all[i >>> 3], 7 - (i & 7)); i++ }
      }
    }
    // pick the mask with the lowest penalty
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0]
    const flip = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x] }
    let best = 0, bestScore = Infinity
    for (let m = 0; m < 8; m++) {
      flip(m); format(m)
      const s = penalty(mod, size)
      if (s < bestScore) { best = m; bestScore = s }
      flip(m)
    }
    flip(best); format(best)
    return mod
  }

  function penalty(m, n) {
    let p = 0, dark = 0
    const line = get => {
      let run = 1
      const seq = []
      for (let i = 0; i < n; i++) seq.push(get(i))
      for (let i = 1; i <= n; i++) {
        if (i < n && seq[i] === seq[i - 1]) run++
        else { if (run >= 5) p += run - 2; run = 1 }
      }
      // a finder-like 1:1:3:1:1 with four light modules on a side
      const s = seq.map(b => (b ? 1 : 0)).join('')
      for (const pat of ['10111010000', '00001011101']) for (let k = s.indexOf(pat); k >= 0; k = s.indexOf(pat, k + 1)) p += 40
    }
    for (let y = 0; y < n; y++) line(x => m[y][x])
    for (let x = 0; x < n; x++) line(y => m[y][x])
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3 }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) dark++
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
    return p
  }

  // An <svg> of the code, with a 4-module quiet zone. Colours come from CSS (.qr-bg, .qr-fg).
  function qrSvg(text, label = 'QR code') {
    const m = encode(text), n = m.length, q = 4
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    return `<svg class="qr" viewBox="0 0 ${n + q * 2} ${n + q * 2}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect class="qr-bg" width="100%" height="100%"/><path class="qr-fg" d="${d}"/></svg>`
  }

  // ---------- share pages: the network's own page, prefilled; the person presses Post there
  const enc = encodeURIComponent
  const join = (text, url) => url && !String(text).includes(url) ? `${text} ${url}` : String(text)
  const SHARE = {
    x: (text, url) => `https://x.com/intent/post?text=${enc(String(text).replace(url, '').trim())}${url ? `&url=${enc(url)}` : ''}`,
    linkedin: (text, url) => `https://www.linkedin.com/feed/?shareActive=true&text=${enc(join(text, url))}`,
    threads: (text, url) => `https://www.threads.net/intent/post?text=${enc(join(text, url))}`,
    bluesky: (text, url) => `https://bsky.app/intent/compose?text=${enc(join(text, url))}`
  }
  // LinkedIn's long-standing link-only share page, for when its text prefill is not accepted
  const linkedinUrlOnly = url => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`
  const shareUrl = (network, text, url) => SHARE[network] ? SHARE[network](text, url || '') : null

  window.SwarmShow = { qrMatrix: encode, qrSvg, shareUrl, linkedinUrlOnly }
})()
