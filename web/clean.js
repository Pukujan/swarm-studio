// Model-written section HTML, made inert before the canvas shows it (Nous catalog review, point 4).
// The browser parses it (a <template>, so nothing loads or runs while it is read), then every
// <script> goes, every on* attribute goes, and every attribute whose value is a javascript:,
// vbscript: or data:text/html URL goes. Nested <template>s are cleaned too.
//
// This is the second wall, not the only one: the frames that show the HTML are sandboxed with
// allow-scripts and no allow-same-origin, so even what slips past cannot reach the studio.

const BAD_URL = /^(javascript|vbscript):|^data:text\/html/i

export function clean(text, doc = globalThis.document) {
  const t = String(text ?? '').replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '')
  if (!doc) return ''
  const tpl = doc.createElement('template')
  tpl.innerHTML = t
  scrub(tpl.content)
  return tpl.innerHTML
}

function scrub(root) {
  for (const el of root.querySelectorAll('script')) el.remove()
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase()
      // what a browser reads as the URL: control characters and spaces inside are ignored
      const value = a.value.replace(/[\u0000- \u007f]+/g, '')
      if (name.startsWith('on') || name === 'srcdoc' || BAD_URL.test(value)) el.removeAttribute(a.name)
    }
    if (el.localName === 'template' && el.content) scrub(el.content)
  }
}
