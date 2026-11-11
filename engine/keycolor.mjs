// The studio's key colour for art that gets cut out (sprites, sheets, portraits).
// Magenta (#FF00FF) by default: almost nothing in a character is pure magenta, so the
// cut is clean and white dresses, pale skin and dark hair all stay. A subject that is
// itself pink, magenta or purple gets chroma green (#00FF00) instead.
// Never grey, white or black: those eat white cloth or dark heads. The cut: scripts/cutout.py.

const PINKISH = /\b(pink|magenta|fuchsia|rose|rosy|purple|violet|lilac|lavender|mauve|orchid|plum)\b/i

export function keyColor(look = '') {
  return PINKISH.test(String(look)) ? { name: 'chroma green', hex: '#00FF00' } : { name: 'magenta', hex: '#FF00FF' }
}

// the background clause for a painting prompt
export function keyGround(look = '') {
  const k = keyColor(look)
  return `On one perfectly flat, even ${k.name} (${k.hex}) background: no gradient, no floor, no shadow, no scenery, nothing else in the picture, and no ${k.name} anywhere on the figure`
}
