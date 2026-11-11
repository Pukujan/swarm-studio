// The flat colour painted sprites and sprite sheets stand on, so they key out cleanly (the
// cutters read it from the corners: scripts/cutout.py, games/ares/tools/sheets/cut.py).
// Magenta by default; green when the character itself is pink or purple, so it never keys
// out part of them.
export const keyFor = (look = '') => (/pink|magenta|fuchsia|purple|violet|lilac|lavender|mauve|\brose\b/i.test(String(look))
  ? { name: 'green', hex: '#00FF00' }
  : { name: 'magenta', hex: '#FF00FF' })
export const keyBackground = look => { const k = keyFor(look); return `a perfectly flat solid ${k.name} (${k.hex}) chroma-key background, one even colour edge to edge with no gradient, and no ${k.name} anywhere on the character` }
export const keyGround = look => `On ${keyBackground(look)}: no floor, no shadow, no scenery, nothing else in the picture`

// When the key colour itself was the trouble (left on the figure, a coloured rim, a figure in
// that colour), the second try is painted on the other key: magenta ↔ green.
export const KEY_TROUBLE = /magenta|pink|fuchsia|purple|green|rim|fringe|halo|spill|leftover|background (left|patch|show)|left around/i
export const keyTrouble = problems => (problems || []).some(p => KEY_TROUBLE.test(String(p)))
export const keyOf = text => /#00FF00/i.test(String(text || '')) ? 'green' : 'magenta'
export function swapKey(text) {
  const s = String(text || '')
  if (!/#FF00FF|#00FF00/i.test(s)) return `${s.replace(/\.?\s*$/, '')}. On ${keyBackground('pink')}`
  const to = keyOf(s) === 'green' ? ['green', 'magenta', '#00FF00', '#FF00FF'] : ['magenta', 'green', '#FF00FF', '#00FF00']
  return s.replace(new RegExp(`\\b${to[0]}\\b`, 'g'), to[1]).replace(new RegExp(to[2], 'gi'), to[3])
}
