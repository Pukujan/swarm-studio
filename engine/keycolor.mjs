// The flat colour painted sprites and sprite sheets stand on, so they key out cleanly (the
// cutters read it from the corners: scripts/cutout.py, games/ares/tools/sheets/cut.py).
// Magenta by default; green when the character itself is pink or purple, so it never keys
// out part of them.
export const keyFor = (look = '') => (/pink|magenta|fuchsia|purple|violet|lilac|lavender|mauve|\brose\b/i.test(String(look))
  ? { name: 'green', hex: '#00FF00' }
  : { name: 'magenta', hex: '#FF00FF' })
export const keyBackground = look => { const k = keyFor(look); return `a perfectly flat solid ${k.name} (${k.hex}) chroma-key background, one even colour edge to edge with no gradient, and no ${k.name} anywhere on the character` }
export const keyGround = look => `On ${keyBackground(look)}: no floor, no shadow, no scenery, nothing else in the picture`
