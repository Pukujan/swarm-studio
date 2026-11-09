// The crew: little alien minion workers from beyond the galaxy, one per agent, drawn in
// code from its name, so the same name always gets the same goggles, antenna and gear,
// at any size. Round blob body, big goggle eyes, the visor strap in the agent's colour.
// A classic script (it sets window.SwarmCrew) so the canvas can use it whether it is
// inlined by the server or loaded on its own. Animation is CSS only, see "the crew" in
// canvas.css: a blink every 4 s, wings that flap while the cursor moves (.moving), a
// mouth that moves while it talks (.talking), a hop when done (.hop).
;(function () {
  // Star-like crew names, original and easy to say. The colour slot is a name's place in
  // this list, so the engine's list (engine/run.mjs AGENT_NAMES) should use the same order;
  // any other name still gets a stable colour from its hash.
  const NAMES = ['Mochi', 'Lumi', 'Zuzu', 'Tofu', 'Pebble', 'Comet', 'Miso', 'Orbi', 'Puff', 'Tiko', 'Wisp', 'Yuzu',
    'Nib', 'Quark', 'Sprout', 'Bixi', 'Fizz', 'Glim', 'Hoku', 'Jelli', 'Nubi', 'Pim', 'Ripple', 'Sola']
  // the F2 palette (spec 08); the tenth is the off-white minion with a Hermes-blue visor
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
  const shade = (c, k) => toHex(hex(c).map(v => v * (1 - k)))
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

  // one goggle: white glass, ink rim, a pupil looking slightly up and a glint
  const goggle = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#F2F2F2" stroke="#05051a" stroke-width="1.1"/>`
    + `<circle cx="${x + r * 0.12}" cy="${y - r * 0.08}" r="${r * 0.46}" fill="#05051a"/><circle cx="${x + r * 0.32}" cy="${y - r * 0.3}" r="${r * 0.16}" fill="#F2F2F2"/>`
  // the strap runs round the head in the agent's colour; one or two big goggle eyes sit on it
  const VISORS = [
    `<path d="M5.6 16.4H26.4" stroke="VIS" stroke-width="3.6"/><g class="eyes">${goggle(12.3, 16.4, 3.6)}${goggle(19.7, 16.4, 3.6)}</g>`,
    `<path d="M5.6 16H26.4" stroke="VIS" stroke-width="3.6"/><g class="eyes">${goggle(16, 16, 5)}</g>`,
    `<path d="M5.6 16.6Q16 13.4 26.4 16.6" fill="none" stroke="VIS" stroke-width="3.4"/><g class="eyes">${goggle(12.2, 15.8, 3.3)}${goggle(19.8, 15.8, 3.3)}</g>`
  ]
  const ANTENNAS = [
    '<path d="M16 8.4V4.2" stroke="STEM" stroke-width="1.4" stroke-linecap="round"/><circle cx="16" cy="3.4" r="1.8" fill="TIP" stroke="#05051a" stroke-width=".9"/>',
    '<path d="M12.6 9.2Q11.2 6 9 5" stroke="STEM" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="8.6" cy="4.8" r="1.5" fill="TIP" stroke="#05051a" stroke-width=".8"/><path d="M19.4 9.2Q20.8 6 23 5" stroke="STEM" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="23.4" cy="4.8" r="1.5" fill="TIP" stroke="#05051a" stroke-width=".8"/>',
    '<path d="M16 8.4Q16.6 5.4 19.6 4.4" stroke="STEM" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M20.4 2.2l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" fill="TIP" stroke="#05051a" stroke-width=".6" stroke-linejoin="round"/>'
  ]
  const ACCESSORIES = [
    '',
    // a tool belt with a pouch
    '<path d="M6.4 24.2Q16 27.4 25.6 24.2" fill="none" stroke="#05051a" stroke-width="1.8"/><rect x="18" y="24.4" width="3.6" height="2.8" rx=".8" fill="#F2F200" stroke="#05051a" stroke-width=".8"/>',
    // a scarf with a tail
    '<path d="M7.2 23.4Q16 26.6 24.8 23.4" fill="none" stroke="#0000F2" stroke-width="2.2" stroke-linecap="round"/><path d="M22.4 24.4l2 3.2 1.6-1" fill="none" stroke="#0000F2" stroke-width="1.8" stroke-linecap="round"/>',
    // overall straps
    '<path d="M10.4 22.6V27M21.6 22.6V27" stroke="#05051a" stroke-width="1.2"/><circle cx="10.4" cy="23" r=".9" fill="#F2F200"/><circle cx="21.6" cy="23" r=".9" fill="#F2F200"/>'
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
    // the body is a soft tint of the agent's colour; the strap is the colour itself
    const vis = c === WHITE ? BLUE : c
    const body = c === WHITE ? '#E4E4F4' : tint(c, 0.5)
    const belly = c === WHITE ? '#F7F7FF' : tint(c, 0.74)
    const visor = VISORS[h % VISORS.length].replace(/VIS/g, vis)
    const antenna = ANTENNAS[(h >>> 4) % ANTENNAS.length].replace(/TIP/g, (h >>> 6) % 2 ? '#F2F200' : vis).replace(/STEM/g, body)
    const acc = ACCESSORIES[(h >>> 8) % ACCESSORIES.length]
    const delay = ((h >>> 12) % 40) / 10
    const svg = `<svg class="crew-av" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" style="--blink-delay:-${delay}s">`
      + `<g class="hopper">${antenna}`
      // a round blob: a little taller than wide, soft at the bottom
      + `<path d="M16 8.2C22.6 8.2 26.2 12.4 26.2 18C26.2 24.2 22.2 27.8 16 27.8C9.8 27.8 5.8 24.2 5.8 18C5.8 12.4 9.4 8.2 16 8.2Z" fill="${body}" stroke="#05051a" stroke-width="1.2"/>`
      + `<ellipse cx="16" cy="23.6" rx="5.6" ry="3.4" fill="${belly}" opacity=".9"/>`
      + `<path d="M9.2 11.8Q11 9.6 14 9.3" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`
      + visor
      + `<path class="mouth" d="M14.2 21.6Q16 23.2 17.8 21.6" fill="#05051a" stroke="#05051a" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>`
      + acc
      + `<ellipse cx="12.2" cy="28.5" rx="2.4" ry="1.3" fill="#05051a"/><ellipse cx="19.8" cy="28.5" rx="2.4" ry="1.3" fill="#05051a"/>`
      + wing('l') + wing('r') + '</g></svg>'
    cache.set(key, svg)
    return svg
  }

  window.SwarmCrew = { NAMES, F2, color, ink, avatar, hash, contrast }
})()
