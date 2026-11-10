// Cleans one builder's HTML fragment: drops prose written before or after the
// markup, and closes tags left open when the output was cut short.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use'])

export function tidyFragment(html = '') {
  let s = String(html)
  const first = s.indexOf('<'), last = s.lastIndexOf('>')
  if (first < 0) return ''
  s = s.slice(first, last + 1)
  // a cut inside a tag: drop the broken tail
  const lt = s.lastIndexOf('<')
  if (s.indexOf('>', lt) < 0) s = s.slice(0, lt)
  const stack = []
  const re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g
  for (let m; (m = re.exec(s));) {
    if (!m[2]) continue
    const tag = m[2].toLowerCase()
    if (m[3] || VOID.has(tag)) continue
    if (!m[1]) stack.push(tag)
    else {
      const i = stack.lastIndexOf(tag)
      if (i >= 0) stack.length = i
    }
  }
  return s + stack.reverse().map(t => `</${t}>`).join('')
}
