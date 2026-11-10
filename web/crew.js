// The crew: one mark per agent, drawn in code from its name (its first letter on its shade),
// so the same name always gets the same mark, at any size.
// A classic script (it sets window.SwarmCrew) so the canvas can use it whether it is
// inlined by the server or loaded on its own.
;(function () {
  // Crew names, original and easy to say. The colour slot is a name's place in
  // this list, and it is the engine's list (engine/run.mjs AGENT_NAMES) in the same order;
  // any other name still gets a stable colour from its hash.
  const NAMES = ['Pip', 'Mochi', 'Lumi', 'Nova', 'Zuzu', 'Bean', 'Kiki', 'Tofu', 'Pebble', 'Juno', 'Comet', 'Dot',
    'Orbi', 'Twinkle', 'Bloop', 'Sprout', 'Nim', 'Puff', 'Gizmo', 'Luma', 'Taro', 'Echo', 'Bix', 'Vela']
  // Few colours (docs/ux/RULES.md): no per-agent hues. The crew is told apart by shade, from white to
  // graphite; their gear and outlines stay ink. (The name F2 stays: it is the slot list the engine shares.)
  const F2 = ['#F4F4F5', '#C7C7CC', '#9A9AA0', '#E4E4E7', '#828288', '#B4B4BA', '#D4D4D8', '#8E8E93', '#A1A1A6', '#606066']
  const INK = '#0b0b0c', WHITE = '#F4F4F5'

  // FNV-1a: small, stable, and the same in every browser
  function hash(s) {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h >>> 0
  }
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const toHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
  const tint = (c, k) => toHex(hex(c).map(v => v + (255 - v) * k))
  const lum = c => { const [r, g, b] = hex(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

  // the slot a name sits in: its place in the list, or a stable hash for other names
  const slot = name => { const i = NAMES.indexOf(name); return i >= 0 ? i : hash(String(name)) % F2.length }
  // agents beyond ten reuse a colour, lighter each round
  function color(name) {
    const i = slot(name), base = F2[i % F2.length], round = Math.floor(i / F2.length)
    return round ? tint(base, Math.min(0.62, round * 0.38)) : base
  }
  // the text colour for a pill in that colour: whichever of ink and off-white reads better
  const ink = c => contrast(c, INK) >= contrast(c, WHITE) ? INK : WHITE

  const cache = new Map()
  function avatar(name, size = 28) {
    // a studio crew mark (docs/ux/PATTERNS.md): the name's first letter on its shade, no creature
    const key = `${name}|${size}`
    if (cache.has(key)) return cache.get(key)
    const c = color(name), letter = String(name || '?').trim().charAt(0).toUpperCase() || '?'
    const svg = `<svg class="crew-av" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">`
      + `<circle cx="16" cy="16" r="15" fill="${c}" stroke="#0b0b0c" stroke-width="1.2"/>`
      + `<text x="16" y="21.4" text-anchor="middle" font-family="Barlow Condensed, Inter, sans-serif" font-weight="700" font-size="16" fill="${ink(c)}">${letter.replace(/[<&"]/g, '')}</text></svg>`
    cache.set(key, svg)
    return svg
  }


  window.SwarmCrew = { NAMES, F2, color, ink, avatar, hash, contrast }
})()
