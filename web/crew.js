// The crew: one little courier sprite per agent, drawn in code from its name, so the
// same name always gets the same body colour, visor, antenna and accessory, at any
// size. A classic script (it sets window.SwarmCrew) so the canvas can use it whether
// it is inlined by the server or loaded on its own. Animation is CSS only, see
// "the crew" in canvas.css: a blink every 4 s, wings that flap while the cursor
// moves (.moving), a mouth that moves while it talks (.talking), a hop when done (.hop).
;(function () {
  // the engine hands out names in this order (engine/run.mjs AGENT_NAMES)
  const NAMES = ['Ada', 'Basil', 'Cleo', 'Dax', 'Esme', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jude', 'Kai', 'Luna',
    'Milo', 'Nova', 'Otis', 'Pia', 'Quin', 'Remy', 'Sage', 'Tess', 'Uma', 'Vito', 'Wren', 'Xan']
  // the F2 palette (spec 08); the tenth is the off-white courier with a Hermes-blue visor
  const F2 = ['#F20000', '#F27900', '#F2F200', '#79F200', '#00F279', '#00F2F2', '#7900F2', '#F200F2', '#F20079', '#F2F2F2']
  const INK = '#05051a', WHITE = '#F2F2F2', BLUE = '#0000F2'

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

  // the slot a name sits in: its place in the engine's list, or a stable hash for other names
  const slot = name => { const i = NAMES.indexOf(name); return i >= 0 ? i : hash(String(name)) % F2.length }
  // agents beyond ten reuse a colour, lighter each round
  function color(name) {
    const i = slot(name), base = F2[i % F2.length], round = Math.floor(i / F2.length)
    return round ? tint(base, Math.min(0.62, round * 0.38)) : base
  }
  // the text colour for a pill in that colour: whichever of ink and off-white reads better
  const ink = c => contrast(c, INK) >= contrast(c, WHITE) ? INK : WHITE

  const VISORS = [
    // a band across both eyes
    '<rect x="8.5" y="13" width="15" height="6.4" rx="3.2" fill="#05051a"/>',
    // round goggle glass
    '<rect x="8" y="12.6" width="16" height="7" rx="3.5" fill="#05051a"/><path d="M16 13v6" stroke="VIS" stroke-width="1" opacity=".55"/>',
    // a slim visor with a peak
    '<path d="M8.2 15.2Q16 11.4 23.8 15.2V18.2Q16 20.6 8.2 18.2Z" fill="#05051a"/>'
  ]
  const EYES = '<g class="eyes"><rect x="11" y="14.6" width="2.6" height="3.2" rx="1.2" fill="VIS"/><rect x="18.4" y="14.6" width="2.6" height="3.2" rx="1.2" fill="VIS"/></g>'
  const ANTENNAS = [
    '<path d="M16 8.6V4.4" stroke="#05051a" stroke-width="1.3" stroke-linecap="round"/><circle cx="16" cy="3.6" r="1.7" fill="#F2F200" stroke="#05051a" stroke-width=".9"/>',
    '<path d="M16 8.6Q16.4 5.6 19.4 4.4" stroke="#05051a" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="20" cy="4.1" r="1.6" fill="#F2F2F2" stroke="#05051a" stroke-width=".9"/>',
    '<path d="M16 8.6l-1.2-1.3 2.4-1.3-2.4-1.3 1.2-1.2" stroke="#05051a" stroke-width="1.1" fill="none" stroke-linejoin="round" stroke-linecap="round"/><rect x="14.6" y="1.3" width="2.8" height="2.8" fill="#F2F200" stroke="#05051a" stroke-width=".8"/>'
  ]
  const ACCESSORIES = [
    // headset: a band over the top and a mic
    '<path d="M6.6 16.5Q6.6 7.2 16 7.2Q25.4 7.2 25.4 16.5" fill="none" stroke="#05051a" stroke-width="1.4"/><rect x="5" y="14.6" width="3" height="4.6" rx="1.4" fill="#05051a"/><path d="M6.6 19.2Q7.6 23 11.6 22.6" fill="none" stroke="#05051a" stroke-width="1"/><circle cx="11.9" cy="22.6" r="1" fill="#05051a"/>',
    // goggles pushed up on the forehead
    '<path d="M7.4 11.4Q16 8 24.6 11.4" fill="none" stroke="#05051a" stroke-width="1.2"/><circle cx="12.6" cy="10" r="2.1" fill="#00F2F2" stroke="#05051a" stroke-width="1"/><circle cx="19.4" cy="10" r="2.1" fill="#00F2F2" stroke="#05051a" stroke-width="1"/>',
    // a tool belt with a pouch
    '<path d="M6.6 23.8Q16 27 25.4 23.8" fill="none" stroke="#05051a" stroke-width="2"/><rect x="18" y="24" width="3.6" height="3" rx=".8" fill="#F2F200" stroke="#05051a" stroke-width=".8"/>',
    // a scarf with a tail
    '<path d="M7.4 23.6Q16 26.8 24.6 23.6" fill="none" stroke="#0000F2" stroke-width="2.4" stroke-linecap="round"/><path d="M22.4 24.6l2.2 3.4 1.6-1" fill="none" stroke="#0000F2" stroke-width="2" stroke-linecap="round"/>'
  ]
  // a tiny winged sandal: off-white feathers with Hermes-blue tips (the right one is mirrored)
  const WING = '<path d="M9.4 26.6C6.2 26.6 3.2 25 1.8 21.8C3.4 22.5 4.7 22.6 5.6 22.3C4.9 23.3 5 24 5.4 24.4C6.2 24.2 7 24.2 7.7 24.6C7.3 25.3 8.2 26.2 9.4 26.6Z" fill="#F2F2F2" stroke="#05051a" stroke-width=".75" stroke-linejoin="round"/><path d="M1.8 21.8C2.7 22.2 3.6 22.4 4.3 22.5L3.5 23.7C2.8 23.2 2.2 22.6 1.8 21.8Z" fill="#0000F2"/>'
  const wing = side => side === 'l'
    ? `<g class="wing l"><g transform="translate(-2.4 .6) rotate(18 9.4 26.6)">${WING}</g></g>`
    : `<g transform="translate(32 0) scale(-1 1)"><g class="wing r"><g transform="translate(-2.4 .6) rotate(18 9.4 26.6)">${WING}</g></g></g>`

  const cache = new Map()
  // The avatar as one <svg>: body in the agent's colour, visor, antenna, one accessory.
  function avatar(name, size = 28) {
    const key = `${name}|${size}`
    if (cache.has(key)) return cache.get(key)
    const h = hash(String(name)), c = color(name)
    const vis = c === WHITE ? BLUE : c
    const body = c === WHITE ? WHITE : c
    const visor = VISORS[h % VISORS.length].replace(/VIS/g, vis)
    const antenna = ANTENNAS[(h >>> 4) % ANTENNAS.length]
    const acc = ACCESSORIES[(h >>> 8) % ACCESSORIES.length]
    const delay = ((h >>> 12) % 40) / 10
    const svg = `<svg class="crew-av" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" style="--blink-delay:-${delay}s">`
      + `<g class="hopper">${antenna}`
      + `<path d="M16 8.4C23 8.4 26 12.8 26 18.4C26 24.4 22 27.6 16 27.6C10 27.6 6 24.4 6 18.4C6 12.8 9 8.4 16 8.4Z" fill="${body}" stroke="#05051a" stroke-width="1.2"/>`
      + `<path d="M9.4 12.4Q11 10 14 9.6" fill="none" stroke="#F2F2F2" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`
      + visor + EYES.replace(/VIS/g, vis)
      + `<path class="mouth" d="M14.4 21.2Q16 22.6 17.6 21.2" fill="#05051a" stroke="#05051a" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>`
      + acc
      + `<ellipse cx="12.2" cy="28.4" rx="2.4" ry="1.4" fill="#05051a"/><ellipse cx="19.8" cy="28.4" rx="2.4" ry="1.4" fill="#05051a"/>`
      + wing('l') + wing('r') + '</g></svg>'
    cache.set(key, svg)
    return svg
  }

  window.SwarmCrew = { NAMES, F2, color, ink, avatar, hash, contrast }
})()
