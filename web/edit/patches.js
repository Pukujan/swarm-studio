// Manual edit (docs/specs/29-chats-references-marks.md, "Manual edit"): change one element of a finished
// section by hand. Works on the section's HTML (a fragment) and hands back new HTML, which the canvas saves
// as a section version (undo, redo, Versions, and the crew is told to keep it).
//
// Adapted from Open Design's edit mode (apps/web/src/edit-mode/source-patches.ts, Apache-2.0; see NOTICE
// and LICENSE beside this file). Modified: plain JavaScript, a section fragment instead of a document,
// elements addressed by their child-index path, no brand kit or runtime overrides, a move patch and
// guards against script links, event handlers and unsafe style values.
//
//   id       'path-0-2': body.children[0].children[2] of the section's fragment (what the canvas's
//            point-to-element reader returns as `path`)
//   patch    { kind: 'set-text', id, value } | { kind: 'set-link', id, text, href }
//            | { kind: 'set-image', id, src, alt } | { kind: 'set-style', id, styles: { fontSize: '20px', … } }
//            | { kind: 'set-attributes', id, attributes: { name: value } } | { kind: 'remove-element', id }
//            | { kind: 'move-element', id, dir: -1 | 1 }
//   result   { ok, html, id, error }   id: where the element is afterwards (a move changes it)
//
// Wrapped in one name: the studio's modules are joined into one script (server/page.mjs).
export const swEdit = (() => {
  const STYLE_PROPS = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textAlign', 'width', 'height', 'padding', 'margin', 'backgroundColor', 'borderRadius', 'opacity']
  const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
  const SAFE_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/
  // the canvas's own marks, and anything that runs script, are not the person's to set here
  const PROTECTED = /^(data-layer|data-swarm|data-gen|on)/i
  const BAD_VALUE = /[<>{};"\\]|url\s*\(\s*['"]?\s*javascript:|expression\s*\(/i
  const SAFE_URL = u => !/^\s*(javascript|vbscript|data:(?!image\/))/i.test(String(u || ''))
  const INERT = new Set(['script', 'style', 'template', 'noscript'])

  const parse = html => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html')
  const out = doc => doc.body.innerHTML.trim()
  function find(doc, id) {
    if (!/^path(-\d+)+$/.test(String(id || ''))) return null
    let el = doc.body
    for (const i of id.slice(5).split('-').map(Number)) { el = el?.children.item(i) || null; if (!el) return null }
    return el
  }
  function idOf(doc, el) {
    const path = []
    for (let e = el; e && e !== doc.body; e = e.parentElement) path.unshift([...e.parentElement.children].indexOf(e))
    return path.length ? `path-${path.join('-')}` : null
  }
  // what kind of thing it is, for which fields the panel shows
  function kindOf(el) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'img') return 'image'
    if (tag === 'svg') return 'graphic'
    if (['section', 'main', 'nav', 'div', 'article', 'header', 'footer', 'ul', 'ol', 'form', 'aside', 'figure'].includes(tag)) return 'container'
    return 'text'
  }
  // the one text node that carries the visible words, or null when there are several (nested markup)
  function soleText(el) {
    let found = null, many = false
    const visit = node => {
      for (const c of node.childNodes) {
        if (many) return
        if (c.nodeType === 3) {
          if (INERT.has((c.parentElement?.tagName || '').toLowerCase()) || !c.nodeValue.trim()) continue
          if (found) { many = true; return }
          found = c
        } else if (c.nodeType === 1 && c.tagName.toLowerCase() !== 'svg') visit(c)
      }
    }
    visit(el)
    return many ? null : found
  }
  const words = el => (el.textContent || '').replace(/\s+/g, ' ').trim()
  function setWords(el, value) {
    const v = String(value ?? '')
    if (!el.children.length) { el.textContent = v; return true }
    const t = soleText(el)
    if (!t) return false
    // keep the spaces around the words, so inline layout stays as it was
    t.nodeValue = t.nodeValue.match(/^\s*/)[0] + v.trim() + t.nodeValue.match(/\s*$/)[0]
    return true
  }
  const BOXES = { section: 'Section', main: 'Main', nav: 'Menu', div: 'Box', article: 'Card', header: 'Header', footer: 'Footer', ul: 'List', ol: 'List', form: 'Form', aside: 'Aside', figure: 'Figure' }
  const label = el => {
    const k = kindOf(el)
    if (k === 'container') return BOXES[el.tagName.toLowerCase()] || 'Box'
    if (k === 'image') return el.getAttribute('alt') || 'Picture'
    if (k === 'graphic') return el.getAttribute('aria-label') || 'Graphic'
    const w = words(el)
    return w ? w.slice(0, 40) : el.tagName.toLowerCase()
  }

  // the elements of a section, in order, for the panel's list: { id, depth, tag, kind, label }
  function tree(html, max = 80) {
    const doc = parse(html), rows = []
    const walk = (el, depth) => {
      for (const c of el.children) {
        if (rows.length >= max) return
        const tag = c.tagName.toLowerCase()
        if (INERT.has(tag) || tag === 'br') continue
        rows.push({ id: idOf(doc, c), depth, tag, kind: kindOf(c), label: label(c) })
        if (tag !== 'svg' && depth < 6) walk(c, depth + 1)
      }
    }
    walk(doc.body, 0)
    return rows
  }

  // one element's fields, inline styles and attributes, and what may be done to it
  function read(html, id) {
    const doc = parse(html), el = find(doc, id)
    if (!el) return null
    const kind = kindOf(el)
    const fields = {}
    if (kind === 'link') { fields.text = words(el); fields.href = el.getAttribute('href') || '' }
    else if (kind === 'image') { fields.src = el.getAttribute('src') || ''; fields.alt = el.getAttribute('alt') || '' }
    else if (kind === 'text') fields.text = words(el)
    const styles = {}
    for (const p of STYLE_PROPS) styles[p] = el.style.getPropertyValue(kebab(p)) || ''
    const attributes = {}
    for (const a of el.attributes) if (a.name !== 'style' && !PROTECTED.test(a.name)) attributes[a.name] = a.value
    const sibs = [...el.parentElement.children]
    return {
      id, tag: el.tagName.toLowerCase(), kind, label: label(el), fields, styles, attributes,
      // words inside nested markup (a <b> in the middle) are changed in Code instead
      wordsEditable: (kind === 'text' || kind === 'link') && (!el.children.length || !!soleText(el)),
      canRemove: !(el.parentElement === doc.body && doc.body.children.length === 1),
      canUp: sibs.indexOf(el) > 0, canDown: sibs.indexOf(el) < sibs.length - 1
    }
  }

  function apply(html, patch) {
    const fail = error => ({ ok: false, html, id: patch?.id || null, error })
    const doc = parse(html), el = find(doc, patch?.id)
    if (!el) return fail('That part is no longer there')
    switch (patch.kind) {
      case 'set-text':
        if (!setWords(el, patch.value)) return fail('These words sit inside other markup: change them in Code')
        break
      case 'set-link':
        if (!SAFE_URL(patch.href)) return fail('That link is not allowed')
        if (patch.text != null && String(patch.text).trim() !== words(el) && !setWords(el, patch.text)) return fail('This link holds other markup: change its words in Code')
        if (String(patch.href || '').trim()) el.setAttribute('href', String(patch.href).trim()); else el.removeAttribute('href')
        break
      case 'set-image':
        if (patch.src != null) { if (!SAFE_URL(patch.src) || !String(patch.src).trim()) return fail('That picture address is not allowed'); el.setAttribute('src', String(patch.src).trim()) }
        if (patch.alt != null) el.setAttribute('alt', String(patch.alt))
        break
      case 'set-style':
        for (const [name, value] of Object.entries(patch.styles || {})) {
          if (!STYLE_PROPS.includes(name)) continue
          const v = String(value ?? '').trim()
          if (BAD_VALUE.test(v)) return fail(`That ${kebab(name)} is not a style value`)
          if (!v) el.style.removeProperty(kebab(name)); else el.style.setProperty(kebab(name), v)
        }
        if (!el.getAttribute('style')?.trim()) el.removeAttribute('style')
        break
      case 'set-attributes':
        for (const [name, value] of Object.entries(patch.attributes || {})) {
          if (!SAFE_NAME.test(name) || PROTECTED.test(name) || name === 'style') return fail(`${name} can't be set here`)
          const v = String(value ?? '')
          if (/^(href|src|action|formaction|xlink:href)$/i.test(name) && !SAFE_URL(v)) return fail('That address is not allowed')
          if (!v.trim()) el.removeAttribute(name); else el.setAttribute(name, v)
        }
        break
      case 'remove-element':
        if (el.parentElement === doc.body && doc.body.children.length === 1) return fail('It is the whole section: remove the section instead')
        el.remove()
        return { ok: true, html: out(doc), id: null }
      case 'move-element': {
        const sib = patch.dir < 0 ? el.previousElementSibling : el.nextElementSibling
        if (!sib) return fail('It is already at the end')
        if (patch.dir < 0) sib.before(el); else sib.after(el)
        return { ok: true, html: out(doc), id: idOf(doc, el) }
      }
      default: return fail('Unknown change')
    }
    return { ok: true, html: out(doc), id: patch.id }
  }

  // the path the point-to-element reader gave ([0, 2]) as an id
  const pathId = path => Array.isArray(path) && path.length ? `path-${path.join('-')}` : null

  return { STYLE_PROPS, tree, read, apply, pathId, kindOf }
})()
